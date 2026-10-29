import { stream, type Emitter, type Observable } from 'kefir';

/** A value InboxSDK views can watch: they accept a Kefir stream and re-render when it emits. */
export class Live<T> {
  private current: T;
  private readonly emitters = new Set<Emitter<T, never>>();
  readonly stream: Observable<T, never>;

  constructor(initial: T) {
    this.current = initial;
    this.stream = stream<T, never>((emitter) => {
      this.emitters.add(emitter);
      emitter.emit(this.current);
      return () => {
        this.emitters.delete(emitter);
      };
    });
  }

  get value(): T {
    return this.current;
  }

  set(value: T): void {
    this.current = value;
    for (const emitter of this.emitters) emitter.emit(value);
  }
}
