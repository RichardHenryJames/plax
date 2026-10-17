// The facts the policy pages state, in one place so the privacy policy, the delete-account page and the answers given in
// the Play Console cannot drift apart. The contact address is the one that is also the Play Console support contact.
export const LEGAL = {
  operator: 'Plax Labs',
  contactEmail: 'richardhenryjames64@gmail.com',
  updated: '13 October 2026',
  // The same day, for the sitemap. Change both when the policy changes.
  updatedIso: '2026-10-13',
  // How long an emailed deletion request may take. Deleting from the app or from the website is immediate.
  emailDeletionDays: 30,
  // The contact page (/contact) has its own date: Google Play's news policy wants contact details that are up to date.
  contactUpdated: '17 October 2026',
  contactUpdatedIso: '2026-10-17',
  // The address of that page in the Android app (FeedApi.CONTACT_URL), which shows the same email; ContactTest keeps them equal.
  contactPath: '/contact',
} as const

export const CONTACT_MAILTO = `mailto:${LEGAL.contactEmail}?subject=${encodeURIComponent('Plax feedback')}`

export const DELETION_MAILTO =
  `mailto:${LEGAL.contactEmail}` +
  `?subject=${encodeURIComponent('Delete my Plax account')}` +
  `&body=${encodeURIComponent('Please delete my Plax account and its data. I am writing from the email address of the account.')}`
