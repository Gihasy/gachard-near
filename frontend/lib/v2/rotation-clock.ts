/**
 * The store's 6-hour rotations, anchored to UTC 00:00, 06:00, 12:00 and 18:00
 * (docs/PLAN-STORE-V2.md, decision P4).
 *
 * A rotation's id is the number of 6-hour periods since the Unix epoch, so any
 * server, script or verifier derives the same id from the same moment.
 */

export const ROTATION_SECONDS = 6 * 60 * 60;
/** A Reserved pack can be bought up to 24 hours after its rotation ends (ADR-038). */
export const RESERVE_SECONDS = 24 * 60 * 60;

export function rotationIdAt(unixSeconds: number): number {
  return Math.floor(unixSeconds / ROTATION_SECONDS);
}

export interface RotationWindow {
  rotationId: number;
  startsAt: number; // unix seconds
  endsAt: number;
  /** When the server secret may be revealed: after the last Reserved pack could be bought. */
  revealAfter: number;
}

export function rotationWindow(rotationId: number): RotationWindow {
  const startsAt = rotationId * ROTATION_SECONDS;
  const endsAt = startsAt + ROTATION_SECONDS;
  return { rotationId, startsAt, endsAt, revealAfter: endsAt + RESERVE_SECONDS };
}

/** Seconds until the current rotation ends, for the store's timer. */
export function secondsLeft(unixSeconds: number): number {
  return rotationWindow(rotationIdAt(unixSeconds)).endsAt - unixSeconds;
}
