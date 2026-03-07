import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/server/privy";
import { getUser, setUser } from "@/lib/server/storage";

export async function POST(req: NextRequest) {
  const { userId } = await verifyToken(req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { preset, address, deployed } = await req.json();
  if (!preset || !address) {
    return NextResponse.json({ error: "preset and address required" }, { status: 400 });
  }

  const user = await getUser(userId);
  if (!user) {
    return NextResponse.json({ error: "Create wallet first" }, { status: 404 });
  }

  user.accounts[preset] = { address, deployed: deployed ?? false };
  await setUser(userId, user);
  return NextResponse.json({ success: true, accounts: user.accounts });
}
