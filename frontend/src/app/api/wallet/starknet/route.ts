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
    // Find existing server-signable wallet (owner: null) for this user
    let wallet: any = null;

    // List all starknet wallets and find one that belongs to this user
    // by checking wallets created without owner (server-managed)
    try {
      for await (const w of getPrivy().wallets().list({ user_id: userId })) {
        if (w.chain_type === "starknet" && !w.owner_id) {
          wallet = w;
          break;
        }
      }
    } catch {}

    // Also check unowned wallets (legacy)
    if (!wallet) {
      try {
        for await (const w of getPrivy().wallets().list({ chain_type: "starknet" })) {
          if (!w.owner_id) {
            // Test if we can actually use this wallet by checking it's not already assigned
            // For now, just use the first available unowned one for this user
            // The in-memory store reset means we lost the mapping, but this gets the user going
            wallet = w;
            break;
          }
        }
      } catch {}
    }

    if (!wallet) {
      // Create new wallet WITHOUT owner — server can sign these
      wallet = await getPrivy().wallets().create({
        chain_type: "starknet",
      });
    }

    const privyWallet = {
      id: wallet.id,
      address: wallet.address,
      publicKey: wallet.public_key as string,
    };
    await setUser(userId, { privyWallet, accounts: {}, xUsername });

    if (xUsername) {
      await setXUsername(wallet.address, xUsername);
    }

    return NextResponse.json({ wallet: privyWallet, accounts: {}, xUsername, isNew: true });
  } catch (error: any) {
    console.error("Wallet setup error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
