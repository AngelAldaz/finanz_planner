// Sync por "snapshot": un solo registro por usuario con TODO su bundle (jsonb).
// Simple y duradero; gana la última versión guardada (ideal para una persona en varios dispositivos).
import type { BackupBundle } from '../../domain/types'
import { supabase } from './client'

export interface Snapshot {
  data: BackupBundle
  updatedAt: string
}

export async function pullSnapshot(): Promise<Snapshot | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('snapshots').select('data, updated_at').maybeSingle()
  if (error) throw error
  if (!data) return null
  return { data: data.data as BackupBundle, updatedAt: data.updated_at as string }
}

export async function pushSnapshot(bundle: BackupBundle): Promise<string> {
  if (!supabase) throw new Error('Nube no configurada')
  const { data: userRes } = await supabase.auth.getUser()
  const uid = userRes.user?.id
  if (!uid) throw new Error('Sin sesión')
  const updatedAt = new Date().toISOString()
  const { error } = await supabase
    .from('snapshots')
    .upsert({ user_id: uid, data: bundle, updated_at: updatedAt }, { onConflict: 'user_id' })
  if (error) throw error
  return updatedAt
}
