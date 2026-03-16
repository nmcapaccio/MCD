export function corsHeaders(origin: string | null) {
  const allowedOrigin = origin ?? "*";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "content-type": "application/json; charset=utf-8",
  } as const;
}

