import { getSupabase } from './supabase'
import type { User } from '@supabase/supabase-js'

// ─── Profile type (matches user_profiles table) ───
interface UserProfile {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  selected_topics: string[]
  has_onboarded: boolean
  cards_read: number
  reading_streak: number
  last_read_at: string | null
  created_at: string
  updated_at: string
}

interface BookmarkRow {
  id: string
  user_id: string
  card_id: string
  card_title: string | null
  card_category: string | null
  card_content: string | null
  created_at: string
}

// ─── Sync user preferences to Supabase ───
export async function syncPreferencesToCloud(
  user: User,
  data: {
    selectedTopics: string[]
    hasOnboarded: boolean
    cardsRead: number
  }
) {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('user_profiles')
    .update({
      selected_topics: data.selectedTopics,
      has_onboarded: data.hasOnboarded,
      cards_read: data.cardsRead,
    })
    .eq('id', user.id)

  if (error) console.error('[Plax] Sync preferences error:', error.message)
  return !error
}

// ─── Load preferences from cloud ───
export async function loadPreferencesFromCloud(user: User): Promise<UserProfile | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('[Plax] Load preferences error:', error.message)
    return null
  }

  return data as UserProfile
}

// ─── Sync bookmark to cloud ───
export async function addBookmarkToCloud(
  user: User,
  card: { id: string; title?: string; category?: string; content?: string }
) {
  const supabase = getSupabase()

  const { error } = await supabase.from('bookmarks').upsert(
    {
      user_id: user.id,
      card_id: card.id,
      card_title: card.title || null,
      card_category: card.category || null,
      card_content: card.content?.slice(0, 500) || null,
    },
    { onConflict: 'user_id,card_id' }
  )

  if (error) console.error('[Plax] Add bookmark error:', error.message)
  return !error
}

// ─── Remove bookmark from cloud ───
export async function removeBookmarkFromCloud(user: User, cardId: string) {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('user_id', user.id)
    .eq('card_id', cardId)

  if (error) console.error('[Plax] Remove bookmark error:', error.message)
  return !error
}

// ─── Load bookmarks from cloud ───
export async function loadBookmarksFromCloud(user: User): Promise<BookmarkRow[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Plax] Load bookmarks error:', error.message)
    return []
  }

  return (data as BookmarkRow[]) || []
}

// ─── Save engagement to cloud ───
export async function saveEngagementToCloud(
  user: User,
  engagement: {
    cardId: string
    category: string
    timeSpent: number
    bookmarked: boolean
    shared: boolean
    completed: boolean
  }
) {
  const supabase = getSupabase()

  const { error } = await supabase.from('engagements').insert({
    user_id: user.id,
    card_id: engagement.cardId,
    category: engagement.category,
    time_spent: engagement.timeSpent,
    bookmarked: engagement.bookmarked,
    shared: engagement.shared,
    completed: engagement.completed,
  })

  if (error) console.error('[Plax] Save engagement error:', error.message)
  return !error
}

// ─── Update reading streak ───
export async function updateReadingStreak(user: User) {
  const supabase = getSupabase()

  const { error } = await supabase.rpc('update_reading_streak', {
    p_user_id: user.id,
  })

  if (error) console.error('[Plax] Update streak error:', error.message)
  return !error
}

// ─── Get user stats ───
export async function getUserStats(user: User) {
  const supabase = getSupabase()

  const [profileRes, bookmarksRes, engagementsRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('bookmarks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('engagements')
      .select('category, time_spent')
      .eq('user_id', user.id),
  ])

  const profile = profileRes.data as UserProfile | null
  const bookmarkCount = bookmarksRes.count || 0
  const engagements = (engagementsRes.data as { category: string; time_spent: number }[]) || []

  // Calculate total reading time
  const totalTimeMs = engagements.reduce((sum, e) => sum + (e.time_spent || 0), 0)
  const totalMinutes = Math.round(totalTimeMs / 60000)

  // Top categories
  const catScores: Record<string, number> = {}
  engagements.forEach((e) => {
    catScores[e.category] = (catScores[e.category] || 0) + (e.time_spent || 0)
  })
  const topCategories = Object.entries(catScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat]) => cat)

  return {
    cardsRead: profile?.cards_read || 0,
    readingStreak: profile?.reading_streak || 0,
    bookmarkCount,
    totalMinutes,
    topCategories,
    memberSince: profile?.created_at || new Date().toISOString(),
  }
}
