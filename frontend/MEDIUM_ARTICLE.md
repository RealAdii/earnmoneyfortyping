# How We Added Confidential Payments to a Starknet Game Using Tongo and StarkZap

*Breaking the on-chain link between players and their winnings — in under 200 lines of code.*

---

We built TypeRacer on Starknet — a competitive typing game where players race against each other and earn STRK rewards for winning. Every keystroke is recorded on-chain, races are verified by a smart contract, and winners get paid out automatically.

But there was a problem. Every reward transaction created a visible trail: this wallet won this race, received this much STRK, and sent it here. For a game that anyone can play, that's a lot of financial information sitting in the open.

So we integrated **Tongo** — a confidential payment protocol built on Starknet — to let players send their winnings privately. Here's how we did it, what we learned, and why Starknet's privacy stack is quietly becoming one of the most interesting things in crypto right now.

---

## What Is Tongo?

Tongo, built by **FAT Solutions**, wraps any ERC-20 token with **ElGamal encryption**, enabling private transfers while maintaining full auditability. Think of it as a privacy layer that sits on top of your existing tokens — you don't need a new token, a new chain, or a bridge. You deposit STRK in, the balance is encrypted, and you can transfer or withdraw it without revealing amounts or linking sender to recipient on-chain.

Under the hood, Tongo uses:

- **ElGamal encryption** — Balances are stored as pairs of elliptic curve points: `(L, R) = (g^b * y^r, g^r)`, where the amount `b` is hidden inside the encryption and only readable with the correct private key.
- **Zero-knowledge proofs** — Every transfer includes ZK proofs (range proofs and Proof of Exponent) that verify the sender has sufficient balance and the amounts are valid, without revealing what those amounts actually are.
- **Optional viewing keys** — For compliance or auditing, users can share viewing keys that let specific parties see their balances without giving up control.

The key insight is that all of this runs natively on Starknet. No off-chain relayers, no trusted intermediaries. The ZK proofs are verified on-chain by Tongo's smart contracts — and because Starknet is already a ZK rollup, the computational overhead of verifying these proofs is significantly lower than it would be on L1.

---

## What Is StarkZap?

**StarkZap** is an open-source TypeScript SDK by StarkWare that makes it trivially easy to add on-chain functionality to any app. We used it as the backbone for TypeRacer's wallet system.

What StarkZap handles for us:

- **Social login wallets** — Players sign in with X (Twitter) via Privy. No seed phrases, no MetaMask popups. A Starknet wallet is created and managed server-side.
- **Gasless transactions** — The AVNU paymaster sponsors all game transactions (starting races, recording keystrokes, finishing races), so players never need to hold gas tokens to play.
- **Account abstraction** — Starknet's native account abstraction means every wallet is a smart contract. This is what makes paymasters, session keys, and multicall transactions possible out of the box.

StarkZap gave us the wallet infrastructure. Tongo gave us privacy. The two fit together naturally because they both speak Starknet.

---

## The Integration: How It Works

The player flow is simple:

1. **Win a race** — Complete a typing race and earn STRK
2. **Tap "Send Privately"** — Opens a modal where they enter a recipient address and amount
3. **Fund the privacy pool** — STRK is deposited into Tongo's confidential contract (approval + deposit in a single multicall)
4. **Withdraw to recipient** — STRK is withdrawn from the pool to the recipient's address, breaking the on-chain link

From the user's perspective, it's two button taps. From the blockchain's perspective, the deposit goes in from address A, and a withdrawal comes out to address B, with no visible connection between the two.

### The Code

The entire privacy integration lives in a single React hook — `useTongo`:

```typescript
import { Account } from "@fatsolutions/tongo-sdk";
import { RpcProvider } from "starknet";

// Generate a privacy key (persisted in localStorage)
const STARK_ORDER = BigInt("0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2f");

function getOrCreateTongoKey(): string {
  let pk = localStorage.getItem("typeracer_tongo_pk");
  if (!pk) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const raw = BigInt("0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(""));
    const scalar = (raw % (STARK_ORDER - 1n)) + 1n;
    pk = "0x" + scalar.toString(16).padStart(64, "0");
    localStorage.setItem("typeracer_tongo_pk", pk);
  }
  return pk;
}
```

The privacy key is a random scalar on the Stark curve — it's what encrypts your confidential balance. It never leaves the browser.

The actual send is two transactions:

```typescript
// 1. Fund: deposit STRK into the confidential pool
const account = new Account(tongoKey, TONGO_STRK_CONTRACT, provider);
const amountWei = BigInt(Math.floor(amountStrk * 1e18));
const tongoAmount = await account.erc20ToTongo(amountWei);

const fundOp = await account.fund({ amount: tongoAmount, sender: walletAddress });
await fundOp.populateApprove();
await wallet.execute([fundOp.approve, fundOp.toCalldata()]);

// 2. Withdraw: send from pool to recipient
const withdrawOp = await account.withdraw({ amount: tongoAmount, to: recipientAddress, sender: walletAddress });
await wallet.execute([withdrawOp.toCalldata()]);
```

That's it. The Tongo SDK handles all the ElGamal encryption, ZK proof generation, and calldata formatting internally. We just call `fund()` and `withdraw()`.

---

## What We Learned

### 1. Gas is the privacy tax

The AVNU paymaster that sponsors our game transactions won't sponsor Tongo calls — paymasters only cover whitelisted contracts. This means users need STRK in their wallet to cover gas for private sends.

This is the biggest UX friction point. We added a wallet address copy button and a disclaimer so users can fund their wallet from another source. In a future version, we'd love to see paymasters that can sponsor privacy transactions, or a meta-transaction relay that handles this.

### 2. The Stark curve has opinions about your random numbers

Our first key generation was naive — generate 32 random bytes, mask the top nibble, call it a private key. Turns out the Stark curve order is approximately `2^251`, and a 32-byte random value can easily exceed it. The fix: modular reduction.

```typescript
const scalar = (raw % (STARK_ORDER - 1n)) + 1n;
```

Simple, but it cost us a production bug. Lesson: always validate your scalars against the curve order.

### 3. RPC providers have quirks

Starknet's default block identifier is `"pending"`, but the Cartridge RPC endpoint rejects it. We had to recursively patch every `blockIdentifier` property on the provider, its channel, and every contract instance to `"latest"`. Not documented anywhere — we found it by reading error logs.

### 4. Privacy on Starknet is real and it's composable

The most exciting part of this integration wasn't the code — it was realizing that Starknet's privacy ecosystem actually works. Tongo isn't a whitepaper. It's deployed on mainnet. You can deposit tokens, transfer them confidentially, and withdraw them, today.

And because everything is built on Starknet's native primitives (account abstraction, multicall, STARK proofs), these privacy tools compose with everything else. Our game uses the same wallet for gameplay (verified by a game contract) and privacy (verified by Tongo's contracts). Same account, same UX, different capabilities.

---

## The Bigger Picture

Starknet is quietly assembling the most comprehensive privacy stack in crypto:

- **Tongo** — Confidential ERC-20 transfers via ElGamal + ZK proofs
- **STRK20** — A standard for making any ERC-20 token private
- **0xbow Privacy Pools** — Compliance-friendly privacy pools
- **Nightfall** — EY's enterprise privacy layer, now integrated into Starknet
- **strkBTC** — Private Bitcoin on Starknet with shielded balances

All of this is possible because Starknet is a ZK rollup from the ground up. Verifying zero-knowledge proofs isn't bolted on after the fact — it's the foundation the entire chain is built on. That means privacy features can be cheaper, more expressive, and more deeply integrated than on chains where ZK is an afterthought.

---

## Try It

TypeRacer is live on Starknet mainnet. Sign in with X, race against other players, earn STRK, and send your winnings privately through Tongo.

The game contract, the privacy integration, and the StarkZap wallet setup are all open source. If you're building on Starknet and want to add confidential payments to your app, the Tongo SDK is the fastest path. It took us under 200 lines of code to go from "all transactions are public" to "users can send privately."

The future of on-chain payments isn't just fast and cheap. It's private.

---

*Built with StarkZap, Tongo by FAT Solutions, and Starknet. Special thanks to the StarkWare and FAT Solutions teams for the tooling that made this possible.*
