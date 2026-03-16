import { corsHeaders } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/crypto.ts";

type GenerateQrTokenRequest = {
  expiresInMinutes: 30 | 120 | 480 | 1440;
  allowedSections?: string[];
};

type GenerateQrTokenResponse =
  | { data: { token: string; qrUrl: string; expiresAt: string }; error: null }
  | { data: null; error: { message: string } };

function jsonResponse(
  body: GenerateQrTokenResponse,
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
  return jsonResponse(
    { data: null, error: { message: "Unauthorized" } },
    { status: 401 },
    origin,
  );
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
    const appBaseUrl = getRequiredEnv("APP_BASE_URL"); // e.g. https://mihistorial.app

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return unauthorized(origin);
    const userJwt = authHeader.slice("Bearer ".length).trim();

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const { SignJWT } = await import("https://esm.sh/jose@5");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(userJwt);
    if (userError || !userData?.user) return unauthorized(origin);

    const { expiresInMinutes, allowedSections } = (await req.json()) as GenerateQrTokenRequest;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = nowSeconds + expiresInMinutes * 60;

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

    const token = await new SignJWT({
      patient_id: patientId,
      scope: "read",
      allowed_sections: allowedSections ?? null,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expiresAtSeconds)
      .sign(new TextEncoder().encode(jwtSecret));

    const tokenHash = await sha256Hex(token);

    const expiresAtIso = new Date(expiresAtSeconds * 1000).toISOString();
    const insertToken = await supabaseAdmin.from("access_tokens").insert({
      patient_id: patientId,
      token_hash: tokenHash,
      expires_at: expiresAtIso,
      scope: "read",
      allowed_sections: allowedSections ?? null,
    });

    if (insertToken.error) {
      return jsonResponse(
        { data: null, error: { message: insertToken.error.message } },
        { status: 500 },
        origin,
      );
    }

    const qrUrl = `${appBaseUrl.replace(/\/$/, "")}/acceso?token=${encodeURIComponent(token)}`;

    return jsonResponse(
      { data: { token, qrUrl, expiresAt: expiresAtIso }, error: null },
      { status: 200 },
      origin,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ data: null, error: { message } }, { status: 500 }, origin);
  }
});

