import { E2E_SITE, variant } from '../build'

/** The made-up host the test build's stories name for their pictures; the test build alone maps it to its mock website. */
export const IMAGE_HOST_E2E = 'https://e2e.plax.test'

/**
 * The address to load a picture from. Every build loads the address the story gives, except the test build, whose stories name pictures on a
 * made-up https host (a story's picture must be https), which it fetches from its mock website instead: nothing else differs.
 */
export function imageUri(url: string): string {
  if (variant() === 'e2e' && url.startsWith(`${IMAGE_HOST_E2E}/`)) return `${E2E_SITE}/e2e-img/${url.slice(IMAGE_HOST_E2E.length + 1)}`
  return url
}
