// Keeps the page's layout boxes at the heights the page gave them.
//
// Google's ad script sets `height: auto !important` on the boxes around the place of an ad (here the page's <main> and the box in it, which
// are as tall as the window and hold the screens inside them): the screen shrinks to the height of its contents, and the story column,
// which has no height of its own, to nothing. It was seen on the live site on a desktop, a blank middle between the two panels, from the
// day the site's AdSense ids were set, whether or not an ad was shown (the script also places ads of its own when Auto ads are on for the
// site). Whatever the script does elsewhere, these boxes keep their size: the height it sets is taken off again as soon as it is set, in
// the same task, so that the browser never paints it. Only a height that is `auto` is taken off; any other is the page's own.

/** Watches these boxes, and takes an `auto` height off each as it is set (and off any that has one now). Returns what stops the watching. */
export function keepLayoutHeights(boxes: ReadonlyArray<HTMLElement | null | undefined>): () => void {
  const watched = boxes.filter((box): box is HTMLElement => !!box)
  const release = () => {
    for (const box of watched) if (box.style.getPropertyValue('height') === 'auto') box.style.removeProperty('height')
  }
  const watch = new MutationObserver(release)
  for (const box of watched) watch.observe(box, { attributes: true, attributeFilter: ['style'] })
  release()
  return () => watch.disconnect()
}
