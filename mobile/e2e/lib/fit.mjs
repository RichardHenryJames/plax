// Does a page of the app fit the screen? Every story is laid out so that all of it is in view at once: nothing scrolls, nothing runs off the
// edge, nothing lies over anything else, and the summary ends where the room does.
import * as d from './device.mjs'

export const density = () => Number(/(\d+)/.exec(d.shell('wm density'))?.[1] ?? 420) / 160

/** The screen the nodes are drawn on, as the largest box in the tree. */
export function screenOf(nodes) {
  return { width: Math.max(...nodes.map((node) => node.bounds.right)), height: Math.max(...nodes.map((node) => node.bounds.bottom)) }
}

const overlap = (a, b) => a.bounds.left < b.bounds.right && b.bounds.left < a.bounds.right && a.bounds.top < b.bounds.bottom && b.bounds.top < a.bounds.bottom

/**
 * The page in view. The pages on either side of it are in the tree too (cut off by the pager), so `pick(id)` gives the element with that test id
 * that mostly lies inside the pager. Off the feed (no pager) it is the first element with the id.
 */
export function pageView(nodes) {
  const pager = d.find(nodes, { id: 'feed-pager' })
  const inView = (node) => {
    if (!pager) return true
    const height = node.bounds.bottom - node.bounds.top
    if (height <= 0) return false
    const visible = Math.min(node.bounds.bottom, pager.bounds.bottom) - Math.max(node.bounds.top, pager.bounds.top)
    return visible / height >= 0.5
  }
  const pick = (id) => nodes.find((node) => (node.id === id || node.id.endsWith(`/${id}`)) && inView(node))
  return { pager, pick }
}

/**
 * What a page must satisfy. `nodes` is the accessibility tree of the screen now. Returns the problems found (an empty list is a page that fits).
 * `fill` also asks that the summary ends within a few lines of the foot of the page (a page of a long story is filled): the summary stops at
 * the end of a sentence that falls up to SENTENCE_SLACK_LINES (2) lines short of its room, and the room itself ends within a line of it, so
 * the most that may be left is three lines of the summary, which are 1.5 times the text size tall; `font` is the phone's text scale.
 */
export function problemsOf(nodes, { fill = true, font = 1 } = {}) {
  const found = []
  const { width } = screenOf(nodes)
  const { pager, pick } = pageView(nodes)
  if (!pager) return ['no pager']
  // A page that is an advertisement is the advertiser's to lay out: it only has to stay inside the screen.
  const adPage = pick('ad-page')
  if (adPage) {
    const box = adPage.bounds
    return box.left < -2 || box.right > width + 2 ? [`the ad page runs off the sides (${box.left}..${box.right} of ${width})`] : []
  }
  const parts = { tag: pick('tag'), credit: pick('credit'), headline: pick('headline'), body: pick('body'), save: pick('save'), share: pick('share'), menu: pick('menu-button') }
  if (!parts.headline) return ['no headline']
  const slack = 2
  for (const [name, node] of Object.entries(parts)) {
    if (!node) continue
    const box = node.bounds
    if (box.left < -slack || box.right > width + slack) found.push(`${name} runs off the sides (${box.left}..${box.right} of ${width})`)
    if (box.top < pager.bounds.top - slack) found.push(`${name} starts above the pager (${box.top} < ${pager.bounds.top})`)
    if (box.bottom > pager.bounds.bottom + slack) found.push(`${name} runs below the pager (${box.bottom} > ${pager.bounds.bottom})`)
  }
  const { headline, body, tag, credit, save, share } = parts
  if (body && overlap(headline, body) && headline.bounds.bottom > body.bounds.top + slack) found.push('the headline lies over the summary')
  if (tag && overlap(tag, headline) && tag.bounds.bottom > headline.bounds.top + slack) found.push('the tag lies over the headline')
  if (credit && share && overlap(credit, share)) found.push('the credit runs under the buttons')
  if (save && share && overlap(save, share)) found.push('the buttons lie over each other')
  // A page whose summary was cut is filled: the cut is where the room ends. A short story (shown whole) leaves room, and that is as it should be.
  const summary = body ? body.text || body.desc : ''
  const cut = summary.trimEnd().endsWith('\u2026')
  if (fill && body && cut) {
    const scale = density()
    const bodySp = screenOf(nodes).height / scale < 700 ? 15 : 16
    const allowedDp = 3 * bodySp * 1.5 * font + 12
    const gapDp = (pager.bounds.bottom - body.bounds.bottom) / scale
    if (gapDp > allowedDp) found.push(`the summary ends ${Math.round(gapDp)} dp above the foot of the page (at most ${Math.round(allowedDp)})`)
  }
  return found
}
