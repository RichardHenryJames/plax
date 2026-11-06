// The app's icons, as SVG paths. They were taken from the native app's vector drawables (version 1.7.1, tag native-android-1.7.1) and are
// kept here as they were drawn. A path is filled when `fill` is set and stroked when `stroke` (the width, in the icon's own units) is set;
// both use the colour the icon is drawn in. The "plax" P is the brand mark (src/lib/brand.ts), which brand.test.mjs keeps equal.

export interface IconPath {
  readonly d: string
  readonly fill?: true
  readonly stroke?: number
  readonly cap?: 'round' | 'butt' | 'square'
  readonly join?: 'round' | 'miter' | 'bevel'
  readonly evenOdd?: true
}

export interface IconDefinition {
  /** The side of the square the paths are drawn in. */
  readonly size: number
  readonly paths: readonly IconPath[]
}

export const ICONS = {
  arrow_up: {
    size: 24,
    paths: [
      { d: "M12,19 V5 M6,11 L12,5 L18,11", stroke: 2, cap: "round", join: "round" },
    ],
  },
  bookmark: {
    size: 24,
    paths: [
      { d: "M7,4 H17 A1.5,1.5 0,0 1,18.5 5.5 V20 L12,16 L5.5,20 V5.5 A1.5,1.5 0,0 1,7 4 Z", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  bookmark_filled: {
    size: 24,
    paths: [
      { d: "M7,4 H17 A1.5,1.5 0,0 1,18.5 5.5 V20 L12,16 L5.5,20 V5.5 A1.5,1.5 0,0 1,7 4 Z", fill: true, stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  check_circle: {
    size: 24,
    paths: [
      { d: "M12,3 A9,9 0 1 0 12,21 A9,9 0 1 0 12,3 Z M8,12.5 L11,15.5 L16,9.5", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  close: {
    size: 24,
    paths: [
      { d: "M6,6 L18,18 M18,6 L6,18", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  cloud_off: {
    size: 24,
    paths: [
      { d: "M7,18.5 H17 A3.8,3.8 0,0 0,17.6 11 A5.5,5.5 0,0 0,7.2 9.2 A4.7,4.7 0,0 0,7,18.5 Z M4,4 L20,20", stroke: 1.6, cap: "round", join: "round" },
    ],
  },
  download: {
    size: 24,
    paths: [
      { d: "M12,4 L12,15 M7,10 L12,15 L17,10 M5,20 L19,20", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  empty: {
    size: 24,
    paths: [
      { d: "M6,3.5 H18 A1.5,1.5 0,0 1,19.5 5 V19 A1.5,1.5 0,0 1,18 20.5 H6 A1.5,1.5 0,0 1,4.5 19 V5 A1.5,1.5 0,0 1,6 3.5 Z M8,8 H16 M8,12 H16 M8,16 H12.5", stroke: 1.6, cap: "round", join: "round" },
    ],
  },
  feed: {
    size: 24,
    paths: [
      { d: "M5.5,4.5 H18.5 A1.5,1.5 0,0 1,20 6 V10 A1.5,1.5 0,0 1,18.5 11.5 H5.5 A1.5,1.5 0,0 1,4 10 V6 A1.5,1.5 0,0 1,5.5 4.5 Z M5.5,13 H18.5 A1.5,1.5 0,0 1,20 14.5 V18 A1.5,1.5 0,0 1,18.5 19.5 H5.5 A1.5,1.5 0,0 1,4 18 V14.5 A1.5,1.5 0,0 1,5.5 13 Z", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  grid: {
    size: 24,
    paths: [
      { d: "M5.5,4.5 H10 V10 H4.5 V5.5 A1,1 0,0 1,5.5 4.5 Z M14,4.5 H18.5 A1,1 0,0 1,19.5 5.5 V10 H14 Z M4.5,14 H10 V19.5 H5.5 A1,1 0,0 1,4.5 18.5 Z M14,14 H19.5 V18.5 A1,1 0,0 1,18.5 19.5 H14 Z", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  image: {
    size: 24,
    paths: [
      { d: "M5.5,4.5 H18.5 A1.5,1.5 0,0 1,20 6 V18 A1.5,1.5 0,0 1,18.5 19.5 H5.5 A1.5,1.5 0,0 1,4 18 V6 A1.5,1.5 0,0 1,5.5 4.5 Z M4.5,16.5 L9,12 L12.5,15.5 L15,13 L19.5,17.5 M15.5,9 A1.2,1.2 0,1 0,17.9 9 A1.2,1.2 0,1 0,15.5 9", stroke: 1.6, cap: "round", join: "round" },
    ],
  },
  info: {
    size: 24,
    paths: [
      { d: "M12,3 A9,9 0,1 0,12 21 A9,9 0,1 0,12 3 M12,11 L12,16 M12,8 L12,8.01", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  mail: {
    size: 24,
    paths: [
      { d: "M4,6.5 L20,6.5 L20,17.5 L4,17.5 Z M4.5,7 L12,13 L19.5,7", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  menu: {
    size: 24,
    paths: [
      { d: "M4,7 L20,7 M4,12 L20,12 M4,17 L20,17", stroke: 2, cap: "round" },
    ],
  },
  person: {
    size: 24,
    paths: [
      { d: "M12,4 A4,4 0 1 0 12,12 A4,4 0 1 0 12,4 Z M4.5,20 C4.5,16.5 8,14.5 12,14.5 C16,14.5 19.5,16.5 19.5,20", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  plax: {
    size: 48,
    paths: [
      { d: "M15.92,8.03 C14.6,8.14 13.95,9.39 14.9,9.99 L21.24,13.5 C23.33,14.66 24.19,15.85 24.48,17.97 C24.54,18.39 24.54,18.39 24.55,24.49 C24.57,31.15 24.55,30.69 24.72,30.88 C25.02,31.21 27.47,31.14 28.93,30.75 C34.87,29.17 38.5,23.3 37.28,17.25 C36.26,12.2 32.22,8.55 27.1,8.05 L15.92,8.03 Z", fill: true },
      { d: "M12.59,11.26 C12.05,11.41 11.68,11.8 11.55,12.38 C11.49,12.64 11.47,35.99 11.53,36.42 C11.72,37.72 12.2,38.25 14.14,39.28 L18.89,41.91 C20.56,42.86 20.96,43.02 21.44,42.92 C21.97,42.81 22.42,42.35 22.58,41.75 C22.66,41.46 22.67,18.6 22.59,18.05 C22.38,16.57 21.8,15.88 19.91,14.84 L15.72,12.51 C13.33,11.18 13.14,11.1 12.59,11.26 Z", fill: true },
    ],
  },
  share: {
    size: 24,
    paths: [
      { d: "M15.5,5 A2.5,2.5 0,1 0,20.5 5 A2.5,2.5 0,1 0,15.5 5 M3.5,12 A2.5,2.5 0,1 0,8.5 12 A2.5,2.5 0,1 0,3.5 12 M15.5,19 A2.5,2.5 0,1 0,20.5 19 A2.5,2.5 0,1 0,15.5 19 M8.2,10.8 L15.8,6.2 M8.2,13.2 L15.8,17.8", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  shield: {
    size: 24,
    paths: [
      { d: "M12,3 L19.5,6 L19.5,11.5 C19.5,16.1 16.4,19.7 12,21 C7.6,19.7 4.5,16.1 4.5,11.5 L4.5,6 Z", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  sparkle: {
    size: 24,
    paths: [
      { d: "M10.5,3.5 L12.2,9.3 L18,11 L12.2,12.7 L10.5,18.5 L8.8,12.7 L3,11 L8.8,9.3 Z", fill: true },
      { d: "M18.5,2.5 L19.3,5 L21.8,5.8 L19.3,6.6 L18.5,9.1 L17.7,6.6 L15.2,5.8 L17.7,5 Z", fill: true },
      { d: "M18,14.5 L18.7,16.6 L20.8,17.3 L18.7,18 L18,20.1 L17.3,18 L15.2,17.3 L17.3,16.6 Z", fill: true },
    ],
  },
  star: {
    size: 24,
    paths: [
      { d: "M12,3.5 L14.6,9 L20.5,9.7 L16.1,13.8 L17.3,19.7 L12,16.8 L6.7,19.7 L7.9,13.8 L3.5,9.7 L9.4,9 Z", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
  theme: {
    size: 24,
    paths: [
      { d: "M12,3 A9,9 0,1 0,12 21 A9,9 0,1 0,12 3", stroke: 1.8, cap: "round", join: "round" },
      { d: "M12,3 A9,9 0,0 0,12 21 Z", fill: true },
    ],
  },
  trash: {
    size: 24,
    paths: [
      { d: "M5,7 L19,7 M10,7 L10,4 L14,4 L14,7 M7,7 L8,20 L16,20 L17,7 M10,11 L10,16 M14,11 L14,16", stroke: 1.8, cap: "round", join: "round" },
    ],
  },
} as const satisfies Record<string, IconDefinition>

export type IconName = keyof typeof ICONS
