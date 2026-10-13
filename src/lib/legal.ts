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
} as const

export const DELETION_MAILTO =
  `mailto:${LEGAL.contactEmail}` +
  `?subject=${encodeURIComponent('Delete my Plax account')}` +
  `&body=${encodeURIComponent('Please delete my Plax account and its data. I am writing from the email address of the account.')}`
