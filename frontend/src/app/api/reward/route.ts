import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/server/privy";
import { RpcProvider, CallData, hash, ec, encode, num } from "starknet";
import { poseidonHashMany } from "@scure/starknet";

const RPC_URL = process.env.STARKNET_RPC_URL || "https://api.cartridge.gg/x/starknet/mainnet";
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x031cd3a42c317d1118f3f4d6e663f6304d8e9c070370eb16e484ab8e3d7d13cb";
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;
const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS!;

// Resource type felt names
const L1_GAS = BigInt("0x4c315f474153"); // "L1_GAS"
const L2_GAS = BigInt("0x4c325f474153"); // "L2_GAS"
const L1_DATA = BigInt("0x4c315f44415441"); // "L1_DATA"

// DA mode bits
const DATA_AVAILABILITY_MODE_BITS = BigInt(32);

// Encoding: resource_name (60 bits) | max_amount (64 bits) | max_price_per_unit (128 bits)
function encodeResourceBound(resourceName: bigint, maxAmount: bigint, maxPricePerUnit: bigint): bigint {
  return (resourceName << BigInt(192)) + (maxAmount << BigInt(128)) + maxPricePerUnit;
}

function toBigInt(v: string | number | bigint): bigint {
  return BigInt(v);
}

// Compute V3 invoke tx hash WITH l1_data_gas support
function computeInvokeV3Hash(params: {
  senderAddress: string;
  calldata: string[];
  chainId: string;
  nonce: string;
  l1Gas: { maxAmount: bigint; maxPrice: bigint };
  l2Gas: { maxAmount: bigint; maxPrice: bigint };
  l1DataGas: { maxAmount: bigint; maxPrice: bigint };
  tip: bigint;
  paymasterData: string[];
  nonceDAMode: number;
  feeDAMode: number;
  accountDeploymentData: string[];
}): string {
  const txPrefix = toBigInt("0x696e766f6b65"); // "invoke"
  const version = BigInt(3);

  // Fee field hash: poseidon(tip, l1_bound, l2_bound, l1_data_bound)
  const l1Bound = encodeResourceBound(L1_GAS, params.l1Gas.maxAmount, params.l1Gas.maxPrice);
  const l2Bound = encodeResourceBound(L2_GAS, params.l2Gas.maxAmount, params.l2Gas.maxPrice);
  const l1DataBound = encodeResourceBound(L1_DATA, params.l1DataGas.maxAmount, params.l1DataGas.maxPrice);
  const feeFieldHash = poseidonHashMany([params.tip, l1Bound, l2Bound, l1DataBound]);

  // DA mode
  const daMode = (BigInt(params.nonceDAMode) << DATA_AVAILABILITY_MODE_BITS) + BigInt(params.feeDAMode);

  // Paymaster hash
  const paymasterHash = poseidonHashMany(params.paymasterData.map(toBigInt));

  // Account deployment data hash
  const accountDeployHash = poseidonHashMany(params.accountDeploymentData.map(toBigInt));

  // Calldata hash
  const calldataHash = poseidonHashMany(params.calldata.map(toBigInt));

  const dataToHash = [
    txPrefix,
    version,
    toBigInt(params.senderAddress),
    toBigInt(feeFieldHash),
    paymasterHash,
    toBigInt(params.chainId),
    toBigInt(params.nonce),
    daMode,
    accountDeployHash,
    calldataHash,
  ].map(v => typeof v === 'bigint' ? v : toBigInt(v));

  return num.toHex(poseidonHashMany(dataToHash));
}

async function rpc(method: string, params: any) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

export async function POST(req: NextRequest) {
  const { userId } = await verifyToken(req.headers.get("authorization"));
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
    const innerCalldata = CallData.compile({
      user: userAddress,
      race_id: raceId.toString(),
    });

    // Build execute calldata (single call format)
    const executeCalldata = [
      "0x1",
      CONTRACT_ADDRESS,
      hash.getSelectorFromName("distribute_reward"),
      num.toHex(innerCalldata.length),
      ...innerCalldata,
    ];

    // Get nonce and chain ID
    const chainProvider = new RpcProvider({ nodeUrl: RPC_URL });
    (chainProvider.channel as any).blockIdentifier = "latest";
    const [nonce, chainId] = await Promise.all([
      rpc("starknet_getNonce", {
        contract_address: ADMIN_ADDRESS,
        block_id: "latest",
      }),
      chainProvider.getChainId(),
    ]);

    // Resource bounds
    const l1Gas = { maxAmount: BigInt("0x100"), maxPrice: BigInt("0x100000000000000") };
    const l2Gas = { maxAmount: BigInt("0x100000"), maxPrice: BigInt("0x1000000000") };
    const l1DataGas = { maxAmount: BigInt("0x100"), maxPrice: BigInt("0x100000000000000") };

    // Compute transaction hash WITH l1_data_gas
    const txHash = computeInvokeV3Hash({
      senderAddress: ADMIN_ADDRESS,
      calldata: executeCalldata,
      chainId,
      nonce,
      l1Gas,
      l2Gas,
      l1DataGas,
      tip: BigInt(0),
      paymasterData: [],
      nonceDAMode: 0,
      feeDAMode: 0,
      accountDeploymentData: [],
    });

    // Sign
    const signature = ec.starkCurve.sign(
      encode.removeHexPrefix(txHash),
      encode.removeHexPrefix(ADMIN_PRIVATE_KEY)
    );

    // Build signed TX
    const signedTx = {
      type: "INVOKE" as const,
      sender_address: ADMIN_ADDRESS,
      calldata: executeCalldata,
      version: "0x3" as const,
      nonce,
      resource_bounds: {
        l1_gas: { max_amount: num.toHex(l1Gas.maxAmount), max_price_per_unit: num.toHex(l1Gas.maxPrice) },
        l2_gas: { max_amount: num.toHex(l2Gas.maxAmount), max_price_per_unit: num.toHex(l2Gas.maxPrice) },
        l1_data_gas: { max_amount: num.toHex(l1DataGas.maxAmount), max_price_per_unit: num.toHex(l1DataGas.maxPrice) },
      },
      signature: [
        num.toHex(signature.r),
        num.toHex(signature.s),
      ],
      tip: "0x0",
      paymaster_data: [],
      account_deployment_data: [],
      nonce_data_availability_mode: "L1" as const,
      fee_data_availability_mode: "L1" as const,
    };

    // Submit
    const result = await rpc("starknet_addInvokeTransaction", {
      invoke_transaction: signedTx,
    });

    console.log("Reward tx submitted:", result.transaction_hash);

    // Wait for confirmation
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const receipt = await rpc("starknet_getTransactionReceipt", {
          transaction_hash: result.transaction_hash,
        });
        if (receipt?.finality_status === "ACCEPTED_ON_L2" || receipt?.finality_status === "ACCEPTED_ON_L1") {
          return NextResponse.json({
            success: true,
            txHash: result.transaction_hash,
          });
        }
      } catch {}
    }

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
