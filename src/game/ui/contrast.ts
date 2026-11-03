/** sRGB relative luminance (WCAG 2.x). */
export function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = relativeLuminance(...fg);
  const l2 = relativeLuminance(...bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Parse `rgb(r, g, b)` / `rgba(...)` from computed styles (alpha defaults to 1). */
export function parseRgb(cssColor: string): [number, number, number] | null {
  const rgba = parseRgba(cssColor);
  if (!rgba) return null;
  return [rgba[0], rgba[1], rgba[2]];
}

export function parseRgba(cssColor: string): [number, number, number, number] | null {
  const m = cssColor.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/,
  );
  if (!m) return null;
  const a = m[4] != null ? Number(m[4]) : 1;
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}

/** Place `top` (with alpha) over `bottom` sRGB triple. */
export function compositeOver(
  bottom: [number, number, number],
  top: [number, number, number, number],
): [number, number, number] {
  const [tr, tg, tb, ta] = top;
  if (ta <= 0) return bottom;
  if (ta >= 1) return [tr, tg, tb];
  const inv = 1 - ta;
  return [
    Math.round(tr * ta + bottom[0] * inv),
    Math.round(tg * ta + bottom[1] * inv),
    Math.round(tb * ta + bottom[2] * inv),
  ];
}
