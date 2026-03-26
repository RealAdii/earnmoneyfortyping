"use client";

import { useState, useCallback } from "react";
import { RpcProvider } from "starknet";
import { CONTRACT_ADDRESS, RPC_URL, API_URL } from "@/lib/constants";

export interface LeaderboardEntry {
  address: string;
  xUsername?: string;
  wpm: number;
  races: number;
}

const provider = new RpcProvider({ nodeUrl: RPC_URL });

async function callView(fn: string, calldata: string[] = []): Promise<string[]> {
  return provider.callContract(
    { contractAddress: CONTRACT_ADDRESS, entrypoint: fn, calldata },
    "latest"
  );
}

async function fetchXUsernames(addresses: string[]): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_URL}/api/usernames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data.usernames || {};
  } catch {
    return {};
  }
}

export function useLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalRaces, setTotalRaces] = useState(0);
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const racesResult = await callView("get_total_races");
      const keystrokesResult = await callView("get_total_keystrokes");

      const raceCount = Number(BigInt(racesResult[0]));
      const keystrokeCount = Number(BigInt(keystrokesResult[0]));

      setTotalRaces(raceCount);
      setTotalKeystrokes(keystrokeCount);

      const userBests = new Map<string, { wpm: number; races: number }>();

      // Fetch ALL races in parallel batches of 20
      const BATCH_SIZE = 20;
      for (let start = 0; start < raceCount; start += BATCH_SIZE) {
        const end = Math.min(start + BATCH_SIZE, raceCount);
        const batch = [];
        for (let i = start; i < end; i++) {
          batch.push(
            callView("get_race", ["0x" + i.toString(16)]).catch(() => null)
          );
        }
        const results = await Promise.all(batch);
        for (const race of results) {
          if (!race) continue;
          const finished = Number(BigInt(race[7])) === 1;
          if (!finished) continue;

          const address = race[0];
          const wpm = Number(BigInt(race[5]));

          const existing = userBests.get(address);
          if (existing) {
            existing.races++;
            if (wpm > existing.wpm) existing.wpm = wpm;
          } else {
            userBests.set(address, { wpm, races: 1 });
          }
        }
      }

      // Fetch X usernames for all addresses
      const addresses = Array.from(userBests.keys());
      const usernames = await fetchXUsernames(addresses);

      const sorted = Array.from(userBests.entries())
        .map(([address, data]) => ({
          address,
          xUsername: usernames[address.toLowerCase()],
          wpm: data.wpm,
          races: data.races,
        }))
        .sort((a, b) => b.wpm - a.wpm);

      setEntries(sorted);
    } catch (err) {
      console.error("Leaderboard fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { entries, loading, refresh, totalRaces, totalKeystrokes };
}
