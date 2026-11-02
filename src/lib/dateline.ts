// Where a story was written, said at the start of its text ("KOCHI", "New Delhi", "Mumbai:", "Hyderabad, Nov 2:", "New Delhi, Nov 2
// (PTI)", "( for web) Our Bureau Mumbai:"), which a card does not need.
//
// Taking one off is a risk: "Delhi Police said", "AIIMS Delhi doctors" and "Trump: I will" begin as one does, and a story that has lost
// its first word reads worse than one that kept a dateline. So there are two ways to know a dateline, and nothing else is guessed:
//  1. The page itself shows it. The page's own paragraphs (its markup) are the story without the dateline, and the structured body
//     holds the same paragraphs after it. Only what the two hold in common is used (agreedParagraphs), so the dateline, the web addresses
//     and counters the structured body carries, and the widgets the markup carries, are each in one of the two only.
//  2. It cannot be anything else (stripDateline): "( for web)" and "Our Bureau Mumbai:"; a place and an agency ("LONDON (Reuters) -");
//     a place, a date and a mark ("Hyderabad, Nov 2:"); a known place and a colon ("Mumbai: "); a known place in capitals ("KOCHI The
//     Ernakulam", but not "DELHI POLICE said"); a known place and "The", "A" or "An" ("New Delhi The Centre has", which is no prose);
//     a known place and a date before such a word, with the credit before it ("Our Bureau New Delhi, November 2 In high-level talks").
// A dateline of a place that is not on the list, and that the page does not confirm, is left where it is.

const PLACE = "[A-Z][A-Za-z.'\u2019-]*(?: [A-Z][A-Za-z.'\u2019-]*){0,2}"
const DATE_LINE = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{1,2}'
const AGENCY = '\\((?:PTI|IANS|ANI|AFP|AP|UNI|Reuters|Bloomberg)\\)'
// Groups: the place, then a date (", Nov 2"), an agency (" (PTI)") and a mark (":", a dash), each only if there.
const MARKED = new RegExp(`^(${PLACE})((?:,\\s*${DATE_LINE})?)((?:\\s*${AGENCY})?)\\s*([:\\u2013\\u2014-])?\\s+`)
const CREDIT_LINE = /^(?:Our|Special|Staff|Senior)\s+(?:Bureau|Correspondent|Reporter|Representative)\b(?:\s+[A-Z][a-z]+(?: [A-Z][a-z]+)?)?\s*[:\u2013\u2014-]\s*/
const FOR_WEB = /^\(\s*for web\s*\)\s*/i
/** A note to the editors that a page's text carries in brackets at its start: "(Highlighted paras can be removed for Print. Please retain those for online)". */
const EDITOR_NOTE = /^\(\s*(?:highlighted paras?|please retain|editor['\u2019]?s note|note\s*:)[^)]*\)\s*/i
/** A credit with no mark after it: only a dateline after it makes it one. */
const UNMARKED_CREDIT = /^(?:Our|Special|Staff|Senior)\s+(?:Bureau|Correspondent|Reporter|Representative)\s+/
/** What can follow a place with no mark between, in words that begin a sentence and cannot go on a name ("New Delhi The Centre"). */
const SENTENCE_STARTER = /^(?:The|A|An|In|On|At|As|After|Amid|With)\s/

const PLACES = new Set(
  (
    // India: the capitals and the towns a newspaper writes its datelines from.
    'new delhi,delhi,mumbai,chennai,kolkata,bengaluru,bangalore,hyderabad,secunderabad,pune,ahmedabad,gandhinagar,jaipur,lucknow,bhopal,' +
    'chandigarh,patna,ranchi,bhubaneswar,thiruvananthapuram,amaravati,dehradun,shimla,raipur,panaji,dispur,guwahati,shillong,imphal,' +
    'agartala,aizawl,kohima,itanagar,gangtok,srinagar,jammu,leh,puducherry,' +
    'kochi,kozhikode,kannur,kollam,thrissur,malappuram,palakkad,kottayam,alappuzha,ernakulam,idukki,wayanad,pathanamthitta,kasaragod,' +
    'thodupuzha,muvattupuzha,kalpetta,' +
    'madurai,coimbatore,tiruchi,tiruchirappalli,salem,tirunelveli,vellore,thanjavur,pudukottai,pudukkottai,erode,tiruppur,namakkal,karur,' +
    'dindigul,theni,virudhunagar,sivakasi,thoothukudi,tuticorin,nagercoil,kanniyakumari,cuddalore,villupuram,kallakurichi,' +
    'tiruvannamalai,ariyalur,perambalur,nagapattinam,mayiladuthurai,tiruvarur,ramanathapuram,sivaganga,tenkasi,ranipet,tirupathur,' +
    'chengalpattu,kancheepuram,kanchipuram,tiruvallur,krishnagiri,dharmapuri,udhagamandalam,ooty,hosur,' +
    'mysuru,mysore,mangaluru,mangalore,hubballi,belagavi,belgaum,kalaburagi,gulbarga,ballari,bellary,vijayapura,bijapur,udupi,hassan,' +
    'mandya,tumakuru,shivamogga,shimoga,davanagere,dharwad,bidar,raichur,koppal,chitradurga,madikeri,chikkamagaluru,ramanagara,' +
    'chikkaballapur,kolar,bagalkot,gadag,haveri,yadgir,karwar,hosapete,' +
    'visakhapatnam,vijayawada,guntur,nellore,tirupati,kurnool,anantapur,kadapa,ongole,rajamahendravaram,kakinada,eluru,srikakulam,' +
    'vizianagaram,warangal,karimnagar,nizamabad,khammam,adilabad,nalgonda,mahabubnagar,siddipet,sangareddy,medak,nagarkurnool,' +
    'kanpur,varanasi,prayagraj,allahabad,agra,meerut,noida,greater noida,gurugram,gurgaon,ghaziabad,faridabad,amritsar,ludhiana,' +
    'jalandhar,patiala,mohali,jodhpur,udaipur,kota,bikaner,ajmer,gwalior,jabalpur,ujjain,indore,nagpur,nashik,aurangabad,kolhapur,' +
    'solapur,thane,navi mumbai,surat,vadodara,rajkot,bhavnagar,jamnagar,howrah,siliguri,darjeeling,asansol,durgapur,jamshedpur,dhanbad,' +
    'bokaro,cuttack,puri,rourkela,sambalpur,gorakhpur,bareilly,moradabad,aligarh,jhansi,ayodhya,mathura,haridwar,rishikesh,nainital,' +
    'hisar,rohtak,karnal,panipat,ambala,bilaspur,bhilai,durg,korba,' +
    // The world.
    'london,new york,washington,beijing,shanghai,hong kong,tokyo,seoul,moscow,kyiv,kiev,paris,berlin,brussels,rome,madrid,lisbon,vienna,' +
    'geneva,zurich,amsterdam,the hague,stockholm,oslo,copenhagen,helsinki,warsaw,prague,budapest,athens,istanbul,ankara,dubai,abu dhabi,' +
    'doha,riyadh,jeddah,muscat,manama,kuwait city,tehran,baghdad,damascus,beirut,amman,jerusalem,tel aviv,gaza,ramallah,cairo,islamabad,' +
    'karachi,lahore,peshawar,quetta,kabul,dhaka,colombo,kathmandu,thimphu,canberra,sydney,melbourne,wellington,auckland,toronto,ottawa,' +
    'vancouver,los angeles,san francisco,chicago,houston,miami,boston,singapore,kuala lumpur,jakarta,manila,bangkok,hanoi,phnom penh,' +
    'yangon,nairobi,lagos,abuja,johannesburg,pretoria,cape town,khartoum,addis ababa,tripoli,tunis,algiers,rabat,kinshasa,accra,dakar,' +
    'kampala,mogadishu'
  ).split(','),
)

/** A known place at the start of the text (one to three words), and whether it is written in capitals. At least one word follows it. */
function knownPlaceAtStart(text: string): { length: number; capitals: boolean } | null {
  const words = text.split(' ')
  for (let count = Math.min(3, words.length - 1); count >= 1; count--) {
    const used = words.slice(0, count)
    if (!used.every((word) => /^\p{Lu}/u.test(word))) continue
    const written = used.join(' ')
    if (PLACES.has(written.toLowerCase())) return { length: written.length, capitals: written === written.toUpperCase() }
  }
  return null
}

/** How much of the start is a dateline that cannot be anything else, by its mark, its date or its agency: or 0. */
function markedLength(text: string): number {
  const found = MARKED.exec(text)
  if (!found) return 0
  const [whole, place, dated, agency, mark] = found
  const known = PLACES.has(place.toLowerCase())
  const sure = agency !== '' || (dated !== '' && !!mark) || (known && mark === ':')
  // A known place and a date with no mark after them, before a word that begins a sentence: "New Delhi, November 2 In high-level talks".
  const datedBeforeSentence = known && dated !== '' && SENTENCE_STARTER.test(text.slice(whole.length))
  return sure || datedBeforeSentence ? whole.length : 0
}

/** How much of the start is a known place with no mark after it that only a dateline can be, or 0. */
function unmarkedLength(text: string): number {
  const place = knownPlaceAtStart(text)
  if (!place) return 0
  const afterPlace = text.slice(place.length)
  const rest = afterPlace.replace(/^\s+/, '')
  if (rest === afterPlace) return 0
  // In capitals the place is a dateline unless the words go on in capitals too ("DELHI POLICE said"); otherwise only a word that
  // begins a sentence can follow it.
  const dateline = place.capitals ? /^[A-Z\u201c"\u2018']/.test(rest) && !/^[A-Z]{2,}(?![a-z])/.test(rest) : SENTENCE_STARTER.test(rest)
  return dateline ? text.length - rest.length : 0
}

const startsLikeSentence = (text: string) => text.length >= 40 && /^[A-Z\u201c"\u2018']/.test(text)

/** The text without a dateline at its start that cannot be anything else (see above), or as it is. */
function withoutPlace(text: string): string {
  const cut = markedLength(text) || unmarkedLength(text)
  if (cut > 0) {
    const after = text.slice(cut)
    if (startsLikeSentence(after)) return after
  }
  return text
}

/**
 * The text without the line that says where it was written, when it begins with one that cannot be anything else. A credit with no
 * mark after it ("Our Bureau New Delhi, November 2 In high-level talks") goes with the dateline that follows it, and stays when none
 * does ("Special Representative Ajay Banga said").
 */
export function stripDateline(text: string): string {
  const rest = text.trim().replace(EDITOR_NOTE, '').replace(FOR_WEB, '').replace(CREDIT_LINE, '')
  const credit = UNMARKED_CREDIT.exec(rest)
  if (credit) {
    const body = rest.slice(credit[0].length)
    const after = withoutPlace(body)
    if (after !== body) return after
  }
  return withoutPlace(rest)
}

/**
 * Whether the text still begins, after what stripDateline is sure of, like a dateline it could not be sure of: a known place, words
 * in capitals before a sentence (a place that is not on the list, or an acronym: "AIIMS Delhi doctors"), or a place with a date, an
 * agency or a mark. It says "maybe", never "yes": the page's own paragraphs are asked.
 */
export function mayBeDateline(text: string): boolean {
  const start = stripDateline(text)
  if (/^[A-Z]{4,}(?: [A-Z]{3,}){0,2}\s+[A-Z]/.test(start)) return true
  const marked = MARKED.exec(start)
  if (marked && (marked[2] !== '' || marked[3] !== '' || marked[4])) return true
  return knownPlaceAtStart(start) !== null
}

/** A text as it is looked up in another: its letters and digits only, so that case, spacing, dashes and the curl of a quote do not matter. */
const letters = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '')

/** The words of a page's structured body, for `holds`. */
export function indexBody(paragraphs: string[]): string {
  return letters(paragraphs.join(' '))
}

/** Whether the start of a paragraph of the page's markup is said by the structured body (see indexBody) too. */
export function holds(index: string, paragraph: string): boolean {
  const probe = letters(paragraph).slice(0, 36)
  return probe.length >= 28 && index.includes(probe)
}

/**
 * The paragraphs of the page's markup that its structured body also holds, in the markup's order. Each says the story's own words and
 * nothing else: what the structured body puts before the first (a dateline), the addresses and counters it carries inside, and the
 * widgets the markup carries (a share's figures before a business story) are each in only one of the two.
 */
export function agreedParagraphs(structured: string[], markup: string[]): string[] {
  const index = indexBody(structured)
  return markup.filter((paragraph) => holds(index, paragraph))
}
