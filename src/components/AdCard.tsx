'use client'

import { useState } from 'react'
import { AdSlot, type AdStatus } from './AdSlot'
import { ads } from '@/lib/ads-config'
import { useT } from '@/lib/i18n'

/**
 * The full-page ad that stands between stories: after every fifth one, in the same swipe feed, so the next story is one swipe away,
 * as in Inshorts. It is plainly marked as an advertisement (a label above, and Google's own mark on the ad), it is never taller than
 * the page, and it can always be left: a swipe from anywhere that is not the ad, the arrow keys, or the button under it. (A swipe that
 * begins on the ad itself belongs to the ad's frame, which is Google's, so the ad is kept smaller than the page and there is room all
 * round it to swipe from.)
 *
 * With no ad to show (none served, or a blocker) it tells the feed, which drops the card, so a reader is never left on an empty page.
 */
export function AdCard({ onNext, onFilled, onUnfilled }: { onNext: () => void; onFilled: () => void; onUnfilled: () => void }) {
  const { t, lang } = useT()
  const [status, setStatus] = useState<AdStatus>('loading')
  const hindi = lang === 'hi' ? 'lang-hi' : ''

  return (
    <div
      data-ad-card
      className={`relative flex h-full w-full max-w-[26rem] flex-col items-center px-5 pt-16 pb-6 lg:pt-20 text-center ${hindi}`}
    >
      <span className="rounded-full border border-dark-border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-dark-muted">
        {t('adLabel')}
      </span>

      <div className="flex min-h-0 w-full flex-1 items-center justify-center py-4">
        <div className="w-full max-w-[336px]" style={{ minHeight: status === 'filled' ? undefined : 250 }}>
          <AdSlot
            unit={ads.page}
            rectangle
            label="Ad preview"
            onStatus={(next) => {
              setStatus(next)
              if (next === 'filled') onFilled()
              if (next === 'unfilled') onUnfilled()
            }}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2.5">
        <button type="button" onClick={onNext} className="btn-primary focus-ring px-6 py-2.5 text-sm">
          {t('adNextButton')} ↓
        </button>
        <p className="text-xs text-dark-subtle [@media(pointer:fine)]:hidden">{t('adNext')}</p>
        <p className="hidden text-xs text-dark-subtle [@media(pointer:fine)]:block">{t('adNextKey')}</p>
      </div>
    </div>
  )
}
