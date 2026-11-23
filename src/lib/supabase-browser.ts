"use client";

/**
 * Upload a file to Storage with a server-issued signed URL. The Supabase client is imported on
 * demand so its ~65 KB only loads when someone actually uploads a file.
 */
export async function uploadToSignedUrl(path: string, token: string, file: File): Promise<boolean> {
  const { createBrowserClient } = await import("@supabase/ssr");
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await client.storage.from("documents").uploadToSignedUrl(path, token, file, { contentType: file.type });
  return !error;
}
