import disclaimer from './disclaimer.json'
export const DISCLAIMER = disclaimer
export const CONSENT_READING_MS = 3000
export interface ConsentState { version: string; remainingMs: number; canAccept: boolean; review: boolean }

/** Monotonic, foreground reading time; hiding or defocusing the window pauses the clock. */
export class ConsentReadingGate {
  private elapsed = 0
  private since: number | null = null
  private presented = false
  reset(): void { this.elapsed = 0; this.since = null; this.presented = false }
  present(now: number, active: boolean): void { if (!this.presented) { this.presented = true; this.update(now, active) } }
  update(now: number, active: boolean): void {
    if (this.since !== null) this.elapsed += Math.max(0, now - this.since)
    this.since = this.presented && active ? now : null
  }
  state(now: number, active: boolean, review = false): ConsentState {
    this.update(now, active)
    const remainingMs = Math.max(0, CONSENT_READING_MS - this.elapsed)
    return { version: DISCLAIMER.version, remainingMs, canAccept: this.presented && remainingMs === 0, review }
  }
}
