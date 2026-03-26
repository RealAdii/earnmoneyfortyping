"use client";

import { VOYAGER_CONTRACT } from "@/lib/constants";

interface WalletStatusProps {
  isAuthenticated: boolean;
  walletAddress: string | null;
  walletReady: boolean;
  xUsername?: string | null;
  strkBalance?: number | null;
  onLogin: () => void;
  onLogout: () => void;
}

function truncate(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

export default function WalletStatus({
  isAuthenticated,
  walletAddress,
  walletReady,
  xUsername,
  strkBalance,
  onLogin,
  onLogout,
}: WalletStatusProps) {
  return (
    <div className="wallet-bar">
      <div className="wallet-info">
        {walletAddress ? (
          <>
            <span style={{ color: walletReady ? "var(--text-primary)" : "#ffaa00" }}>
              {walletReady ? "[CONNECTED]" : "[CONNECTING...]"}
            </span>
            {xUsername && (
              <span style={{ color: "var(--text-primary)", marginLeft: 8 }}>
                @{xUsername}
              </span>
            )}
            <a
              href={VOYAGER_CONTRACT(walletAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="wallet-address"
              title={walletAddress}
            >
              {truncate(walletAddress)}
            </a>
            {strkBalance !== null && strkBalance !== undefined && (
              <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                Earned: {strkBalance.toFixed(1)} STRK
              </span>
            )}
          </>
        ) : isAuthenticated ? (
          <span style={{ color: "#ffaa00" }}>
            <span className="spinner" /> Setting up wallet...
          </span>
        ) : (
          <span style={{ color: "var(--text-dim)" }}>[NOT CONNECTED]</span>
        )}
      </div>

      <div>
        {isAuthenticated ? (
          <button className="btn btn-secondary" onClick={onLogout}>
            Disconnect
          </button>
        ) : (
          <button className="btn" onClick={onLogin}>
            Connect
          </button>
        )}
      </div>
    </div>
  );
}
