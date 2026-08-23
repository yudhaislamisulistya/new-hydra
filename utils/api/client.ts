import { createClient as createApiClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient<any> | undefined;

export function createClient() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error("Local API URL and key are not configured.");
  }

  client ??= createApiClient<any>(apiUrl, apiKey);
  return client;
}
