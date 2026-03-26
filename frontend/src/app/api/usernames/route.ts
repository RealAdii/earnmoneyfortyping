import { NextRequest, NextResponse } from "next/server";
import { getXUsernames } from "@/lib/server/storage";

export async function POST(req: NextRequest) {
  const { addresses } = await req.json();
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return NextResponse.json({ error: "addresses array required" }, { status: 400 });
  }

  const limited = addresses.slice(0, 100);

  try {
    // Look up usernames from Redis (persisted when users connect via Privy + Twitter)
    const usernames = await getXUsernames(limited);
    return NextResponse.json({ usernames });
  } catch (error: any) {
    console.error("Failed to fetch usernames:", error);
    return NextResponse.json({ usernames: {} });
  }
}
