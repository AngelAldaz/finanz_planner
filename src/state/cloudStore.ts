import { create } from 'zustand'
import { cloudConfigured, supabase } from '../data/supabase/client'
import { pullSnapshot, pushSnapshot } from '../data/supabase/cloud'
import { repository } from '../data'
import { usePlanStore } from './planStore'

const REV_KEY = 'finanz-cloud-rev'
type Status = 'idle' | 'syncing' | 'error'

interface CloudState {
  configured: boolean
  email: string | null
  status: Status
  lastSync: string | null
  error: string | null
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  syncNow: () => Promise<void>
  start: () => void
}

let suspendPush = false
let pushTimer: ReturnType<typeof setTimeout> | null = null
let started = false

export const useCloudStore = create<CloudState>((set, get) => ({
  configured: cloudConfigured,
  email: null,
  status: 'idle',
  lastSync: null,
  error: null,

  signUp: async (email, password) => {
    if (!supabase) return
    set({ status: 'syncing', error: null })
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) set({ status: 'error', error: error.message })
    else if (!data.session)
      set({ status: 'idle', error: 'Revisa tu correo para confirmar la cuenta.' })
    else set({ status: 'idle' })
  },

  signIn: async (email, password) => {
    if (!supabase) return
    set({ status: 'syncing', error: null })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    set(error ? { status: 'error', error: error.message } : { status: 'idle' })
  },

  signOut: async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    localStorage.removeItem(REV_KEY)
    set({ email: null, lastSync: null })
  },

  syncNow: async () => {
    if (!supabase || !get().email) return
    set({ status: 'syncing', error: null })
    try {
      const rev = await pushSnapshot(await repository.exportAll())
      localStorage.setItem(REV_KEY, rev)
      set({ status: 'idle', lastSync: rev })
    } catch (e) {
      set({ status: 'error', error: (e as Error).message })
    }
  },

  start: () => {
    if (!supabase || started) return
    started = true

    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        set({ email: data.user.email ?? null })
        void reconcile(set)
      }
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ email: session?.user?.email ?? null })
      if (session?.user) void reconcile(set)
    })

    // empuja los cambios locales a la nube (con debounce)
    usePlanStore.subscribe((s, prev) => {
      if (suspendPush || !get().email) return
      const changed =
        s.movements !== prev.movements ||
        s.scenarios !== prev.scenarios ||
        s.creditCards !== prev.creditCards ||
        s.categories !== prev.categories ||
        s.plans !== prev.plans
      if (!changed) return
      if (pushTimer) clearTimeout(pushTimer)
      pushTimer = setTimeout(() => void get().syncNow(), 1500)
    })
  },
}))

/** Al iniciar sesión: baja lo de la nube si es más nuevo; si la nube está vacía, sube lo local. */
async function reconcile(set: (p: Partial<CloudState>) => void) {
  set({ status: 'syncing', error: null })
  try {
    const remote = await pullSnapshot()
    const localRev = localStorage.getItem(REV_KEY)
    if (remote && remote.updatedAt !== localRev) {
      suspendPush = true
      await repository.importAll(remote.data)
      await usePlanStore.getState().init()
      suspendPush = false
      localStorage.setItem(REV_KEY, remote.updatedAt)
      set({ status: 'idle', lastSync: remote.updatedAt })
    } else if (!remote) {
      const rev = await pushSnapshot(await repository.exportAll())
      localStorage.setItem(REV_KEY, rev)
      set({ status: 'idle', lastSync: rev })
    } else {
      set({ status: 'idle', lastSync: remote.updatedAt })
    }
  } catch (e) {
    suspendPush = false
    set({ status: 'error', error: (e as Error).message })
  }
}
