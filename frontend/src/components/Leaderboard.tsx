"use client";

import { useEffect } from "react";
import { useLeaderboard } from "@/hooks/use-leaderboard";

interface LeaderboardProps {
  onClose: () => void;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

export default function Leaderboard({ onClose }: LeaderboardProps) {
  const { entries, loading, refresh, totalRaces, totalKeystrokes } =
    useLeaderboard();

  useEffect(() => {
    refresh();
    // Auto-refresh after delay to catch recently confirmed txs
    const timer = setTimeout(() => refresh(), 5000);
    return () => clearTimeout(timer);
  }, [refresh]);

  return (
    <div className="leaderboard-overlay" onClick={onClose}>
      <div
        className="leaderboard-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div className="leaderboard-title">On-Chain Leaderboard</div>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="global-stats" style={{ marginBottom: 20 }}>
          <div>
            Total Races: <span>{totalRaces}</span>
          </div>
          <div>
            Total Words: <span>{totalKeystrokes.toLocaleString()}</span>
          </div>
        </div>

        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "var(--text-muted)",
            }}
          >
            <span className="spinner" /> Loading from chain...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "var(--text-dim)",
            }}
          >
            No races completed yet. Be the first!
          </div>
        )}

        {!loading && entries.length > 0 && (
          <>
            <div className="leaderboard-row header">
              <div>#</div>
              <div>Racer</div>
              <div style={{ textAlign: "right" }}>WPM</div>
              <div style={{ textAlign: "right" }}>Races</div>
            </div>

            {entries.map((entry, i) => (
              <div key={entry.address} className="leaderboard-row">
                <div className={`rank ${i < 3 ? "top3" : ""}`}>{i + 1}</div>
                <div className="leaderboard-address">
                  {entry.xUsername
                    ? `@${entry.xUsername}`
                    : truncateAddress(entry.address)}
                </div>
                <div className="leaderboard-wpm">{entry.wpm}</div>
                <div className="leaderboard-races">{entry.races}</div>
              </div>
            ))}
          </>
        )}

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button className="btn btn-secondary" onClick={refresh}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}
