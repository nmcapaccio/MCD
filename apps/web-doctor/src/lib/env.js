function optionalEnv(key) {
    const value = import.meta.env[key];
    return value ? value : null;
}
export const env = {
    supabaseUrl: optionalEnv("VITE_SUPABASE_URL"),
    supabaseAnonKey: optionalEnv("VITE_SUPABASE_ANON_KEY"),
    appBaseUrl: optionalEnv("VITE_APP_BASE_URL"),
};
export function isSupabaseConfigured() {
    return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}
