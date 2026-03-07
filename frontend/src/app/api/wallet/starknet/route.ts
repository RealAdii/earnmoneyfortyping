import { NextRequest, NextResponse } from "next/server";
import { privy as getPrivy, verifyToken } from "@/lib/server/privy";
import { getUser, setUser, setXUsername } from "@/lib/server/storage";

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await verifyToken(req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized", detail: authError }, { status: 401 });
  }

  // Get X username from Privy user profile
  let xUsername: string | undefined;
  try {
    const privyUser = await (getPrivy().users().get as any)(userId);
    const twitterAccount = privyUser.linked_accounts?.find(
      (a: any) => a.type === "twitter_oauth"
    ) as any;
    if (twitterAccount?.username) {
      xUsername = twitterAccount.username;
    }
  } catch {}

  const existing = await getUser(userId);
  if (existing) {
    // Update X username if we have it and wallet exists
    if (xUsername && existing.privyWallet?.address) {
      await setXUsername(existing.privyWallet.address, xUsername);
      if (!existing.xUsername) {
        await setUser(userId, { ...existing, xUsername });
      }
    }
    return NextResponse.json({
      wallet: existing.privyWallet,
      accounts: existing.accounts,
      xUsername: xUsername || existing.xUsername,
      isNew: false,
    });
  }

  try {
    const wallet = await getPrivy().wallets().create({ chain_type: "starknet" });
    const privyWallet = {
      id: wallet.id,
      address: wallet.address,
      publicKey: wallet.public_key as string,
    };
    await setUser(userId, { privyWallet, accounts: {}, xUsername });

    // Map wallet address → X username for leaderboard lookups
    if (xUsername) {
      await setXUsername(wallet.address, xUsername);
    }

    return NextResponse.json({ wallet: privyWallet, accounts: {}, xUsername, isNew: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
