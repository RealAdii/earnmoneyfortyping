"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

interface WpmSample {
  time: number;
  wpm: number;
}

interface RewardInfo {
  success: boolean;
  txHash?: string;
  error?: string;
}

interface RaceResultsProps {
  wpm: number;
  accuracy: number;
  totalWords: number;
  correctWords: number;
  txSuccess: number;
  txTotal: number;
  finishTxHash?: string;
  finishExplorerUrl?: string;
  isNewBest: boolean;
  elapsedMs: number;
  wpmHistory: WpmSample[];
  rewardResult?: RewardInfo | null;
  racesRemaining: number;
  strkPerWord: number;
  onRaceAgain: () => void;
  onViewLeaderboard: () => void;
  onSendPrivately?: () => void;
}

function fireConfetti() {
  const colors = ["#00ff41", "#00cc33", "#33ff66", "#ffffff", "#88ff88", "#ffdd00"];

  // Big burst from both sides
  confetti({
    particleCount: 100,
    spread: 80,
    origin: { x: 0.1, y: 0.6 },
    colors,
    startVelocity: 40,
    zIndex: 10000,
  });
  confetti({
    particleCount: 100,
    spread: 80,
    origin: { x: 0.9, y: 0.6 },
    colors,
    startVelocity: 40,
    zIndex: 10000,
  });

  // Center burst after short delay
  setTimeout(() => {
    confetti({
      particleCount: 60,
      spread: 120,
      origin: { x: 0.5, y: 0.35 },
      colors,
      startVelocity: 50,
      zIndex: 10000,
    });
  }, 250);

  // Extra burst when reward confirmed
  setTimeout(() => {
    confetti({
      particleCount: 40,
      spread: 360,
      origin: { x: 0.5, y: 0.5 },
      colors,
      startVelocity: 25,
      ticks: 80,
      zIndex: 10000,
    });
  }, 600);
}

export default function RaceResults({
  wpm,
  accuracy,
  totalWords,
  correctWords,
  txSuccess,
  txTotal,
  finishExplorerUrl,
  isNewBest,
  elapsedMs,
  wpmHistory,
  rewardResult,
  racesRemaining,
  strkPerWord,
  onRaceAgain,
  onViewLeaderboard,
  onSendPrivately,
}: RaceResultsProps) {
  const elapsedSec = Math.round(elapsedMs / 1000);
  const rewardAmount = correctWords * strkPerWord;
  const confettiFired = useRef(false);
  const rewardConfettiFired = useRef(false);

  // Fire confetti on mount
  useEffect(() => {
    if (!confettiFired.current) {
      confettiFired.current = true;
      fireConfetti();
    }
  }, []);

  // Extra confetti when reward succeeds
  useEffect(() => {
    if (rewardResult?.success && !rewardConfettiFired.current) {
      rewardConfettiFired.current = true;
      setTimeout(() => fireConfetti(), 300);
    }
  }, [rewardResult]);

  return (
    <div className="reward-overlay">
      {/* WPM Hero */}
      <div className="reward-wpm">{wpm}</div>
      <div className="reward-wpm-label">words per minute</div>

      {isNewBest && (
        <div style={{
          color: "#ffdd00",
          fontWeight: "bold",
          fontSize: "1rem",
          textShadow: "0 0 20px rgba(255,221,0,0.5)",
          marginBottom: 16,
          letterSpacing: 2,
        }}>
          NEW PERSONAL BEST
        </div>
      )}

      {/* Reward Amount - Big and Bold */}
      <div className="reward-amount">+{rewardAmount.toFixed(1)} STRK</div>
      <div className="reward-subtitle">
        {correctWords} correct words x {strkPerWord} STRK
      </div>

      {/* Reward Status */}
      {rewardResult && rewardResult.success && (
        <div className="reward-status" style={{ color: "#00ff41" }}>
          Reward distributed on-chain
        </div>
      )}
      {rewardResult && !rewardResult.success && (
        <div className="reward-status" style={{ color: "#ff4141" }}>
          Reward failed: {rewardResult.error}
        </div>
      )}
      {!rewardResult && (
        <div className="reward-status" style={{
          color: "var(--text-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}>
          <span style={{
            width: 14,
            height: 14,
            border: "2px solid rgba(0,255,65,0.2)",
            borderTopColor: "#00ff41",
            borderRadius: "50%",
            display: "inline-block",
            animation: "spin 0.8s linear infinite",
          }} />
          Distributing reward...
        </div>
      )}

      {/* Stats Row */}
      <div className="reward-stats">
        <div className="reward-stat-item">
          <div className="reward-stat-value">{accuracy}%</div>
          <div className="reward-stat-label">Accuracy</div>
        </div>
        <div className="reward-stat-item">
          <div className="reward-stat-value">{txSuccess}</div>
          <div className="reward-stat-label">On-Chain TXs</div>
        </div>
        <div className="reward-stat-item">
          <div className="reward-stat-value">{elapsedSec}s</div>
          <div className="reward-stat-label">Time</div>
        </div>
        <div className="reward-stat-item">
          <div className="reward-stat-value">
            {txTotal > 0 ? Math.round((txSuccess / txTotal) * 100) : 0}%
          </div>
          <div className="reward-stat-label">TX Success</div>
        </div>
      </div>

      {/* Explorer Link */}
      {finishExplorerUrl && (
        <div className="reward-explorer">
          Race verified on-chain:{" "}
          <a href={finishExplorerUrl} target="_blank" rel="noopener noreferrer">
            View on Voyager
          </a>
        </div>
      )}

      {/* Races Remaining */}
      <div className="reward-remaining">
        {racesRemaining > 0
          ? `${racesRemaining} race${racesRemaining === 1 ? "" : "s"} remaining`
          : "No races remaining"}
      </div>

      {/* Actions */}
      <div className="reward-actions">
        <button
          className="btn btn-large"
          onClick={onRaceAgain}
          disabled={racesRemaining <= 0}
        >
          {racesRemaining > 0 ? "Play Again" : "No Races Left"}
        </button>
        <button className="btn btn-secondary" onClick={onViewLeaderboard}>
          Leaderboard
        </button>
        {rewardResult?.success && onSendPrivately && (
          <button
            className="btn btn-secondary"
            onClick={onSendPrivately}
            style={{ borderColor: "#9945ff", color: "#9945ff" }}
          >
            Send Privately
          </button>
        )}
      </div>
    </div>
  );
}
