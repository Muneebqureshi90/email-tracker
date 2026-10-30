/**
 * Read-time heartbeats (docs/v2-contract.md, POST /d/{token}/beat). Only time while the page is visible
 * counts. The first beat of a view counts the view; the backend turns it into a read once the visible
 * time reaches the owner's threshold. Beats stop while the page is hidden; hiding sends one last beat
 * with the time collected so far.
 */

export const BEAT_INTERVAL_MS = 5_000;
/**
 * The backend accepts at most this much visible time per beat. More than this between two beats means the
 * timers stalled (for example the computer slept with the page open), so the excess is dropped, not counted.
 */
export const MAX_VISIBLE_MS = 10_000;

export interface BeatPayload {
  viewId: string;
  visibleMs: number;
  page: number;
  pagesViewed: number[];
  pageCount: number;
}

export interface ReadingState {
  page: number;
  pagesViewed: number[];
  pageCount: number;
}

/** Adds up visible time between beats. */
export class VisibleTime {
  private pending = 0;
  private visibleSince: number | null;

  constructor(
    private readonly now: () => number,
    visible: boolean,
  ) {
    this.visibleSince = visible ? now() : null;
  }

  setVisible(visible: boolean): void {
    const time = this.now();
    if (visible && this.visibleSince === null) {
      this.visibleSince = time;
    } else if (!visible && this.visibleSince !== null) {
      this.pending += time - this.visibleSince;
      this.visibleSince = null;
    }
  }

  /** Takes the time collected since the last take, at most MAX_VISIBLE_MS (see above). */
  take(): number {
    const time = this.now();
    if (this.visibleSince !== null) {
      this.pending += time - this.visibleSince;
      this.visibleSince = time;
    }
    const taken = Math.min(Math.max(0, this.pending), MAX_VISIBLE_MS);
    this.pending = 0;
    return Math.round(taken);
  }
}

export interface HeartbeatOptions {
  viewId: string;
  now: () => number;
  visible: () => boolean;
  state: () => ReadingState;
  /** `final` beats are sent while the page is going away (sendBeacon). */
  send: (payload: BeatPayload, final: boolean) => void;
  every?: (callback: () => void, ms: number) => () => void;
}

const defaultEvery = (callback: () => void, ms: number) => {
  const timer = setInterval(callback, ms);
  return () => clearInterval(timer);
};

export class Heartbeat {
  private readonly time: VisibleTime;
  private stopTimer: (() => void) | null = null;
  private started = false;

  constructor(private readonly options: HeartbeatOptions) {
    this.time = new VisibleTime(options.now, options.visible());
  }

  /** Call once the document is on screen. The first beat goes out as soon as the page is visible. */
  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.options.visible()) this.resume();
  }

  /** Wire this to the visibilitychange event. */
  visibilityChanged(): void {
    const visible = this.options.visible();
    this.time.setVisible(visible);
    if (!this.started) return;
    if (visible) {
      this.resume();
    } else {
      this.pause();
      this.beat(true);
    }
  }

  /**
   * The page is going away (pagehide): send what is left. Nothing to send when the page was already hidden:
   * hiding sent the last beat (browsers fire visibilitychange before pagehide).
   */
  finish(): void {
    if (!this.stopTimer) return;
    this.time.setVisible(false);
    this.pause();
    this.beat(true);
  }

  private resume(): void {
    if (this.stopTimer) return;
    this.beat(false);
    this.stopTimer = (this.options.every ?? defaultEvery)(() => {
      if (this.options.visible()) this.beat(false);
    }, BEAT_INTERVAL_MS);
  }

  private pause(): void {
    this.stopTimer?.();
    this.stopTimer = null;
  }

  private beat(final: boolean): void {
    const state = this.options.state();
    this.options.send(
      {
        viewId: this.options.viewId,
        visibleMs: this.time.take(),
        page: state.page,
        pagesViewed: [...new Set(state.pagesViewed)].sort((a, b) => a - b),
        pageCount: state.pageCount,
      },
      final,
    );
  }
}
