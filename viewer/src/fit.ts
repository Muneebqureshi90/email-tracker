// Pure rules for the viewer page: the automatic page size and which load failures are permanent.

/** Widest a page is drawn at the automatic size (zoom 1), in CSS pixels: a comfortable reading width. */
export const READING_WIDTH = 900;
/** Largest automatic scale, for very small pages. */
export const MAX_FIT_SCALE = 4;

/** Scale that fits a page `pageWidth` wide into `available` CSS pixels, never wider than the reading width. */
export function fitScale(available: number, pageWidth: number): number {
  return Math.min(Math.min(available, READING_WIDTH) / pageWidth, MAX_FIT_SCALE);
}

/** True when PDF.js got the file but cannot display it (broken or password-protected): retrying will not help. */
export function isUnreadablePdf(error: unknown): boolean {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  return name === 'InvalidPDFException' || name === 'PasswordException';
}
