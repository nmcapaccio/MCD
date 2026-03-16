import { env } from "./env";

export type ValidateQrTokenResult =
  | { data: { sessionToken: string; patientId: string; expiresAt: string }; error: null }
  | { data: null; error: { message: string } };

export async function validateQrToken(input: {
  token: string;
  doctorName?: string;
}): Promise<ValidateQrTokenResult> {
  if (!env.supabaseUrl) {
    return { data: null, error: { message: "Supabase no configurado (modo demo)" } };
  }

  const res = await fetch(`${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/validate-qr-token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      token: input.token,
      doctorName: input.doctorName,
    }),
  });

  const json = (await res.json()) as unknown;
  if (typeof json !== "object" || json === null) {
    return { data: null, error: { message: "Invalid response" } };
  }
  return json as ValidateQrTokenResult;
}

