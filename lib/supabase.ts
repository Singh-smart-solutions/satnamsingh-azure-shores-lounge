import { createClient } from '@supabase/supabase-js'

// ── Browser client (used in client components + Realtime) ──────────────────
// Singleton pattern so Realtime subscriptions survive re-renders
let browserClient: ReturnType<typeof createClient> | null = null

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
    browserClient = createClient(supabaseUrl, supabaseAnonKey)
  }
  return browserClient
}

// ── Server client (used in API routes — bypasses RLS) ─────────────────────
export function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
  return createClient(
    supabaseUrl,
    supabaseServiceKey,
    { auth: { persistSession: false } }
  )
}
