import { NextRequest, NextResponse } from "next/server";
import { privy as getPrivy } from "@/lib/server/privy";

export async function POST(req: NextRequest) {
  const { addresses } = await req.json();
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return NextResponse.json({ error: "addresses array required" }, { status: 400 });
  }

  const limited = addresses.slice(0, 100);
  const result: Record<string, string> = {};

  try {
    const client = getPrivy();

    // Normalize target addresses for comparison
    const targetMap = new Map<string, string>(); // normalized -> original lowercase
    for (const addr of limited) {
      try {
        const normalized = "0x" + BigInt(addr).toString(16);
        targetMap.set(normalized, addr.toLowerCase());
      } catch {
        targetMap.set(addr.toLowerCase(), addr.toLowerCase());
      }
    }

    // For each user with Twitter, check their wallets
    for await (const user of client.users().list()) {
      const twitter = user.linked_accounts?.find(
        (a: any) => a.type === "twitter_oauth"
      ) as any;
      if (!twitter?.username) continue;

      // List wallets owned by this user
      try {
        for await (const wallet of client.wallets().list({ user_id: user.id })) {
          if (!wallet.address) continue;
          try {
            const normalizedWallet = "0x" + BigInt(wallet.address).toString(16);
            const originalAddr = targetMap.get(normalizedWallet);
            if (originalAddr) {
              result[originalAddr] = twitter.username;
            }
          } catch {}
        }
      } catch {}
    }

    // If we still have unresolved addresses, scan all wallets (for legacy wallets without owners)
    if (Object.keys(result).length < limited.length) {
      // Build wallet address -> wallet map from all wallets
      const allWallets = new Map<string, string>(); // normalized addr -> wallet.id
      const walletCreatedAt = new Map<string, number>(); // wallet.id -> created_at

      for await (const wallet of client.wallets().list({ chain_type: "starknet" })) {
        if (!wallet.address) continue;
        try {
          const normalized = "0x" + BigInt(wallet.address).toString(16);
          if (targetMap.has(normalized) && !result[targetMap.get(normalized)!]) {
            allWallets.set(normalized, wallet.id);
            walletCreatedAt.set(wallet.id, (wallet as any).created_at || 0);
          }
        } catch {}
      }

      // Match unresolved wallets to users by creation time proximity
      if (allWallets.size > 0) {
        const users: Array<{ id: string; username: string; created_at: number }> = [];
        for await (const user of client.users().list()) {
          const twitter = user.linked_accounts?.find(
            (a: any) => a.type === "twitter_oauth"
          ) as any;
          if (twitter?.username) {
            users.push({ id: user.id, username: twitter.username, created_at: user.created_at });
          }
        }

        for (const [normalizedAddr, walletId] of allWallets) {
          const wCreated = walletCreatedAt.get(walletId) || 0;
          // Find user created within 60 seconds of wallet creation
          const match = users.find(u => Math.abs(u.created_at - wCreated) < 60);
          if (match) {
            const originalAddr = targetMap.get(normalizedAddr)!;
            result[originalAddr] = match.username;
          }
        }
      }
    }

    console.log(`[usernames] Resolved ${Object.keys(result).length}/${limited.length}`);
    return NextResponse.json({ usernames: result });
  } catch (error: any) {
    console.error("Failed to fetch usernames:", error);
    return NextResponse.json({ usernames: result });
  }
}
