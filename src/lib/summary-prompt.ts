// What /api/summarize asks the model for.
//
// A story on the website has to fit one screen together with its picture (see card-fit.ts), so a NEWS card asks for a short brief:
// about as long as an Inshorts card. Everything that is not a card of the website keeps its longer form: the app's on-demand
// "AI brief" sends no `card` flag, and every other topic is a micro-essay by design.

/** True when the request is the website's text for a news card, which has to leave room for its picture. */
export function wantsShortBrief(category: string, card: unknown): boolean {
  return card === true && category === 'news'
}

// Topic-specific voice + structure. A breaking-news brief, a science explainer,
// a book note, and a philosophy idea should each READ differently.
export function topicGuidance(category: string, shortBrief = false): { role: string; angle: string; words: string } {
  switch (category) {
    case 'news':
      return {
        role: 'a sharp newsroom editor writing a crisp news brief',
        angle:
          '- Lead with the single most important fact (who/what/where/when).\n' +
          '- Give essential context and why it matters, neutrally — no hype, no opinion.\n' +
          '- Prefer concrete specifics (numbers, places, names) straight from the source.',
        // No full stop at the end: the prompt adds one. A thin source stays short instead of being padded to the range.
        words: shortBrief
          ? '35–60 words in one or two tight paragraphs. Stay close to the length of the source when it is short, and never pad a thin source'
          : '70–110 words, 2–3 tight paragraphs',
      }
    case 'science':
    case 'physics':
    case 'space':
    case 'health':
    case 'nature':
      return {
        role: 'a gifted science communicator (think a great science magazine)',
        angle:
          '- Open on the surprising finding or the question it answers.\n' +
          '- Explain the mechanism in plain language; gloss any term a layperson would not know.\n' +
          '- Note why it matters or what it changes.',
        words: '110–170 words, 3–4 short paragraphs',
      }
    case 'books':
      return {
        role: 'a thoughtful literary critic recommending a book',
        angle:
          '- Capture the essence, theme, or why the work endures — not a plot dump.\n' +
          '- Convey its distinctive voice or idea and who would love it.\n' +
          '- Be evocative but faithful to what the source says.',
        words: '100–160 words, 3 short paragraphs',
      }
    case 'philosophy':
    case 'psychology':
      return {
        role: 'a lucid thinker who makes big ideas click',
        angle:
          '- Frame the core idea or question and why it unsettles or illuminates.\n' +
          '- Use a concrete example or thought experiment to make it tangible.\n' +
          '- Land on what it means for how we think or live.',
        words: '110–170 words, 3–4 short paragraphs',
      }
    case 'finance':
    case 'business':
      return {
        role: 'a savvy business explainer (think a sharp finance newsletter)',
        angle:
          '- Lead with the core insight, number, or move that matters.\n' +
          '- Explain the mechanism and the stakes plainly; gloss jargon.\n' +
          '- Note the practical takeaway for a reader.',
        words: '90–150 words, 3 short paragraphs',
      }
    case 'history':
      return {
        role: 'a vivid history storyteller',
        angle:
          '- Set the scene and the stakes; make a distant moment feel immediate.\n' +
          '- Center the pivotal person, event, or turning point.\n' +
          '- Close on its lasting significance.',
        words: '110–170 words, 3–4 short paragraphs',
      }
    default:
      return {
        role: 'a brilliant, friendly explainer who makes anyone feel smarter in under a minute',
        angle:
          '- Open with something surprising, vivid, or a sharp question.\n' +
          '- Explain the core idea in plain language; gloss any jargon.\n' +
          '- Include the single most surprising or useful detail.',
        words: '110–170 words, 3–4 short paragraphs',
      }
  }
}

// Build the full summarize prompt for a given topic. CRITICAL: the essay must
// READ like a finished piece — it should HAVE a hook and a takeaway, but must
// NEVER print the words "Hook"/"Takeaway" or any section labels (that looks like
// a template, not journalism).
export function buildPrompt(category: string, content: string, type: string, outputLanguage?: string, shortBrief = false): string {
  const g = topicGuidance(category, shortBrief)
  const languageRule = outputLanguage
    ? `- Write the TITLE and the text entirely in ${outputLanguage}, in natural wording a native editor would use (the source is already in that language).\n`
    : ''
  return `You are ${g.role}. Rewrite the source below into a polished, publication-quality micro-read.

SOURCE:
${content.slice(0, 2200)}

Requirements:
- A compelling TITLE (max 8 words) — specific and intriguing, never clickbait.
- ${g.words}.
${g.angle}
${languageRule}- Write flowing prose. Do NOT use section labels or headers — NEVER write the words "Hook", "Takeaway", "Summary", "Intro", or similar. It must read like a finished article, not a template.
- End on a resonant closing line, but do not announce it.
- **Bold** 2–4 key phrases (never whole sentences).
- Use ONLY markdown for emphasis (**bold**). NEVER output HTML tags (no <p>, <strong>, <em>, <br>) — plain text + markdown only.
- NEVER output LaTeX or math markup (no $...$, \\commands, ^, _, {}). Express any math in plain words or simple Unicode a normal reader understands.
- STAY FAITHFUL to the source — never invent facts, numbers, names, or dates. If the source is thin, be concise rather than padding.

Respond with JSON only:
{"title": "...", "content": "...", "type": "${type}"}`
}
