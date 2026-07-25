// Verify the caller is a signed-in ADMIN, using the Supabase session JWT the PWA
// sends as `Authorization: Bearer <access_token>`. Confirms the JWT with GoTrue,
// then checks profiles.role = 'admin'. Throws on failure.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./supabase.js";

export async function verifyAdmin(
  req: Request,
  env: Env,
  db: SupabaseClient,
): Promise<{ userId: string; email: string | null }> {
  const header = req.headers.get("Authorization") || "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!jwt) throw new Error("Not signed in");

  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!resp.ok) throw new Error("Invalid or expired session");
  const user = (await resp.json()) as { id: string; email?: string };

  const { data, error } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.role !== "admin") throw new Error("Admin only");
  return { userId: user.id, email: user.email ?? null };
}
