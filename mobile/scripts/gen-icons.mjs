// Scratch: converts the native app's vector drawables (res/drawable/ic_*.xml) into a typed TypeScript module of SVG paths, so the app's icons
// are the same drawings. Run: node gen-icons.mjs
import fs from 'node:fs'
const dir = 'C:/Users/parimalkumar/Desktop/Projects/plax/android/app/src/main/res/drawable'
const out = 'C:/Users/parimalkumar/Desktop/Projects/plax/mobile/src/ui/icons.generated.ts'

const attr = (tag, name) => new RegExp(`android:${name}="([^"]*)"`).exec(tag)?.[1]
const entries = []
for (const file of fs.readdirSync(dir).filter((f) => /^ic_.*\.xml$/.test(f)).sort()) {
  const name = file.replace(/^ic_/, '').replace(/\.xml$/, '')
  // The launcher and splash drawings are rasterized into PNG assets by gen-assets.mjs, not drawn at run time.
  if (name === 'launcher_foreground' || name === 'splash') continue
  const xml = fs.readFileSync(`${dir}/${file}`, 'utf8')
  const vector = /<vector[^>]*>/.exec(xml)[0]
  const viewW = Number(attr(vector, 'viewportWidth')), viewH = Number(attr(vector, 'viewportHeight'))
  if (viewW !== viewH) throw new Error(`${file} is not square`)
  const paths = []
  for (const tag of xml.match(/<path[^>]*\/>/g) ?? []) {
    const fill = attr(tag, 'fillColor')
    const stroke = attr(tag, 'strokeColor')
    const filled = fill !== undefined && fill !== '@android:color/transparent'
    const item = { d: attr(tag, 'pathData').replace(/\s+/g, ' ').trim() }
    if (filled) item.fill = true
    if (stroke) {
      item.stroke = Number(attr(tag, 'strokeWidth') ?? 1)
      const cap = attr(tag, 'strokeLineCap'), join = attr(tag, 'strokeLineJoin')
      if (cap) item.cap = cap
      if (join) item.join = join
    }
    if (attr(tag, 'fillType') === 'evenOdd') item.evenOdd = true
    paths.push(item)
  }
  if (!paths.length) throw new Error(`${file} has no paths`)
  entries.push({ name, size: viewW, paths })
}

const lines = [
  '// Generated from the native app\'s res/drawable/ic_*.xml by scripts/gen-icons.mjs; the drawings are unchanged. A path is filled when `fill`',
  '// is set and stroked when `stroke` (the width, in the icon\'s own units) is set; both use the colour the icon is drawn in.',
  '',
  'export interface IconPath {',
  '  readonly d: string',
  '  readonly fill?: true',
  '  readonly stroke?: number',
  "  readonly cap?: 'round' | 'butt' | 'square'",
  "  readonly join?: 'round' | 'miter' | 'bevel'",
  '  readonly evenOdd?: true',
  '}',
  '',
  'export interface IconDefinition {',
  '  /** The side of the square the paths are drawn in. */',
  '  readonly size: number',
  '  readonly paths: readonly IconPath[]',
  '}',
  '',
  'export const ICONS = {',
]
for (const e of entries) {
  lines.push(`  ${e.name}: {`, `    size: ${e.size},`, '    paths: [')
  for (const p of e.paths) lines.push(`      ${JSON.stringify(p).replace(/"([a-zA-Z]+)":/g, '$1: ').replace(/,(?=[a-zA-Z]+: )/g, ', ').replace(/^{/, '{ ').replace(/}$/, ' }')},`)
  lines.push('    ],', '  },')
}
lines.push('} as const satisfies Record<string, IconDefinition>', '', 'export type IconName = keyof typeof ICONS', '')
fs.mkdirSync('C:/Users/parimalkumar/Desktop/Projects/plax/mobile/src/ui', { recursive: true })
fs.writeFileSync(out, lines.join('\n'))
console.log(`${entries.length} icons: ${entries.map((e) => e.name).join(', ')}`)
