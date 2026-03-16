import { env } from "./env";
export async function validateQrToken(input) {
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
    const json = (await res.json());
    if (typeof json !== "object" || json === null) {
        return { data: null, error: { message: "Invalid response" } };
    }
    return json;
}
