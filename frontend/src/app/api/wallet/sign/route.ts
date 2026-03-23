import { NextRequest, NextResponse } from "next/server";
import { privy as getPrivy } from "@/lib/server/privy";

export async function POST(req: NextRequest) {
  const { walletId, hash } = await req.json();
  if (!walletId || !hash) {
    return NextResponse.json({ error: "walletId and hash required" }, { status: 400 });
  }

  try {
    console.log("[sign] walletId:", walletId, "hash:", hash.slice(0, 20) + "...");
    const result = await getPrivy().wallets().rawSign(walletId, { params: { hash } });
    console.log("[sign] Success");
    return NextResponse.json({ signature: result.signature });
  } catch (error: any) {
    console.error("[sign] Failed:", error.message, "walletId:", walletId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
