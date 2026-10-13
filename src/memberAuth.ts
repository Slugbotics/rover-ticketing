import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type MemberIdentity = {
  user: User
  username: string | null
}

export async function ensureMemberIdentity(): Promise<MemberIdentity> {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error
  let user = session?.user
  if (!user) {
    const result = await supabase.auth.signInAnonymously()
    if (result.error || !result.data.user) throw result.error || new Error('Anonymous member sign-in failed.')
    user = result.data.user
  }

  const profile = await supabase.from('member_profiles').select('discord_username').eq('user_id', user.id).maybeSingle()
  if (profile.error) throw profile.error
  return { user, username: profile.data?.discord_username || null }
}

export async function saveMemberUsername(userId: string, username: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('member_profiles').upsert({ user_id: userId, discord_username: username, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function endMemberIdentity() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
