import { describe, expect, it } from 'vitest';
import { BEAT_INTERVAL_MS, Heartbeat, MAX_VISIBLE_MS, VisibleTime, type BeatPayload } from './beat';

class Clock {
  time = 1_000;
  readonly now = () => this.time;
  advance(ms: number): void {
    this.time += ms;
  }
}

describe('VisibleTime', () => {
  it('counts only the time the page is visible', () => {
    const clock = new Clock();
    const time = new VisibleTime(clock.now, true);
    clock.advance(3_000);
    time.setVisible(false);
    clock.advance(60_000);
    time.setVisible(true);
    clock.advance(2_000);
    expect(time.take()).toBe(5_000);
    expect(time.take()).toBe(0);
  });

  it('starts at zero when the page opens hidden', () => {
    const clock = new Clock();
    const time = new VisibleTime(clock.now, false);
    clock.advance(10_000);
    expect(time.take()).toBe(0);
  });

  it('ignores a repeated change to the same state', () => {
    const clock = new Clock();
    const time = new VisibleTime(clock.now, true);
    clock.advance(4_000);
    time.setVisible(true);
    clock.advance(1_000);
    time.setVisible(false);
    time.setVisible(false);
    expect(time.take()).toBe(5_000);
  });

  it('drops time above MAX_VISIBLE_MS between two takes (stalled timers, a sleeping computer)', () => {
    const clock = new Clock();
    const time = new VisibleTime(clock.now, true);
    clock.advance(25_000);
    expect(time.take()).toBe(MAX_VISIBLE_MS);
    expect(time.take()).toBe(0);
    clock.advance(4_000);
    expect(time.take()).toBe(4_000);
  });
});

function setup(initiallyVisible = true) {
  const clock = new Clock();
  const page = { visible: initiallyVisible };
  const state = { page: 1, pagesViewed: [1], pageCount: 3 };
  const sent: { payload: BeatPayload; final: boolean }[] = [];
  const timer: { tick: (() => void) | null } = { tick: null };
  const heartbeat = new Heartbeat({
    viewId: 'view-1',
    now: clock.now,
    visible: () => page.visible,
    state: () => state,
    send: (payload, final) => {
      sent.push({ payload, final });
    },
    every: (callback, ms) => {
      expect(ms).toBe(BEAT_INTERVAL_MS);
      timer.tick = callback;
      return () => {
        timer.tick = null;
      };
    },
  });
  return {
    clock,
    page,
    state,
    sent,
    heartbeat,
    timer,
    /** The browser changes visibility and fires visibilitychange. */
    show(visible: boolean): void {
      page.visible = visible;
      heartbeat.visibilityChanged();
    },
    /** One interval of the beat timer. */
    tick(): void {
      clock.advance(BEAT_INTERVAL_MS);
      timer.tick?.();
    },
  };
}

describe('Heartbeat', () => {
  it('sends the first beat at once, then one every 5 s while visible', () => {
    const h = setup();
    h.heartbeat.start();
    expect(h.sent).toEqual([{ payload: { viewId: 'view-1', visibleMs: 0, page: 1, pagesViewed: [1], pageCount: 3 }, final: false }]);
    h.tick();
    h.state.page = 2;
    h.state.pagesViewed = [2, 1, 2];
    h.tick();
    expect(h.sent.map((beat) => beat.payload.visibleMs)).toEqual([0, 5_000, 5_000]);
    expect(h.sent[2]).toMatchObject({ final: false, payload: { page: 2, pagesViewed: [1, 2] } });
  });

  it('sends nothing before start, and waits for a page that opens hidden to become visible', () => {
    const h = setup(false);
    h.show(false);
    expect(h.sent).toHaveLength(0);
    h.heartbeat.start();
    expect(h.sent).toHaveLength(0);
    expect(h.timer.tick).toBeNull();
    h.clock.advance(30_000);
    h.show(true);
    expect(h.sent).toEqual([{ payload: expect.objectContaining({ visibleMs: 0 }) as BeatPayload, final: false }]);
    expect(h.timer.tick).not.toBeNull();
  });

  it('stops while hidden, after one last beat with the time so far', () => {
    const h = setup();
    h.heartbeat.start();
    h.clock.advance(3_000);
    h.show(false);
    expect(h.sent.at(-1)).toMatchObject({ final: true, payload: { visibleMs: 3_000 } });
    expect(h.timer.tick).toBeNull();
    h.clock.advance(60_000);
    h.show(true);
    expect(h.sent.at(-1)).toMatchObject({ final: false, payload: { visibleMs: 0 } });
    h.tick();
    expect(h.sent.at(-1)?.payload.visibleMs).toBe(5_000);
    expect(h.sent).toHaveLength(4);
  });

  it('skips a timer tick that comes after the page was hidden but before the event', () => {
    const h = setup();
    h.heartbeat.start();
    h.page.visible = false;
    h.tick();
    expect(h.sent).toHaveLength(1);
  });

  it('sends one final beat when the page goes away, and none twice', () => {
    const h = setup();
    h.heartbeat.finish();
    expect(h.sent).toHaveLength(0);
    h.heartbeat.start();
    h.clock.advance(4_000);
    h.heartbeat.finish();
    expect(h.sent.at(-1)).toMatchObject({ final: true, payload: { visibleMs: 4_000 } });
    expect(h.timer.tick).toBeNull();
    h.heartbeat.finish();
    expect(h.sent).toHaveLength(2);
  });

  it('sends no extra beat on pagehide when hiding already sent the last one', () => {
    const h = setup();
    h.heartbeat.start();
    h.clock.advance(2_000);
    h.show(false);
    h.heartbeat.finish();
    expect(h.sent.map((beat) => beat.final)).toEqual([false, true]);
  });
});
