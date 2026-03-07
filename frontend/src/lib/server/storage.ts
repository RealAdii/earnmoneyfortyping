import { Redis } from "@upstash/redis";

interface UserData {
  privyWallet: { id: string; address: string; publicKey: string };
  accounts: Record<string, { address: string; deployed: boolean }>;
  xUsername?: string;
}

// In-memory fallback when Redis is not configured
const memoryStore = new Map<string, any>();

const memoryRedis = {
  get: async <T>(key: string): Promise<T | null> => (memoryStore.get(key) as T) ?? null,
  set: async (key: string, value: any): Promise<void> => { memoryStore.set(key, value); },
  mget: async <T>(...keys: string[]): Promise<T> => keys.map((k) => memoryStore.get(k) ?? null) as T,
};

let _redis: Redis | typeof memoryRedis | null = null;

function getRedis() {
  if (!_redis) {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      _redis = new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
    } else {
      console.warn("[storage] No KV_REST_API_URL configured, using in-memory storage");
      _redis = memoryRedis;
    }
  }
  return _redis;
}

function userKey(userId: string): string {
  return `typeracer:user:${userId}`;
}

export async function getUser(userId: string): Promise<UserData | null> {
  return getRedis().get<UserData>(userKey(userId));
}

export async function setUser(userId: string, data: UserData): Promise<void> {
  await getRedis().set(userKey(userId), data);
}

// Map wallet address → X username for leaderboard
function xUsernameKey(walletAddress: string): string {
  return `typeracer:x:${walletAddress.toLowerCase()}`;
}

export async function setXUsername(walletAddress: string, username: string): Promise<void> {
  await getRedis().set(xUsernameKey(walletAddress), username);
}

export async function getXUsername(walletAddress: string): Promise<string | null> {
  return getRedis().get<string>(xUsernameKey(walletAddress));
}

export async function getXUsernames(walletAddresses: string[]): Promise<Record<string, string>> {
  if (walletAddresses.length === 0) return {};
  const keys = walletAddresses.map((a) => xUsernameKey(a));
  const values = await (getRedis().mget as any)(...keys) as (string | null)[];
  const result: Record<string, string> = {};
  walletAddresses.forEach((addr, i) => {
    if (values[i]) result[addr.toLowerCase()] = values[i]!;
  });
  return result;
}
