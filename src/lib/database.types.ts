// ─── Supabase Database Types ───

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
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
        Insert: {
          id: string
          email?: string | null
          display_name?: string | null
          avatar_url?: string | null
          selected_topics?: string[]
          has_onboarded?: boolean
          cards_read?: number
          reading_streak?: number
          last_read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          display_name?: string | null
          avatar_url?: string | null
          selected_topics?: string[]
          has_onboarded?: boolean
          cards_read?: number
          reading_streak?: number
          last_read_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      bookmarks: {
        Row: {
          id: string
          user_id: string
          card_id: string
          card_title: string | null
          card_category: string | null
          card_content: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          card_id: string
          card_title?: string | null
          card_category?: string | null
          card_content?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          card_id?: string
          card_title?: string | null
          card_category?: string | null
          card_content?: string | null
          created_at?: string
        }
      }
      engagements: {
        Row: {
          id: string
          user_id: string
          card_id: string
          category: string
          time_spent: number
          bookmarked: boolean
          shared: boolean
          completed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          card_id: string
          category: string
          time_spent?: number
          bookmarked?: boolean
          shared?: boolean
          completed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          card_id?: string
          category?: string
          time_spent?: number
          bookmarked?: boolean
          shared?: boolean
          completed?: boolean
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
