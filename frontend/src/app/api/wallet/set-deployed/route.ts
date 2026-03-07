import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/server/privy";
import { getUser, setUser } from "@/lib/server/storage";

export async function POST(req: NextRequest) {
  const { userId } = await verifyToken(req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { preset, deployed } = await req.json();
  if (!preset) {
    return NextResponse.json({ error: "preset required" }, { status: 400 });
  }

  const user = await getUser(userId);
  if (!user || !user.accounts[preset]) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  user.accounts[preset].deployed = deployed ?? true;
  await setUser(userId, user);
  return NextResponse.json({ success: true, accounts: user.accounts });
}
