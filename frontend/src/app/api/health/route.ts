import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    env: {
      PRIVY_APP_ID: process.env.PRIVY_APP_ID ? process.env.PRIVY_APP_ID.slice(0, 8) + "..." : "MISSING",
      PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET ? process.env.PRIVY_APP_SECRET.slice(0, 20) + "..." : "MISSING",
      NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID ? process.env.NEXT_PUBLIC_PRIVY_APP_ID.slice(0, 8) + "..." : "MISSING",
    },
  });
}
