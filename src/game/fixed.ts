// Fixed-point helpers. Work, heat, scores and energy are integers in thousandths.
// Every accrual carries its residue so ten 100 ms steps equal exactly one second.

/** Accrue a non-negative rate (milli-units per second) over stepMs. Returns [gainMilli, newResidue]. */
export function accrue(rateMilliPerSec: number, stepMs: number, residue: number): [number, number] {
  if (rateMilliPerSec <= 0) return [0, residue];
  const num = rateMilliPerSec * stepMs + residue;
  const gain = Math.floor(num / 1000);
  return [gain, num - gain * 1000];
}

/** Multiply two milli values, returning milli (floor). */
export const mulMilli = (a: number, b: number): number => Math.floor((a * b) / 1000);

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const toMilli = (units: number): number => Math.round(units * 1000);
