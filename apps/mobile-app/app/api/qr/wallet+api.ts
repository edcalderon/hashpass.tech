import { randomBytes } from "node:crypto";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });

export async function POST(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return json({ error: identity.error }, identity.status);
  if (!identity.supabaseUserId) return json({ error: "A linked wallet account is required" }, 403);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const walletAddress = typeof body?.walletAddress === "string" ? body.walletAddress.trim() : "";
  if (!walletAddress) return json({ error: "A wallet address is required" }, 400);
  const amount = body?.amount === undefined ? null : Number(body.amount);
  const currency = typeof body?.currency === "string" ? body.currency.trim().toUpperCase() : "VOI";
  const expiresInMinutes = Math.min(Math.max(Math.floor(Number(body?.expiresInMinutes) || 60), 1), 1440);
  const maxUses = Math.min(Math.max(Math.floor(Number(body?.maxUses) || 1), 1), 25);
  const token = `QR-${randomBytes(20).toString("hex").toUpperCase()}`;
  const qrData = {
    type: "wallet_transfer",
    user_id: identity.supabaseUserId,
    wallet_address: walletAddress,
    amount: Number.isFinite(amount) ? amount : null,
    currency,
    timestamp: Date.now(),
  };
  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase
    .from("qr_codes")
    .insert({
      token,
      qr_type: "wallet_transfer",
      user_id: identity.supabaseUserId,
      associated_entity_id: walletAddress,
      qr_data: qrData,
      display_data: { wallet_address: walletAddress, amount: qrData.amount, currency },
      expires_at: new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString(),
      max_uses: maxUses,
    })
    .select("id,token,qr_data")
    .single();
  if (error || !data) return json({ error: "Unable to generate a wallet QR" }, 503);
  return json({ data });
}
