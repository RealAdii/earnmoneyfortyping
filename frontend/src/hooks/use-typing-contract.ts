"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { CONTRACT_ADDRESS, GAME_CONFIG, VOYAGER_TX, API_URL } from "@/lib/constants";

const { TX_TIMEOUT_MS } = GAME_CONFIG;
const SUBMIT_INTERVAL_MS = 300; // Min gap between paymaster submissions

export interface WordTx {
  id: string;
  status: "pending" | "success" | "error";
  hash?: string;
  error?: string;
  wordNumber: number;
  timestamp: number;
}

interface QueueItem {
  txId: string;
  wordNumber: number;
  raceId: string;
}

interface RewardResult {
  success: boolean;
  txHash?: string;
  error?: string;
  rewardAmount?: number;
}

interface UseTypingContractOpts {
  wallet: any;
  getAccessToken?: () => Promise<string | null>;
}

export function useTypingContract({ wallet, getAccessToken }: UseTypingContractOpts) {
  const [activeRaceId, setActiveRaceId] = useState<string | null>(null);
  const activeRaceIdRef = useRef<string | null>(null);
  const [txLog, setTxLog] = useState<WordTx[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [rewardResult, setRewardResult] = useState<RewardResult | null>(null);
  const txIdCounter = useRef(0);
  const getAccessTokenRef = useRef(getAccessToken);

  useEffect(() => {
    getAccessTokenRef.current = getAccessToken;
  }, [getAccessToken]);

  // Staggered submission queue
  const queueRef = useRef<QueueItem[]>([]);
  const drainRunning = useRef(false);
  const walletRef = useRef(wallet);
  const inflightRef = useRef(0);

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);

  useEffect(() => {
    activeRaceIdRef.current = activeRaceId;
  }, [activeRaceId]);

  const addTxEntry = useCallback((entry: WordTx) => {
    setTxLog((prev) => [entry, ...prev].slice(0, 200));
  }, []);

  const updateTxEntry = useCallback((id: string, update: Partial<WordTx>) => {
    setTxLog((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, ...update } : tx))
    );
  }, []);

  // Drain queue: submit one tx every SUBMIT_INTERVAL_MS (fire-and-forget each)
  const drainQueue = useCallback(() => {
    if (drainRunning.current) return;
    drainRunning.current = true;

    const tick = () => {
      const item = queueRef.current.shift();
      if (!item) {
        drainRunning.current = false;
        return;
      }

      const w = walletRef.current;
      if (!w) {
        drainRunning.current = false;
        return;
      }

      // Fire-and-forget: submit but don't await
      inflightRef.current++;

      const timeout = setTimeout(() => {
        inflightRef.current--;
        updateTxEntry(item.txId, { status: "error", error: "Timeout" });
      }, TX_TIMEOUT_MS);

      w.execute([
        {
          contractAddress: CONTRACT_ADDRESS,
          entrypoint: "record_keystroke",
          calldata: [item.raceId],
        },
      ])
        .then((tx: any) => {
          clearTimeout(timeout);
          inflightRef.current--;
          updateTxEntry(item.txId, { status: "success", hash: tx.hash });
        })
        .catch((err: any) => {
          clearTimeout(timeout);
          inflightRef.current--;
          updateTxEntry(item.txId, {
            status: "error",
            error: err?.message || "Failed",
          });
        });

      // Schedule next submission after interval
      setTimeout(tick, SUBMIT_INTERVAL_MS);
    };

    tick();
  }, [updateTxEntry]);

  const startRace = useCallback(
    async (challengeId: number): Promise<string | null> => {
      if (!wallet) return null;
      setIsStarting(true);
      setTxLog([]);
      queueRef.current = [];

      try {
        const tx = await wallet.execute([
          {
            contractAddress: CONTRACT_ADDRESS,
            entrypoint: "start_race",
            calldata: [challengeId.toString()],
          },
        ]);

        await tx.wait();

        const receipt = await tx.receipt();
        let raceId: string | null = null;

        if (receipt.events && receipt.events.length > 0) {
          for (const event of receipt.events) {
            if (event.data && event.data.length >= 1) {
              raceId = event.data[0];
              break;
            }
          }
        }

        if (!raceId) raceId = "0";

        setActiveRaceId(raceId);
        return raceId;
      } catch (err: any) {
        console.error("start_race failed:", err);
        return null;
      } finally {
        setIsStarting(false);
      }
    },
    [wallet]
  );

  const recordWord = useCallback(
    (wordNumber: number) => {
      const raceId = activeRaceIdRef.current;
      if (!walletRef.current || !raceId) return;

      const txId = `w-${txIdCounter.current++}`;

      addTxEntry({
        id: txId,
        status: "pending",
        wordNumber,
        timestamp: Date.now(),
      });

      // Enqueue and kick off drain
      queueRef.current.push({ txId, wordNumber, raceId });
      drainQueue();
    },
    [addTxEntry, drainQueue]
  );

  const claimReward = useCallback(
    async (raceId: string, userAddress: string): Promise<RewardResult> => {
      try {
        const token = getAccessTokenRef.current
          ? await getAccessTokenRef.current()
          : null;
        if (!token) {
          return { success: false, error: "Not authenticated" };
        }

        const res = await fetch(`${API_URL}/api/reward`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ raceId, userAddress }),
        });

        const data = await res.json();
        if (!res.ok) {
          return { success: false, error: data.error || "Reward claim failed" };
        }

        return { success: true, txHash: data.txHash };
      } catch (err: any) {
        console.error("Reward claim failed:", err);
        return { success: false, error: err.message || "Reward claim failed" };
      }
    },
    []
  );

  const finishRace = useCallback(
    async (
      correctChars: number,
      totalChars: number,
      wpm: number,
      accuracy: number
    ): Promise<{ hash: string; explorerUrl: string } | null> => {
      const w = walletRef.current;
      const raceId = activeRaceIdRef.current;
      if (!w || !raceId) return null;
      setIsFinishing(true);
      setRewardResult(null);

      // Wait for all in-flight txs to settle
      const waitStart = Date.now();
      while (
        (inflightRef.current > 0 || queueRef.current.length > 0) &&
        Date.now() - waitStart < 30_000
      ) {
        await new Promise((r) => setTimeout(r, 300));
      }

      try {
        const tx = await w.execute([
          {
            contractAddress: CONTRACT_ADDRESS,
            entrypoint: "finish_race",
            calldata: [
              raceId,
              correctChars.toString(),
              totalChars.toString(),
              wpm.toString(),
              accuracy.toString(),
            ],
          },
        ]);

        await tx.wait();

        // Claim reward via server
        const userAddress = w.address;
        if (userAddress) {
          const reward = await claimReward(raceId, userAddress);
          setRewardResult(reward);
        }

        setActiveRaceId(null);
        return { hash: tx.hash, explorerUrl: VOYAGER_TX(tx.hash) };
      } catch (err: any) {
        console.error("finish_race failed:", err);
        return null;
      } finally {
        setIsFinishing(false);
      }
    },
    [claimReward]
  );

  const clearLog = useCallback(() => {
    setTxLog([]);
    queueRef.current = [];
    setRewardResult(null);
  }, []);

  return {
    startRace,
    recordWord,
    finishRace,
    activeRaceId,
    txLog,
    clearLog,
    isStarting,
    isFinishing,
    rewardResult,
    pendingCount: txLog.filter((t) => t.status === "pending").length,
    successCount: txLog.filter((t) => t.status === "success").length,
    isReady: !!wallet,
  };
}
