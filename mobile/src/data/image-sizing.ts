/** Pure helpers that decide which image bytes to ask for and how large to decode them (the native app's ImageSizing.java). */

// BBC's image service serves the same picture at several fixed widths; feeds usually carry the smallest.
const BBC = /^(https:\/\/ichef\.bbci\.co\.uk\/ace\/(?:standard|ws)\/)(\d{2,4})(\/.*)$/
const BBC_WIDTHS = [240, 320, 480, 624, 800, 976]

/** Addresses to try in order. The original is always last, so that an unsupported upgrade falls back to it. */
export function imageCandidates(url: string, targetWidth: number): string[] {
  const urls: string[] = []
  const bbc = BBC.exec(url)
  if (bbc) {
    const current = Number(bbc[2])
    const wanted = BBC_WIDTHS.find((width) => width >= targetWidth) ?? BBC_WIDTHS[BBC_WIDTHS.length - 1]
    if (wanted > current) urls.push(`${bbc[1]}${wanted}${bbc[3]}`)
  }
  urls.push(url)
  return urls
}

/** The largest power-of-two subsampling that keeps the decoded width at or above the target. */
export function sampleSize(width: number, targetWidth: number): number {
  if (!(targetWidth > 0) || !Number.isFinite(width)) return 1
  let sample = 1
  while (Math.floor(width / (sample * 2)) >= targetWidth) sample *= 2
  return sample
}
