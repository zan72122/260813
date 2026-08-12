/** Palette from docs/ART_DIRECTION.md — the only place hex colors are defined. */
export const PALETTE = {
  cream: 0xfaf3e7,
  woodLight: 0xe3c9a3,
  woodDark: 0xc9a876,
  coral: 0xf2857e,
  mint: 0x8fd6c0,
  sky: 0x8ec9eb,
  butter: 0xf7d97b,

  floor: 0xd9b88a,
  wallBack: 0xfaf3e7,
  wallSide: 0xf3e6d3,
  window: 0xcfeaf9,
  windowFrame: 0xc9a876,

  skinTones: [0xf3cfa0, 0xecb98a, 0xd99a6c, 0xb97a52],
  hairColors: [0x5b3a29, 0x2c2320, 0xd8b25c, 0xa65b3a],
  clothesColors: [0xf2857e, 0x8fd6c0, 0x8ec9eb, 0xf7d97b, 0xc9a2e0],
  matColorways: [0xf2857e, 0x8fd6c0, 0x8ec9eb, 0xf7d97b],

  toyAccentByMaterial: {
    wood: [0xc9a876, 0xe3c9a3, 0xb5865a],
    fabric: [0xf2857e, 0x8fd6c0, 0xf7d97b],
    plastic: [0x8ec9eb, 0xf7d97b, 0xf2857e],
  },

  teacherClothes: 0x8ec9eb,
  teacherSkin: 0xecb98a,
  teacherHair: 0x3a2a20,

  night: {
    ambient: 0x2a3a55,
    key: 0x8fa8d6,
  },
} as const;

export function hexOf(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}
