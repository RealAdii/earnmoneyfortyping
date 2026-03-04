import { NextRequest, NextResponse } from "next/server";
import { getXUsernames } from "@/lib/server/storage";

export async function POST(req: NextRequest) {
  const { addresses } = await req.json();
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return NextResponse.json({ error: "addresses array required" }, { status: 400 });
  }

  // Limit to prevent abuse
  const limited = addresses.slice(0, 100);

  try {
    const usernames = await getXUsernames(limited);
    return NextResponse.json({ usernames });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
