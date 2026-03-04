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

export const STORAGE_KEYS = {
  walletId: "typeracer_wallet_id",
  walletAddress: "typeracer_wallet_address",
  publicKey: "typeracer_public_key",
};
