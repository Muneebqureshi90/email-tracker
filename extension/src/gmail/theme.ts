/**
 * Gmail light or dark: the colour of Gmail's own text decides (light text means a dark or image
 * theme). It sets `mp-gmail-dark` on <html>, which switches the colours in content.css.
 */
export const DARK_CLASS = 'mp-gmail-dark';

/** Relative luminance of a CSS rgb()/rgba() colour, 0 (black) to 1 (white); null when unknown. */
export function luminance(color: string): number | null {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(color);
  if (!match) return null;
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => {
    const value = Number(part) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function gmailLooksDark(doc: Document): boolean {
  const probe = doc.querySelector('[role="main"]') ?? doc.body;
  const value = luminance(getComputedStyle(probe).color);
  return value !== null && value > 0.5;
}

/** Checks now and every few seconds (themes change rarely; the check is one style read). */
export function watchGmailTheme(doc: Document = document, everyMs = 5000): () => void {
  const apply = (): void => {
    doc.documentElement.classList.toggle(DARK_CLASS, gmailLooksDark(doc));
  };
  apply();
  const timer = setInterval(apply, everyMs);
  return () => clearInterval(timer);
}
