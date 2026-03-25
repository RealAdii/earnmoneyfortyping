export const NETWORK = process.env.NEXT_PUBLIC_NETWORK || "sepolia";
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "";
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x031cd3a42c317d1118f3f4d6e663f6304d8e9c070370eb16e484ab8e3d7d13cb";

export const RPC_URL =
  NETWORK === "mainnet"
    ? "https://api.cartridge.gg/x/starknet/mainnet"
    : "https://api.cartridge.gg/x/starknet/sepolia";

export const EXPLORER_URL =
  NETWORK === "mainnet"
    ? "https://voyager.online"
    : "https://sepolia.voyager.online";

export const VOYAGER_TX = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const VOYAGER_CONTRACT = (addr: string) =>
  `${EXPLORER_URL}/contract/${addr}`;

export const GAME_CONFIG = {
  MAX_CONCURRENT_TXS: 5,
  TX_TIMEOUT_MS: 20_000,
  COUNTDOWN_SECONDS: 3,
  RACE_DURATION_SECONDS: 30,
  WPM_SAMPLE_INTERVAL_MS: 2_000,
  MAX_RACES_PER_USER: 3,
  STRK_PER_WORD: 0.1,
};

// Owner addresses bypass race limit
export const UNLIMITED_RACE_ADDRESSES = [
  "0x006ff46ac803364ab77ac91b8eb1490b60da47e14ffd188d02b5bdf3590fa5e5",
];

export const STORAGE_KEYS = {
  walletId: "typeracer_wallet_id",
  walletAddress: "typeracer_wallet_address",
  publicKey: "typeracer_public_key",
  tongoPrivateKey: "typeracer_tongo_pk",
};

// Tongo confidential payment contracts (mainnet)
export const TONGO_CONTRACTS: Record<string, string> = {
  STRK: "0x3a542d7eb73b3e33a2c54e9827ec17a6365e289ec35ccc94dde97950d9db498",
  ETH: "0x276e11a5428f6de18a38b7abc1d60abc75ce20aa3a925e20a393fcec9104f89",
};

// STRK token address on mainnet
export const STRK_TOKEN_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
