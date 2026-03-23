"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { CONTRACT_ADDRESS, GAME_CONFIG, VOYAGER_TX, API_URL } from "@/lib/constants";

const { TX_TIMEOUT_MS, MAX_CONCURRENT_TXS } = GAME_CONFIG;

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

  // Parallel fire-and-forget (like Winky)
  const queueRef = useRef<QueueItem[]>([]);
  const walletRef = useRef(wallet);
  const inflightRef = useRef(0);
  // Words typed before raceId is available
  const earlyWordsRef = useRef<number[]>([]);

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

  const submitTx = useCallback(
    (item: QueueItem) => {
      const w = walletRef.current;
      if (!w) return;

      inflightRef.current++;

      const timeout = setTimeout(() => {
        inflightRef.current--;
        updateTxEntry(item.txId, { status: "error", error: "Timeout" });
        while (inflightRef.current < MAX_CONCURRENT_TXS && queueRef.current.length > 0) {
          submitTx(queueRef.current.shift()!);
        }
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
          while (inflightRef.current < MAX_CONCURRENT_TXS && queueRef.current.length > 0) {
            submitTx(queueRef.current.shift()!);
          }
        })
        .catch((err: any) => {
          clearTimeout(timeout);
          inflightRef.current--;
          updateTxEntry(item.txId, {
            status: "error",
            error: err?.message || "Failed",
          });
          while (inflightRef.current < MAX_CONCURRENT_TXS && queueRef.current.length > 0) {
            submitTx(queueRef.current.shift()!);
          }
        });
    },
    [updateTxEntry]
  );

  // enqueueWord must be defined BEFORE startRace and recordWord
  const enqueueWord = useCallback(
    (wordNumber: number, raceId: string) => {
      const txId = `w-${txIdCounter.current++}`;

      addTxEntry({
        id: txId,
        status: "pending",
        wordNumber,
        timestamp: Date.now(),
      });

      const item = { txId, wordNumber, raceId };

      if (inflightRef.current < MAX_CONCURRENT_TXS) {
        submitTx(item);
      } else {
        queueRef.current.push(item);
      }
    },
    [addTxEntry, submitTx]
  );

  const startRace = useCallback(
    async (challengeId: number): Promise<string | null> => {
      if (!wallet) return null;
      setIsStarting(true);
      setTxLog([]);
      queueRef.current = [];
      earlyWordsRef.current = [];

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

        // Replay any words typed before raceId was available
        const earlyWords = earlyWordsRef.current;
        earlyWordsRef.current = [];
        for (const wordNum of earlyWords) {
          enqueueWord(wordNum, raceId);
        }

        return raceId;
      } catch (err: any) {
        console.error("start_race failed:", err);
        return null;
      } finally {
        setIsStarting(false);
      }
    },
    [wallet, enqueueWord]
  );

  const recordWord = useCallback(
    (wordNumber: number) => {
      if (!walletRef.current) return;

      const raceId = activeRaceIdRef.current;
      if (!raceId) {
        // Race not started yet — save for later
        earlyWordsRef.current.push(wordNumber);
        return;
      }

      enqueueWord(wordNumber, raceId);
    },
    [enqueueWord]
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

      // Wait for in-flight txs to settle (max 5s, skip if none pending)
      if (inflightRef.current > 0 || queueRef.current.length > 0) {
        const waitStart = Date.now();
        while (
          (inflightRef.current > 0 || queueRef.current.length > 0) &&
          Date.now() - waitStart < 5_000
        ) {
          await new Promise((r) => setTimeout(r, 200));
        }
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

        // Fire reward claim immediately without waiting for finish_race confirmation
        const userAddress = w.address;
        if (userAddress) {
          // Wait for tx confirmation and claim reward in parallel
          tx.wait().catch(() => {});
          const reward = await claimReward(raceId, userAddress);
          setRewardResult(reward);
        } else {
          await tx.wait();
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
