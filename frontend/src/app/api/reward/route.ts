import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/server/privy";
import { Account, RpcProvider, Contract, CallData } from "starknet";

const RPC_URL = process.env.STARKNET_RPC_URL || "https://api.cartridge.gg/x/starknet/mainnet";
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x031cd3a42c317d1118f3f4d6e663f6304d8e9c070370eb16e484ab8e3d7d13cb";
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;
const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS!;

export async function POST(req: NextRequest) {
  const userId = await verifyToken(req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { raceId, userAddress } = await req.json();
  if (!raceId && raceId !== "0" && raceId !== 0) {
    return NextResponse.json({ error: "raceId required" }, { status: 400 });
  }
  if (!userAddress) {
    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
  }

  try {
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
    const adminAccount = new Account(provider, ADMIN_ADDRESS, ADMIN_PRIVATE_KEY);

    const result = await adminAccount.execute([
      {
        contractAddress: CONTRACT_ADDRESS,
        entrypoint: "distribute_reward",
        calldata: CallData.compile({
          user: userAddress,
          race_id: raceId.toString(),
        }),
      },
    ]);

    await provider.waitForTransaction(result.transaction_hash);

    return NextResponse.json({
      success: true,
      txHash: result.transaction_hash,
    });
  } catch (error: any) {
    console.error("distribute_reward failed:", error);
    return NextResponse.json(
      { error: error.message || "Reward distribution failed" },
      { status: 500 }
    );
  }
}
