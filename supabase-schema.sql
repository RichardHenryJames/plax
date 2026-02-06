-- ════════════════════════════════════════════════════════════
-- Plax — Supabase Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ════════════════════════════════════════════════════════════

-- 1. User Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  selected_topics TEXT[] DEFAULT '{}',
  has_onboarded BOOLEAN DEFAULT FALSE,
  cards_read INTEGER DEFAULT 0,
  reading_streak INTEGER DEFAULT 0,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bookmarks
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  card_id TEXT NOT NULL,
  card_title TEXT,
  card_category TEXT,
  card_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

-- 3. Engagements (reading analytics)
CREATE TABLE IF NOT EXISTS public.engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  card_id TEXT NOT NULL,
  category TEXT NOT NULL,
  time_spent INTEGER DEFAULT 0, -- milliseconds
  bookmarked BOOLEAN DEFAULT FALSE,
  shared BOOLEAN DEFAULT FALSE,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_engagements_user ON public.engagements(user_id);
CREATE INDEX IF NOT EXISTS idx_engagements_category ON public.engagements(user_id, category);

-- ── Row Level Security ──
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own data
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own bookmarks" ON public.bookmarks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmarks" ON public.bookmarks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks" ON public.bookmarks
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own engagements" ON public.engagements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own engagements" ON public.engagements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── Auto-create profile on signup ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: run after a new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Auto-update updated_at ──
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── Reading streak helper (call from app) ──
-- Checks if last_read_at was yesterday → increment streak, else reset to 1
CREATE OR REPLACE FUNCTION public.update_reading_streak(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_last_read DATE;
  v_today DATE := CURRENT_DATE;
BEGIN
  SELECT last_read_at::DATE INTO v_last_read
  FROM public.user_profiles WHERE id = p_user_id;

  IF v_last_read = v_today - INTERVAL '1 day' THEN
    UPDATE public.user_profiles
    SET reading_streak = reading_streak + 1, last_read_at = NOW()
    WHERE id = p_user_id;
  ELSIF v_last_read IS NULL OR v_last_read < v_today THEN
    UPDATE public.user_profiles
    SET reading_streak = 1, last_read_at = NOW()
    WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
