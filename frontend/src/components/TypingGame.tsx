"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { StarkSDK } from "starkzap";
import type { WalletInterface } from "starkzap";
import ChallengeText from "./ChallengeText";
import TransactionLog from "./TransactionLog";
import RaceResults from "./RaceResults";
import Leaderboard from "./Leaderboard";
import WalletStatus from "./WalletStatus";
import PrivateSend from "./PrivateSend";
import { useTypingContract } from "@/hooks/use-typing-contract";
import { useTongo } from "@/hooks/use-tongo";
import { generateChallenge, type GeneratedChallenge } from "@/lib/challenges";
import {
  API_URL,
  CONTRACT_ADDRESS,
  RPC_URL,
  NETWORK,
  GAME_CONFIG,
  STORAGE_KEYS,
  UNLIMITED_RACE_ADDRESSES,
} from "@/lib/constants";

type GameState = "idle" | "countdown" | "racing" | "finished";

export default function TypingGame() {
  const { ready, authenticated, user, login, logout, getAccessToken } =
    usePrivy();

  // Wallet state
  const [wallet, setWallet] = useState<WalletInterface | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [xUsername, setXUsername] = useState<string | null>(null);
  const sdkRef = useRef<StarkSDK | null>(null);

  // Game state
  const [gameState, setGameState] = useState<GameState>("idle");
  const [challenge, setChallenge] = useState<GeneratedChallenge | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [startTime, setStartTime] = useState(0);
  const [currentWpm, setCurrentWpm] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [finishResult, setFinishResult] = useState<{
    hash: string;
    explorerUrl: string;
  } | null>(null);
  const [previousBest, setPreviousBest] = useState(0);

  // Word-level state
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentInput, setCurrentInput] = useState("");
  const [completedWords, setCompletedWords] = useState(0);
  const [wordResults, setWordResults] = useState<
    Array<"correct" | "incorrect" | "pending">
  >([]);
  const [timeRemaining, setTimeRemaining] = useState(
    GAME_CONFIG.RACE_DURATION_SECONDS
  );
  const [wpmHistory, setWpmHistory] = useState<
    Array<{ time: number; wpm: number }>
  >([]);
  const [finalElapsed, setFinalElapsed] = useState(0);

  const [cashFloaters, setCashFloaters] = useState<Array<{ id: number; x: number }>>([]);
  const cashIdRef = useRef(0);

  const spawnCash = useCallback(() => {
    const id = cashIdRef.current++;
    const x = 30 + Math.random() * 40; // random x position 30-70%
    setCashFloaters((prev) => [...prev, { id, x }]);
    setTimeout(() => {
      setCashFloaters((prev) => prev.filter((f) => f.id !== id));
    }, 1500);
  }, []);

  const spawnCashRef = useRef(spawnCash);
  useEffect(() => { spawnCashRef.current = spawnCash; }, [spawnCash]);

  const inputRef = useRef<HTMLInputElement>(null);
  const gameStateRef = useRef<GameState>("idle");
  const completedWordsRef = useRef(0);
  const currentWordIndexRef = useRef(0);
  const wordResultsRef = useRef<Array<"correct" | "incorrect" | "pending">>([]);
  const startTimeRef = useRef(0);
  const currentInputRef = useRef("");
  const challengeRef = useRef<GeneratedChallenge | null>(null);

  // Keep refs in sync
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  useEffect(() => {
    completedWordsRef.current = completedWords;
  }, [completedWords]);
  useEffect(() => {
    currentWordIndexRef.current = currentWordIndex;
  }, [currentWordIndex]);
  useEffect(() => {
    wordResultsRef.current = wordResults;
  }, [wordResults]);
  useEffect(() => {
    startTimeRef.current = startTime;
  }, [startTime]);

  // Race limit tracking
  const [userRaceCount, setUserRaceCount] = useState(0);
  const isUnlimited = walletAddress ? UNLIMITED_RACE_ADDRESSES.includes(walletAddress.toLowerCase()) : false;
  const racesRemaining = isUnlimited ? 999 : GAME_CONFIG.MAX_RACES_PER_USER - userRaceCount;

  const {
    startRace,
    recordWord,
    finishRace,
    txLog,
    clearLog,
    isStarting,
    isFinishing,
    rewardResult,
    successCount,
    pendingCount,
    isReady,
  } = useTypingContract({ wallet, getAccessToken });

  const [showPrivateSend, setShowPrivateSend] = useState(false);
  const tongo = useTongo({ wallet, walletAddress });

  // ─── Wallet Setup (Privy → Starkzap) ───
  useEffect(() => {
    if (!ready || !authenticated || !user?.id || wallet) return;

    const setupWallet = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;

        const walletRes = await fetch(`${API_URL}/api/wallet/starknet`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const walletData = await walletRes.json();

        if (!walletData.wallet) {
          console.error("No wallet in response:", walletData);
          return;
        }

        const { id: walletId, publicKey } = walletData.wallet;

        if (walletData.xUsername) {
          setXUsername(walletData.xUsername);
        }

        localStorage.setItem(STORAGE_KEYS.walletId, walletId);
        localStorage.setItem(STORAGE_KEYS.publicKey, publicKey);

        if (!sdkRef.current) {
          const sdkConfig: any = {
            network: NETWORK as "sepolia" | "mainnet",
          };
          if (process.env.NEXT_PUBLIC_AVNU_PAYMASTER === "true") {
            sdkConfig.paymaster = {
              nodeUrl: `${API_URL}/api/paymaster`,
            };
          }
          sdkRef.current = new StarkSDK(sdkConfig);
        }

        const feeMode = (process.env.NEXT_PUBLIC_AVNU_PAYMASTER === "true"
          ? "sponsored"
          : "strk_balance") as any;

        const result = await sdkRef.current.onboard({
          strategy: "privy",
          privy: {
            resolve: async () => ({
              walletId,
              publicKey,
              serverUrl: `${API_URL}/api/wallet/sign`,
            }),
          },
          deploy: "if_needed",
          feeMode,
        });

        setWallet(result.wallet);
        setWalletAddress(result.wallet.address);
        localStorage.setItem(
          STORAGE_KEYS.walletAddress,
          result.wallet.address
        );
      } catch (err) {
        console.error("Wallet setup failed:", err);
      }
    };

    setupWallet();
  }, [ready, authenticated, user?.id, wallet, getAccessToken]);

  // ─── Fetch user race count from chain ───
  useEffect(() => {
    if (!walletAddress) return;

    const fetchRaceCount = async () => {
      try {
        const { RpcProvider, Contract, BlockTag } = await import("starknet");
        const provider = new RpcProvider({ nodeUrl: RPC_URL, blockIdentifier: "latest" as any });
        const contract = new Contract(
          [
            {
              type: "function",
              name: "get_user_race_count",
              inputs: [{ name: "user", type: "core::starknet::contract_address::ContractAddress" }],
              outputs: [{ type: "core::integer::u32" }],
              state_mutability: "view",
            },
          ],
          CONTRACT_ADDRESS,
          provider
        );
        const count = await contract.call("get_user_race_count", [walletAddress], { blockIdentifier: "latest" as any });
        setUserRaceCount(Number(Array.isArray(count) ? count[0] : count));
      } catch (err) {
        console.error("Failed to fetch race count:", err);
      }
    };

    fetchRaceCount();
  }, [walletAddress, gameState]); // Re-fetch when game state changes (after finishing)

  // ─── Countdown Timer ───
  useEffect(() => {
    if (gameState !== "countdown") return;

    if (countdown <= 0) {
      setGameState("racing");
      setStartTime(Date.now());
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [gameState, countdown]);

  // ─── 30-Second Race Timer ───
  useEffect(() => {
    if (gameState !== "racing") return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Use refs to avoid stale closures
          doFinishRace();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Real-time WPM ───
  useEffect(() => {
    if (gameState !== "racing") return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed <= 0) return;
      const minutes = elapsed / 60000;
      setCurrentWpm(Math.round(completedWordsRef.current / minutes) || 0);
    }, 500);

    return () => clearInterval(interval);
  }, [gameState]);

  // ─── WPM Sampling for Graph ───
  useEffect(() => {
    if (gameState !== "racing") return;

    const interval = setInterval(() => {
      if (gameStateRef.current !== "racing") return;
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed <= 0) return;
      const minutes = elapsed / 60000;
      const wpm = Math.round(completedWordsRef.current / minutes) || 0;
      setWpmHistory((prev) => [
        ...prev,
        { time: Math.round(elapsed / 1000), wpm },
      ]);
    }, GAME_CONFIG.WPM_SAMPLE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [gameState]);

  // ─── Finish Race (ref-safe for timer callback) ───
  const doFinishRace = useCallback(async () => {
    if (gameStateRef.current === "finished") return;
    setGameState("finished");

    const rawElapsed = Date.now() - startTimeRef.current;
    const elapsed = Math.min(rawElapsed, GAME_CONFIG.RACE_DURATION_SECONDS * 1000);
    setFinalElapsed(elapsed);
    const minutes = elapsed / 60000;
    const finalWpm =
      Math.round(completedWordsRef.current / minutes) || 0;
    setCurrentWpm(finalWpm);

    // Add final sample
    setWpmHistory((prev) => [
      ...prev,
      { time: Math.round(elapsed / 1000), wpm: finalWpm },
    ]);

    // Calculate correct chars for on-chain finish
    const results = wordResultsRef.current;
    const idx = currentWordIndexRef.current;
    let correctCharCount = 0;
    let totalCharCount = 0;

    if (challenge) {
      for (let i = 0; i < idx; i++) {
        const wordLen = challenge.words[i].length;
        totalCharCount += wordLen;
        if (results[i] === "correct") {
          correctCharCount += wordLen;
        }
      }
    }

    // Calculate accuracy as percentage
    const finalAccuracy = idx > 0 ? Math.round((completedWordsRef.current / idx) * 100) : 100;

    const result = await finishRace(
      Math.max(correctCharCount, 0),
      Math.max(totalCharCount, 1),
      finalWpm,
      finalAccuracy
    );
    if (result) {
      setFinishResult(result);
    }
  }, [challenge, finishRace]);

  // ─── Start Race ───
  const handleStartRace = useCallback(async () => {
    const ch = generateChallenge();
    setChallenge(ch);
    challengeRef.current = ch;
    setCurrentWordIndex(0);
    currentWordIndexRef.current = 0;
    setCurrentInput("");
    currentInputRef.current = "";
    setCompletedWords(0);
    completedWordsRef.current = 0;
    setWordResults(ch.words.map(() => "pending" as const));
    setTimeRemaining(GAME_CONFIG.RACE_DURATION_SECONDS);
    setWpmHistory([]);
    clearLog();
    setFinishResult(null);
    setCurrentWpm(0);
    setFinalElapsed(0);
    setCountdown(GAME_CONFIG.COUNTDOWN_SECONDS);
    setGameState("countdown");

    const raceId = await startRace(0);
    if (!raceId && raceId !== "0") {
      console.warn("On-chain start_race failed, continuing locally");
    }
  }, [startRace, clearLog]);

  // ─── Handle Keystroke (word-level) ───
  // Use refs for the hot path to avoid stale closures when typing fast
  const recordWordRef = useRef(recordWord);
  useEffect(() => { recordWordRef.current = recordWord; }, [recordWord]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (gameStateRef.current !== "racing" || !challengeRef.current) return;

      if (
        ["Shift", "Control", "Alt", "Meta", "Tab", "Escape", "CapsLock"].includes(
          e.key
        )
      )
        return;

      e.preventDefault();

      if (e.key === "Backspace") {
        currentInputRef.current = currentInputRef.current.slice(0, -1);
        setCurrentInput(currentInputRef.current);
        return;
      }

      if (e.key === " ") {
        if (currentInputRef.current.length === 0) return;

        const idx = currentWordIndexRef.current;
        const ch = challengeRef.current;
        const expectedWord = ch.words[idx];
        const isCorrect = currentInputRef.current === expectedWord;

        const newIdx = idx + 1;
        currentWordIndexRef.current = newIdx;
        currentInputRef.current = "";

        setWordResults((prev) => {
          const next = [...prev];
          next[idx] = isCorrect ? "correct" : "incorrect";
          return next;
        });

        if (isCorrect) {
          completedWordsRef.current++;
          setCompletedWords(completedWordsRef.current);
          recordWordRef.current(completedWordsRef.current);
          spawnCashRef.current();
        }

        setCurrentWordIndex(newIdx);
        setCurrentInput("");
        return;
      }

      // Only printable characters
      if (e.key.length !== 1) return;

      currentInputRef.current += e.key;
      setCurrentInput(currentInputRef.current);
    },
    [] // No deps — reads everything from refs
  );

  // ─── Computed Values ───
  const accuracy =
    currentWordIndex > 0
      ? Math.round((completedWords / currentWordIndex) * 100)
      : 100;
  const elapsed = gameState === "finished"
    ? finalElapsed
    : startTime ? Date.now() - startTime : 0;
  const isNewBest = currentWpm > previousBest && previousBest > 0;

  // ─── Render ───
  return (
    <>
      {/* Header */}
      <div className="header">
        <h1 className="site-title">who&apos;s the fastest on CT</h1>
        <div className="subtitle">
          Earn STRK for every word you type correctly
        </div>
      </div>

      {/* Wallet Status */}
      <WalletStatus
        isAuthenticated={authenticated}
        walletAddress={walletAddress}
        walletReady={isReady}
        xUsername={xUsername}
        onLogin={login}
        onLogout={async () => {
          if (wallet) {
            try {
              await wallet.disconnect();
            } catch {}
          }
          setWallet(null);
          setWalletAddress(null);
          setXUsername(null);
          sdkRef.current = null;
          localStorage.removeItem(STORAGE_KEYS.walletId);
          localStorage.removeItem(STORAGE_KEYS.walletAddress);
          localStorage.removeItem(STORAGE_KEYS.publicKey);
          logout();
        }}
      />

      {/* Main Game Area */}
      <div className="game-area">
        <div className="game-main">
          {/* Idle State */}
          {gameState === "idle" && (
            <div className="idle-screen">
              <h2>Ready to Race?</h2>
              <p>
                Type as fast as you can for 30 seconds. Every completed word
                fires an on-chain transaction on Starknet. Your WPM score is
                provably recorded on the blockchain.
              </p>

              {!authenticated && (
                <div style={{ marginBottom: 24 }}>
                  <button className="btn btn-large" onClick={login}>
                    Connect to Start
                  </button>
                </div>
              )}

              {authenticated && (
                <>
                  <button
                    className="btn btn-large"
                    onClick={handleStartRace}
                    disabled={isStarting || !isReady || racesRemaining <= 0}
                  >
                    {isStarting ? (
                      <>
                        <span className="spinner" /> Starting Race...
                      </>
                    ) : !isReady ? (
                      <>
                        <span className="spinner" /> Wallet Loading...
                      </>
                    ) : racesRemaining <= 0 ? (
                      "No Races Left"
                    ) : (
                      "Start Race"
                    )}
                  </button>
                  <div style={{
                    marginTop: 12,
                    color: "var(--text-secondary)",
                    fontSize: "0.85rem",
                  }}>
                    {racesRemaining > 0
                      ? `${racesRemaining} of ${GAME_CONFIG.MAX_RACES_PER_USER} races remaining | Earn ${GAME_CONFIG.STRK_PER_WORD} STRK per word`
                      : "You've used all your races"}
                  </div>
                </>
              )}

              <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowLeaderboard(true)}
                >
                  View Leaderboard
                </button>
                {authenticated && walletAddress && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      tongo.reset();
                      setShowPrivateSend(true);
                    }}
                    style={{ borderColor: "#9945ff", color: "#9945ff" }}
                  >
                    Send Privately
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Countdown */}
          {gameState === "countdown" && (
            <div className="countdown">
              <div className="countdown-number" key={countdown}>
                {countdown > 0 ? countdown : "GO!"}
              </div>
            </div>
          )}

          {/* Racing */}
          {gameState === "racing" && challenge && (
            <>
              {/* Cash floaters */}
              {cashFloaters.map((f) => (
                <div
                  key={f.id}
                  className="cash-floater"
                  style={{ left: `${f.x}%` }}
                >
                  +0.1 STRK
                </div>
              ))}
              <div className="stats-bar">
                <div className="stat">
                  <div className="stat-label">Time</div>
                  <div
                    className={`stat-value highlight ${timeRemaining <= 5 ? "timer-critical" : ""}`}
                  >
                    {timeRemaining}s
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">WPM</div>
                  <div className="stat-value highlight">{currentWpm}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Words</div>
                  <div className="stat-value">{completedWords}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">On-Chain TXs</div>
                  <div
                    className="stat-value"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {successCount}
                  </div>
                </div>
              </div>

              <ChallengeText
                words={challenge.words}
                wordResults={wordResults}
                currentWordIndex={currentWordIndex}
                currentInput={currentInput}
              />

              <input
                ref={inputRef}
                className="hidden-input"
                onKeyDown={handleKeyDown}
                autoFocus
                aria-label="Type here"
              />

              <div
                style={{
                  textAlign: "center",
                  marginTop: 20,
                  color: "var(--text-dim)",
                  fontSize: "0.75rem",
                }}
              >
                {currentWordIndex === 0 && currentInput.length === 0
                  ? "Start typing..."
                  : `${completedWords} words completed`}
              </div>
            </>
          )}

          {/* Finished */}
          {gameState === "finished" && challenge && (
            <RaceResults
              wpm={currentWpm}
              accuracy={accuracy}
              totalWords={currentWordIndex}
              correctWords={completedWords}
              txSuccess={successCount}
              txTotal={txLog.length}
              finishTxHash={finishResult?.hash}
              finishExplorerUrl={finishResult?.explorerUrl}
              isNewBest={isNewBest}
              elapsedMs={elapsed}
              wpmHistory={wpmHistory}
              rewardResult={rewardResult}
              racesRemaining={racesRemaining}
              strkPerWord={GAME_CONFIG.STRK_PER_WORD}
              onRaceAgain={() => {
                setGameState("idle");
                setCurrentInput("");
                setCurrentWordIndex(0);
                setCompletedWords(0);
              }}
              onViewLeaderboard={() => setShowLeaderboard(true)}
              onSendPrivately={() => {
                tongo.reset();
                setShowPrivateSend(true);
              }}
            />
          )}
        </div>

        {/* Transaction Log Sidebar */}
        <TransactionLog
          txLog={txLog}
          pendingCount={pendingCount}
          successCount={successCount}
        />
      </div>

      {/* Footer */}
      <div className="footer">
        Powered by{" "}
        <a
          href="https://github.com/0xsisyfos/starkzap"
          target="_blank"
          rel="noopener noreferrer"
        >
          Starkzap SDK
        </a>{" "}
        | Deployed on{" "}
        <a
          href="https://www.starknet.io"
          target="_blank"
          rel="noopener noreferrer"
        >
          Starknet
        </a>{" "}
        | Auth by{" "}
        <a
          href="https://privy.io"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privy
        </a>
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <Leaderboard onClose={() => setShowLeaderboard(false)} />
      )}

      {/* Private Send Modal */}
      {showPrivateSend && walletAddress && (
        <PrivateSend
          walletAddress={walletAddress}
          maxAmount={gameState === "finished" ? completedWords * GAME_CONFIG.STRK_PER_WORD : 0}
          step={tongo.step}
          error={tongo.error}
          txHash={tongo.txHash}
          onSend={(recipient, amount) => tongo.sendPrivately(recipient, amount)}
          onClose={() => setShowPrivateSend(false)}
        />
      )}
    </>
  );
}
