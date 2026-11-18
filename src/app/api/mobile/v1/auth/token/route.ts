import { mobileTokenLogin } from "@/lib/mobile/login";

// Pubblica per definizione (è il login): niente Bearer. Risposta con no-store.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return mobileTokenLogin(body);
}
