import { Redis } from "@upstash/redis";

interface UserData {
  privyWallet: { id: string; address: string; publicKey: string };
  accounts: Record<string, { address: string; deployed: boolean }>;
  xUsername?: string;
}

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
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
  const values = await getRedis().mget<(string | null)[]>(...keys);
  const result: Record<string, string> = {};
  walletAddresses.forEach((addr, i) => {
    if (values[i]) result[addr.toLowerCase()] = values[i]!;
  });
  return result;
}
