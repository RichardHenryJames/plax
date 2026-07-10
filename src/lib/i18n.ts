'use client'

import { usePlaxStore } from './store'

// ─── Topic labels per language ───
export const TOPIC_LABELS_HI: Record<string, string> = {
  science: 'विज्ञान',
  technology: 'तकनीक',
  philosophy: 'दर्शन',
  psychology: 'मनोविज्ञान',
  history: 'इतिहास',
  finance: 'वित्त',
  space: 'अंतरिक्ष',
  programming: 'प्रोग्रामिंग',
  books: 'पुस्तकें',
  health: 'स्वास्थ्य',
  math: 'गणित',
  nature: 'प्रकृति',
  art: 'कला व डिज़ाइन',
  physics: 'भौतिकी',
  business: 'व्यापार',
  language: 'भाषा',
  general: 'खोज',
}

// ─── UI strings (chrome) per language ───
type Dict = Record<string, string>

const EN: Dict = {
  // Nav / rails
  search: 'Search',
  forYou: 'For You',
  bookmarks: 'Bookmarks',
  exploreTopics: 'Explore Topics',
  profileStats: 'Profile & Stats',
  yourTopics: 'Your Topics',
  edit: 'Edit',
  addTopics: 'Add topics',
  addTopicsToPersonalize: 'to personalize your feed.',
  signIn: 'Sign in',
  signInWithGoogle: 'Sign in with Google',
  signOut: 'Sign out',
  editInterests: 'Edit interests',
  profileAndStats: 'Profile & Stats',
  signInToSync: 'Sign in to sync',
  cloudBenefits: 'Cloud bookmarks, streaks & more',
  continueWithGoogle: 'Continue with Google',
  nowReading: 'Now Reading',
  yourActivity: 'Your Activity',
  topInterests: 'Top Interests',
  shortcuts: 'Shortcuts',
  nextCard: 'Next card',
  previousCard: 'Previous card',
  searchAndJump: 'Search & jump',
  cardsRead: 'Cards read',
  minutes: 'Minutes',
  interests: 'Interests',
  save: 'Save',
  saved: 'Saved',
  source: 'Source',
  read: 'read',
  // Interests editor
  yourInterests: 'Your interests',
  selectedTapToAddRemove: 'selected · tap to add or remove',
  feedLanguage: 'Feed language',
  searchTopics: 'Search topics…',
  done: 'Done',
  pickAtLeastOne: 'Pick at least one topic',
  close: 'Close',
  // Card
  aiSummary: 'AI summary',
  readFullStory: 'Read full story',
  copy: 'Copy',
  share: 'Share',
  swipeOrPress: 'Swipe up or press ↓',
  addToFeedQ: 'Add “{x}” to your feed?',
  removeFromFeedQ: 'Remove “{x}” from your feed?',
  add: 'Add',
  remove: 'Remove',
  cancel: 'Cancel',
  loading: 'Loading',
  // Onboarding
  yourDailyKnowledgeFeed: 'Your daily knowledge feed',
  becomeSmarter: 'Become smarter,',
  oneSwipeAtATime: 'one swipe at a time',
  onboardingSub: 'Short, AI-summarized insights on the topics you care about — from science and startups to AI and philosophy.',
  getStarted: 'Get started',
  freeNoAccount: 'Free • No account needed to start',
  or: 'Or',
  exploreAllTopics: 'explore all topics',
  whatAreYouCurious: 'What are you curious about?',
  pickAtLeast3: "Pick at least 3 — we'll craft your feed around them.",
  startReading: 'Start reading →',
  selected: 'selected',
  moreToContinue: 'more to continue',
  readyCheck: 'Ready ✓',
  valueProp1: 'Get smarter in 5 minutes a day',
  valueProp2: 'AI-summarized, not endless scrolling',
  valueProp3: 'Personalized to what you care about',
  // Profile
  feed: 'Feed',
  yourReading: 'Your reading',
  savedOnDevice: 'Saved on this device',
  cardsReadCap: 'Cards Read',
  interestsCap: 'Interests',
  yourTopInterests: 'Your Top Interests',
  signInToSyncTitle: 'Sync across your devices',
  signInToSyncBody: 'Sign in to save your bookmarks, streaks and reading history to the cloud.',
  goDeeper: 'Go deeper',
  deeperLoading: 'Thinking…',
  deeperError: 'Could not load more right now.',
}

const HI: Dict = {
  search: 'खोजें',
  forYou: 'आपके लिए',
  bookmarks: 'सहेजे गए',
  exploreTopics: 'विषय देखें',
  profileStats: 'प्रोफ़ाइल व आँकड़े',
  yourTopics: 'आपके विषय',
  edit: 'बदलें',
  addTopics: 'विषय जोड़ें',
  addTopicsToPersonalize: 'ताकि आपकी फ़ीड बेहतर बने।',
  signIn: 'साइन इन',
  signInWithGoogle: 'Google से साइन इन',
  signOut: 'साइन आउट',
  editInterests: 'रुचियाँ बदलें',
  profileAndStats: 'प्रोफ़ाइल व आँकड़े',
  signInToSync: 'सिंक हेतु साइन इन करें',
  cloudBenefits: 'क्लाउड बुकमार्क, स्ट्रीक व अधिक',
  continueWithGoogle: 'Google से जारी रखें',
  nowReading: 'अभी पढ़ रहे हैं',
  yourActivity: 'आपकी गतिविधि',
  topInterests: 'प्रमुख रुचियाँ',
  shortcuts: 'शॉर्टकट',
  nextCard: 'अगला कार्ड',
  previousCard: 'पिछला कार्ड',
  searchAndJump: 'खोजें व जाएँ',
  cardsRead: 'पढ़े गए कार्ड',
  minutes: 'मिनट',
  interests: 'रुचियाँ',
  save: 'सहेजें',
  saved: 'सहेजा गया',
  source: 'स्रोत',
  read: 'पढ़ें',
  yourInterests: 'आपकी रुचियाँ',
  selectedTapToAddRemove: 'चुने गए · जोड़ने/हटाने हेतु टैप करें',
  feedLanguage: 'फ़ीड भाषा',
  searchTopics: 'विषय खोजें…',
  done: 'हो गया',
  pickAtLeastOne: 'कम से कम एक विषय चुनें',
  close: 'बंद करें',
  aiSummary: 'AI सारांश',
  readFullStory: 'पूरी कहानी पढ़ें',
  copy: 'कॉपी',
  share: 'साझा करें',
  swipeOrPress: 'ऊपर स्वाइप करें या ↓ दबाएँ',
  addToFeedQ: 'क्या “{x}” को अपनी फ़ीड में जोड़ें?',
  removeFromFeedQ: 'क्या “{x}” को अपनी फ़ीड से हटाएँ?',
  add: 'जोड़ें',
  remove: 'हटाएँ',
  cancel: 'रद्द करें',
  loading: 'लोड हो रहा है',
  yourDailyKnowledgeFeed: 'आपकी रोज़ाना ज्ञान फ़ीड',
  becomeSmarter: 'हर स्वाइप के साथ',
  oneSwipeAtATime: 'बनें और समझदार',
  onboardingSub: 'आपकी पसंद के विषयों पर छोटे, AI-सारांशित विचार — विज्ञान और स्टार्टअप से लेकर AI और दर्शन तक।',
  getStarted: 'शुरू करें',
  freeNoAccount: 'निःशुल्क • शुरू करने हेतु खाता आवश्यक नहीं',
  or: 'या',
  exploreAllTopics: 'सभी विषय देखें',
  whatAreYouCurious: 'आप किसमें रुचि रखते हैं?',
  pickAtLeast3: 'कम से कम 3 चुनें — हम उन्हीं के आसपास आपकी फ़ीड बनाएँगे।',
  startReading: 'पढ़ना शुरू करें →',
  selected: 'चुने गए',
  moreToContinue: 'और चाहिए',
  readyCheck: 'तैयार ✓',
  valueProp1: 'रोज़ 5 मिनट में बनें समझदार',
  valueProp2: 'AI-सारांश, अंतहीन स्क्रॉलिंग नहीं',
  valueProp3: 'आपकी पसंद के अनुसार निजीकृत',
  feed: 'फ़ीड',
  yourReading: 'आपकी पढ़ाई',
  savedOnDevice: 'इस डिवाइस पर सहेजा गया',
  cardsReadCap: 'पढ़े गए कार्ड',
  interestsCap: 'रुचियाँ',
  yourTopInterests: 'आपकी प्रमुख रुचियाँ',
  signInToSyncTitle: 'अपने सभी डिवाइस पर सिंक करें',
  signInToSyncBody: 'अपने बुकमार्क, स्ट्रीक व पढ़ाई का इतिहास क्लाउड में सहेजने हेतु साइन इन करें।',
  goDeeper: 'और गहराई में जाएँ',
  deeperLoading: 'सोच रहे हैं…',
  deeperError: 'अभी और जानकारी लोड नहीं हो सकी।',
}

const DICTS: Record<string, Dict> = { en: EN, hi: HI }

// Translate a UI string key for the current language, with optional {x} interpolation.
export function translate(lang: string, key: string, vars?: Record<string, string>): string {
  const dict = DICTS[lang] || EN
  let s = dict[key] ?? EN[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v)
  return s
}

// Topic label in the current language.
export function topicLabel(lang: string, id: string, fallback: string): string {
  if (lang === 'hi') return TOPIC_LABELS_HI[id] || fallback
  return fallback
}

// Hook: returns { lang, t, tp } — t() for UI strings, tp() for topic labels.
export function useT() {
  const lang = usePlaxStore((s) => s.language)
  return {
    lang,
    t: (key: string, vars?: Record<string, string>) => translate(lang, key, vars),
    tp: (id: string, fallback: string) => topicLabel(lang, id, fallback),
  }
}
