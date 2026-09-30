import { WORLD } from '../content/campaign';
import type { Mass } from './types';

export const ZERO = 0n;
export const CLIP = WORLD.clip;

export function sum(values: Iterable<Mass>): Mass {
  let t = 0n;
  for (const v of values) t += v;
  return t;
}

export const minBig = (a: Mass, b: Mass): Mass => (a < b ? a : b);
export const maxBig = (a: Mass, b: Mass): Mass => (a > b ? a : b);

/** Split an input into [primary, remainder] by parts-per-million; the remainder takes rounding residue. */
export function splitPpm(input: Mass, ppm: bigint): [Mass, Mass] {
  const primary = (input * ppm) / 1_000_000n;
  return [primary, input - primary];
}

/** Whole reference-clip equivalents (integer division); remainder retained separately. */
export function clipsOf(mass: Mass): Mass {
  return mass / CLIP;
}

const SUPERS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};
export const sup = (n: number | string) => String(n).split('').map((d) => SUPERS[d] ?? d).join('');

/** Format a big integer: grouped digits below 10^9, scientific notation above. */
export function fmtBig(v: Mass, digits = 3): string {
  const neg = v < 0n;
  const s = (neg ? -v : v).toString();
  if (s.length <= 9) {
    return (neg ? '−' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  const exp = s.length - 1;
  const mant = s[0] + '.' + s.slice(1, digits);
  return `${neg ? '−' : ''}${mant} × 10${sup(exp)}`;
}

/** Group digits of an exact value for inspection. */
export function exact(v: Mass): string {
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Human mass label from micrograms (µg, mg, g, kg, t, then scientific grams). */
export function fmtMass(v: Mass): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const sign = neg ? '−' : '';
  if (a < 1000n) return `${sign}${a} µg`;
  if (a < 1_000_000n) return `${sign}${trim(Number(a) / 1000)} mg`;
  if (a < 1_000_000_000n) return `${sign}${trim(Number(a) / 1e6)} g`;
  if (a < 1_000_000_000_000n) return `${sign}${trim(Number(a) / 1e9)} kg`;
  if (a < 1_000_000_000_000_000_000n) return `${sign}${trim(Number(a) / 1e12)} t`;
  return `${sign}${fmtBig(a / 1_000_000n)} g`;
}

function trim(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1).replace(/\.0$/, '');
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/** Clip count label: exact integers when small, scientific when large. */
export function fmtClips(mass: Mass): string {
  return fmtBig(clipsOf(mass));
}

/** Milli-unit fixed point to display string. */
export function fmtMilli(v: number, decimals = 1): string {
  return (v / 1000).toFixed(decimals);
}
