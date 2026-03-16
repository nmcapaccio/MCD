import { corsHeaders } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/crypto.ts";

type ValidateQrTokenRequest = {
  token: string;
  doctorName?: string;
  ipAddress?: string;
};

type ValidateQrTokenResponse =
  | {
    data: { sessionToken: string; patientId: string; expiresAt: string };
    error: null;
  }
  | { data: null; error: { message: string } };

function jsonResponse(
  body: ValidateQrTokenResponse,
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
    const jwtSecret = getRequiredEnv("SUPABASE_JWT_SECRET");

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const { jwtVerify, SignJWT } = await import("https://esm.sh/jose@5");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { token, doctorName, ipAddress } = (await req.json()) as ValidateQrTokenRequest;
    if (!token) {
      return jsonResponse({ data: null, error: { message: "Missing token" } }, { status: 400 }, origin);
    }

    const verified = await jwtVerify(token, new TextEncoder().encode(jwtSecret));
    const payload = verified.payload as Record<string, unknown>;
    const patientId = typeof payload.patient_id === "string" ? payload.patient_id : null;
    const expSeconds = typeof payload.exp === "number" ? payload.exp : null;

    if (!patientId || !expSeconds) {
      return jsonResponse(
        { data: null, error: { message: "Invalid token payload" } },
        { status: 401 },
        origin,
      );
    }

    const tokenHash = await sha256Hex(token);
    const tokenRow = await supabaseAdmin
      .from("access_tokens")
      .select("id, revoked_at, expires_at, patient_id")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenRow.error) {
      return jsonResponse(
        { data: null, error: { message: tokenRow.error.message } },
        { status: 500 },
        origin,
      );
    }
    if (!tokenRow.data) {
      return jsonResponse(
        { data: null, error: { message: "Token not found" } },
        { status: 401 },
        origin,
      );
    }
    if (tokenRow.data.revoked_at) {
      return jsonResponse(
        { data: null, error: { message: "Token revoked" } },
        { status: 401 },
        origin,
      );
    }
    if (tokenRow.data.patient_id !== patientId) {
      return jsonResponse(
        { data: null, error: { message: "Token patient mismatch" } },
        { status: 401 },
        origin,
      );
    }

    const expiresAtIso = new Date(expSeconds * 1000).toISOString();

    // Create a short-lived session token that can be used by the web-doctor app.
    // In MVP this is a short-lived JWT signed with SUPABASE_JWT_SECRET so PostgREST/RLS
    // can read `auth.jwt() ->> 'patient_id'` and scope reads to that patient.
    //
    // We keep it in-memory on the web app (no localStorage/cookies).
    const sessionTokenTtlSeconds = 15 * 60; // 15 minutes max
    const nowSeconds = Math.floor(Date.now() / 1000);
    const sessionTokenExp = Math.min(nowSeconds + sessionTokenTtlSeconds, expSeconds);
    const sessionToken = await new SignJWT({
      patient_id: patientId,
      kind: "doctor_session",
      role: "anon",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(nowSeconds)
      .setExpirationTime(sessionTokenExp)
      .sign(new TextEncoder().encode(jwtSecret));

    const insertLog = await supabaseAdmin.from("access_logs").insert({
      access_token_id: tokenRow.data.id,
      patient_id: patientId,
      ip_address: ipAddress ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
      doctor_declared_name: doctorName ?? null,
      action: "view",
    });

    if (insertLog.error) {
      return jsonResponse(
        { data: null, error: { message: insertLog.error.message } },
        { status: 500 },
        origin,
      );
    }

    return jsonResponse(
      { data: { sessionToken, patientId, expiresAt: expiresAtIso }, error: null },
      { status: 200 },
      origin,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid or expired token";
    return jsonResponse({ data: null, error: { message } }, { status: 401 }, origin);
  }
});

