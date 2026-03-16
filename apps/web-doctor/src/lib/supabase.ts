import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

export function createDoctorClient(sessionToken: string): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("Supabase no configurado (modo demo)");
  }
  // No persistencia (sin localStorage/cookies). El token vive solo en memoria.
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    },
  });
}

