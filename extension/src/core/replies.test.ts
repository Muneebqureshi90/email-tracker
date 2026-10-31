import { describe, expect, it } from 'vitest';
import { findReply, rememberReported } from './replies';

const OWNER = 'me@example.com';
const SENT = 1_000;

describe('findReply', () => {
  it('finds a later message from a recipient, case-insensitive', () => {
    expect(findReply(OWNER, ['HR@Corp.example'], SENT, [{ sender: ' hr@corp.EXAMPLE ', at: 2_000 }])).toBe(2_000);
  });

  it('takes the earliest reply', () => {
    const messages = [
      { sender: 'a@x.example', at: 5_000 },
      { sender: 'b@x.example', at: 3_000 },
    ];
    expect(findReply(OWNER, ['a@x.example', 'b@x.example'], SENT, messages)).toBe(3_000);
  });

  it('ignores the owner, non-recipients, earlier messages and unreadable dates', () => {
    const messages = [
      { sender: 'ME@example.com', at: 2_000 },
      { sender: 'stranger@x.example', at: 2_000 },
      { sender: 'a@x.example', at: 500 },
      { sender: 'a@x.example', at: SENT },
      { sender: 'a@x.example', at: Number.NaN },
    ];
    expect(findReply(OWNER, ['a@x.example', 'me@example.com'], SENT, messages)).toBeNull();
  });
});

describe('rememberReported', () => {
  it('keeps each id once and drops the oldest past the limit', () => {
    expect(rememberReported(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(rememberReported(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
  });
});
