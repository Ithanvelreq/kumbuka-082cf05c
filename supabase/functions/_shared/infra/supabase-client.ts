import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Service-role client. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the Supabase runtime. */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}
