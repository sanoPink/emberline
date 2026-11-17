// EMBERLINE — the palette. One source of truth for colour: the world and the
// HUD read the same names, so the dusk-yard look (indigo night, sodium amber,
// rust containers, teal Warden trim) stays consistent everywhere.
export const PAINT = {
  accent: '#F2A33C', // sodium amber: Ember team, money, tracers
  canvas: '#0D1117', // page background, fog, deep shadow
  danger: '#D4543C', // damage, planted spark, urgent timer
  ember: '#E8702A', // hot orange for the spark charge itself
  hairline: '#2B3542', // borders, crates, gunmetal
  ink: '#ECE5D3', // readable text, head / skin tone of bots
  muted: '#8D99A6', // secondary text
  rust: '#A34D2C', // rust-red containers
  surface: '#171D26', // panels, buy menu, overlay cards
  teal: '#3D8A84', // Warden team, armour
};

// Convenience accessor for code that wants a colour by name.
export function swatch(key) {
  return PAINT[key];
}
