import { describe, expect, it } from 'vitest';
import { formatSize, isLinkInfo, tokenFromPath } from './link';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv_-';

describe('tokenFromPath', () => {
  it('reads the token from a viewer path, with or without a trailing slash', () => {
    expect(tokenFromPath(`/d/${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromPath(`/d/${TOKEN}/`)).toBe(TOKEN);
  });

  it('rejects other paths and tokens of the wrong length or alphabet', () => {
    expect(tokenFromPath('/')).toBeNull();
    expect(tokenFromPath('/d/')).toBeNull();
    expect(tokenFromPath(`/d/${TOKEN}/pdf`)).toBeNull();
    expect(tokenFromPath(`/d/${TOKEN.slice(1)}`)).toBeNull();
    expect(tokenFromPath(`/d/${TOKEN}x`)).toBeNull();
    expect(tokenFromPath(`/d/${TOKEN.slice(1)}+`)).toBeNull();
    expect(tokenFromPath(`/d/_/${TOKEN}`)).toBeNull();
    expect(tokenFromPath(`/t/${TOKEN}`)).toBeNull();
  });
});

describe('isLinkInfo', () => {
  const info = { name: 'resume.pdf', pageCount: 2, sizeBytes: 184_320, allowDownload: true };

  it('accepts the /d/{token}/info shape, also with an unknown page count', () => {
    expect(isLinkInfo(info)).toBe(true);
    expect(isLinkInfo({ ...info, pageCount: null })).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isLinkInfo(null)).toBe(false);
    expect(isLinkInfo('resume.pdf')).toBe(false);
    expect(isLinkInfo({ ...info, name: 3 })).toBe(false);
    expect(isLinkInfo({ ...info, pageCount: '2' })).toBe(false);
    expect(isLinkInfo({ ...info, sizeBytes: undefined })).toBe(false);
    expect(isLinkInfo({ ...info, allowDownload: 'yes' })).toBe(false);
  });
});

describe('formatSize', () => {
  it('uses B, KB and MB', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(184_320)).toBe('180 KB');
    expect(formatSize(2.4 * 1024 * 1024)).toBe('2.4 MB');
  });

  it('switches to MB where KB would round up to 1024', () => {
    expect(formatSize(1024 * 1024 - 1)).toBe('1.0 MB');
  });
});
