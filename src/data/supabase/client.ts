import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** La nube está activa solo si pegaste tus llaves en .env (si no, la app sigue 100% local). */
export const cloudConfigured = Boolean(url && key)

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url as string, key as string)
  : null
