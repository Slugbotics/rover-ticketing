import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type MemberIdentity = {
  user: User
  username: string | null
}

// Captured at load: a failed Discord redirect leaves its error in the URL, and
// auth-js keeps the existing session when that happens.
const redirectError = readRedirectError()

function readRedirectError() {
  const params = new URLSearchParams(location.hash.slice(1))
  new URLSearchParams(location.search).forEach((value, key) => { if (!params.has(key)) params.set(key, value) })
  const code = params.get('error_code') || params.get('error')
  if (!code) return null
  return { code, description: params.get('error_description')?.replaceAll('+', ' ') || 'Discord sign-in failed.' }
}

// Returns the redirect error once and strips it from the address bar.
export function takeRedirectError() {
  if (!redirectError) return null
  const url = new URL(location.href)
  for (const key of ['error', 'error_code', 'error_description']) url.searchParams.delete(key)
  url.hash = ''
  history.replaceState(history.state, '', url)
  return redirectError
}

export function isDiscordUser(user: User) {
  return Boolean(user.identities?.some((identity) => identity.provider === 'discord'))
}

// Discord handles come back as full_name ("ada") or name ("ada#0").
export function discordUsername(user: User): string | null {
  const meta = user.user_metadata || {}
  const candidates = [meta.full_name, typeof meta.name === 'string' ? meta.name.replace(/#0$/, '') : null, meta.custom_claims?.global_name]
  const name = candidates.find((value): value is string => typeof value === 'string' && value.trim().length >= 2)
  return name ? name.trim().slice(0, 64) : null
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
  // Discord accounts always show their verified Discord handle.
  // Falls back to a placeholder so a Discord member is never left without a name.
  const verifiedName = isDiscordUser(user) ? discordUsername(user) || profile.data?.discord_username || 'Discord member' : null
  if (verifiedName && verifiedName !== profile.data?.discord_username) {
    await saveMemberUsername(user.id, verifiedName)
    return { user, username: verifiedName }
  }
  return { user, username: profile.data?.discord_username || null }
}

async function hasMemberActivity(userId: string) {
  if (!supabase) return false
  const [participants, comments] = await Promise.all([
    supabase.from('ticket_participants').select('ticket_id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('ticket_comments').select('id', { count: 'exact', head: true }).eq('author_id', userId),
  ])
  if (participants.error || comments.error) throw participants.error || comments.error
  return (participants.count || 0) + (comments.count || 0) > 0
}

const returnUrl = () => location.origin + location.pathname + location.search
const mergeTokenKey = 'rover-merge-token'

// If this browser's guest session already has work, it issues a one-time merge
// token first so that work moves to the Discord account after sign-in.
export async function signInWithDiscord() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (user?.is_anonymous && await hasMemberActivity(user.id)) {
    const { data, error } = await supabase.rpc('create_account_merge')
    if (error) throw error
    sessionStorage.setItem(mergeTokenKey, data)
  }
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: returnUrl() } })
  if (error) throw error
}

// Redeems a merge token left by signInWithDiscord. Returns the number of
// tickets moved, or null when there was nothing to merge.
export async function completePendingMerge(): Promise<number | null> {
  if (!supabase) return null
  const token = sessionStorage.getItem(mergeTokenKey)
  if (!token) return null
  sessionStorage.removeItem(mergeTokenKey)
  const { data, error } = await supabase.rpc('complete_account_merge', { merge_token: token })
  if (error) throw error
  return data ?? 0
}

// Merges guest sessions whose typed name matches this account's Discord
// username (checked server-side). Returns the number of tickets moved.
export async function claimGuestSessions(): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('claim_guest_sessions')
  if (error) throw error
  return data ?? 0
}

export type GuestSession = {
  userId: string
  typedName: string | null
  ticketCount: number
  commentCount: number
  createdAt: string
}

export type MemberAccount = { userId: string; name: string }

// Administrator-only; the server re-checks access.
export async function loadGuestSessions(): Promise<GuestSession[]> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('admin_list_guest_sessions')
  if (error) throw error
  return (data || []).map((row: { user_id: string; typed_name: string | null; ticket_count: number; comment_count: number; created_at: string }) => ({
    userId: row.user_id,
    typedName: row.typed_name,
    ticketCount: Number(row.ticket_count),
    commentCount: Number(row.comment_count),
    createdAt: row.created_at,
  }))
}

export async function loadMemberAccounts(): Promise<MemberAccount[]> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('admin_list_member_accounts')
  if (error) throw error
  return (data || []).map((row: { user_id: string; name: string }) => ({ userId: row.user_id, name: row.name }))
}

export async function mergeGuestSession(guestUserId: string, memberUserId: string): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('admin_merge_guest', { guest_user: guestUserId, member_user: memberUserId })
  if (error) throw error
  return data ?? 0
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
