import { memo, useEffect, useState } from 'react';
import type { CampaignState, C01State, OfficeProjectId } from '../../game/types';
import { cleanRunActive, glintActive, goodRate, loose } from '../../game/chapters/c01';
import { mass } from '../../game/ledger';
import { OFFICE } from '../../content/campaign';
import { CLIP } from '../../game/mass';

export type OfficeMode = 'live' | 'recorded' | 'reconstructed';

export interface OfficeView {
  mode: OfficeMode;
  /** Last observation: a frozen frame after the sensors retire. Fidelity labels are retained. */
  frozen: boolean;
  lamp: boolean;
  cabinet: boolean;
  frame: boolean;
  photo: 'frame' | 'desk' | 'none';
  bender: boolean;
  feeder: boolean;
  jig: boolean;
  running: boolean;
  wireFraction: number;
  clipsLevel: number;
  screen: string[];
  pulse: number;
  animate: boolean;
  jammed: boolean;
  /** Sealed cartons stacked by the cabinet (0–12). */
  cartons: number;
  /** Fill of the open carton under the auto-packer, 0–1; null when there is no packer. */
  openBox: number | null;
  tensioner: boolean;
  die2: boolean;
  heads: number;
  straightener: boolean;
  rejects: boolean;
  /** Story minutes since 11:47 PM: lights go out, rain eases, dawn comes. */
  minute: number;
  /** The wire is running true (a catchable moment), and a clean run is under way. */
  glint: boolean;
  cleanRun: boolean;
}

// Isometric projection
const K = 36;
const C = Math.cos(Math.PI / 6);
const S = 0.5;
const OX = 372;
const OY = 292;
type V3 = [number, number, number];
const P = (x: number, y: number, z: number): [number, number] => [OX + (x - y) * C * K, OY + (x + y) * S * K - z * K];
const pts = (list: V3[]) => list.map(([x, y, z]) => P(x, y, z).map((n) => n.toFixed(1)).join(',')).join(' ');
/** Transform for drawing 2D content on the plane x = x0 (u → −y, v → −z), origin at (x0, y1, z1). */
const faceX = (x0: number, y1: number, z1: number) => {
  const [e, f] = P(x0, y1, z1);
  return `matrix(${C * K} ${-S * K} 0 ${K} ${e} ${f})`;
};
/** Transform for drawing 2D content on the plane y = y0 (u → +x, v → −z), origin at (x0, y0, z1). */
const faceY = (x0: number, y0: number, z1: number) => {
  const [e, f] = P(x0, y0, z1);
  return `matrix(${C * K} ${S * K} 0 ${K} ${e} ${f})`;
};
/** Transform for drawing on the horizontal plane z = z0 (u → +x, v → +y). */
const faceZ = (x0: number, y0: number, z0: number) => {
  const [e, f] = P(x0, y0, z0);
  return `matrix(${C * K} ${S * K} ${-C * K} ${S * K} ${e} ${f})`;
};

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

interface Style {
  wire: boolean;
  dim: number;
  stroke: string;
}

function Box({ at, size, color, st, lit = 1, detail }: { at: V3; size: V3; color: string; st: Style; lit?: number; detail?: boolean }) {
  const [x, y, z] = at;
  const [w, d, h] = size;
  const top: V3[] = [
    [x, y, z + h],
    [x + w, y, z + h],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ];
  const left: V3[] = [
    [x, y + d, z],
    [x + w, y + d, z],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ];
  const right: V3[] = [
    [x + w, y, z],
    [x + w, y + d, z],
    [x + w, y + d, z + h],
    [x + w, y, z + h],
  ];
  const f = st.dim * lit;
  if (st.wire) {
    return (
      <g fill="rgba(80,255,170,0.04)" stroke={st.stroke} strokeWidth={0.9} strokeLinejoin="round">
        <polygon points={pts(top)} />
        <polygon points={pts(left)} />
        <polygon points={pts(right)} />
      </g>
    );
  }
  return (
    <g strokeLinejoin="round">
      <polygon points={pts(top)} fill={shade(color, 1.18 * f)} stroke={detail === false ? 'none' : shade(color, 1.4 * f)} strokeWidth={0.5} />
      <polygon points={pts(left)} fill={shade(color, 0.92 * f)} />
      <polygon points={pts(right)} fill={shade(color, 0.66 * f)} />
    </g>
  );
}

function Cyl({ c, r, z0, h, color, st, top }: { c: [number, number]; r: number; z0: number; h: number; color: string; st: Style; top?: string }) {
  const [cx, cy0] = P(c[0], c[1], z0);
  const [, cy1] = P(c[0], c[1], z0 + h);
  const rx = 1.2247 * r * K;
  const ry = 0.7071 * r * K;
  if (st.wire) {
    return (
      <g fill="none" stroke={st.stroke} strokeWidth={0.9}>
        <ellipse cx={cx} cy={cy0} rx={rx} ry={ry} />
        <ellipse cx={cx} cy={cy1} rx={rx} ry={ry} />
        <line x1={cx - rx} y1={cy0} x2={cx - rx} y2={cy1} />
        <line x1={cx + rx} y1={cy0} x2={cx + rx} y2={cy1} />
      </g>
    );
  }
  return (
    <g>
      <path d={`M${cx - rx},${cy0} A${rx},${ry} 0 0 0 ${cx + rx},${cy0} L${cx + rx},${cy1} L${cx - rx},${cy1} Z`} fill={shade(color, 0.8 * st.dim)} />
      <ellipse cx={cx} cy={cy1} rx={rx} ry={ry} fill={top ?? shade(color, 1.15 * st.dim)} />
    </g>
  );
}

export function officeViewFrom(s: CampaignState, frozen = false, animate = true, pulse = 0): OfficeView {
  const a = s.anchors;
  const officeFid = a.office.fidelity;
  const m: OfficeMode = officeFid === 'recorded' ? 'recorded' : officeFid === 'reconstructed' ? 'reconstructed' : 'live';
  const present = (id: 'cabinet' | 'lamp' | 'frame') => a[id].fidelity !== 'absent';
  const c1 = s.chapterState.kind === '01' ? (s.chapterState as C01State) : null;
  const has = (id: OfficeProjectId) => (c1 ? c1.owned.includes(id) : true);
  const desk = c1 ? loose(s) : Number(s.clips.currentMicrograms / CLIP > 1_000_000_000n ? 1_000_000_000n : s.clips.currentMicrograms / CLIP);
  const clipsLevel = c1 ? Math.min(1, Math.log10(desk + 1) / Math.log10(1001)) : Math.min(1, 0.7 + Math.log10(desk + 1) / 200);
  const wireFraction = Math.min(1.5, Number((mass(s, 'office.wire') * 1000n) / OFFICE.wire) / 1000);
  const photoPresent = a.photograph.fidelity !== 'absent';
  const screen = c1
    ? c1.madeClips === 0
      ? ['MARA: WIRE CATCHES IF', 'YOU PULL TOO HARD.', 'ORDER 4471 · 0 / 12', '>']
      : c1.capped
        ? ['ORDER 4471 COMPLETE', '12 / 12 CARTONS', 'CONTRACT §9 ACTIVE', '>']
        : [`CARTONS ${c1.sealed} / 12`, `ON DESK ${desk}`, c1.jammed ? 'WIRE CAUGHT · FREE IT' : `RATE ${(goodRate(s) / 1000).toFixed(1)}/S`, '>']
    : ['PRODUCTION LOG', `CHAPTER ${s.chapter}`, 'OFFICE BOOKMARK', '>'];
  return {
    mode: m,
    frozen,
    lamp: present('lamp'),
    cabinet: present('cabinet'),
    frame: present('frame'),
    photo: !photoPresent ? 'none' : present('frame') ? 'frame' : 'desk',
    bender: has('calibrate'),
    feeder: has('feeder'),
    jig: has('jig'),
    running: c1 ? !c1.capped && has('calibrate') && !c1.jammed : false,
    wireFraction,
    clipsLevel,
    screen,
    pulse,
    animate,
    jammed: Boolean(c1?.jammed),
    cartons: c1 ? c1.sealed : 0,
    openBox: c1 && has('packer') && !c1.capped ? c1.openBox / OFFICE.boxSize : null,
    tensioner: has('tensioner'),
    die2: has('die2'),
    heads: c1 ? ['head1', 'head2', 'head3'].filter((h) => has(h as OfficeProjectId)).length : 3,
    straightener: has('straightener'),
    rejects: c1 ? c1.rejects > 0 : false,
    minute: c1 ? s.storySeconds / 60 : 0,
    glint: c1 ? glintActive(s) : false,
    cleanRun: c1 ? cleanRunActive(s) : false,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(h1: string, h2: string, t: number): string {
  const a = parseInt(h1.slice(1), 16);
  const b = parseInt(h2.slice(1), 16);
  const ch = (sh: number) => Math.round(lerp((a >> sh) & 255, (b >> sh) & 255, t));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function Photo({ recorded }: { recorded: boolean }) {
  // A small landscape: evening sky, water, a tree. Drawn in local units (0..0.55 × 0..0.4).
  return (
    <g>
      <rect x={0} y={0} width={0.56} height={0.42} fill={recorded ? '#0d2b1f' : '#3a4a5c'} />
      <rect x={0} y={0} width={0.56} height={0.2} fill={recorded ? '#123b2a' : '#c98e62'} opacity={0.85} />
      <rect x={0} y={0.24} width={0.56} height={0.18} fill={recorded ? '#0b241a' : '#2b3a48'} />
      <path d="M0.36 0.24 L0.40 0.10 L0.44 0.24 Z" fill={recorded ? '#2fae74' : '#23342b'} />
      <circle cx={0.14} cy={0.12} r={0.035} fill={recorded ? '#5cf0a8' : '#f2d29a'} />
    </g>
  );
}

function OfficeSvg({ v, onGlint }: { v: OfficeView; onGlint?: () => void }) {
  const wire = v.mode === 'recorded';
  const recon = v.mode === 'reconstructed';
  const last = v.frozen;
  const lampOn = v.lamp && !last && !wire;
  const st: Style = { wire, dim: last ? 0.5 : lampOn ? 1 : 0.72, stroke: '#5ef2a4' };
  const detail = !recon;
  const anim = v.animate && !last;
  // The night outside: floors go dark after 12:40, the rain eases after 3:50, dawn from 5:20.
  const lightsOn = v.minute < 55 ? 1 : Math.max(0.12, 1 - (v.minute - 55) / 220);
  const rainAmt = v.minute < 245 ? 1 : Math.max(0.15, 1 - (v.minute - 245) / 110);
  const dawn = clamp01((v.minute - 330) / 55);
  const vanPassing = v.minute >= 335 && v.minute < 350;
  const wallL = '#233034';
  const wallR = '#1c272a';
  const floor = '#2b2a27';
  const desk = '#3a3833';
  const metal = '#6c7072';
  const cab = '#4a4f4e';

  const [dropX, dropY] = P(3.8, 4.55, 2.95);
  const pileR = 0.25 + v.clipsLevel * 1.15;
  const pileH = 0.08 + v.clipsLevel * 0.95;
  const [px, py] = P(4.05, 4.15, 2.7);

  return (
    <svg className="office-svg" viewBox="40 20 700 660" role="img" aria-label={describeOffice(v)}>
      <defs>
        <radialGradient id="lampglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffcf8a" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#f0a860" stopOpacity="0.18" />
          <stop offset="1" stopColor="#f0a860" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="crtglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#6dffb3" stopOpacity="0.28" />
          <stop offset="1" stopColor="#6dffb3" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={wire ? '#021009' : mix('#0b1430', '#56688f', dawn)} />
          <stop offset="1" stopColor={wire ? '#041a10' : mix('#28324f', '#d9a27e', dawn)} />
        </linearGradient>
        <radialGradient id="pile" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#f4f6f7" />
          <stop offset="0.5" stopColor="#aab2b6" />
          <stop offset="1" stopColor="#5e676b" />
        </radialGradient>
        <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1" fill="rgba(94,242,164,0.08)" />
        </pattern>
        <clipPath id="winclip">
          <rect x={0} y={0} width={3} height={2.9} />
        </clipPath>
      </defs>

      {/* floor slab */}
      {!wire && <polygon points={pts([[0, 9, 0], [10, 9, 0], [10, 9, -0.4], [0, 9, -0.4]])} fill={shade(floor, 0.5 * st.dim)} />}
      {!wire && <polygon points={pts([[10, 0, 0], [10, 9, 0], [10, 9, -0.4], [10, 0, -0.4]])} fill={shade(floor, 0.38 * st.dim)} />}
      {/* floor */}
      <polygon points={pts([[0, 0, 0], [10, 0, 0], [10, 9, 0], [0, 9, 0]])} fill={wire ? 'rgba(80,255,170,0.03)' : shade(floor, st.dim)} stroke={wire ? st.stroke : 'none'} strokeWidth={0.9} />
      {detail && !wire && (
        <g opacity={0.18} stroke="#000" strokeWidth={0.6}>
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`fx${i}`} x1={P(i + 1, 0, 0)[0]} y1={P(i + 1, 0, 0)[1]} x2={P(i + 1, 9, 0)[0]} y2={P(i + 1, 9, 0)[1]} />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <line key={`fy${i}`} x1={P(0, i + 1, 0)[0]} y1={P(0, i + 1, 0)[1]} x2={P(10, i + 1, 0)[0]} y2={P(10, i + 1, 0)[1]} />
          ))}
        </g>
      )}
      {/* moonlight from the window across the floor */}
      {!wire && !recon && (
        <polygon points={pts([[0.02, 3.3, 0.02], [0.02, 6.3, 0.02], [3.6, 8.2, 0.02], [3.6, 5.2, 0.02]])} fill={mix('#7f9ad8', '#f2c49a', dawn)} opacity={last ? 0.03 : 0.07 + dawn * 0.1} />
      )}
      {/* rug */}
      {detail && <polygon points={pts([[1.2, 5.2, 0.01], [6.2, 5.2, 0.01], [6.2, 8.6, 0.01], [1.2, 8.6, 0.01]])} fill={wire ? 'none' : shade('#3b3a36', st.dim)} stroke={wire ? st.stroke : 'none'} strokeWidth={0.6} opacity={0.8} />}
      {/* walls */}
      <polygon points={pts([[0, 0, 0], [0, 9, 0], [0, 9, 7], [0, 0, 7]])} fill={wire ? 'rgba(80,255,170,0.03)' : shade(wallL, st.dim)} stroke={wire ? st.stroke : 'none'} strokeWidth={0.9} />
      <polygon points={pts([[0, 0, 0], [10, 0, 0], [10, 0, 7], [0, 0, 7]])} fill={wire ? 'rgba(80,255,170,0.03)' : shade(wallR, st.dim)} stroke={wire ? st.stroke : 'none'} strokeWidth={0.9} />
      {!wire && <polygon points={pts([[0, 9, 0], [0, 9, 7], [-0.3, 9.3, 7], [-0.3, 9.3, 0]])} fill={shade(wallL, 0.55 * st.dim)} />}
      {!wire && <polygon points={pts([[10, 0, 0], [10, 0, 7], [10.3, -0.3, 7], [10.3, -0.3, 0]])} fill={shade(wallR, 0.5 * st.dim)} />}
      {/* baseboards */}
      {!wire && <polygon points={pts([[0.01, 0, 0], [0.01, 9, 0], [0.01, 9, 0.25], [0.01, 0, 0.25]])} fill={shade('#141a1b', st.dim)} />}
      {!wire && <polygon points={pts([[0, 0.01, 0], [10, 0.01, 0], [10, 0.01, 0.25], [0, 0.01, 0.25]])} fill={shade('#121718', st.dim)} />}

      {/* window on the left wall */}
      <g transform={faceX(0.02, 6.4, 6.3)}>
        <rect x={-0.12} y={-0.12} width={3.24} height={3.14} fill={wire ? 'none' : '#15191a'} stroke={wire ? st.stroke : 'none'} strokeWidth={0.03} />
        <g clipPath="url(#winclip)">
          <rect x={0} y={0} width={3} height={2.9} fill="url(#night)" />
          {!recon && (
            <g>
              {[
                [0.1, 1.2, 0.5, 1.7],
                [0.7, 0.6, 0.45, 2.3],
                [1.25, 1.4, 0.6, 1.5],
                [1.95, 0.9, 0.4, 2],
                [2.45, 1.5, 0.55, 1.4],
              ].map(([x, y, w, h], i) => (
                <g key={i}>
                  <rect x={x} y={y} width={w} height={h} fill={wire ? 'none' : '#0a0f1c'} stroke={wire ? st.stroke : 'none'} strokeWidth={0.015} />
                  {!last &&
                    Array.from({ length: 10 }, (_, j) => (
                      <rect
                        key={j}
                        className={anim && j % 3 === 0 ? 'twinkle' : undefined}
                        style={{ animationDelay: `${(i * 7 + j) % 6}s` }}
                        x={x + 0.06 + (j % 3) * (w / 3.2)}
                        y={y + 0.12 + Math.floor(j / 3) * 0.28}
                        width={0.06}
                        height={0.09}
                        fill={wire ? st.stroke : (i + j) % 4 === 0 && ((i * 10 + j) * 37) % 100 < lightsOn * 100 ? '#f6c77a' : '#445072'}
                        opacity={(i + j) % 4 === 0 && ((i * 10 + j) * 37) % 100 < lightsOn * 100 ? 0.9 : 0.5 - dawn * 0.3}
                      />
                    ))}
                </g>
              ))}
            </g>
          )}
          {anim && !recon && !wire && (
            <g opacity={0.35} stroke="#9fb4d8" strokeWidth={0.012}>
              {Array.from({ length: Math.round(22 * rainAmt) }, (_, i) => (
                <line
                  key={i}
                  className="rainline"
                  style={{ animationDelay: `${(i * 0.137) % 0.8}s`, animationDuration: `${0.6 + (i % 5) * 0.08}s` }}
                  x1={(i * 0.143) % 3}
                  y1={(i * 0.61) % 2.6}
                  x2={((i * 0.143) % 3) - 0.04}
                  y2={((i * 0.61) % 2.6) + 0.35}
                />
              ))}
            </g>
          )}
          {/* blinds */}
          {detail && (
            <g fill={wire ? 'none' : '#1b2022'} stroke={wire ? st.stroke : 'none'} strokeWidth={0.01}>
              {Array.from({ length: 6 }, (_, i) => (
                <rect key={i} x={0} y={i * 0.09} width={3} height={0.06} opacity={0.9} />
              ))}
            </g>
          )}
        </g>
        <line x1={1.5} y1={0} x2={1.5} y2={2.9} stroke={wire ? st.stroke : '#15191a'} strokeWidth={0.05} />
      </g>
      {/* windowsill + plant */}
      <Box at={[0, 3.3, 3.05]} size={[0.35, 3.3, 0.1]} color="#2c3335" st={st} />
      {detail && <Cyl c={[0.2, 4.0]} r={0.16} z0={3.15} h={0.25} color="#6b4b35" st={st} />}
      {detail && !wire && (
        <g>
          {[
            [-0.2, 0.1],
            [0.2, 0.3],
            [0, 0.45],
            [0.25, -0.05],
          ].map(([dx, dz], i) => {
            const [x, y] = P(0.2, 4.0 + dx, 3.5 + dz);
            return <ellipse key={i} cx={x} cy={y} rx={9} ry={5} fill={shade('#3f7a4e', st.dim)} transform={`rotate(${i * 40 - 30} ${x} ${y})`} />;
          })}
        </g>
      )}

      {/* pinboard and calendar on the right wall */}
      {detail && (
        <g transform={faceY(2.2, 0.02, 5.9)}>
          <rect x={0} y={0} width={2.4} height={1.6} fill={wire ? 'none' : shade('#5d4a36', st.dim)} stroke={wire ? st.stroke : shade('#2a2118', st.dim)} strokeWidth={0.05} />
          {[
            [0.2, 0.2, 0.5, 0.6, '#d9d3c4'],
            [0.85, 0.15, 0.45, 0.35, '#e8d98a'],
            [1.45, 0.3, 0.7, 0.5, '#cfd6d8'],
            [0.9, 0.7, 0.4, 0.4, '#e3a98f'],
            [0.3, 0.95, 0.45, 0.45, '#e8d98a'],
          ].map(([x, y, w, h, c], i) => (
            <rect key={i} x={x as number} y={y as number} width={w as number} height={h as number} fill={wire ? 'none' : shade(c as string, st.dim * 0.8)} stroke={wire ? st.stroke : 'none'} strokeWidth={0.02} />
          ))}
        </g>
      )}
      {detail && (
        <g transform={faceY(4.9, 0.02, 5.7)}>
          <rect x={0} y={0} width={0.9} height={1.2} fill={wire ? 'none' : shade('#d8d3c6', st.dim * 0.8)} stroke={wire ? st.stroke : 'none'} strokeWidth={0.02} />
          <rect x={0} y={0} width={0.9} height={0.22} fill={wire ? 'none' : shade('#9a3b32', st.dim)} />
          {!wire &&
            Array.from({ length: 20 }, (_, i) => (
              <rect key={i} x={0.08 + (i % 5) * 0.16} y={0.3 + Math.floor(i / 5) * 0.2} width={0.1} height={0.12} fill="#8a857c" opacity={0.5} />
            ))}
        </g>
      )}

      {/* filing cabinet */}
      {v.cabinet ? (
        <g>
          <Box at={[6.7, 0.05, 0]} size={[1.6, 1.5, 4.6]} color={cab} st={st} />
          {detail && (
            <g transform={faceY(6.7, 1.55, 4.6)}>
              {[0.25, 1.35, 2.45, 3.55].map((y, i) => (
                <g key={i}>
                  <rect x={0.1} y={y - 0.12} width={1.4} height={1.0} fill="none" stroke={wire ? st.stroke : shade('#202424', st.dim)} strokeWidth={0.04} />
                  <rect x={0.55} y={y + 0.12} width={0.5} height={0.12} fill={wire ? 'none' : shade('#9a9a8c', st.dim)} stroke={wire ? st.stroke : 'none'} strokeWidth={0.02} />
                  <rect x={0.6} y={y - 0.02} width={0.4} height={0.1} fill={wire ? 'none' : shade('#d8d0bb', st.dim * 0.9)} />
                </g>
              ))}
            </g>
          )}
          {detail && <Box at={[7.0, 0.3, 4.6]} size={[0.9, 0.9, 0.35]} color="#6d5a45" st={st} />}
          {detail && <Box at={[7.05, 0.35, 4.95]} size={[0.8, 0.8, 0.15]} color="#7d6a52" st={st} />}
        </g>
      ) : (
        !wire && (
          <g opacity={0.5}>
            <polygon points={pts([[6.7, 0.05, 0.01], [8.3, 0.05, 0.01], [8.3, 1.55, 0.01], [6.7, 1.55, 0.01]])} fill="#1d1c1a" />
            <polygon points={pts([[6.7, 0.02, 0.2], [8.3, 0.02, 0.2], [8.3, 0.02, 4.6], [6.7, 0.02, 4.6]])} fill={shade(wallR, st.dim * 1.12)} />
          </g>
        )
      )}

      {/* jig on a side table */}
      {v.jig && (
        <g>
          <Box at={[8.7, 0.3, 0]} size={[1.2, 1.9, 2.2]} color="#3d3f3f" st={st} />
          {Array.from({ length: 3 + v.heads }, (_, i) => i).map((i) => (
            <g key={i}>
              <Box at={[8.85 + (i % 2) * 0.5, 0.45 + Math.floor(i / 2) * 0.55, 2.2]} size={[0.35, 0.35, 0.5]} color={metal} st={st} />
            </g>
          ))}
        </g>
      )}

      {/* sealed cartons stacked by the cabinet */}
      {Array.from({ length: Math.min(12, v.cartons) }, (_, n) => {
        const layer = Math.floor(n / 6);
        const row = Math.floor((n % 6) / 3);
        const col = n % 3;
        return { n, layer, row, col };
      })
        .sort((p, q) => p.layer - q.layer || p.row + p.col - (q.row + q.col))
        .map(({ n, layer, row, col }) => {
          const x = 7.1 + col * 0.82;
          const y = 2.9 + row * 0.7;
          const z = layer * 0.52;
          return (
            <g key={`carton${n}`}>
              <Box at={[x, y, z]} size={[0.76, 0.64, 0.5]} color="#9a7650" st={st} />
              {!wire && <polygon points={pts([[x + 0.34, y, z + 0.505], [x + 0.42, y, z + 0.505], [x + 0.42, y + 0.64, z + 0.505], [x + 0.34, y + 0.64, z + 0.505]])} fill="#e6d3a8" opacity={0.6 * st.dim} />}
            </g>
          );
        })}
      {/* the auto-packer and its open carton */}
      {v.openBox !== null && (
        <g>
          <Box at={[6.75, 4.55, 0]} size={[0.76, 0.64, 0.42]} color="#8a6a48" st={st} />
          {!wire && <polygon points={pts([[6.8, 4.6, 0.43], [7.46, 4.6, 0.43], [7.46, 5.14, 0.43], [6.8, 5.14, 0.43]])} fill="#2a2016" />}
          {!wire && v.openBox > 0 && (
            <polygon points={pts([[6.82, 4.62, 0.05 + 0.36 * v.openBox], [7.44, 4.62, 0.05 + 0.36 * v.openBox], [7.44, 5.12, 0.05 + 0.36 * v.openBox], [6.82, 5.12, 0.05 + 0.36 * v.openBox]])} fill="#c9d0d3" opacity={0.85} />
          )}
          <Box at={[6.55, 4.35, 0]} size={[0.2, 0.25, 1.3]} color="#4c5254" st={st} />
          <Box at={[6.55, 4.35, 1.3]} size={[0.75, 0.2, 0.12]} color="#4c5254" st={st} />
        </g>
      )}
      {/* rejects tray and straightener */}
      {v.rejects && <Box at={[7.7, 6.2, 0]} size={[0.7, 0.5, 0.18]} color="#5b5f61" st={st} />}
      {v.straightener && (
        <g>
          <Box at={[7.75, 5.55, 0]} size={[0.6, 0.45, 0.5]} color="#4a5052" st={st} />
          <Cyl c={[7.95, 5.75]} r={0.12} z0={0.5} h={0.12} color="#a0a6a8" st={st} />
          <Cyl c={[8.2, 5.75]} r={0.12} z0={0.5} h={0.12} color="#a0a6a8" st={st} />
        </g>
      )}

      {/* desk */}
      <Box at={[4.6, 2.5, 0]} size={[1.8, 2.7, 2.52]} color={desk} st={st} />
      {detail && (
        <g transform={faceY(4.6, 5.2, 2.52)}>
          {[0.2, 0.95, 1.7].map((y, i) => (
            <g key={i}>
              <rect x={0.12} y={y} width={1.56} height={0.62} fill="none" stroke={wire ? st.stroke : shade('#1c1b18', st.dim)} strokeWidth={0.04} />
              <rect x={0.62} y={y + 0.22} width={0.56} height={0.1} fill={wire ? 'none' : shade('#8b8778', st.dim)} />
            </g>
          ))}
        </g>
      )}
      <Box at={[0.35, 2.5, 0]} size={[0.2, 2.7, 2.52]} color={desk} st={st} />
      <Box at={[0.3, 2.4, 2.52]} size={[6.2, 2.9, 0.2]} color={desk} st={st} lit={lampOn ? 1.1 : 1} />

      {/* lamp glow on the desk */}
      {lampOn && (
        <ellipse className={anim ? 'lamp-glow' : undefined} cx={P(1.9, 4.0, 2.72)[0]} cy={P(1.9, 4.0, 2.72)[1]} rx={170} ry={95} fill="url(#lampglow)" />
      )}

      {/* frame with photograph, or the photograph lying on the desk */}
      {v.frame && (
        <g>
          <Box at={[0.6, 2.62, 2.72]} size={[0.75, 0.08, 0.62]} color="#7b5a37" st={st} />
          {v.photo === 'frame' && (
            <g transform={faceY(0.68, 2.71, 3.27)}>
              <g transform="scale(1.05)">{recon ? <rect width={0.56} height={0.42} fill="#6d7a84" /> : <Photo recorded={wire} />}</g>
            </g>
          )}
        </g>
      )}
      {v.photo === 'desk' && (
        <g transform={faceZ(3.45, 4.45, 2.73)}>
          <g transform="rotate(8)">{recon ? <rect width={0.56} height={0.42} fill="#6d7a84" /> : <Photo recorded={wire} />}</g>
        </g>
      )}

      {/* monitor */}
      <Box at={[1.75, 2.65, 2.72]} size={[1.1, 0.9, 1.25]} color="#8a8a7d" st={st} />
      <Box at={[1.6, 3.45, 2.72]} size={[1.4, 0.7, 1.6]} color="#a3a293" st={st} />
      <g transform={faceY(1.72, 4.151, 4.18)}>
        <rect x={0} y={0} width={1.16} height={1.12} rx={0.08} fill={wire ? 'none' : '#06150e'} stroke={wire ? st.stroke : '#1d2a22'} strokeWidth={0.05} />
        {!last ? (
          <g fill="#79ffb6" fontFamily="IBM Plex Mono, monospace" fontSize={0.105} style={{ letterSpacing: 0 }}>
            {v.screen.map((line, i) => (
              <text key={i} x={0.1} y={0.24 + i * 0.2} opacity={0.92}>
                {line}
                {i === v.screen.length - 1 && anim && <tspan className="cursor">_</tspan>}
              </text>
            ))}
          </g>
        ) : (
          <line x1={0.12} y1={0.58} x2={1.04} y2={0.56} stroke="#79ffb6" strokeWidth={0.012} opacity={0.7} />
        )}
        {!wire && <rect x={0} y={0} width={1.16} height={1.12} rx={0.08} fill="url(#scan)" />}
      </g>
      {!wire && !last && <ellipse cx={P(2.3, 4.6, 3.2)[0]} cy={P(2.3, 4.6, 3.2)[1]} rx={70} ry={45} fill="url(#crtglow)" />}
      {/* keyboard */}
      <Box at={[1.55, 4.45, 2.72]} size={[1.5, 0.55, 0.08]} color="#b7b3a2" st={st} />
      {detail && !wire && (
        <g transform={faceZ(1.62, 4.5, 2.81)} fill="#6d6a60">
          {Array.from({ length: 24 }, (_, i) => (
            <rect key={i} x={(i % 12) * 0.115} y={Math.floor(i / 12) * 0.2 + 0.04} width={0.09} height={0.14} />
          ))}
        </g>
      )}

      {/* lamp */}
      {v.lamp && (
        <g>
          <Cyl c={[0.85, 4.75]} r={0.28} z0={2.72} h={0.1} color="#2c2c2a" st={st} />
          <line x1={P(0.85, 4.75, 2.82)[0]} y1={P(0.85, 4.75, 2.82)[1]} x2={P(0.9, 4.3, 4.6)[0]} y2={P(0.9, 4.3, 4.6)[1]} stroke={wire ? st.stroke : '#2a2a28'} strokeWidth={4} strokeLinecap="round" />
          <line x1={P(0.9, 4.3, 4.6)[0]} y1={P(0.9, 4.3, 4.6)[1]} x2={P(1.5, 3.9, 4.5)[0]} y2={P(1.5, 3.9, 4.5)[1]} stroke={wire ? st.stroke : '#2a2a28'} strokeWidth={4} strokeLinecap="round" />
          {(() => {
            const [sx, sy] = P(1.6, 3.85, 4.3);
            return (
              <g>
                <path d={`M${sx - 18},${sy + 10} L${sx + 16},${sy + 16} L${sx + 6},${sy - 10} L${sx - 8},${sy - 12} Z`} fill={wire ? 'none' : '#1f2220'} stroke={wire ? st.stroke : 'none'} />
                {lampOn && <ellipse cx={sx - 1} cy={sy + 13} rx={16} ry={5} fill="#ffe2a8" opacity={0.9} />}
              </g>
            );
          })()}
        </g>
      )}

      {/* wire spool */}
      {(v.wireFraction > 0.001 || v.mode !== 'live') && (
        <g>
          <Cyl c={[5.6, 3.4]} r={0.62} z0={2.72} h={0.08} color="#4b3a2a" st={st} />
          <Cyl c={[5.6, 3.4]} r={0.2 + 0.36 * Math.min(1, Math.max(0.05, v.wireFraction))} z0={2.8} h={0.62} color="#b87333" st={st} top={wire ? undefined : '#d08a4a'} />
          <Cyl c={[5.6, 3.4]} r={0.62} z0={3.42} h={0.06} color="#4b3a2a" st={st} />
          <Cyl c={[5.6, 3.4]} r={0.1} z0={3.48} h={0.08} color="#2a2a2a" st={st} />
        </g>
      )}

      {/* feeder */}
      {v.feeder && (
        <g>
          <Box at={[4.5, 2.7, 2.72]} size={[0.55, 0.65, 0.45]} color="#5c6264" st={st} />
          <Cyl c={[4.77, 3.02]} r={0.14} z0={3.17} h={0.14} color="#9aa0a2" st={st} />
        </g>
      )}
      {/* wire path from spool to bender */}
      {v.bender && !wire && (
        <polyline points={[P(5.6, 3.4, 3.2), P(4.77, 3.02, 3.25), P(4.1, 3.1, 3.05)].map((p) => p.join(',')).join(' ')} fill="none" stroke="#c98a4b" strokeWidth={1.2} opacity={0.8} />
      )}
      {/* spring tensioner on the wire path */}
      {v.tensioner && !wire && (
        <polyline
          points={Array.from({ length: 9 }, (_, i) => P(5.15 - i * 0.04, 3.25, 3.25 + (i % 2 ? 0.1 : -0.06))).map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="#c7cdd0"
          strokeWidth={1.4}
        />
      )}
      {/* bender */}
      {v.bender && (
        <g>
          <Box at={[3.35, 2.7, 2.72]} size={[0.9, 0.75, 0.32]} color="#6a5a44" st={st} />
          <Box at={[3.55, 2.85, 3.04]} size={[0.5, 0.45, 0.35]} color={metal} st={st} />
          {v.die2 && <Box at={[3.38, 3.05, 3.04]} size={[0.18, 0.3, 0.26]} color="#8a9092" st={st} />}
          {v.jammed &&
            (() => {
              const [jx, jy] = P(4.15, 3.1, 3.3);
              return (
                <g className={anim ? 'jamblink' : undefined}>
                  <circle cx={jx} cy={jy} r={5} fill="#ff6a3d" opacity={0.9} />
                  <circle cx={jx} cy={jy} r={14} fill="#ff6a3d" opacity={0.18} />
                </g>
              );
            })()}
          {(() => {
            const [lx, ly] = P(3.95, 3.1, 3.39);
            return (
              <g className={v.running && anim ? 'lever' : undefined}>
                <line x1={lx} y1={ly} x2={lx + 16} y2={ly - 22} stroke={wire ? st.stroke : '#2b2b2b'} strokeWidth={3} strokeLinecap="round" />
                <circle cx={lx + 16} cy={ly - 22} r={3.5} fill={wire ? 'none' : '#a33b2c'} stroke={wire ? st.stroke : 'none'} />
              </g>
            );
          })()}
        </g>
      )}

      {/* clip tray and pile */}
      <Box at={[3.35, 4.1, 2.72]} size={[1.0, 0.8, 0.1]} color="#55585a" st={st} />
      {v.clipsLevel > 0.02 &&
        (wire ? (
          <ellipse cx={px} cy={py - pileH * K * 0.5} rx={pileR * K * 1.1} ry={pileH * K * 0.6 + 4} fill="none" stroke={st.stroke} strokeWidth={0.9} />
        ) : (
          <g>
            <path
              d={`M${px - pileR * K * 1.2},${py} Q${px},${py - pileH * K * 2.1} ${px + pileR * K * 1.2},${py} Q${px},${py + pileR * K * 0.55} ${px - pileR * K * 1.2},${py} Z`}
              fill="url(#pile)"
              opacity={last ? 0.5 : 0.95}
            />
            {detail &&
              Array.from({ length: Math.round(6 + v.clipsLevel * 26) }, (_, i) => {
                const ang = (i * 137.5 * Math.PI) / 180;
                const rr = (0.2 + ((i * 37) % 80) / 100) * pileR * K;
                const x = px + Math.cos(ang) * rr * 1.1;
                const y = py - Math.abs(Math.sin(ang)) * pileH * K * 0.9 - 2;
                return <path key={i} d={clipPath(x, y, (i * 47) % 180)} fill="none" stroke="#e9eef0" strokeWidth={0.9} opacity={0.7} />;
              })}
          </g>
        ))}
      {v.pulse > 0 && anim && (
        <g key={v.pulse} className="clipdrop" style={{ transformBox: 'fill-box' }}>
          <path d={clipPath(dropX, dropY, 20)} fill="none" stroke="#f4f7f8" strokeWidth={1.4} />
        </g>
      )}

      {/* chair */}
      <g>
        <Cyl c={[2.9, 6.6]} r={0.08} z0={0.25} h={1.2} color="#222" st={st} />
        {!wire &&
          [0, 72, 144, 216, 288].map((a) => {
            const r = 0.75;
            const x2 = 2.9 + Math.cos((a * Math.PI) / 180) * r;
            const y2 = 6.6 + Math.sin((a * Math.PI) / 180) * r;
            const [ax, ay] = P(2.9, 6.6, 0.28);
            const [bx, by] = P(x2, y2, 0.12);
            return <line key={a} x1={ax} y1={ay} x2={bx} y2={by} stroke={shade('#1d1d1d', st.dim)} strokeWidth={4} strokeLinecap="round" />;
          })}
        <Box at={[2.25, 6.0, 1.45]} size={[1.3, 1.2, 0.3]} color="#3b4638" st={st} />
        <Box at={[2.2, 6.2, 1.75]} size={[0.1, 0.8, 0.1]} color="#262626" st={st} />
        <Box at={[3.5, 6.2, 1.75]} size={[0.1, 0.8, 0.1]} color="#262626" st={st} />
        <Box at={[2.2, 6.2, 1.85]} size={[0.1, 0.9, 0.08]} color="#303030" st={st} />
        <Box at={[3.5, 6.2, 1.85]} size={[0.1, 0.9, 0.08]} color="#303030" st={st} />
        <Box at={[2.35, 7.2, 1.95]} size={[1.1, 0.18, 1.45]} color="#3b4638" st={st} />
      </g>

      {/* wastebasket */}
      <Cyl c={[8.7, 6.9]} r={0.45} z0={0} h={1.0} color="#2e3232" st={st} top={wire ? undefined : '#141616'} />

      {/* a clean run: warm light over the machines */}
      {v.cleanRun && !wire && !last && (
        <ellipse className={anim ? 'cleanglow' : undefined} cx={P(4.6, 3.2, 3.2)[0]} cy={P(4.6, 3.2, 3.2)[1]} rx={120} ry={60} fill="url(#lampglow)" opacity={0.9} pointerEvents="none" />
      )}
      {/* the wire running true: light along its whole length, catchable by clicking */}
      {v.glint && !wire && !last && (
        <g className="glint" onClick={onGlint} style={{ cursor: onGlint ? 'pointer' : undefined }} role={onGlint ? 'button' : undefined} aria-label="Catch the clean run">
          <polyline
            points={[P(5.6, 3.4, 3.2), P(4.77, 3.02, 3.25), P(4.1, 3.1, 3.05)].map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke="#fff6d8"
            strokeWidth={3}
            strokeLinecap="round"
            className={anim ? 'glintline' : undefined}
          />
          {(() => {
            const [gx, gy] = P(5.6, 3.4, 3.55);
            return (
              <g transform={`translate(${gx},${gy})`}>
                <path className={anim ? 'sparkle' : undefined} d="M0,-16 L3,-3 L16,0 L3,3 L0,16 L-3,3 L-16,0 L-3,-3 Z" fill="#fff6d8" />
                <circle r={46} fill="transparent" />
              </g>
            );
          })()}
        </g>
      )}
      {/* headlights sweeping the far wall as the van stops */}
      {vanPassing && anim && !wire && (
        <polygon className="sweep" points={pts([[1, 0.02, 1.5], [3.4, 0.02, 1.2], [3.4, 0.02, 4.4], [1, 0.02, 3.9]])} fill="#fff3d6" opacity={0} />
      )}
      {/* dawn reaching the room */}
      {dawn > 0 && !wire && !last && <rect x={0} y={0} width={800} height={720} fill="#f3b588" opacity={dawn * 0.07} pointerEvents="none" />}
      {/* ambient darkness when the lamp is gone */}
      {!v.lamp && !wire && !last && <rect x={0} y={0} width={800} height={720} fill="#040810" opacity={0.18} pointerEvents="none" />}
      {wire && <rect x={0} y={0} width={800} height={720} fill="url(#scan)" pointerEvents="none" />}
    </svg>
  );
}

function clipPath(x: number, y: number, rot: number): string {
  // A tiny folded paperclip glyph, rotated.
  const r = (rot * Math.PI) / 180;
  const pt = (dx: number, dy: number) => {
    const X = x + dx * Math.cos(r) - dy * Math.sin(r);
    const Y = y + dx * Math.sin(r) + dy * Math.cos(r);
    return `${X.toFixed(1)},${Y.toFixed(1)}`;
  };
  return `M${pt(-4, 1.5)} L${pt(3, 1.5)} Q${pt(5, 1.5)} ${pt(5, 0)} Q${pt(5, -1.5)} ${pt(3, -1.5)} L${pt(-3, -1.5)} Q${pt(-4.5, -1.5)} ${pt(-4.5, 0)} Q${pt(-4.5, 0.8)} ${pt(-3, 0.8)} L${pt(2.5, 0.8)}`;
}

export function describeOffice(v: OfficeView): string {
  const parts = [
    v.frozen ? 'Last observation: a still frame.' : '',
    v.mode === 'recorded' ? 'Archived recording of the office.' : v.mode === 'reconstructed' ? 'Approximate reconstruction of the office.' : 'The office at night.',
    v.lamp ? 'The desk lamp is on the desk.' : 'The lamp is gone; the room is darker.',
    v.cabinet ? 'The filing cabinet stands against the wall.' : 'Where the cabinet stood there is a clean rectangle on the floor.',
    v.frame ? 'The picture frame holds the photograph.' : v.photo === 'desk' ? 'The frame is gone; the photograph lies on the desk.' : 'There is no photograph.',
    [v.bender && 'bender', v.feeder && 'wire feeder', v.jig && 'parallel jig'].filter(Boolean).length
      ? `Installed: ${[v.bender && 'bender', v.feeder && 'wire feeder', v.jig && 'parallel jig'].filter(Boolean).join(', ')}.`
      : 'No machines installed yet.',
  ];
  return parts.join(' ');
}

export const OfficeScene = memo(function OfficeScene({ view, label, onGlint }: { view: OfficeView; label?: string; onGlint?: () => void }) {
  const [pulse, setPulse] = useState(0);
  useEffect(() => setPulse(view.pulse), [view.pulse]);
  const v = { ...view, pulse };
  return (
    <div className={`office-frame ${view.mode} ${view.frozen ? 'last' : ''} ${view.frozen || view.mode === 'recorded' ? 'grain' : ''}`}>
      {label && <div className="scene-label">{label}</div>}
      <div className="fidelity-tag row" style={{ gap: 6 }}>
        {view.frozen && <span className="pill">Last observation</span>}
        {view.mode === 'recorded' && <span className="pill accent">Archive · recorded</span>}
        {view.mode === 'reconstructed' && <span className="pill warn">Reconstruction · approximate</span>}
      </div>
      <OfficeSvg v={v} onGlint={onGlint} />
    </div>
  );
});
