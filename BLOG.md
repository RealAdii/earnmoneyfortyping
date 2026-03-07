# How I Made a Game Where You Earn $$ for Every Word You Type Correctly — Using StarkZap

> A typing game on Starknet where every correct word is a transaction, and you get paid in STRK for it.

---

## The Idea

What if you could earn real money just by typing? Not freelancing, not data entry — literally just typing words as fast as you can, like a game?

That's what I built: **a typeracer game on Starknet where every correct word you type fires a transaction on-chain, and at the end of each race you earn STRK tokens proportional to how many words you got right.**

0.1 STRK per correct word. Type 30 words in 30 seconds? That's 3 STRK. Straight to your wallet.

## The Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Smart Contract**: Cairo (Starknet) — deployed on mainnet
- **Auth**: Privy (Twitter/X login → embedded Starknet wallet)
- **On-chain Wallet SDK**: [StarkZap](https://github.com/starkience/starkzap-sdk) — the secret sauce
- **Gas Sponsorship**: AVNU Paymaster (users pay zero gas)
- **Storage**: Upstash Redis (user data, X username mapping)
- **Deployment**: Render

## Why StarkZap?

The core challenge: every correct word needs to fire an on-chain transaction. That means during a 30-second race, a fast typist could trigger 30+ transactions. If each one required a wallet popup confirmation, the game would be unplayable.

**StarkZap solves this.** It provides a `WalletInterface` that wraps Privy's server-side wallets and lets you fire transactions programmatically — no popups, no confirmations, no friction. The user logs in with Twitter, StarkZap creates an embedded Starknet wallet behind the scenes, and from there every `wallet.execute()` call just... works.

```typescript
import { StarkSDK } from "starkzap";
import type { WalletInterface } from "starkzap";

// Initialize after Privy login
const sdk = new StarkSDK({ rpcUrl: RPC_URL });
const wallet: WalletInterface = await sdk.getPrivyWallet({
  privyUser: user,
  getAccessToken,
  apiUrl: API_URL,
});

// Fire transactions with zero friction
await wallet.execute([{
  contractAddress: CONTRACT_ADDRESS,
  entrypoint: "record_keystroke",
  calldata: [raceId],
}]);
```

No MetaMask. No ArgentX. No popups. Just instant transactions.

## The Smart Contract

The Cairo contract is straightforward. It tracks races, keystrokes, WPM, and handles reward distribution:

```rust
#[starknet::interface]
pub trait ITypeRacer<TContractState> {
    fn start_race(ref self: TContractState, challenge_id: u32) -> u64;
    fn record_keystroke(ref self: TContractState, race_id: u64);
    fn finish_race(ref self: TContractState, race_id: u64, ...);
    fn distribute_reward(ref self: TContractState, user: ContractAddress, race_id: u64);
}
```

Key design decisions:

1. **3-race limit per account** — prevents farming. You get 3 races, make them count.
2. **0.1 STRK per correct word** — the contract holds a STRK balance, and the admin (server) calls `distribute_reward` after each race.
3. **Keystroke recording is fire-and-forget** — if a keystroke tx arrives after the race ends, the contract silently ignores it instead of reverting. This is important because with parallel transactions, some will inevitably land late.

```rust
fn record_keystroke(ref self: ContractState, race_id: u64) {
    let mut race = self.races.read(race_id);
    // Silently return instead of reverting
    if race.finished { return; }
    if caller != race.racer { return; }
    race.keystroke_count = race.keystroke_count + 1;
    self.races.write(race_id, race);
}
```

## The Parallel Transaction Engine

This is where it gets fun. When you type a word correctly, the frontend doesn't wait for the previous transaction to confirm before sending the next one. It fires them in parallel, up to 5 concurrent transactions at once:

```typescript
const MAX_CONCURRENT_TXS = 5;

const recordWord = (wordNumber: number) => {
  const raceId = activeRaceIdRef.current;
  if (!raceId) {
    // Race hasn't started on-chain yet — buffer for later
    earlyWordsRef.current.push(wordNumber);
    return;
  }
  enqueueWord(wordNumber, raceId);
};
```

There's a queue system: if all 5 slots are full, new transactions wait. When one completes, the next in queue fires immediately. Each transaction has a 20-second timeout.

The `earlyWordsRef` handles a race condition (pun intended): the user might type words before `start_race` confirms on-chain. Those words get buffered and replayed once we have a `raceId`.

## Auth Flow: Twitter Login to Starknet Wallet

Users log in with their Twitter/X account via Privy. Behind the scenes:

1. User clicks "Login with X" → Privy OAuth flow
2. Server creates an embedded Starknet wallet via Privy's server SDK
3. StarkZap wraps that wallet into a `WalletInterface`
4. The AVNU Paymaster sponsors all gas fees — users never need to hold ETH/STRK for gas

```typescript
// Server-side: create wallet on first login
const wallet = await getPrivy().wallets().create({ chain_type: "starknet" });

// Map the wallet address to their X username (for the leaderboard)
await setXUsername(wallet.address, xUsername);
```

## Reward Distribution

After a race finishes, the server calls `distribute_reward` on the contract. This is an admin-only function — the server signs the transaction with the admin private key using Starknet V3 invoke transactions:

```typescript
// Server builds + signs + submits the reward tx
const executeCalldata = [
  "0x1",
  CONTRACT_ADDRESS,
  hash.getSelectorFromName("distribute_reward"),
  num.toHex(innerCalldata.length),
  ...innerCalldata,
];

// Sign with admin key
const signature = ec.starkCurve.sign(
  encode.removeHexPrefix(txHash),
  encode.removeHexPrefix(ADMIN_PRIVATE_KEY)
);

// Submit via RPC
await rpc("starknet_addInvokeTransaction", { invoke_transaction: signedTx });
```

The contract transfers STRK directly to the user's wallet. No claiming, no extra steps. You finish the race, you get paid.

## The UX

The game has a retro hacker terminal aesthetic:

- **CRT scanline overlay** on the entire page
- **Matrix-style green text** on black background
- **Cash floaters** — when you type a word correctly, a "+$0.1" floats up and fades away
- **Real-time transaction log** in the sidebar showing each word tx pending/confirmed/failed
- **WPM graph** on the results screen
- **Full-screen reward overlay** showing your earnings with confetti

Every visual element reinforces the feeling: you're earning money in real-time, one word at a time.

## Lessons Learned

### 1. Parallel transactions are hard
When you have 5 transactions in flight and the race ends, some will land after `finish_race`. If your contract reverts on those, the user sees errors. Make your contract gracefully handle late arrivals.

### 2. Embedded wallets change everything
The UX difference between "click approve 30 times during a typing race" and "just type and transactions happen" is the difference between unusable and addictive. StarkZap + Privy embedded wallets make this possible.

### 3. Gas sponsorship is table stakes for games
Nobody is going to fund a wallet with ETH to play a typing game. AVNU Paymaster covers gas for every transaction. The user experience is: log in with Twitter, start typing, earn STRK. Zero crypto knowledge required.

### 4. Starknet V3 transactions have tricky resource bounds
Getting the `l1_gas`, `l2_gas`, and `l1_data_gas` bounds right took some iteration. Too high and you exceed your wallet balance. Too low and the transaction gets rejected. The sweet spot for this app:

```typescript
const l1Gas = { maxAmount: 0x100, maxPrice: 0x100000000000000 };
const l2Gas = { maxAmount: 0x100000, maxPrice: 0x1000000000 };
const l1DataGas = { maxAmount: 0x100, maxPrice: 0x100000000000000 };
```

### 5. Build something people actually want to use
At the end of the day, typing games are fun. Getting paid to play makes them addictive. The blockchain part is invisible — users just see Twitter login, a typing game, and STRK appearing in their wallet.

## Try It

The game is live at [earnmoneyfortyping.xyz](https://earnmoneyfortyping.xyz). Log in with your X account, type fast, earn STRK.

Contract on Voyager: [`0x031cd3a...d13cb`](https://voyager.online/contract/0x031cd3a42c317d1118f3f4d6e663f6304d8e9c070370eb16e484ab8e3d7d13cb)

---

*Built with Next.js, Cairo, StarkZap, Privy, and AVNU Paymaster on Starknet mainnet.*
