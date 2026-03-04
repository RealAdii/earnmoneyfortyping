"use client";

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
}

function WpmGraph({ data }: { data: WpmSample[] }) {
  if (data.length < 2) return null;

  const width = 500;
  const height = 160;
  const pad = { top: 20, right: 20, bottom: 30, left: 45 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxTime = Math.max(...data.map((d) => d.time), 30);
  const maxWpm = Math.max(...data.map((d) => d.wpm), 10);

  const toX = (t: number) => pad.left + (t / maxTime) * plotW;
  const toY = (w: number) => pad.top + plotH - (w / maxWpm) * plotH;

  const pathD = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(d.time)} ${toY(d.wpm)}`)
    .join(" ");

  const areaD =
    pathD +
    ` L ${toX(data[data.length - 1].time)} ${toY(0)}` +
    ` L ${toX(data[0].time)} ${toY(0)} Z`;

  const yTicks = Array.from({ length: 5 }, (_, i) =>
    Math.round((maxWpm / 4) * i)
  );
  const xTicks = [0, 10, 20, 30].filter((t) => t <= maxTime);

  return (
    <div className="wpm-graph">
      <div className="wpm-graph-title">WPM Over Time</div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }}>
        {yTicks.map((tick) => (
          <line
            key={`yg-${tick}`}
            x1={pad.left}
            y1={toY(tick)}
            x2={width - pad.right}
            y2={toY(tick)}
            stroke="rgba(0,255,65,0.1)"
            strokeDasharray="2,4"
          />
        ))}
        <path d={areaD} fill="rgba(0,255,65,0.06)" />
        <path
          d={pathD}
          fill="none"
          stroke="#00ff41"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => (
          <circle key={i} cx={toX(d.time)} cy={toY(d.wpm)} r="3" fill="#00ff41" />
        ))}
        {yTicks.map((tick) => (
          <text
            key={`yl-${tick}`}
            x={pad.left - 8}
            y={toY(tick) + 4}
            textAnchor="end"
            fill="rgba(0,255,65,0.5)"
            fontSize="10"
            fontFamily="monospace"
          >
            {tick}
          </text>
        ))}
        {xTicks.map((tick) => (
          <text
            key={`xl-${tick}`}
            x={toX(tick)}
            y={height - 5}
            textAnchor="middle"
            fill="rgba(0,255,65,0.5)"
            fontSize="10"
            fontFamily="monospace"
          >
            {tick}s
          </text>
        ))}
      </svg>
    </div>
  );
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
}: RaceResultsProps) {
  const elapsedSec = Math.round(elapsedMs / 1000);
  const rewardAmount = correctWords * strkPerWord;

  return (
    <div className="results">
      <div className="results-wpm">{wpm}</div>
      <div className="results-label">words per minute</div>

      {isNewBest && <div className="new-best">New Personal Best!</div>}

      {/* Reward Section */}
      <div className="results-reward" style={{
        margin: "16px 0",
        padding: "12px 16px",
        border: "1px solid rgba(0,255,65,0.3)",
        borderRadius: 8,
        textAlign: "center",
      }}>
        <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#00ff41" }}>
          +{rewardAmount.toFixed(1)} STRK
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
          {correctWords} correct words x {strkPerWord} STRK
        </div>
        {rewardResult && rewardResult.success && (
          <div style={{ fontSize: "0.75rem", color: "#00ff41", marginTop: 8 }}>
            Reward distributed on-chain
          </div>
        )}
        {rewardResult && !rewardResult.success && (
          <div style={{ fontSize: "0.75rem", color: "#ff4141", marginTop: 8 }}>
            Reward failed: {rewardResult.error}
          </div>
        )}
        {!rewardResult && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 8 }}>
            Distributing reward...
          </div>
        )}
      </div>

      <WpmGraph data={wpmHistory} />

      <div className="results-grid">
        <div className="results-stat">
          <div className="value">{accuracy}%</div>
          <div className="label">Accuracy</div>
        </div>
        <div className="results-stat">
          <div className="value">
            {correctWords}/{totalWords}
          </div>
          <div className="label">Correct Words</div>
        </div>
        <div className="results-stat">
          <div className="value">{elapsedSec}s</div>
          <div className="label">Time</div>
        </div>
      </div>

      <div className="results-grid">
        <div className="results-stat">
          <div className="value" style={{ color: "var(--text-primary)" }}>
            {txSuccess}
          </div>
          <div className="label">On-Chain TXs</div>
        </div>
        <div className="results-stat">
          <div className="value">{totalWords}</div>
          <div className="label">Words Typed</div>
        </div>
        <div className="results-stat">
          <div className="value">
            {txTotal > 0 ? Math.round((txSuccess / txTotal) * 100) : 0}%
          </div>
          <div className="label">TX Success Rate</div>
        </div>
      </div>

      {finishExplorerUrl && (
        <div className="results-tx-link">
          Race verified on-chain:{" "}
          <a href={finishExplorerUrl} target="_blank" rel="noopener noreferrer">
            View on Voyager
          </a>
        </div>
      )}

      <div style={{
        textAlign: "center",
        margin: "12px 0",
        color: "var(--text-secondary)",
        fontSize: "0.85rem",
      }}>
        {racesRemaining > 0
          ? `${racesRemaining} race${racesRemaining === 1 ? "" : "s"} remaining`
          : "No races remaining"}
      </div>

      <div className="results-actions">
        <button
          className="btn btn-large"
          onClick={onRaceAgain}
          disabled={racesRemaining <= 0}
        >
          {racesRemaining > 0 ? "Race Again" : "No Races Left"}
        </button>
        <button className="btn btn-secondary" onClick={onViewLeaderboard}>
          Leaderboard
        </button>
      </div>
    </div>
  );
}
