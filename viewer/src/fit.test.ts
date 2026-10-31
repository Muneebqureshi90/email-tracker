import { describe, expect, it } from 'vitest';
import { MAX_FIT_SCALE, READING_WIDTH, fitScale, isUnreadablePdf } from './fit';

const LETTER_WIDTH = 612;

function named(name: string): Error {
  const error = new Error('failed');
  error.name = name;
  return error;
}

describe('fitScale', () => {
  it('caps a Letter page on a 1366 px laptop at the reading width', () => {
    const scale = fitScale(1366 - 32, LETTER_WIDTH);
    expect(scale * LETTER_WIDTH).toBeCloseTo(READING_WIDTH);
    expect(scale).toBeLessThan(1.5);
  });

  it('still fits the width on a phone', () => {
    expect(fitScale(390 - 32, LETTER_WIDTH) * LETTER_WIDTH).toBeCloseTo(358);
  });

  it('never goes above the largest automatic scale for tiny pages', () => {
    expect(fitScale(1334, 100)).toBe(MAX_FIT_SCALE);
  });
});

describe('isUnreadablePdf', () => {
  it('treats a broken or password-protected PDF as permanent', () => {
    expect(isUnreadablePdf(named('InvalidPDFException'))).toBe(true);
    expect(isUnreadablePdf(named('PasswordException'))).toBe(true);
  });

  it('keeps network, server and unknown failures retryable', () => {
    expect(isUnreadablePdf(named('ResponseException'))).toBe(false);
    expect(isUnreadablePdf(named('UnknownErrorException'))).toBe(false);
    expect(isUnreadablePdf(new TypeError('Failed to fetch'))).toBe(false);
    expect(isUnreadablePdf('InvalidPDFException')).toBe(false);
    expect(isUnreadablePdf(null)).toBe(false);
  });
});
