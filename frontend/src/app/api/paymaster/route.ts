import { NextRequest, NextResponse } from "next/server";

const AVNU_API_KEY = process.env.AVNU_API_KEY;
const AVNU_PAYMASTER_URL =
  process.env.AVNU_PAYMASTER_URL || "https://sepolia.paymaster.avnu.fi";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const response = await fetch(AVNU_PAYMASTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AVNU_API_KEY && { "x-paymaster-api-key": AVNU_API_KEY }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[paymaster] AVNU error:", response.status, JSON.stringify(data));
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
