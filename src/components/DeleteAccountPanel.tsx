'use client'

import { useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { getSupabase } from '@/lib/supabase'
import { withBase } from '@/lib/base-path'
import { DELETION_MAILTO, LEGAL } from '@/lib/legal'

type Step = 'idle' | 'confirm' | 'deleting' | 'deleted' | 'expired' | 'failed'

const BUTTON = 'focus-ring w-full sm:w-auto px-6 h-12 rounded-xl text-[15px] font-semibold transition disabled:opacity-60'

/**
 * Deleting the account from the website, for people who no longer have the app: sign in with the same Google account,
 * confirm, and the account and everything stored in it is removed (POST /api/account/delete, proved by the reader's own
 * sign-in token). The email route on the page stays available for when sign-in is not.
 */
export function DeleteAccountPanel() {
  const { user, loading, signInWithGoogle, signOut } = useAuth()
  const [step, setStep] = useState<Step>('idle')
  const [checking, setChecking] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const signIn = async () => {
    setChecking(true)
    setUnavailable(false)
    // Google sends the reader back to this page.
    const result = await signInWithGoogle('/delete-account')
    if (result === 'unavailable') {
      setUnavailable(true)
      setChecking(false)
    }
  }

  const remove = async () => {
    setStep('deleting')
    try {
      // Reading the session refreshes an expired token first.
      const { data } = await getSupabase().auth.getSession()
      const token = data.session?.access_token
      if (!token) { setStep('expired'); return }
      const res = await fetch(withBase('/api/account/delete'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        await signOut()
        setStep('deleted')
      } else {
        setStep(res.status === 401 ? 'expired' : 'failed')
      }
    } catch {
      setStep('failed')
    }
  }

  const note = 'rounded-xl bg-white/5 px-4 py-3.5 text-[15px] text-white leading-relaxed'
  const emailLink = <a href={DELETION_MAILTO} className="text-[color:var(--signal-text)] underline">email {LEGAL.contactEmail}</a>

  if (step === 'deleted') {
    return (
      <div role="status" className={note}>
        <p className="font-semibold">Your Plax account has been deleted.</p>
        <p className="mt-1.5 text-dark-muted">
          Its email, name, picture, topics, saved stories and reading activity are gone from our servers. Anything saved on a device
          stays on that device until you clear it.
        </p>
      </div>
    )
  }

  if (loading) return <p className="text-sm text-dark-muted" role="status">Checking sign-in…</p>

  if (!user) {
    return (
      <div>
        <button type="button" onClick={signIn} disabled={checking} className={`${BUTTON} bg-white text-gray-800 hover:bg-gray-100`}>
          {checking ? 'Checking sign-in…' : 'Continue with Google'}
        </button>
        <p className="mt-3 text-[13px] text-dark-muted leading-relaxed">
          Use the Google account you signed in to Plax with. You will come back to this page to confirm.
        </p>
        {step === 'expired' && (
          <p role="status" className={`mt-4 ${note}`}>Your sign-in ended before the account could be deleted. Please sign in again.</p>
        )}
        {unavailable && (
          <p role="status" className={`mt-4 ${note}`}>
            Sign-in is temporarily unavailable. You can {emailLink} instead and we will delete the account.
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <p className="text-[15px] text-white">
        Signed in as <strong>{String(user.email || user.user_metadata?.full_name || 'your account')}</strong>
      </p>
      {step === 'confirm' || step === 'deleting' || step === 'failed' || step === 'expired' ? (
        <div className="mt-4">
          <p className={note}>
            This permanently deletes this Plax account and everything stored in it. It cannot be undone.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={remove} disabled={step === 'deleting'} className={`${BUTTON} bg-red-600 text-white hover:bg-red-500`}>
              {step === 'deleting' ? 'Deleting…' : 'Delete my account permanently'}
            </button>
            <button type="button" onClick={() => setStep('idle')} disabled={step === 'deleting'} className={`${BUTTON} btn-secondary`}>
              Keep my account
            </button>
          </div>
          {step === 'failed' && (
            <p role="status" className={`mt-4 ${note}`}>
              The account could not be deleted right now. Nothing was changed; please try again in a moment, or {emailLink}.
            </p>
          )}
          {step === 'expired' && (
            <p role="status" className={`mt-4 ${note}`}>
              Your sign-in ended before the account could be deleted.{' '}
              <button type="button" onClick={() => { void signOut(); setStep('idle') }} className="underline text-[color:var(--signal-text)]">
                Sign in again
              </button>
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <button type="button" onClick={() => setStep('confirm')} className={`${BUTTON} bg-red-600 text-white hover:bg-red-500`}>
            Delete my account
          </button>
          <button type="button" onClick={() => { void signOut() }} className="ml-0 sm:ml-4 mt-3 sm:mt-0 text-sm font-semibold text-dark-muted underline">
            Not you? Sign out
          </button>
        </div>
      )}
    </div>
  )
}
