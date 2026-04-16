/** Pure color math utilities — hex ↔ HSL ↔ RGB triplet conversions. */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const s1 = s / 100;
  const l1 = l / 100;
  if (s1 === 0) {
    const v = Math.round(l1 * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let t1 = t;
    if (t1 < 0) t1 += 1;
    if (t1 > 1) t1 -= 1;
    if (t1 < 1 / 6) return p + (q - p) * 6 * t1;
    if (t1 < 1 / 2) return q;
    if (t1 < 2 / 3) return p + (q - p) * (2 / 3 - t1) * 6;
    return p;
  };
  const q = l1 < 0.5 ? l1 * (1 + s1) : l1 + s1 - l1 * s1;
  const p = 2 * l1 - q;
  const h1 = h / 360;
  return [
    Math.round(hue2rgb(p, q, h1 + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h1) * 255),
    Math.round(hue2rgb(p, q, h1 - 1 / 3) * 255),
  ];
}

/** Convert HSL to an "R G B" triplet string for CSS vars. */
export function hslToTriplet(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, Math.max(0, Math.min(100, s)), Math.max(0, Math.min(100, l)));
  return `${r} ${g} ${b}`;
}

export function hexToTriplet(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

export function shiftHue(h: number, degrees: number): number {
  return ((h + degrees) % 360 + 360) % 360;
}
