import type { OfficeView } from './OfficeScene';

// The office night drawn on the concept painting itself. The painting is 722 × 676; everything
// here is placed in its pixels: the monitor's screen, the clip machine and spool, the clip tray,
// the window glass, open floor in front of the desk (cartons) and by the right wall (the rack).
// Only the live night in chapter 1 uses it; the archive, reconstruction and last observation
// keep the drawn office, which can be rendered as a wireframe or with details missing.

const ART = './art/00-title-office.webp';
const W = 722;
const H = 676;

/** The window glass below the blinds, and the lit windows across the street (which go dark one by one). */
const GLASS = '53,128 178,80 180,222 55,252';
const CITY_LIGHTS: Array<[number, number]> = [
  [67, 210],
  [150, 170],
  [92, 211],
  [157, 196],
  [91, 222],
  [150, 217],
];
/** The monitor's screen: the unit box (140 × 100) mapped onto the slanted glass. */
const SCREEN_QUAD = '307,224 376,242 372,292 304,281';
const SCREEN_MATRIX = `matrix(${69 / 140} ${18 / 140} ${-3 / 100} ${57 / 100} 307 224)`;
/** The floor's two directions in the painting (towards the back right, towards the back left) and up. */
const AX: [number, number] = [1, -0.53];
const BX: [number, number] = [-1, -0.62];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Where the rack stands: its front-bottom corner on the floor by the left wall, under the window. */
const RACK: [number, number] = [72, 478];

/** An isometric box on the painting's floor: front-bottom corner at (x, y), a along AX, b along BX, h up. */
function IsoBox({ x, y, a, b, h, top, left, right, className }: { x: number; y: number; a: number; b: number; h: number; top: string; left: string; right: string; className?: string }) {
  const p = (u: number, w: number, z: number) => `${x + AX[0] * u + BX[0] * w},${y + AX[1] * u + BX[1] * w - z}`;
  return (
    <g className={className}>
      <polygon points={[p(0, 0, 0), p(a, 0, 0), p(a, 0, h), p(0, 0, h)].join(' ')} fill={right} />
      <polygon points={[p(0, 0, 0), p(0, b, 0), p(0, b, h), p(0, 0, h)].join(' ')} fill={left} />
      <polygon points={[p(0, 0, h), p(a, 0, h), p(a, b, h), p(0, b, h)].join(' ')} fill={top} />
    </g>
  );
}

function Carton({ x, y, className }: { x: number; y: number; className?: string }) {
  const a = 30;
  const b = 22;
  const h = 22;
  // The tape runs across the top, along the carton's long side.
  const t = (u: number, w: number) => `${x + AX[0] * u + BX[0] * w},${y + AX[1] * u + BX[1] * w - h}`;
  return (
    <g className={className}>
      <IsoBox x={x} y={y} a={a} b={b} h={h} top="#b58d5d" left="#6e4f30" right="#8d6a43" />
      <polyline
        points={[
          `${x},${y}`,
          `${x + AX[0] * a},${y + AX[1] * a}`,
          `${x + AX[0] * a},${y + AX[1] * a - h}`,
          `${x + AX[0] * a + BX[0] * b},${y + AX[1] * a + BX[1] * b - h}`,
          `${x + BX[0] * b},${y + BX[1] * b - h}`,
          `${x + BX[0] * b},${y + BX[1] * b}`,
          `${x},${y}`,
          `${x},${y - h}`,
          `${x + AX[0] * a},${y + AX[1] * a - h}`,
        ].join(' ')}
        fill="none"
        stroke="#2b1f13"
        strokeWidth={0.7}
        opacity={0.7}
      />
      <polyline points={`${x + BX[0] * b},${y + BX[1] * b - h} ${x},${y - h}`} fill="none" stroke="#2b1f13" strokeWidth={0.7} opacity={0.7} />
      <polygon points={[t(0, b / 2 - 2), t(a, b / 2 - 2), t(a, b / 2 + 2), t(0, b / 2 + 2)].join(' ')} fill="#d9c49a" opacity={0.75} />
    </g>
  );
}

/** A few silver clips, scattered (deterministically) in the tray. */
function TrayClips({ n }: { n: number }) {
  const clips = [];
  for (let i = 0; i < n; i++) {
    const u = ((i * 37) % 100) / 100;
    const w = ((i * 61 + 13) % 100) / 100;
    const cx = 448 + u * 56 + w * 8;
    const cy = 362 + w * 24 - u * 10 - Math.min(10, i / 6);
    const rot = (i * 47) % 180;
    clips.push(<rect key={i} x={cx - 5} y={cy - 1.6} width={10} height={3.2} rx={1.6} fill="none" stroke={i % 3 ? '#cfd2d4' : '#e9ecee'} strokeWidth={0.9} transform={`rotate(${rot} ${cx} ${cy})`} />);
  }
  return <g opacity={0.95}>{clips}</g>;
}

export function OfficeArt({ v, onGlint, onSheet }: { v: OfficeView; onGlint?: () => void; onSheet?: () => void }) {
  const anim = v.animate && !v.frozen;
  // The night outside: floors go dark after 12:40, the rain eases after 3:50, dawn from 5:20.
  const lightsOn = v.minute < 55 ? 1 : Math.max(0.12, 1 - (v.minute - 55) / 220);
  const rainAmt = v.minute < 245 ? 1 : Math.max(0.15, 1 - (v.minute - 245) / 110);
  const dawn = clamp01((v.minute - 330) / 55);
  const darkWindows = Math.round((1 - lightsOn) * CITY_LIGHTS.length);
  const clipCount = Math.round(v.clipsLevel * 46);

  // Cartons: three along the desk, two deep, two high, on the floor in front of the desk.
  const cartons = Array.from({ length: Math.min(12, v.cartons) }, (_, n) => ({ n, layer: Math.floor(n / 6), i: n % 3, j: Math.floor((n % 6) / 3) }))
    .sort((p, q) => p.layer - q.layer || q.i + q.j - (p.i + p.j));
  const stackX = 334;
  const stackY = 612;

  const installAt = v.installing ? { bender: [440, 300], jig: [108, 420], packer: [330, 330], desk: [330, 330] }[v.installing.at] : null;

  return (
    <svg className="office-svg office-art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label(v)}>
      <defs>
        <clipPath id="art-glass">
          <polygon points={GLASS} />
        </clipPath>
        <radialGradient id="art-warm" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffcf8a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffcf8a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="art-screen" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#7dffb8" stopOpacity="0.35" />
          <stop offset="1" stopColor="#7dffb8" stopOpacity="0" />
        </radialGradient>
        {/* linen under the lamp: lit from the upper left, falling into shadow on the right */}
        <radialGradient id="art-sheet" gradientUnits="userSpaceOnUse" cx="400" cy="270" r="210">
          <stop offset="0" stopColor="#9c825d" />
          <stop offset="0.3" stopColor="#6c5a43" />
          <stop offset="0.65" stopColor="#3b3127" />
          <stop offset="1" stopColor="#1c1712" />
        </radialGradient>
        <filter id="art-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
        {/* a coarse weave and slightly soft edges, so the cloth sits in the painting rather than on it */}
        <filter id="art-cloth" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.28 0" result="grain" />
          <feComposite in="grain" in2="SourceGraphic" operator="in" result="grainIn" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.7" result="soft" />
          <feMerge>
            <feMergeNode in="soft" />
            <feMergeNode in="grainIn" />
          </feMerge>
        </filter>
        <radialGradient id="art-headlight" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff4d6" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#ffd98f" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffd98f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="art-shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.6" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="art-dark" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <image href={ART} x={0} y={0} width={W} height={H} />

      {/* the street: windows across the way go dark one by one; rain on the glass; the van's headlights; dawn */}
      <g clipPath="url(#art-glass)" pointerEvents="none">
        {CITY_LIGHTS.slice(0, darkWindows).map(([x, y]) => (
          <rect key={`${x},${y}`} x={x - 3.5} y={y - 4.5} width={7} height={9} fill="#232a3d" />
        ))}
        {anim &&
          Array.from({ length: Math.round(18 * rainAmt) }, (_, i) => (
            <line
              key={i}
              className="rainline-art"
              style={{ animationDelay: `${(i * 0.137) % 0.8}s`, animationDuration: `${0.6 + (i % 5) * 0.08}s` }}
              x1={55 + ((i * 37) % 125)}
              y1={60 + ((i * 53) % 150)}
              x2={53 + ((i * 37) % 125)}
              y2={74 + ((i * 53) % 150)}
              stroke="#9fb4d8"
              strokeWidth={0.8}
              opacity={0.45}
            />
          ))}
        {v.van !== null && (
          <g>
            <ellipse className={anim ? 'headlights-art' : undefined} cx={115} cy={236} rx={70} ry={26} fill="url(#art-headlight)" />
            <ellipse className={anim ? 'headlights-art' : undefined} cx={115} cy={238} rx={26} ry={9} fill="url(#art-headlight)" />
          </g>
        )}
        {dawn > 0 && <rect x={40} y={40} width={160} height={230} fill="#a9b8cc" opacity={dawn * 0.45} />}
      </g>
      {/* dawn reaches into the room a little */}
      {dawn > 0 && <rect x={0} y={0} width={W} height={H} fill="#8fa3b8" opacity={dawn * 0.12} style={{ mixBlendMode: 'soft-light' }} pointerEvents="none" />}

      {/* when the machines run hard the lamp falters with them */}
      {v.lamp && v.strain && anim && <ellipse className="lampdip" cx={300} cy={320} rx={240} ry={170} fill="url(#art-dark)" pointerEvents="none" />}

      {/* the monitor: the terminal's own lines */}
      <polygon points={SCREEN_QUAD} fill="#071a10" />
      <g transform={SCREEN_MATRIX} fill="#79ffb6" fontFamily="IBM Plex Mono, monospace" fontSize={13}>
        <clipPath id="art-screen-clip">
          <rect x={4} y={2} width={132} height={96} />
        </clipPath>
        <g clipPath="url(#art-screen-clip)">
          {v.screen.map((line, i) => (
            <text key={i} x={10} y={20 + i * 19} opacity={0.92}>
              {line}
              {i === v.screen.length - 1 && anim && <tspan className="cursor">_</tspan>}
            </text>
          ))}
        </g>
      </g>
      <ellipse cx={340} cy={258} rx={52} ry={40} fill="url(#art-screen)" pointerEvents="none" />

      {/* the clip machine's extras: the wire spring, the second arm, the powered feeder */}
      {!v.sheet && v.tensioner && (
        <g fill="none" stroke="#b79f78" strokeWidth={1.1} opacity={0.9}>
          {[0, 1, 2, 3, 4].map((k) => (
            <ellipse key={k} cx={494 + k * 3.4} cy={314.5 + k * 0.6} rx={1.6} ry={3.4} />
          ))}
        </g>
      )}
      {!v.sheet && v.die2 && (
        <g>
          <rect x={452} y={276} width={9} height={22} rx={1.5} fill="#6e6a62" stroke="#2c2a27" strokeWidth={0.8} />
          <rect x={453} y={277} width={3} height={20} fill="#a7a197" opacity={0.6} />
        </g>
      )}
      {v.feeder && (
        <g>
          {/* a small motor behind the spool, belted to its hub */}
          <IsoBox x={584} y={386} a={16} b={12} h={14} top="#4a4741" left="#2a2825" right="#38352f" />
          <line x1={576} y1={368} x2={548} y2={352} stroke="#151413" strokeWidth={2} />
          {v.running && <circle cx={590} cy={372} r={1.5} fill="#8dffb4" className={anim ? 'blink' : undefined} />}
        </g>
      )}

      {/* clips in the tray: more of them as the desk fills up */}
      <TrayClips n={clipCount} />

      {/* the clip machine under its dust sheet, before anyone has looked: a low hump over the machine, a taller one over the spool */}
      {v.sheet && (
        <g onClick={onSheet} style={{ cursor: onSheet ? 'pointer' : undefined }} role={onSheet ? 'button' : undefined} aria-label={onSheet ? 'Lift the dust sheet' : undefined}>
          <ellipse cx={476} cy={382} rx={124} ry={18} fill="url(#art-shadow)" />
          {/* the cloth: a low hump over the machine with the lever poking up, a tall round one over the spool */}
          <path
            filter="url(#art-cloth)"
            d="M366 366 C362 336 368 300 384 282 C396 270 416 270 430 282 C436 288 442 294 446 298 L452 282 C454 276 458 276 460 282 L466 296 C474 284 488 272 506 268 C530 264 554 272 568 290 C580 306 584 330 582 354 C584 362 586 368 588 372 C572 380 556 374 540 384 C520 392 498 382 478 390 C458 396 440 386 420 390 C400 392 384 384 374 376 Z"
            fill="url(#art-sheet)"
          />
          {/* the round top of the spool showing through */}
          <ellipse cx={530} cy={280} rx={36} ry={10} fill="#d9c09a" opacity={0.1} filter="url(#art-soft)" />
          {/* fold valleys (dark) and ridges (light), soft */}
          <g filter="url(#art-soft)" fill="none" strokeLinecap="round">
            <path d="M458 298 C452 324 446 352 438 386" stroke="#1d1711" strokeWidth={4} opacity={0.55} />
            <path d="M506 272 C504 306 498 346 490 388" stroke="#1d1711" strokeWidth={4} opacity={0.5} />
            <path d="M556 284 C566 314 568 346 562 378" stroke="#120e0a" strokeWidth={5} opacity={0.55} />
            <path d="M412 304 C406 330 404 356 406 388" stroke="#1d1711" strokeWidth={3} opacity={0.4} />
            <path d="M430 300 C426 326 424 356 424 386" stroke="#e8d2a8" strokeWidth={2.5} opacity={0.35} />
            <path d="M478 282 C476 312 472 348 466 388" stroke="#e8d2a8" strokeWidth={2.5} opacity={0.3} />
            <path d="M400 312 C420 302 440 298 456 300 M468 290 C488 276 512 270 534 274" stroke="#e9cf9f" strokeWidth={2} opacity={0.35} />
          </g>
          {/* the hem lying on the desk */}
          <path d="M366 372 C384 382 404 386 422 388 C442 394 460 388 478 392 C500 394 520 384 540 384 C556 380 572 376 588 374" fill="none" stroke="#17120d" strokeWidth={1.6} opacity={0.7} />
        </g>
      )}

      {/* the machine running: a soft warm light where it works */}
      {v.running && !v.sheet && <ellipse className={anim ? 'machineglow' : undefined} cx={445} cy={318} rx={60} ry={30} fill="url(#art-warm)" opacity={0.35} pointerEvents="none" />}

      {/* a speed burst: warm light over the machines */}
      {v.cleanRun && <ellipse className={anim ? 'cleanglow' : undefined} cx={480} cy={330} rx={150} ry={80} fill="url(#art-warm)" opacity={0.9} pointerEvents="none" />}

      {/* the wire running perfectly straight: light along it, catchable by clicking */}
      {v.glint && !v.sheet && (
        <g className="glint" onClick={onGlint} style={{ cursor: onGlint ? 'pointer' : undefined }} role={onGlint ? 'button' : undefined} aria-label="Grab the speed burst">
          <polyline points="535,318 505,314 470,308" fill="none" stroke="#fff6d8" strokeWidth={3} strokeLinecap="round" />
          <circle cx={505} cy={314} r={9} fill="#fff6d8" opacity={0.35} />
          <polyline points="535,318 505,314 470,308" fill="none" stroke="transparent" strokeWidth={26} />
        </g>
      )}

      {/* a snag: the machine stops and blinks red */}
      {v.jammed && (
        <g className={anim ? 'jamblink' : undefined} pointerEvents="none">
          <circle cx={455} cy={298} r={4} fill="#ff6a3d" />
          <circle cx={455} cy={298} r={13} fill="#ff6a3d" opacity={0.22} />
        </g>
      )}

      {/* the side-table rack against the left wall, under the window, with up to six small machines */}
      {v.jig && (
        <g>
          {/* legs and two shelves; the rack runs along the wall (AX) and is shallow (BX) */}
          {[0, 1, 2].map((shelf) => (
            <IsoBox key={shelf} x={RACK[0]} y={RACK[1] - 38 * shelf} a={66} b={20} h={3} top={shelf === 0 ? '#1f1d1a' : '#3a3631'} left="#1c1a18" right="#2b2824" />
          ))}
          {[0, 66].map((u) => (
            <line key={u} x1={RACK[0] + AX[0] * u} y1={RACK[1] + AX[1] * u} x2={RACK[0] + AX[0] * u} y2={RACK[1] + AX[1] * u - 79} stroke="#1a1816" strokeWidth={2} />
          ))}
          {[1, 2].map((shelf) =>
            Array.from({ length: 3 }, (_, k) => {
              const n = (shelf - 1) * 3 + k;
              if (n >= v.stations) return null;
              const bx = RACK[0] + AX[0] * (5 + k * 20) + BX[0] * 4;
              const by = RACK[1] - 38 * (shelf - 1) - 3 + AX[1] * (5 + k * 20) + BX[1] * 4;
              return (
                <g key={`${shelf}${k}`}>
                  <IsoBox x={bx} y={by} a={15} b={12} h={14} top="#5f5a51" left="#2e2b27" right="#423e38" />
                  <line x1={bx + 3} y1={by - 15} x2={bx + 9} y2={by - 18} stroke="#b58a52" strokeWidth={1.2} opacity={0.7} />
                  {v.running && <circle cx={bx + 8} cy={by - 7} r={1.4} fill="#8dffb4" className={anim ? 'blink' : undefined} style={{ animationDelay: `${n * 0.23}s` }} />}
                </g>
              );
            }),
          )}
        </g>
      )}

      {/* sealed cartons, stacked on the floor in front of the desk */}
      {cartons.map(({ n, layer, i, j }) => (
        <Carton
          key={`c${n}`}
          x={stackX + AX[0] * i * 31 + BX[0] * j * 23}
          y={stackY + AX[1] * i * 31 + BX[1] * j * 23 - layer * 22}
          className={anim ? (v.van !== null && n >= v.cartons - v.van ? 'cartonout' : 'cartonin') : undefined}
        />
      ))}

      {/* the van's count, by the stack */}
      {v.van !== null && (
        <text className={anim ? 'vancount' : undefined} x={400} y={540} textAnchor="middle" fontFamily="var(--font-serif)" fontSize={26} fill="#fff3d6" style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,0.65)" strokeWidth={4} pointerEvents="none">
          {v.van === 0 ? 'Nothing for the van' : `${v.van} carton${v.van === 1 ? '' : 's'} → the 5:22 van`}
        </text>
      )}

      {/* something being installed: a ring filling up where it goes */}
      {installAt && v.installing && (
        <g pointerEvents="none">
          <circle cx={installAt[0]} cy={installAt[1]} r={14} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.15)" strokeWidth={3} />
          <circle
            cx={installAt[0]}
            cy={installAt[1]}
            r={14}
            fill="none"
            stroke="#f3c98b"
            strokeWidth={3}
            strokeDasharray={`${2 * Math.PI * 14 * v.installing.fraction} ${2 * Math.PI * 14}`}
            transform={`rotate(-90 ${installAt[0]} ${installAt[1]})`}
          />
        </g>
      )}

      {/* what the machines added, floating up off the tray */}
      {anim &&
        (v.gains ?? []).map((g) => (
          <text key={g.id} className="gainfloat" x={482} y={350} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize={13} fill="#fff1d6" style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,0.5)" strokeWidth={3} pointerEvents="none">
            +{g.n}
          </text>
        ))}

      {/* a big upgrade just went in */}
      {v.flash && <rect className={anim ? 'milestoneflash' : undefined} x={0} y={0} width={W} height={H} fill="#f6d39a" opacity={0} pointerEvents="none" />}
    </svg>
  );
}

function label(v: OfficeView): string {
  const parts = ['The 11th-floor office at night: a desk under a lamp, a green terminal, a filing cabinet, rain on the window.'];
  if (v.sheet) parts.push('Something on the desk is under a dust sheet.');
  else if (v.bender) parts.push(`The clip machine is ${v.running ? 'running' : v.jammed ? 'stopped: the wire has snagged' : 'off'}.`);
  if (v.jig) parts.push(`A rack by the wall holds ${v.stations} small machines.`);
  if (v.cartons > 0) parts.push(`${v.cartons} sealed carton${v.cartons === 1 ? '' : 's'} on the floor.`);
  return parts.join(' ');
}
