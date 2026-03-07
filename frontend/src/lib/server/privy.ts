import { PrivyClient } from "@privy-io/node";

let _privy: PrivyClient | null = null;

function getPrivy(): PrivyClient {
  if (!_privy) {
    _privy = new PrivyClient({
      appId: process.env.PRIVY_APP_ID!,
      appSecret: process.env.PRIVY_APP_SECRET!,
    });
  }
  return _privy;
}

export { getPrivy as privy };

export async function verifyToken(authHeader: string | null): Promise<{ userId: string | null; error?: string }> {
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return { userId: null, error: "No token provided" };

  try {
    const claims = await getPrivy().utils().auth().verifyAccessToken(token);
    return { userId: claims.user_id };
  } catch (err: any) {
    return { userId: null, error: err?.message || String(err) };
  }
}
