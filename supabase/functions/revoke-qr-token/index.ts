import { corsHeaders } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/crypto.ts";

type RevokeQrTokenRequest = { token: string };

type RevokeQrTokenResponse =
  | { data: { revokedAt: string }; error: null }
  | { data: null; error: { message: string } };

function jsonResponse(
  body: RevokeQrTokenResponse,
  init?: ResponseInit,
  origin?: string | null,
) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders(origin ?? null),
      ...(init?.headers ?? {}),
    },
  });
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function unauthorized(origin: string | null) {
  return jsonResponse({ data: null, error: { message: "Unauthorized" } }, { status: 401 }, origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") {
    return jsonResponse(
      { data: null, error: { message: "Method not allowed" } },
      { status: 405 },
      origin,
    );
  }

  try {
    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return unauthorized(origin);
    const userJwt = authHeader.slice("Bearer ".length).trim();

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(userJwt);
    if (userError || !userData?.user) return unauthorized(origin);

    const { token } = (await req.json()) as RevokeQrTokenRequest;
    if (!token) {
      return jsonResponse({ data: null, error: { message: "Missing token" } }, { status: 400 }, origin);
    }

    const tokenHash = await sha256Hex(token);

    const patientLookup = await supabaseAdmin
      .from("patients")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (patientLookup.error) {
      return jsonResponse(
        { data: null, error: { message: patientLookup.error.message } },
        { status: 500 },
        origin,
      );
    }

    const patientId = patientLookup.data?.id;
    if (!patientId) {
      return jsonResponse(
        { data: null, error: { message: "Patient profile not found" } },
        { status: 404 },
        origin,
      );
    }

    const revokedAt = new Date().toISOString();
    const update = await supabaseAdmin
      .from("access_tokens")
      .update({ revoked_at: revokedAt })
      .eq("token_hash", tokenHash)
      .eq("patient_id", patientId)
      .is("revoked_at", null);

    if (update.error) {
      return jsonResponse({ data: null, error: { message: update.error.message } }, { status: 500 }, origin);
    }

    return jsonResponse({ data: { revokedAt }, error: null }, { status: 200 }, origin);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ data: null, error: { message } }, { status: 500 }, origin);
  }
});

