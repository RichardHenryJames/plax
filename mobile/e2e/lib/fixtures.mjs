// The stories and pictures the mock website serves to the test build: deterministic, in English and Hindi, in all the lengths the page has to
// fit (a headline of three words and one of forty, a summary of a line and one of ten sentences), with pictures of several shapes, and some
// stories with no picture at all.
import zlib from 'node:zlib'

const SECTIONS = ['india', 'world', 'us', 'tech', 'business', 'science']
const SOURCES = ['The Hindu', 'NDTV', 'BBC News', 'Al Jazeera', 'India Today', 'The Hindu Business']

const EN_TITLES = [
  'Rupee steadies against the dollar',
  'Court gives ministry two weeks to respond to the petition on school fees',
  'Opposition leaders walk out of the Lok Sabha after the Speaker refuses a debate on the rising cost of cooking gas across the country, saying the House cannot ignore households',
  'ISRO tests new engine',
  'Heavy rain brings the city to a standstill for a second day',
  'Scientists find water ice under the surface of a crater near the Moon\'s south pole, and say the deposit could be larger than first thought',
  'Markets close higher as banks lead the gains',
  'Government extends deadline for filing returns',
  'Dr. Rao named to the new expert panel on air quality, which will report to the ministry before the winter session of Parliament begins next month',
  'Cricket: India win the series with a day to spare',
  'New metro line opens to commuters',
  'Study links screen time to poor sleep in teenagers',
]
const EN_SENTENCES = [
  'The court said on Thursday that the ministry must respond within two weeks.',
  'Officials said the rules would be reviewed again next month and that no decision had been made.',
  'Opposition leaders called the move a delay, while industry groups welcomed the clarity it brings.',
  'The matter returns to the bench in March, when both sides will be heard in full.',
  'Prices rose by three percent last month, a little more than economists had expected.',
  'Residents were asked to stay indoors until the water levels fall, and schools will remain closed on Friday.',
  'The agency said the test went as planned and that the data would be studied over the coming weeks.',
  'Analysts said the rally was led by banks and large technology companies, with small caps lagging behind.',
  'A spokesperson for the company declined to comment on the report, saying only that it follows the law.',
  'The new line, which is 14 km long and has 11 stations, is expected to carry about 300,000 people a day.',
  'Researchers followed more than 4,000 students for two years and asked them about their habits each term.',
  'The minister told reporters that talks would continue and that a statement would follow on Monday.',
]
const HI_TITLES = [
  'रुपया डॉलर के मुक़ाबले स्थिर रहा',
  'अदालत ने मंत्रालय को जवाब देने के लिए दो हफ़्ते का समय दिया',
  'विपक्षी नेताओं ने लोकसभा से वॉकआउट किया, अध्यक्ष ने रसोई गैस की बढ़ती क़ीमतों पर चर्चा की अनुमति नहीं दी और कहा कि सदन को इस मुद्दे पर बहस की ज़रूरत नहीं है',
  'इसरो ने नए इंजन का परीक्षण किया',
  'भारी बारिश से शहर दूसरे दिन भी ठप रहा',
  'वैज्ञानिकों को चंद्रमा के दक्षिणी ध्रुव के पास गड्ढे में बर्फ़ के नीचे पानी मिला',
]
const HI_SENTENCES = [
  'अदालत ने गुरुवार को कहा कि मंत्रालय को दो हफ़्ते के भीतर जवाब देना होगा।',
  'अधिकारियों ने बताया कि नियमों की अगले महीने फिर समीक्षा की जाएगी और अभी कोई फ़ैसला नहीं हुआ है।',
  'विपक्षी नेताओं ने इसे देरी बताया, जबकि उद्योग संगठनों ने स्पष्टता का स्वागत किया।',
  'मामले की अगली सुनवाई मार्च में होगी, जब दोनों पक्षों को विस्तार से सुना जाएगा।',
  'पिछले महीने क़ीमतों में तीन प्रतिशत की बढ़ोतरी हुई, जो अर्थशास्त्रियों की उम्मीद से थोड़ी ज़्यादा है।',
  'लोगों से कहा गया है कि पानी का स्तर घटने तक घरों में ही रहें, शुक्रवार को स्कूल बंद रहेंगे।',
]

const TOPIC_CATEGORIES = ['stocks', 'science', 'technology', 'philosophy', 'psychology', 'history', 'finance', 'space', 'programming', 'books', 'health', 'math', 'nature', 'art', 'physics', 'business', 'language']

/** 0 = no picture, then the kinds of picture a story can have. */
const PICTURES = ['none', 'landscape', 'portrait', 'square', 'wide', 'small', 'broken', 'landscape']

export const IMAGE_HOST = 'https://e2e.plax.test'

const hex = (n, length) => n.toString(16).padStart(length, '0')

function story(index, { category, lang, now, ageMinutes }) {
  const hindi = lang === 'hi'
  const titles = hindi ? HI_TITLES : EN_TITLES
  const sentences = hindi ? HI_SENTENCES : EN_SENTENCES
  const title = titles[index % titles.length]
  // Summaries from one sentence to twelve, so that short, medium and long stories all appear.
  const count = [1, 2, 4, 7, 12, 3, 10, 5][index % 8]
  const content = Array.from({ length: count }, (_, i) => sentences[(index * 3 + i) % sentences.length]).join(' ')
  const picture = PICTURES[index % PICTURES.length]
  const idBase = `e2e-${category}-${lang}-${String(index).padStart(3, '0')}`
  const news = category === 'news'
  const section = news ? SECTIONS[index % SECTIONS.length] : ''
  const source = SOURCES[index % SOURCES.length]
  return {
    id: idBase,
    title: hindi ? title : `${title}${index >= titles.length ? ` (${Math.floor(index / titles.length) + 1})` : ''}`,
    content,
    category,
    section,
    source,
    sourceUrl: `https://e2e.plax.test/article/${idBase}`,
    image: picture === 'none' ? '' : `${IMAGE_HOST}/${picture}-${index % 5}.png`,
    readTime: ['12s', '30s', '1 min', '45s', '2 min'][index % 5],
    ...(news ? { publishedAt: now - ageMinutes * 60_000 } : {}),
    sig: `${hex(index + 1, 8)}${hex(index * 7919 + 13, 8)}${hex(index * 104729 + 5, 8)}${hex(index * 1299709 + 1, 8)}`,
  }
}

/** The whole pool of one category in one language: newest first, about 70 stories of news and 40 of every other topic. */
export function pool(category, lang, now) {
  const size = category === 'news' ? 70 : 40
  return Array.from({ length: size }, (_, index) => story(index, { category, lang, now, ageMinutes: 3 + index * 17 }))
}

export const CATEGORIES = ['news', ...TOPIC_CATEGORIES]

// Pictures -----------------------------------------------------------------------------------------------------------------------------------
const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()
const crc32 = (buffer) => {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** A PNG of this size, a diagonal blend between two colours with a lighter stripe, so that pictures can be told apart on a screenshot. */
export function png(width, height, seed) {
  const hue = (seed * 67) % 360
  const colour = (h, l) => {
    const a = (1 * Math.min(l, 1 - l))
    const f = (n) => {
      const k = (n + h / 30) % 12
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))))
    }
    return [f(0), f(8), f(4)]
  }
  const from = colour(hue, 0.35)
  const to = colour((hue + 50) % 360, 0.62)
  const rows = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1)
    rows[row] = 0
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2
      const stripe = Math.abs(((x + y) % 160) - 80) < 6 ? 28 : 0
      const at = row + 1 + x * 4
      for (let channel = 0; channel < 3; channel++) rows[at + channel] = Math.min(255, Math.round(from[channel] + (to[channel] - from[channel]) * t) + stripe)
      rows[at + 3] = 255
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

const SHAPES = { landscape: [960, 640], portrait: [640, 960], square: [800, 800], wide: [1200, 500], small: [160, 100] }

/** The picture for a path like `landscape-3.png`, or null for one that does not exist (a broken picture). */
export function imageFor(name) {
  const match = /^([a-z]+)-(\d+)\.png$/.exec(name)
  if (!match || !SHAPES[match[1]]) return null
  return png(...SHAPES[match[1]], Number(match[2]) * 5 + match[1].length)
}
