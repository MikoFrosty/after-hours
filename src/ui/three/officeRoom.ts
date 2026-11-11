// The night office as a 3D room (prototype). Seated first person at Mara's desk: drag to look around, click things to use them.
// Everything here is presentation: the room reads an OfficeView each frame and reports clicks as targets.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OfficeView } from '../scenes/OfficeScene';

export type Target = 'press' | 'carton' | 'machine' | 'dark' | 'glint' | 'monitor';

export interface RoomInput {
  v: OfficeView;
  /** What clicking each target does right now (shown on hover); null when it does nothing. */
  labels: Partial<Record<Target, string | null>>;
  /** Clips per second from the machines (spins the wheels). */
  rate: number;
  /** Clips loose on the desk. */
  loose: number;
  owned: string[];
  reducedMotion: boolean;
}

export interface Room {
  set(input: RoomInput): void;
  /** The hand bender's lever dips (a press). */
  press(): void;
  dispose(): void;
}

const W = { woodDark: 0x2a1d14, beige: 0x9a8f78, green: 0x2f4a3c, card: 0x9a7448 };

function std(color: number, roughness = 0.8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A small canvas texture: noise over a base colour, so flat surfaces read as wood, carpet or paint. */
function grain(base: string, streak: string, size = 256, lines = 120, vertical = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.strokeStyle = streak;
  for (let i = 0; i < lines; i++) {
    g.globalAlpha = 0.05 + rnd() * 0.12;
    g.lineWidth = 0.5 + rnd() * 1.5;
    g.beginPath();
    const p = rnd() * size;
    if (vertical) {
      g.moveTo(p, 0);
      g.bezierCurveTo(p + rnd() * 6 - 3, size / 3, p + rnd() * 6 - 3, (2 * size) / 3, p, size);
    } else {
      g.moveTo(0, p);
      g.bezierCurveTo(size / 3, p + rnd() * 6 - 3, (2 * size) / 3, p + rnd() * 6 - 3, size, p);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** One paperclip as a thin tube. */
function clipGeometry() {
  const s = 0.016;
  const pts = [
    [0, 0.6],
    [0, -0.7],
    [0.16, -0.95],
    [0.34, -0.7],
    [0.34, 0.8],
    [0.6, 1.05],
    [0.8, 0.8],
    [0.8, -0.95],
    [1.0, -1.15],
    [1.16, -0.95],
    [1.16, 0.45],
  ].map(([x, y]) => new THREE.Vector3((x - 0.58) * s, 0, y * s));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2), 48, 0.0011, 5, false);
}

/** The city outside: sky, towers, lit windows (fewer as the night goes), dawn at the end. */
function drawCity(g: CanvasRenderingContext2D, w: number, h: number, minute: number) {
  const dawn = Math.max(0, Math.min(1, (minute - 300) / 80));
  const sky = g.createLinearGradient(0, 0, 0, h);
  const lerp = (a: number[], b: number[], t: number) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`;
  sky.addColorStop(0, lerp([10, 14, 28], [70, 92, 130], dawn));
  sky.addColorStop(0.7, lerp([22, 28, 48], [190, 140, 110], dawn));
  sky.addColorStop(1, lerp([30, 34, 50], [230, 170, 120], dawn));
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lit = Math.max(0.08, 0.55 - minute / 700);
  for (let layer = 0; layer < 2; layer++) {
    let x = -10;
    while (x < w) {
      const bw = 40 + rnd() * 70;
      const bh = h * (layer === 0 ? 0.35 + rnd() * 0.4 : 0.2 + rnd() * 0.3);
      const shade = layer === 0 ? 18 + dawn * 30 : 12 + dawn * 40;
      g.fillStyle = `rgb(${shade},${shade + 4},${shade + 12})`;
      g.fillRect(x, h - bh, bw, bh);
      for (let wy = h - bh + 8; wy < h - 6; wy += 11) {
        for (let wx = x + 6; wx < x + bw - 6; wx += 9) {
          const r = rnd();
          if (r < lit * (layer === 0 ? 0.7 : 1)) {
            g.fillStyle = r < lit * 0.3 ? 'rgba(255,214,150,0.9)' : 'rgba(230,190,120,0.55)';
            g.fillRect(wx, wy, 4, 5);
          }
        }
      }
      x += bw + 4 + rnd() * 16;
    }
  }
}

function drawScreen(g: CanvasRenderingContext2D, lines: string[], cursor: boolean) {
  const w = g.canvas.width;
  const h = g.canvas.height;
  g.fillStyle = '#04120a';
  g.fillRect(0, 0, w, h);
  g.font = 'bold 26px "IBM Plex Mono", ui-monospace, monospace';
  g.textBaseline = 'top';
  g.shadowColor = 'rgba(120,255,160,0.8)';
  g.shadowBlur = 8;
  g.fillStyle = '#8dffb0';
  const shown = lines.slice(-6);
  shown.forEach((l, i) => {
    const text = l === '>' ? (cursor ? '> _' : '>') : l;
    g.fillText(text.slice(0, 16), 22, 22 + i * 34);
  });
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2);
  const vig = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.65)');
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);
}

/** A desktop clip machine: base, body, flywheel, bending arm. Returns the parts that move. */
function clipMachine(scale = 1) {
  const g = new THREE.Group();
  const body = std(W.green, 0.55, 0.35);
  const steel = std(0x8a9294, 0.35, 0.8);
  const brass = std(0xa07a3a, 0.4, 0.7);
  g.add(box(0.3, 0.04, 0.2, std(0x1f2a24, 0.7, 0.2), 0, 0.02, 0));
  g.add(box(0.14, 0.12, 0.12, body, -0.04, 0.1, 0));
  const wheel = cyl(0.055, 0.055, 0.025, steel, 28);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(0.07, 0.11, 0.02);
  const spoke = box(0.006, 0.1, 0.012, std(0x2a2a2a), 0, 0, 0, false);
  spoke.rotation.z = Math.PI / 2;
  wheel.add(spoke);
  g.add(wheel);
  const arm = new THREE.Group();
  arm.position.set(-0.04, 0.17, 0.0);
  const armBar = box(0.16, 0.014, 0.02, brass, -0.06, 0, 0);
  arm.add(armBar);
  g.add(arm);
  const head = box(0.04, 0.05, 0.05, steel, -0.12, 0.07, 0.03);
  g.add(head);
  g.scale.setScalar(scale);
  return { g, wheel, arm };
}

export function createRoom(canvas: HTMLCanvasElement, onTarget: (t: Target) => void, onHover: (label: string | null) => void): Room {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090b);
  scene.fog = new THREE.Fog(0x07090b, 4, 9);
  // a faint environment so metal reads as metal rather than black
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.12;

  const camera = new THREE.PerspectiveCamera(62, 1, 0.02, 30);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.16, 0.05);
  let yaw = 0.05;
  let pitch = -0.42;

  // ---------- the room ----------
  const floorTex = grain('#3a322b', '#120e0b', 256, 200);
  floorTex.repeat.set(4, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -0.1);
  floor.receiveShadow = true;
  scene.add(floor);

  const wallTex = grain('#33474f', '#0d1418', 256, 60, true);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, color: 0xb8c4c8 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), wallMat);
  back.position.set(0, 1.3, -1.3);
  back.receiveShadow = true;
  scene.add(back);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(1.6, 1.3, -0.1);
  right.receiveShadow = true;
  scene.add(right);
  const behind = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), wallMat);
  behind.rotation.y = Math.PI;
  behind.position.set(0, 1.3, 1.5);
  scene.add(behind);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), std(0x15191c, 1));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 2.6, -0.1);
  scene.add(ceiling);
  // skirting
  scene.add(box(3.2, 0.08, 0.02, std(0x1b2226), 0, 0.04, -1.29, false));
  scene.add(box(0.02, 0.08, 3.2, std(0x1b2226), 1.59, 0.04, -0.1, false));

  // left wall with a window: z −1.0…0.1, y 0.95…2.0
  const WX = -1.5;
  const win = { z0: -1.0, z1: 0.1, y0: 0.95, y1: 2.0 };
  const leftWall = (z0: number, z1: number, y0: number, y1: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0), wallMat);
    m.rotation.y = Math.PI / 2;
    m.position.set(WX, (y0 + y1) / 2, (z0 + z1) / 2);
    m.receiveShadow = true;
    scene.add(m);
  };
  leftWall(-1.3, win.z0, 0, 2.6);
  leftWall(win.z1, 1.5, 0, 2.6);
  leftWall(win.z0, win.z1, 0, win.y0);
  leftWall(win.z0, win.z1, win.y1, 2.6);
  const frameMat = std(0x2a2620, 0.7);
  const zc = (win.z0 + win.z1) / 2;
  const zw = win.z1 - win.z0;
  scene.add(box(0.12, 0.04, zw + 0.08, frameMat, WX + 0.04, win.y0 - 0.02, zc));
  scene.add(box(0.06, 0.04, zw + 0.08, frameMat, WX + 0.01, win.y1 + 0.02, zc, false));
  scene.add(box(0.06, win.y1 - win.y0, 0.04, frameMat, WX + 0.01, (win.y0 + win.y1) / 2, win.z0 - 0.02, false));
  scene.add(box(0.06, win.y1 - win.y0, 0.04, frameMat, WX + 0.01, (win.y0 + win.y1) / 2, win.z1 + 0.02, false));
  scene.add(box(0.04, win.y1 - win.y0, 0.025, frameMat, WX + 0.01, (win.y0 + win.y1) / 2, zc, false));
  scene.add(box(0.04, 0.025, zw, frameMat, WX + 0.01, (win.y0 + win.y1) / 2 + 0.05, zc, false));
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(zw, win.y1 - win.y0),
    new THREE.MeshPhysicalMaterial({ color: 0x8aa0b0, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, depthWrite: false }),
  );
  glass.rotation.y = Math.PI / 2;
  glass.position.set(WX, (win.y0 + win.y1) / 2, zc);
  scene.add(glass);
  // a plant on the sill
  const pot = cyl(0.05, 0.04, 0.08, std(0x6b3d26, 0.9));
  pot.position.set(WX + 0.06, win.y0 + 0.04, 0.0);
  scene.add(pot);
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), std(0x2e4a2a, 0.9));
    leaf.scale.set(1, 0.4, 2);
    leaf.position.set(WX + 0.06 + Math.cos(i) * 0.04, win.y0 + 0.12 + (i % 3) * 0.03, Math.sin(i * 2) * 0.05);
    leaf.rotation.set(i, i * 0.7, 0.4);
    leaf.castShadow = true;
    scene.add(leaf);
  }

  // the city behind the glass
  const cityCanvas = document.createElement('canvas');
  cityCanvas.width = 1024;
  cityCanvas.height = 512;
  const cityG = cityCanvas.getContext('2d')!;
  drawCity(cityG, 1024, 512, 0);
  const cityTex = new THREE.CanvasTexture(cityCanvas);
  cityTex.colorSpace = THREE.SRGBColorSpace;
  const city = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: cityTex, fog: false }));
  city.rotation.y = Math.PI / 2;
  city.position.set(-5.5, 1.2, -0.45);
  scene.add(city);
  let cityMinute = -99;

  // rain outside the glass
  const RAIN = 220;
  const rainPos = new Float32Array(RAIN * 6);
  const rainSeed: number[] = [];
  for (let i = 0; i < RAIN; i++) rainSeed.push(Math.random());
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.22, fog: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  scene.add(rain);
  const rainBase = Array.from({ length: RAIN }, () => [WX - 0.15 - Math.random() * 1.8, Math.random() * 3, win.z0 - 0.6 + Math.random() * (zw + 1.2)]);

  // the van's headlights in the street below
  const vanLight = new THREE.SpotLight(0xffd9a0, 0, 7, 0.5, 0.8, 1.2);
  vanLight.position.set(-4, 0.6, -0.4);
  vanLight.target.position.set(0, 1.4, -0.6);
  scene.add(vanLight, vanLight.target);
  const vanGlow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0, fog: false }));
  vanGlow.position.set(-4.4, 0.3, -0.55);
  const vanGlow2 = vanGlow.clone();
  vanGlow2.material = vanGlow.material;
  vanGlow2.position.z = -0.25;
  scene.add(vanGlow, vanGlow2);

  // ---------- the desk ----------
  const woodTex = grain('#4a3424', '#1a110a', 256, 140);
  woodTex.repeat.set(2, 1);
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.6, color: 0xc8b8a8 });
  const DY = 0.75; // desk top
  scene.add(box(1.9, 0.045, 0.82, woodMat, 0, DY - 0.022, -0.76));
  scene.add(box(0.46, DY - 0.05, 0.74, std(W.woodDark, 0.7), 0.66, (DY - 0.05) / 2, -0.78));
  for (const dy of [0.18, 0.42, 0.62]) scene.add(box(0.4, 0.012, 0.012, std(0x8a7a5a, 0.4, 0.6), 0.66, dy, -0.405, false));
  scene.add(box(0.04, DY - 0.05, 0.7, std(W.woodDark, 0.7), -0.9, (DY - 0.05) / 2, -0.78));
  scene.add(box(1.4, 0.3, 0.02, std(W.woodDark, 0.8), -0.2, DY - 0.2, -1.12));

  // the chair's back edge, seen when looking down
  scene.add(box(0.5, 0.04, 0.44, std(0x1d1d1f, 0.9), 0, 0.46, 0.18));

  // the CRT terminal
  const monitor = new THREE.Group();
  monitor.userData.target = 'monitor';
  const beige = std(W.beige, 0.65);
  monitor.add(box(0.38, 0.32, 0.36, beige, 0, 0.2, 0));
  monitor.add(box(0.3, 0.26, 0.12, beige, 0, 0.19, -0.22));
  monitor.add(box(0.2, 0.04, 0.2, beige, 0, 0.02, 0));
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 320;
  screenCanvas.height = 240;
  const screenG = screenCanvas.getContext('2d')!;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.22), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 0.21, 0.181);
  monitor.add(screen);
  monitor.position.set(-0.3, DY, -0.98);
  monitor.rotation.y = 0.18;
  scene.add(monitor);
  const screenLight = new THREE.PointLight(0x60ff9a, 0.06, 0.9, 2);
  screenLight.position.set(-0.22, DY + 0.22, -0.45);
  scene.add(screenLight);
  let screenKey = '';

  // keyboard
  const kb = box(0.44, 0.025, 0.15, std(W.beige, 0.65), -0.22, DY + 0.012, -0.55);
  kb.rotation.y = 0.08;
  scene.add(kb);
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 13; k++) {
      const key = box(0.026, 0.012, 0.026, std(0xb8ae96, 0.7), -0.22 - 0.19 + k * 0.031, DY + 0.03, -0.6 + r * 0.032, false);
      scene.add(key);
    }

  // a mug, a photo frame, papers
  const mug = cyl(0.035, 0.032, 0.09, std(0x7a3b2e, 0.6));
  mug.position.set(-0.55, DY + 0.045, -0.55);
  scene.add(mug);
  const frame = box(0.12, 0.15, 0.015, std(0x6a4a2a, 0.6), -0.52, DY + 0.075, -1.02);
  frame.rotation.set(-0.15, 0.4, 0);
  scene.add(frame);
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.12), std(0xb09a70, 0.9));
  photo.position.set(0, 0, 0.009);
  frame.add(photo);
  const paper = box(0.21, 0.003, 0.29, std(0xd8d2c0, 0.95), 0.1, DY + 0.002, -0.62, false);
  paper.rotation.y = -0.3;
  scene.add(paper);
  // sticky notes and a calendar on the back wall
  for (let i = 0; i < 4; i++) {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), std(i % 2 ? 0xd8c070 : 0xc8b0a0, 0.9));
    n.position.set(0.9 + (i % 2) * 0.09, 1.25 + Math.floor(i / 2) * 0.09, -1.295);
    n.rotation.z = (i - 1.5) * 0.08;
    scene.add(n);
  }
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), std(0xcfc8b8, 0.9));
  cal.position.set(0.45, 1.45, -1.295);
  scene.add(cal);

  // filing cabinet, back right
  const cab = new THREE.Group();
  const cabMat = std(0x6e6a5e, 0.55, 0.3);
  cab.add(box(0.46, 1.3, 0.6, cabMat, 0, 0.65, 0));
  for (let i = 0; i < 4; i++) {
    cab.add(box(0.42, 0.29, 0.01, std(0x7a766a, 0.5, 0.3), 0, 0.17 + i * 0.32, 0.305, false));
    cab.add(box(0.12, 0.02, 0.02, std(0xa0a0a0, 0.3, 0.9), 0, 0.26 + i * 0.32, 0.32, false));
  }
  cab.position.set(1.3, 0, -0.98);
  scene.add(cab);

  // the desk lamp, back left: it turns toward the machine when asked
  const lamp = new THREE.Group();
  const lampMat = std(0x1d1f22, 0.45, 0.6);
  const lampBase = cyl(0.07, 0.08, 0.025, lampMat);
  lampBase.position.y = 0.012;
  lamp.add(lampBase);
  const elbow = new THREE.Vector3(-0.02, 0.32, -0.02);
  const headAt = new THREE.Vector3(0.12, 0.44, 0.14);
  const rod = (a: THREE.Vector3, b: THREE.Vector3) => {
    const m = cyl(0.007, 0.007, a.distanceTo(b), lampMat, 8);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    lamp.add(m);
  };
  rod(new THREE.Vector3(0, 0.02, 0), elbow);
  rod(elbow, headAt);
  const lampHead = new THREE.Group();
  lampHead.position.copy(headAt);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.11, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide }));
  shade.castShadow = true;
  lampHead.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false }));
  bulb.position.y = -0.04;
  lampHead.add(bulb);
  lamp.add(lampHead);
  lamp.position.set(-0.72, DY, -1.0);
  scene.add(lamp);
  const lampLight = new THREE.SpotLight(0xffc27a, 6, 4, 0.85, 0.65, 1.6);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.bias = -0.0004;
  lampLight.shadow.camera.near = 0.05;
  scene.add(lampLight, lampLight.target);
  const lampFill = new THREE.PointLight(0xffb060, 0.5, 2.6, 2);
  scene.add(lampFill);
  const aimAway = new THREE.Vector3(-0.4, DY, -0.6);
  const aimMachine = new THREE.Vector3(0.18, DY, -0.75);
  const aim = aimAway.clone();

  scene.add(new THREE.AmbientLight(0x1a2a3a, 0.55));
  scene.add(new THREE.HemisphereLight(0x3a4a66, 0x120c08, 0.35));
  const moon = new THREE.DirectionalLight(0x6f8cb8, 0.5);
  moon.position.set(-4, 3, -0.3);
  moon.target.position.set(0, 0.6, -0.4);
  scene.add(moon, moon.target);

  // ---------- the things you use ----------
  const targets: THREE.Object3D[] = [];
  const targetGroup = (t: Target, g: THREE.Object3D) => {
    g.userData.target = t;
    targets.push(g);
    return g;
  };
  targetGroup('monitor', monitor);

  // the hand bender: a block with a lever, where clips are made by hand
  const press = targetGroup('press', new THREE.Group());
  const pressMetal = std(0x6a6e70, 0.4, 0.75);
  press.add(box(0.14, 0.03, 0.1, std(0x34302a, 0.7), 0, 0.015, 0));
  press.add(box(0.03, 0.09, 0.03, pressMetal, -0.04, 0.075, 0));
  const lever = new THREE.Group();
  lever.position.set(-0.04, 0.12, 0);
  const leverBar = box(0.1, 0.01, 0.01, pressMetal, 0.05, 0, 0);
  lever.add(leverBar);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), std(0x7a1f1a, 0.4));
  knob.position.set(0.1, 0, 0);
  lever.add(knob);
  lever.rotation.z = 0.35;
  press.add(lever);
  const wireStub = cyl(0.002, 0.002, 0.1, std(0xb0b4b8, 0.3, 0.9), 6);
  wireStub.rotation.z = Math.PI / 2;
  wireStub.position.set(0.02, 0.035, 0.03);
  press.add(wireStub);
  press.position.set(0.16, DY, -0.5);
  press.rotation.y = -0.3;
  scene.add(press);
  let pressT = 1;

  // the clip tray
  const tray = new THREE.Group();
  const trayMat = std(0x2a2d30, 0.5, 0.5);
  tray.add(box(0.22, 0.008, 0.15, trayMat, 0, 0.004, 0));
  tray.add(box(0.22, 0.03, 0.008, trayMat, 0, 0.015, 0.071));
  tray.add(box(0.22, 0.03, 0.008, trayMat, 0, 0.015, -0.071));
  tray.add(box(0.008, 0.03, 0.15, trayMat, 0.106, 0.015, 0));
  tray.add(box(0.008, 0.03, 0.15, trayMat, -0.106, 0.015, 0));
  tray.position.set(0.36, DY, -0.48);
  tray.rotation.y = -0.15;
  scene.add(tray);
  const CLIPS = 400;
  const clipMesh = new THREE.InstancedMesh(clipGeometry(), std(0xd8dce0, 0.3, 0.7), CLIPS);
  clipMesh.castShadow = true;
  // its bounds would be measured while the tray is empty and never again
  clipMesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < CLIPS; i++) {
    const layer = Math.floor(i / 60);
    dummy.position.set((Math.random() - 0.5) * 0.18, 0.01 + layer * 0.0035 + Math.random() * 0.002, (Math.random() - 0.5) * 0.11);
    dummy.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
    dummy.updateMatrix();
    clipMesh.setMatrixAt(i, dummy.matrix);
  }
  clipMesh.count = 0;
  tray.add(clipMesh);

  // the open carton on the desk's right end
  const carton = targetGroup('carton', new THREE.Group());
  const cardMat = std(W.card, 0.9);
  const cardIn = std(0x5a4128, 0.95);
  carton.add(box(0.3, 0.008, 0.22, cardIn, 0, 0.004, 0));
  carton.add(box(0.3, 0.17, 0.008, cardMat, 0, 0.085, 0.106));
  carton.add(box(0.3, 0.17, 0.008, cardMat, 0, 0.085, -0.106));
  carton.add(box(0.008, 0.17, 0.22, cardMat, 0.146, 0.085, 0));
  carton.add(box(0.008, 0.17, 0.22, cardMat, -0.146, 0.085, 0));
  const flapA = box(0.3, 0.006, 0.1, cardMat, 0, 0.17, 0.15);
  flapA.rotation.x = -0.5;
  carton.add(flapA);
  const flapB = box(0.3, 0.006, 0.1, cardMat, 0, 0.17, -0.15);
  flapB.rotation.x = 0.5;
  carton.add(flapB);
  carton.scale.setScalar(0.85);
  carton.position.set(0.74, DY, -0.68);
  carton.rotation.y = -0.25;
  scene.add(carton);

  // the clip machine and its wire spool at the dark end of the desk
  const machine = clipMachine();
  targetGroup('machine', machine.g);
  machine.g.position.set(0.32, DY, -0.92);
  machine.g.rotation.y = -0.35;
  scene.add(machine.g);
  const spool = new THREE.Group();
  const spoolCore = cyl(0.075, 0.075, 0.1, std(0x9a7650, 0.35, 0.85), 32);
  spoolCore.rotation.x = Math.PI / 2;
  spool.add(spoolCore);
  for (const z of [-0.055, 0.055]) {
    const flange = cyl(0.09, 0.09, 0.008, std(0x2a2a2a, 0.6, 0.4), 32);
    flange.rotation.x = Math.PI / 2;
    flange.position.z = z;
    spool.add(flange);
  }
  spool.position.set(0.58, DY + 0.095, -0.98);
  spool.rotation.y = -0.6;
  scene.add(spool);
  const stand = box(0.04, 0.09, 0.14, std(0x2a2a2a, 0.6, 0.4), 0.58, DY + 0.045, -0.98);
  stand.rotation.y = -0.6;
  scene.add(stand);
  const wireLine = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.53, DY + 0.16, -0.95), new THREE.Vector3(0.44, DY + 0.13, -0.92), new THREE.Vector3(0.36, DY + 0.1, -0.9)]), 16, 0.0016, 6),
    new THREE.MeshStandardMaterial({ color: 0xc0c4c8, roughness: 0.3, metalness: 0.9, emissive: 0x000000 }),
  );
  scene.add(wireLine);
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0, depthWrite: false });
  const glint = targetGroup('glint', new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), glintMat));
  glint.position.set(0.45, DY + 0.13, -0.92);
  scene.add(glint);
  const glintLight = new THREE.PointLight(0xfff0c0, 0, 0.8, 2);
  glintLight.position.copy(glint.position);
  scene.add(glintLight);
  const jamLed = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0x330a08, toneMapped: false }));
  jamLed.position.set(-0.04, 0.17, 0.062);
  machine.g.add(jamLed);
  const runLight = new THREE.PointLight(0xffa860, 0, 0.6, 2);
  runLight.position.set(0.3, DY + 0.18, -0.85);
  scene.add(runLight);

  // the dark end of the desk: an invisible catch for the click until the lamp is turned
  const dark = targetGroup('dark', new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.35), new THREE.MeshBasicMaterial({ visible: false })));
  dark.position.set(0.45, DY + 0.12, -0.94);
  scene.add(dark);

  // upgrades that appear on the desk
  const spring = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(Array.from({ length: 60 }, (_, i) => new THREE.Vector3(Math.cos(i * 0.6) * 0.012, i * 0.0012, Math.sin(i * 0.6) * 0.012))),
      120,
      0.0015,
      5,
    ),
    std(0xc0c4c8, 0.3, 0.9),
  );
  spring.position.set(0.1, 0.05, 0.06);
  spring.rotation.z = Math.PI / 2;
  machine.g.add(spring);
  const oil = new THREE.Group();
  const can = cyl(0.03, 0.035, 0.08, std(0x8a2a1a, 0.5, 0.4));
  can.position.y = 0.04;
  oil.add(can);
  const spout = cyl(0.003, 0.006, 0.09, std(0x9a9a9a, 0.3, 0.9), 8);
  spout.position.set(0.03, 0.1, 0);
  spout.rotation.z = -0.9;
  oil.add(spout);
  oil.position.set(0.1, DY, -1.02);
  scene.add(oil);
  const feeder = new THREE.Group();
  feeder.add(box(0.08, 0.08, 0.1, std(0x4a5a50, 0.5, 0.5), 0, 0.04, 0));
  const fw = cyl(0.025, 0.025, 0.012, std(0x9a9a9a, 0.3, 0.9));
  fw.rotation.x = Math.PI / 2;
  fw.position.set(0, 0.09, 0.0);
  feeder.add(fw);
  feeder.position.set(0.47, DY, -0.88);
  feeder.rotation.y = -0.4;
  scene.add(feeder);
  const arm2 = new THREE.Group();
  arm2.position.set(-0.04, 0.2, -0.05);
  arm2.add(box(0.16, 0.014, 0.02, std(0xa07a3a, 0.4, 0.7), -0.06, 0, 0));
  machine.g.add(arm2);
  const pedal = new THREE.Group();
  pedal.add(box(0.16, 0.025, 0.24, std(0x2a2a2a, 0.6, 0.5), 0, 0.012, 0));
  const pedalTop = box(0.13, 0.015, 0.18, std(0x4a4a4a, 0.5, 0.6), 0, 0.035, 0);
  pedalTop.rotation.x = -0.15;
  pedal.add(pedalTop);
  pedal.position.set(0.1, 0, -0.35);
  scene.add(pedal);
  const governor = new THREE.Group();
  governor.add(box(0.08, 0.1, 0.05, std(0x3a3a34, 0.5, 0.4), 0, 0.05, 0));
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.025, 20), new THREE.MeshBasicMaterial({ color: 0x90ffa0, toneMapped: false }));
  dial.position.set(0, 0.06, 0.026);
  governor.add(dial);
  governor.position.set(0.0, DY, -1.04);
  scene.add(governor);

  // the side-table rack under the window, with up to six machines
  const rack = new THREE.Group();
  rack.add(box(0.5, 0.03, 1.1, woodMat, 0, 0.62, 0));
  for (const [dx, dz] of [[-0.22, -0.52], [0.22, -0.52], [-0.22, 0.52], [0.22, 0.52]]) rack.add(box(0.03, 0.62, 0.03, std(W.woodDark), dx, 0.31, dz));
  rack.add(box(0.46, 0.02, 1.04, std(W.woodDark), 0, 0.2, 0));
  const rackMachines: Array<ReturnType<typeof clipMachine>> = [];
  for (let i = 0; i < 6; i++) {
    const m = clipMachine(0.72);
    m.g.position.set(i % 2 ? 0.12 : -0.1, 0.635, -0.4 + Math.floor(i / 2) * 0.38 + (i % 2) * 0.08);
    m.g.rotation.y = Math.PI / 2;
    rack.add(m.g);
    rackMachines.push(m);
  }
  rack.position.set(-1.2, 0, -0.45);
  scene.add(rack);

  // sealed cartons stacked on the floor to the right
  const sealedMat = std(0x8a6840, 0.9);
  const tapeMat = std(0xc8b890, 0.6);
  const sealed: THREE.Group[] = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    g.add(box(0.34, 0.24, 0.26, sealedMat, 0, 0.12, 0));
    g.add(box(0.345, 0.004, 0.05, tapeMat, 0, 0.241, 0, false));
    const col = i % 4;
    const level = Math.floor(i / 4);
    g.position.set(1.15 + (col % 2) * 0.36, level * 0.245, -0.2 + Math.floor(col / 2) * 0.3);
    g.rotation.y = ((i * 37) % 7) * 0.02 - 0.06;
    g.visible = false;
    scene.add(g);
    sealed.push(g);
  }

  // ---------- input ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let input: RoomInput | null = null;
  let hovered: Target | null = null;
  let down: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
  const hitTarget = (cx: number, cy: number): Target | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(targets, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.target) o = o.parent;
      const t = o?.userData.target as Target | undefined;
      if (t && input?.labels[t]) return t;
    }
    return null;
  };
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false };
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (down) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true;
      if (down.moved) {
        const k = 2.2 / Math.max(400, canvas.clientWidth);
        yaw = Math.max(-1.25, Math.min(1.75, down.yaw + dx * k * 1.6));
        pitch = Math.max(-1.05, Math.min(0.4, down.pitch + dy * k * 1.6));
      }
      return;
    }
    if (e.pointerType === 'mouse') setHover(hitTarget(e.clientX, e.clientY));
  };
  const onUp = (e: PointerEvent) => {
    const d = down;
    down = null;
    if (!d || d.moved) return;
    const t = hitTarget(e.clientX, e.clientY);
    if (t) onTarget(t);
  };
  const setHover = (t: Target | null) => {
    if (t === hovered) {
      if (t) onHover(input?.labels[t] ?? null);
      return;
    }
    hovered = t;
    canvas.style.cursor = t ? 'pointer' : 'grab';
    onHover(t ? (input?.labels[t] ?? null) : null);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => (down = null));
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the desk in view on tall phone screens
    camera.fov = w / h < 0.8 ? 80 : 62;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ---------- the frame loop ----------
  const clock = new THREE.Clock();
  let t = 0;
  let raf = 0;
  let wheelAngle = 0;
  const frameLoop = () => {
    raf = requestAnimationFrame(frameLoop);
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    camera.rotation.set(pitch, yaw, 0);
    const i = input;
    if (i) {
      const v = i.v;
      const anim = v.animate && !i.reducedMotion;
      // the lamp: away from the machine until it is turned toward it
      aim.lerp(v.sheet ? aimAway : aimMachine, Math.min(1, dt * 1.8));
      const head = new THREE.Vector3();
      lampHead.getWorldPosition(head);
      lampLight.position.copy(head).add(new THREE.Vector3(0, -0.03, 0));
      lampLight.target.position.copy(aim);
      lampHead.lookAt(aim);
      lampHead.rotateX(-Math.PI / 2);
      lampFill.position.copy(head).lerp(aim, 0.35);
      let flicker = 1;
      if (v.strain && anim) flicker = Math.sin(t * 31) > 0.93 ? 0.55 : 1;
      if (v.flash) flicker *= 1.35;
      lampLight.intensity = 6 * flicker;
      lampFill.intensity = 0.5 * flicker;

      // the screen
      const cursor = Math.floor(t * 2) % 2 === 0;
      const key = v.screen.join('|') + (cursor ? '_' : '');
      if (key !== screenKey) {
        screenKey = key;
        drawScreen(screenG, v.screen, cursor);
        screenTex.needsUpdate = true;
      }

      // the city, every few story minutes
      if (Math.abs(v.minute - cityMinute) >= 4) {
        cityMinute = v.minute;
        drawCity(cityG, 1024, 512, v.minute);
        cityTex.needsUpdate = true;
        const dawn = Math.max(0, Math.min(1, (v.minute - 300) / 80));
        moon.color.setHSL(0.6 - dawn * 0.5, 0.35, 0.55 + dawn * 0.1);
        moon.intensity = 0.5 + dawn * 0.9;
      }

      // rain, easing towards morning
      const rainAmt = Math.max(0.25, 1 - Math.max(0, v.minute - 240) / 200);
      rainMat.opacity = 0.22 * rainAmt;
      for (let k = 0; k < RAIN; k++) {
        const b = rainBase[k];
        const y = (((b[1] - t * (2.6 + rainSeed[k])) % 3) + 3) % 3;
        rainPos.set([b[0], y, b[2], b[0], y + 0.07, b[2] + 0.004], k * 6);
      }
      rainGeo.attributes.position.needsUpdate = true;

      // the van
      const vanOn = v.van !== null;
      vanLight.intensity += ((vanOn ? 9 : 0) - vanLight.intensity) * Math.min(1, dt * 2);
      (vanGlow.material as THREE.MeshBasicMaterial).opacity = Math.min(1, vanLight.intensity / 9);

      // the machines
      const owns = (id: string) => i.owned.includes(id);
      machine.g.visible = true;
      spring.visible = v.tensioner;
      oil.visible = owns('oil');
      feeder.visible = v.feeder;
      arm2.visible = v.die2;
      pedal.visible = owns('pedal');
      governor.visible = owns('governor');
      rack.visible = v.jig;
      rackMachines.forEach((m, k) => (m.g.visible = k < v.stations));
      const spin = v.running ? Math.min(30, 2 + i.rate * 0.6) * (v.cleanRun ? 1.6 : 1) : 0;
      wheelAngle += spin * dt;
      machine.wheel.rotation.x = wheelAngle;
      machine.arm.rotation.z = v.running ? Math.sin(wheelAngle) * 0.25 : 0;
      arm2.rotation.z = v.running ? Math.sin(wheelAngle + 1.5) * 0.25 : 0;
      fw.rotation.y = wheelAngle * 1.3;
      spool.rotation.z = v.running ? -wheelAngle * 0.15 : spool.rotation.z;
      for (const m of rackMachines) {
        m.wheel.rotation.x = wheelAngle * 1.1;
        m.arm.rotation.z = v.running ? Math.sin(wheelAngle * 1.1) * 0.25 : 0;
      }
      runLight.intensity = v.running ? 0.25 + (v.cleanRun ? 0.6 : 0) : 0;
      (jamLed.material as THREE.MeshBasicMaterial).color.setHex(v.jammed ? (Math.floor(t * 3) % 2 ? 0xff2a1a : 0x401008) : v.running ? 0x40ff70 : 0x0a2a10);

      // the glint along the wire
      const g = v.glint ? 0.5 + 0.5 * Math.sin(t * 8) : 0;
      glintMat.opacity = v.glint ? 0.12 + g * 0.18 : 0;
      glintLight.intensity = v.glint ? 0.4 + g * 0.8 : 0;
      (wireLine.material as THREE.MeshStandardMaterial).emissive.setHex(v.glint ? 0x806a30 : 0x000000);

      // clips in the tray and in the carton
      clipMesh.count = Math.min(CLIPS, i.loose <= 120 ? i.loose : Math.round(120 + Math.sqrt(i.loose - 120) * 12));
      sealed.forEach((c, k) => (c.visible = k < v.cartons));

      // the hand bender's lever
      pressT = Math.min(1, pressT + dt * 6);
      lever.rotation.z = 0.35 - Math.sin(pressT * Math.PI) * 0.45;

      // hover highlight
      for (const o of targets) {
        const on = o.userData.target === hovered;
        o.traverse((m) => {
          const mat = (m as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (mat && 'emissive' in mat && mat !== (wireLine.material as THREE.Material)) mat.emissive.setHex(on ? 0x2a1e10 : 0x000000);
        });
      }
    }
    renderer.render(scene, camera);
  };
  frameLoop();

  return {
    set(next) {
      input = next;
      if (hovered && !next.labels[hovered]) setHover(null);
    },
    press() {
      pressT = 0;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
    },
  };
}
