"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { RPC_URL, TONGO_CONTRACTS, STORAGE_KEYS } from "@/lib/constants";

type TongoStep = "idle" | "funding" | "withdrawing" | "done" | "error";

interface UseTongoOpts {
  wallet: any;
  walletAddress: string | null;
}

function getOrCreateTongoKey(): string {
  let pk = localStorage.getItem(STORAGE_KEYS.tongoPrivateKey);
  if (!pk) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    bytes[0] &= 0x0f; // keep within Stark field
    pk = "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(STORAGE_KEYS.tongoPrivateKey, pk);
  }
  return pk;
}

/**
 * Recursively patch all blockIdentifier properties on a provider to "latest".
 * Needed because Cartridge RPC doesn't support "pending" block identifier.
 */
function patchBlockIdentifier(obj: any, depth = 0): void {
  if (!obj || typeof obj !== "object" || depth > 5) return;
  if ("blockIdentifier" in obj) {
    obj.blockIdentifier = "latest";
  }
  // Patch nested channel/provider references
  if (obj.channel) patchBlockIdentifier(obj.channel, depth + 1);
  if (obj.provider) patchBlockIdentifier(obj.provider, depth + 1);
  if (obj.providerOrAccount) patchBlockIdentifier(obj.providerOrAccount, depth + 1);
}

export function useTongo({ wallet, walletAddress }: UseTongoOpts) {
  const [step, setStep] = useState<TongoStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const walletRef = useRef(wallet);

  useEffect(() => { walletRef.current = wallet; }, [wallet]);

  const sendPrivately = useCallback(
    async (recipientAddress: string, amountStrk: number) => {
      const w = walletRef.current;
      if (!w || !walletAddress) {
        setError("Wallet not connected");
        setStep("error");
        return;
      }

      setStep("funding");
      setError(null);
      setTxHash(null);

      try {
        const { Account } = await import("@fatsolutions/tongo-sdk");
        const { RpcProvider } = await import("starknet");

        const tongoKey = getOrCreateTongoKey();
        const provider = new RpcProvider({ nodeUrl: RPC_URL });

        // Patch "pending" → "latest" everywhere (Cartridge RPC rejects "pending")
        patchBlockIdentifier(provider);

        const account = new Account(
          tongoKey,
          TONGO_CONTRACTS.STRK,
          provider as any
        );

        // Also patch the internal Contract's provider chain
        patchBlockIdentifier((account as any).Tongo);
        patchBlockIdentifier((account as any).provider);

        // Convert STRK to wei (18 decimals) then to tongo units
        const amountWei = BigInt(Math.floor(amountStrk * 1e18));
        const tongoAmount = await account.erc20ToTongo(amountWei);

        // Fund confidential account (approve + deposit)
        const fundOp = await account.fund({
          amount: tongoAmount,
          sender: walletAddress,
        });

        await fundOp.populateApprove();
        const fundCalls: any[] = [];
        if (fundOp.approve) fundCalls.push(fundOp.approve);
        fundCalls.push(fundOp.toCalldata());

        let fundTx: any;
        try {
          fundTx = await w.execute(fundCalls);
        } catch (execErr: any) {
          // Paymaster may reject Tongo txs — show a clear message
          const msg = execErr?.message || String(execErr);
          if (msg.includes("paymaster") || msg.includes("sponsor") || msg.includes("resources")) {
            throw new Error("Paymaster cannot sponsor Tongo transactions. Your wallet needs STRK for gas fees.");
          }
          throw execErr;
        }
        await fundTx.wait();

        // Withdraw to recipient (breaks on-chain link through Tongo pool)
        setStep("withdrawing");

        const withdrawOp = await account.withdraw({
          amount: tongoAmount,
          to: recipientAddress,
          sender: walletAddress,
        });

        let withdrawTx: any;
        try {
          withdrawTx = await w.execute([withdrawOp.toCalldata()]);
        } catch (execErr: any) {
          const msg = execErr?.message || String(execErr);
          if (msg.includes("paymaster") || msg.includes("sponsor") || msg.includes("resources")) {
            throw new Error("Paymaster cannot sponsor Tongo transactions. Your wallet needs STRK for gas fees.");
          }
          throw execErr;
        }
        await withdrawTx.wait();

        setTxHash(withdrawTx.hash);
        setStep("done");
      } catch (err: any) {
        console.error("Tongo send failed:", err);
        setError(err?.message || "Private send failed");
        setStep("error");
      }
    },
    [walletAddress]
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setTxHash(null);
  }, []);

  return { sendPrivately, step, error, txHash, reset };
}
