// Motor del personaje 3D de vita (port de design_handoff_vita_avatar/
// vita-animo-v5.html + three-d-stage.js). Este módulo es el ÚNICO que importa
// `three` y se carga con import() dinámico desde vita-avatar.tsx, así que el
// chunk de three nunca entra al bundle inicial.
//
// Arquitectura: UN solo WebGLRenderer compartido (singleton de módulo, canvas
// fuera del DOM) — los navegadores móviles limitan los contextos WebGL a
// ~8-16 y la app puede mostrar varios avatares a la vez. Cada instancia tiene
// su propia Scene/rig y un <canvas> 2D: por cuadro se renderiza la escena con
// el renderer compartido en una región (viewport+scissor) y se copia con
// drawImage al canvas de la instancia. El loop RAF duerme cuando no hay
// instancias visibles (IntersectionObserver + document.visibilityState + prop
// `activo`).

import {
  ACESFilmicToneMapping,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { obtenerAnalizadorDeVoz } from "@/lib/voz/hablar-cliente";

export type Mood = "alegre" | "triste" | "enojo" | "seguimiento";
const MOODS: Mood[] = ["alegre", "triste", "enojo", "seguimiento"];
export type Mirada = "puntero" | "centro" | "arriba";

export interface Intencion {
  /** Pesos objetivo por mood (suman 1). null = conservar los actuales (speaking). */
  pesos: Record<Mood, number> | null;
  mirada: Mirada;
  /** Multiplicador extra del tamaño de los ojos (escuchando = más grandes). */
  ojosExtra: number;
  /** Velocidad del reloj de animación (pensando = más lento). */
  velocidad: number;
  /** Boca abierta según la amplitud RMS del audio de salida. */
  hablando: boolean;
}

export interface OpcionesInstancia {
  canvas: HTMLCanvasElement;
  size: number;
  interactivo: boolean;
  activo: boolean;
  reducirMovimiento: boolean;
  intencion: Intencion;
  onListo: () => void;
}

export interface Instancia {
  setIntencion: (i: Intencion) => void;
  setTamano: (px: number) => void;
  setActivo: (a: boolean) => void;
  setReducirMovimiento: (r: boolean) => void;
  destruir: () => void;
}

// ---------------------------------------------------------------- geometría
const A = 0.46,
  B = 0.36,
  C = 0.34,
  P = 3.2;
const EYE_X = 0.15,
  EYE_Y = B + 0.05,
  MOUTH_Y = B - 0.065;

const CFG_BOCA: Record<Mood, { arc: number; r: number; frown: boolean }> = {
  alegre: { arc: 1.9, r: 0.06, frown: false },
  triste: { arc: 1.1, r: 0.05, frown: true },
  enojo: { arc: 0.5, r: 0.12, frown: true },
  seguimiento: { arc: 1.2, r: 0.045, frown: false },
};
const MIRADA_L: Record<Mood, number> = { alegre: 1, triste: 0.6, enojo: 0.8, seguimiento: 2.2 };

interface Compartido {
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  bodyGeo: BufferGeometry;
  stemGeo: BufferGeometry;
  leafGeo: BufferGeometry;
  armGeo: BufferGeometry;
  blushGeo: BufferGeometry;
  ballGeo: BufferGeometry;
  sparkGeo: BufferGeometry;
  happyGeo: BufferGeometry;
  bocaGeo: Record<Mood, BufferGeometry>;
  bodyMat: MeshPhysicalMaterial;
  eyeMat: MeshPhysicalMaterial;
  sparkMat: MeshBasicMaterial;
  blushMat: MeshBasicMaterial;
  blushTex: CanvasTexture;
  colores: { hoja: Color; cielo: Color; suelo: Color; principal: Color; relleno: Color; contraluz: Color; brillo: Color };
  buffer: number;
}

let compartido: Compartido | null = null;
let fallo = false;

function token(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}
function colorDeToken(nombre: string): Color {
  const c = new Color();
  const v = token(nombre);
  if (v) c.set(v);
  return c;
}

function crearBodyGeo(): BufferGeometry {
  const g = new SphereGeometry(1, 160, 120);
  g.rotateY(-Math.PI / 2);
  const p = g.attributes.position,
    v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const r = Math.pow(Math.abs(v.x / A) ** P + Math.abs(v.y / B) ** P + Math.abs(v.z / C) ** P, -1 / P);
    p.setXYZ(i, v.x * r, v.y * r + B, v.z * r);
  }
  g.computeVertexNormals();
  return g;
}

function crearCompartido(): Compartido | null {
  if (compartido) return compartido;
  if (fallo) return null;
  try {
    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.setClearAlpha(0);
    renderer.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault());

    const camera = new PerspectiveCamera(30, 1, 0.1, 50);
    // Encuadre fijo: la figura mide ~0.92 x 0.87 (con hoja), apoyada en y=0.
    camera.position.set(0, 0.75, 2.4);
    camera.lookAt(0, 0.45, 0);

    const brillo = colorDeToken("--vita-brillo");
    const bodyMat = new MeshPhysicalMaterial({
      color: colorDeToken("--vita-cuerpo"),
      roughness: 0.7,
      sheen: 0.8,
      sheenRoughness: 0.45,
      sheenColor: brillo,
      clearcoat: 0.15,
      clearcoatRoughness: 0.6,
    });
    const eyeMat = new MeshPhysicalMaterial({
      color: colorDeToken("--vita-ojos"),
      roughness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
    });
    const sparkMat = new MeshBasicMaterial({ color: brillo });

    // Mejilla: máscara radial (alfa 0.8 -> 0) teñida con --vita-blush. Se
    // pinta el color sólido y se recorta con destination-in para no escribir
    // ningún color literal en código.
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    if (g) {
      g.fillStyle = token("--vita-blush");
      g.fillRect(0, 0, 128, 128);
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, token("--vita-ojos"));
      gr.addColorStop(1, "transparent");
      g.globalCompositeOperation = "destination-in";
      g.globalAlpha = 0.8;
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    }
    const blushTex = new CanvasTexture(cv);
    blushTex.colorSpace = SRGBColorSpace;
    const blushMat = new MeshBasicMaterial({ map: blushTex, transparent: true, depthWrite: false, opacity: 0.9 }); // paleta "nube": mejilla más marcada para que se lea sobre el cuerpo claro

    const bocaGeo = {} as Record<Mood, BufferGeometry>;
    for (const m of MOODS) bocaGeo[m] = new TorusGeometry(CFG_BOCA[m].r, 0.011, 12, 48, CFG_BOCA[m].arc);

    compartido = {
      renderer,
      camera,
      bodyGeo: crearBodyGeo(),
      stemGeo: new TubeGeometry(
        new QuadraticBezierCurve3(new Vector3(0, 0, 0), new Vector3(0, 0.06, 0), new Vector3(0.04, 0.09, 0)),
        24,
        0.012,
        12
      ),
      leafGeo: new SphereGeometry(1, 48, 24),
      armGeo: new CapsuleGeometry(0.045, 0.11, 12, 24),
      blushGeo: new PlaneGeometry(0.12, 0.08),
      ballGeo: new SphereGeometry(1, 40, 28),
      sparkGeo: new SphereGeometry(0.011, 16, 12),
      happyGeo: new TorusGeometry(0.046, 0.013, 12, 40, 2.3),
      bocaGeo,
      bodyMat,
      eyeMat,
      sparkMat,
      blushMat,
      blushTex,
      colores: {
        hoja: colorDeToken("--vita-hoja"),
        cielo: colorDeToken("--vita-luz-cielo"),
        suelo: colorDeToken("--vita-luz-suelo"),
        principal: colorDeToken("--vita-luz-principal"),
        relleno: colorDeToken("--vita-luz-relleno"),
        contraluz: colorDeToken("--vita-luz-contraluz"),
        brillo,
      },
      buffer: 0,
    };
    return compartido;
  } catch {
    fallo = true;
    return null;
  }
}

// Coloca una pieza sobre la superficie frontal del superelipsoide, orientada
// según la normal (attach() del prototipo).
function adherir(parent: Group, obj: Group | Mesh, x: number, y: number, inset = 0) {
  const yy = y - B,
    t = Math.max(1 - Math.abs(x / A) ** P - Math.abs(yy / B) ** P, 1e-4),
    z = C * t ** (1 / P);
  const n = new Vector3(
    (Math.sign(x) * Math.abs(x) ** (P - 1)) / A ** P,
    (Math.sign(yy) * Math.abs(yy) ** (P - 1)) / B ** P,
    z ** (P - 1) / C ** P
  ).normalize();
  const pos = new Vector3(x, y, z).addScaledVector(n, -inset);
  obj.position.copy(pos);
  obj.lookAt(pos.clone().add(n));
  parent.add(obj);
}

// -------------------------------------------------------------------- rig
interface Ojo {
  grupo: Group;
  inner: Group;
  happy: Group;
  pill: Group;
  ball: Mesh;
  spark: Mesh;
  flat: Mesh;
  base: Vector3;
}
interface Rig {
  scene: Scene;
  root: Group;
  look: Group;
  pose: Group;
  sprout: Group;
  ojos: Ojo[];
  brazos: Group[];
  bocas: Record<Mood, Group>;
  abierta: Mesh;
  leafMat: MeshPhysicalMaterial;
}

function crearRig(c: Compartido): Rig {
  const scene = new Scene();
  scene.add(new HemisphereLight(c.colores.cielo, c.colores.suelo, 1.35));
  const key = new DirectionalLight(c.colores.principal, 1.6);
  key.position.set(-3, 8, 6);
  const fill = new DirectionalLight(c.colores.relleno, 0.7);
  fill.position.set(5, 2, 5);
  const rim = new DirectionalLight(c.colores.contraluz, 0.9);
  rim.position.set(0, 4, -6);
  scene.add(key, fill, rim);

  const root = new Group();
  const look = new Group();
  const pose = new Group();
  root.add(look);
  look.add(pose);
  scene.add(root);
  pose.add(new Mesh(c.bodyGeo, c.bodyMat));

  const leafMat = new MeshPhysicalMaterial({
    color: c.colores.hoja,
    roughness: 0.6,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: c.colores.brillo,
    emissive: c.colores.hoja,
    emissiveIntensity: 0,
  });
  const sprout = new Group();
  sprout.position.set(-0.04, 2 * B - 0.004, 0);
  const leaf = new Mesh(c.leafGeo, leafMat);
  leaf.scale.set(0.11, 0.022, 0.058);
  leaf.position.set(0.125, 0.115, 0);
  leaf.rotation.z = 0.5;
  sprout.add(new Mesh(c.stemGeo, leafMat), leaf);
  pose.add(sprout);

  for (const s of [-1, 1]) {
    const b = new Mesh(c.blushGeo, c.blushMat);
    b.renderOrder = 2;
    adherir(pose, b, s * 0.25, B - 0.025, -0.003);
  }

  const brazos: Group[] = [];
  for (const s of [-1, 1]) {
    const sh = new Group();
    sh.position.set(s * (A + 0.01), B - 0.04, 0.05);
    const arm = new Mesh(c.armGeo, c.bodyMat);
    arm.position.y = -0.085;
    sh.add(arm);
    sh.rotation.z = s * 0.35;
    pose.add(sh);
    brazos.push(sh);
  }

  const ojos: Ojo[] = [];
  for (const s of [-1, 1]) {
    const grupo = new Group();
    const inner = new Group();
    grupo.add(inner);
    // Los tres tipos de ojo conviven y se mezclan por peso (alegre = arco,
    // triste/seguimiento = óvalo, enojo = óvalo plano) para poder
    // interpolar entre moods sin saltos.
    const happy = new Group();
    const arcMesh = new Mesh(c.happyGeo, c.eyeMat);
    arcMesh.rotation.z = Math.PI / 2 - 2.3 / 2;
    arcMesh.position.y = -0.024;
    happy.add(arcMesh);
    const pill = new Group();
    const ball = new Mesh(c.ballGeo, c.eyeMat);
    const spark = new Mesh(c.sparkGeo, c.sparkMat);
    pill.add(ball, spark);
    const flat = new Mesh(c.ballGeo, c.eyeMat);
    inner.add(happy, pill, flat);
    adherir(pose, grupo, s * EYE_X, EYE_Y, 0.004);
    ojos.push({ grupo, inner, happy, pill, ball, spark, flat, base: grupo.position.clone() });
  }

  const bocas = {} as Record<Mood, Group>;
  for (const m of MOODS) {
    const { r, arc, frown } = CFG_BOCA[m];
    const g = new Group();
    const t = new Mesh(c.bocaGeo[m], c.eyeMat);
    if (frown) {
      t.rotation.z = Math.PI / 2 - arc / 2;
      t.position.y = -r;
    } else {
      t.rotation.z = -Math.PI / 2 - arc / 2;
      t.position.y = r;
    }
    g.add(t);
    bocas[m] = g;
  }
  const mouth = new Group();
  const abierta = new Mesh(c.ballGeo, c.eyeMat);
  abierta.position.y = -0.012;
  mouth.add(bocas.alegre, bocas.triste, bocas.enojo, bocas.seguimiento, abierta);
  adherir(pose, mouth, 0, MOUTH_Y, 0.003);

  return { scene, root, look, pose, sprout, ojos, brazos, bocas, abierta, leafMat };
}

// -------------------------------------------------------------- animación
interface Pose {
  px: number;
  py: number;
  rx: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  sprout: number;
  emis: number;
  brazoL: number;
  brazoR: number;
  brazoFx: number;
  blink: number;
}
const CAMPOS: (keyof Pose)[] = [
  "px", "py", "rx", "rz", "sx", "sy", "sz", "sprout", "emis", "brazoL", "brazoR", "brazoFx", "blink",
];
function poseVacia(): Pose {
  return { px: 0, py: 0, rx: 0, rz: 0, sx: 1, sy: 1, sz: 1, sprout: 0, emis: 0, brazoL: 0.35, brazoR: 0.35, brazoFx: 0, blink: 1 };
}
function reset(p: Pose) {
  Object.assign(p, poseVacia());
}
const parpadeo = (tb: number, ph: number, per: number) => {
  const c = (tb + ph) % per;
  return c < 0.16 ? 1 - Math.sin((c / 0.16) * Math.PI) * 0.9 : 1;
};

const ANIM: Record<Mood, (p: Pose, t: number, tb: number, lx: number) => void> = {
  alegre: (p, t) => {
    const c = t % 2.4,
      hop = c < 0.5 ? Math.sin((c / 0.5) * Math.PI) : 0,
      land = c > 0.5 && c < 0.7 ? Math.sin(((c - 0.5) / 0.2) * Math.PI) : 0;
    p.py = hop * 0.07;
    p.sx = p.sz = 1 + land * 0.05;
    p.sy = 1 + hop * 0.03 - land * 0.06;
    p.rz = Math.sin(t * 2.4) * 0.03;
    p.sprout = Math.sin(t * 5) * 0.18 + hop * 0.2;
    p.emis = 0.25 + hop * 0.4;
    const up = 2.3 + Math.sin(t * 6) * 0.25 + hop * 0.3;
    p.brazoL = p.brazoR = up;
  },
  triste: (p, t, tb) => {
    const s = Math.sin(t * 0.8);
    p.sx = 1 + 0.012 * s;
    p.sy = 0.965 + 0.008 * s;
    p.rx = 0.1;
    p.py = -0.006;
    p.sprout = -0.75 + Math.sin(t * 0.6) * 0.04;
    p.emis = 0;
    p.brazoL = p.brazoR = 0.28;
    p.brazoFx = 0.15;
    p.blink = parpadeo(tb, 0, 3.6);
  },
  enojo: (p, t) => {
    const c = t % 3.2,
      burst = c < 0.45 ? Math.sin((c / 0.45) * Math.PI) : 0;
    p.px = Math.sin(t * 60) * 0.008 * burst;
    const puff = 0.5 + 0.5 * Math.sin(t * 2.6);
    p.sx = p.sz = 1 + 0.02 * puff + burst * 0.03;
    p.sy = 1 - 0.01 * puff;
    p.sz = 1 + 0.02 * puff;
    p.sprout = 0.55 + Math.sin(t * 40) * 0.04 * (0.3 + burst);
    p.emis = 0.1 + burst * 0.3;
    const ak = 0.75 + burst * 0.25 + Math.sin(t * 40) * 0.03 * burst;
    p.brazoL = p.brazoR = ak;
    p.brazoFx = -0.55;
  },
  seguimiento: (p, t, tb, lx) => {
    const s = Math.sin(t * 1.3);
    p.sx = p.sz = 1 - 0.006 * s;
    p.sy = 1 + 0.014 * s;
    p.sprout = Math.sin(t * 0.9) * 0.06 + lx * 0.15;
    p.emis = 0.15;
    const pt = MathUtils.clamp(lx, -1, 1);
    p.brazoL = 0.35 + Math.max(0, -pt) * 1.2;
    p.brazoR = 0.35 + Math.max(0, pt) * 1.2;
    p.blink = parpadeo(tb, 1.4, 4.6);
  },
};

// ---------------------------------------------------------------- puntero
const ptr = { x: 0, y: 0, at: -1e9 };
let escuchandoPuntero = false;
function alMoverPuntero(e: PointerEvent) {
  ptr.x = e.clientX;
  ptr.y = e.clientY;
  ptr.at = performance.now();
}

// ---------------------------------------------------------------- loop
interface Interno {
  op: OpcionesInstancia;
  rig: Rig;
  ctx: CanvasRenderingContext2D;
  io: IntersectionObserver;
  visible: boolean;
  ocultoCss: boolean;
  chequeoCss: number;
  activo: boolean;
  reducir: boolean;
  intencion: Intencion;
  pesosObj: Record<Mood, number>;
  pesos: Record<Mood, number>;
  pw: number;
  ultimoPaso: number;
  ultimoDibujo: number;
  intervalo: number;
  tAnim: number;
  tBlink: number;
  dibujado: boolean;
  lx: { v: number; d: number };
  ly: { v: number; d: number };
  gr: { v: number; d: number };
  sq: { v: number; d: number };
  hover: boolean;
  wave: number;
  hop: number;
  blinkNow: number;
  entradaEn: number;
  taps: number[];
  enojoHasta: number;
  abierta: number;
  poses: Record<Mood, Pose>;
  acc: Pose;
}

const instancias = new Set<Interno>();
let raf = 0;

const spring = (s: { v: number; d: number }, target: number, k: number, c: number, dt: number) => {
  s.d += (-k * (s.v - target) - c * s.d) * dt;
  s.v += s.d * dt;
};

function trabajable(i: Interno): boolean {
  return i.visible && i.activo;
}
function despertar() {
  if (raf || typeof document === "undefined" || document.visibilityState !== "visible") return;
  for (const i of instancias) {
    if (trabajable(i)) {
      raf = requestAnimationFrame(bucle);
      return;
    }
  }
}

function bucle(now: number) {
  raf = 0;
  if (document.visibilityState !== "visible") return;
  let hay = false;
  for (const i of instancias) {
    if (!trabajable(i)) continue;
    hay = true;
    if (now - i.chequeoCss > 500) {
      i.chequeoCss = now;
      // El overlay del chat sigue montado cerrado (invisible/inert): sin esto
      // seguiría renderizando fuera de pantalla.
      const el = i.op.canvas;
      i.ocultoCss = typeof el.checkVisibility === "function" ? !el.checkVisibility({ visibilityProperty: true }) : false;
    }
    if (i.ocultoCss) continue;
    if (now - i.ultimoDibujo < i.intervalo - 3) continue;
    const dt = Math.min((now - i.ultimoPaso) / 1000, i.op.interactivo ? 0.05 : 0.1);
    i.ultimoPaso = now;
    i.ultimoDibujo = now;
    paso(i, now, dt);
    dibujar(i);
  }
  if (hay) raf = requestAnimationFrame(bucle);
}

function paso(i: Interno, now: number, dt: number) {
  const { rig, op, intencion } = i;
  const reducir = i.reducir;
  const interactivo = op.interactivo && !reducir;

  // Reloj de animación (velocidad variable) y reloj de parpadeo (real).
  i.tAnim += dt * intencion.velocidad;
  i.tBlink += dt;
  const tm = reducir ? 0 : i.tAnim;
  const tb = i.tBlink;

  // Mood efectivo: toques repetidos -> enojo (~3 s), si no, el pedido.
  const enojando = now < i.enojoHasta;
  const objetivo = enojando ? ENOJO : (i.pesosObj);
  const kMood = 1 - Math.exp(-dt / 0.09); // ~95% en 270 ms
  let suma = 0;
  for (const m of MOODS) {
    i.pesos[m] += (objetivo[m] - i.pesos[m]) * kMood;
    suma += i.pesos[m];
  }
  if (suma <= 0) suma = 1;

  // Mirada objetivo.
  const r = op.canvas.getBoundingClientRect();
  let nx = 0,
    ny = 0;
  const sinPuntero = !interactivo || now - ptr.at > 2500;
  if (!reducir) {
    if (intencion.mirada === "centro") {
      nx = 0;
      ny = 0.1;
    } else if (intencion.mirada === "arriba") {
      nx = Math.sin(tm * 0.5) * 0.5 + 0.2;
      ny = -0.5;
    } else if (!sinPuntero && r.width > 0) {
      nx = MathUtils.clamp((ptr.x - (r.left + r.width / 2)) / (r.width * 1.1), -1, 1);
      ny = MathUtils.clamp((ptr.y - (r.top + r.height * 0.45)) / (r.height * 1.1), -1, 1);
    }
    if (intencion.mirada === "puntero" && sinPuntero) {
      const w = i.pesos.seguimiento / suma;
      nx += (Math.sin(tm * 0.7) * 0.8 - nx) * w;
      ny += (Math.sin(tm * 1.1) * 0.35 - ny) * w;
    }
    ny += (Math.max(ny, 0.35) - ny) * (i.pesos.triste / suma);
  }
  spring(i.lx, nx, 60, 12, dt);
  spring(i.ly, ny, 60, 12, dt);

  // Pose: suma ponderada de las poses de cada mood.
  const acc = i.acc;
  for (const k of CAMPOS) acc[k] = 0;
  for (const m of MOODS) {
    const w = i.pesos[m] / suma;
    if (w < 0.002) continue;
    const p = i.poses[m];
    reset(p);
    ANIM[m](p, tm, tb, i.lx.v);
    for (const k of CAMPOS) acc[k] += p[k] * w;
  }
  if (reducir) {
    // Solo respiración y parpadeo.
    const s = Math.sin(tb * 1.3);
    acc.px = acc.rx = acc.rz = 0;
    acc.sx = acc.sz = 1 - 0.006 * s;
    acc.sy = 1 + 0.014 * s;
  }
  rig.pose.position.set(acc.px, acc.py, 0);
  rig.pose.rotation.set(acc.rx, 0, acc.rz);
  rig.pose.scale.set(acc.sx, acc.sy, acc.sz);
  rig.sprout.rotation.set(0, 0, acc.sprout);
  rig.leafMat.emissiveIntensity = acc.emis;
  rig.brazos[0].rotation.set(acc.brazoFx, 0, -acc.brazoL);
  rig.brazos[1].rotation.set(acc.brazoFx, 0, acc.brazoR);

  // Mirada -> rotación del cuerpo y desplazamiento de ojos.
  let L = 0;
  for (const m of MOODS) L += (i.pesos[m] / suma) * MIRADA_L[m];
  rig.look.rotation.y = i.lx.v * 0.18 * L;
  rig.look.rotation.x = i.ly.v * 0.1 * L;

  // Hover / parpadeo de toque / aplaste.
  spring(i.gr, i.hover && interactivo ? 1.15 : 1, 180, 14, dt);
  let kBlink = acc.blink;
  if (i.blinkNow > 0) {
    i.blinkNow -= dt;
    kBlink *= 1 - Math.sin((1 - i.blinkNow / 0.16) * Math.PI) * 0.9;
  }
  const escala = i.gr.v * intencion.ojosExtra;

  // Ojos: pesos por tipo.
  const w = (m: Mood) => i.pesos[m] / suma;
  const wHappy = w("alegre"),
    wPill = w("triste") + w("seguimiento"),
    wFlat = w("enojo");
  const sy = wPill > 0.001 ? (w("triste") * 0.78 + w("seguimiento") * 1.12) / wPill : 1;
  const tilt = w("triste") * -0.32 + w("enojo") * 0.42;
  const dy = w("triste") * -0.012;
  rig.ojos.forEach((o, idx) => {
    const s = idx === 0 ? -1 : 1;
    o.grupo.scale.set(escala, kBlink * escala, 1);
    o.grupo.position.set(
      o.base.x + i.lx.v * 0.014 * L,
      o.base.y + dy - i.ly.v * 0.012 * L,
      o.base.z
    );
    o.inner.rotation.z = s * tilt;
    o.happy.visible = wHappy > 0.02;
    o.happy.scale.setScalar(Math.max(wHappy, 0.001));
    o.pill.visible = wPill > 0.02;
    const pw = Math.max(wPill, 0.001);
    o.ball.scale.set(0.042 * pw, 0.062 * sy * pw, 0.022 * pw);
    o.spark.position.set(0.014 * pw, 0.026 * sy * pw, 0.021);
    o.spark.scale.setScalar(pw);
    o.flat.visible = wFlat > 0.02;
    o.flat.scale.set(0.05 * wFlat, 0.02 * wFlat, 0.022 * wFlat);
  });

  // Boca: arcos por mood + elipse abierta con el RMS del audio de salida.
  let objetivoAbierta = 0;
  if (intencion.hablando) {
    const an = obtenerAnalizadorDeVoz();
    if (an) {
      if (bufferVoz.length !== an.fftSize) bufferVoz = new Uint8Array(an.fftSize);
      const datos = bufferVoz;
      an.getByteTimeDomainData(datos);
      let sum = 0;
      for (let k = 0; k < datos.length; k++) {
        const n = (datos[k] - 128) / 128;
        sum += n * n;
      }
      objetivoAbierta = MathUtils.clamp((Math.sqrt(sum / datos.length) - 0.02) / 0.15, 0, 1);
    }
  }
  i.abierta += (objetivoAbierta - i.abierta) * (1 - Math.exp(-dt * 25));
  const ab = i.abierta;
  for (const m of MOODS) {
    const g = rig.bocas[m];
    const ww = w(m) * (1 - 0.9 * ab);
    g.visible = ww > 0.02;
    g.scale.setScalar(Math.max(ww, 0.001));
  }
  rig.abierta.visible = ab > 0.04;
  rig.abierta.scale.set(0.03 + 0.014 * ab, 0.004 + 0.036 * ab, 0.012);

  // Aplaste (resorte), saltito de entrada y saludo.
  rig.root.scale.set(1, 1, 1);
  rig.root.position.y = 0;
  if (interactivo) {
    spring(i.sq, 0, 220, 11, dt);
    const s = MathUtils.clamp(i.sq.v, -0.25, 0.25);
    rig.root.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    if (i.entradaEn > 0 && now >= i.entradaEn) {
      i.entradaEn = 0;
      i.hop = 1;
      i.wave = 1;
    }
    if (i.hop > 0) {
      i.hop = Math.max(0, i.hop - dt * 1.6);
      const p = 1 - i.hop;
      rig.root.position.y = Math.sin(Math.min(p * 2, 1) * Math.PI) * 0.06;
      if (i.hop === 0) i.sq.d -= 2.5;
    }
    if (i.wave > 0) {
      const a = rig.brazos[1];
      const wv = 2.4 + Math.sin((1 - i.wave) * Math.PI * 8) * 0.4;
      a.rotation.z = MathUtils.lerp(a.rotation.z, wv, Math.min(1, i.wave * 1.5));
      i.wave = Math.max(0, i.wave - dt * 0.8);
      rig.sprout.rotation.z += Math.sin((1 - i.wave) * Math.PI * 6) * 0.35 * i.wave;
      rig.leafMat.emissiveIntensity += 0.4 * i.wave;
    }
  }
}

let bufferVoz: Uint8Array<ArrayBuffer> = new Uint8Array(0);
const ENOJO: Record<Mood, number> = { alegre: 0, triste: 0, enojo: 1, seguimiento: 0 };

function dibujar(i: Interno) {
  const c = compartido;
  if (!c) return;
  const { renderer, camera } = c;
  const w = i.pw;
  if (c.buffer < w) {
    c.buffer = w;
    renderer.setSize(w, w, false);
  }
  renderer.setViewport(0, 0, w, w);
  renderer.setScissor(0, 0, w, w);
  renderer.setScissorTest(true);
  renderer.render(i.rig.scene, camera);
  i.ctx.clearRect(0, 0, w, w);
  i.ctx.drawImage(renderer.domElement, 0, c.buffer - w, w, w, 0, 0, w, w);
  if (!i.dibujado) {
    i.dibujado = true;
    i.op.onListo();
  }
}

function pxDeTamano(size: number): number {
  return Math.max(16, Math.round(size * Math.min(window.devicePixelRatio || 1, 2)));
}

function alCambiarVisibilidad() {
  if (document.visibilityState === "visible") despertar();
}

export function crearInstancia(op: OpcionesInstancia): Instancia | null {
  const c = crearCompartido();
  if (!c) return null;
  const ctx = op.canvas.getContext("2d");
  if (!ctx) return null;

  const rig = crearRig(c);
  const tramo = op.interactivo ? 1000 / 60 : 100;
  const i: Interno = {
    op,
    rig,
    ctx,
    io: new IntersectionObserver((es) => {
      i.visible = es[es.length - 1]?.isIntersecting ?? false;
      if (i.visible) despertar();
    }),
    visible: false,
    ocultoCss: false,
    chequeoCss: 0,
    activo: op.activo,
    reducir: op.reducirMovimiento,
    intencion: op.intencion,
    pesosObj: { alegre: 0, triste: 0, enojo: 0, seguimiento: 1 },
    pesos: { alegre: 0, triste: 0, enojo: 0, seguimiento: 1 },
    pw: pxDeTamano(op.size),
    ultimoPaso: performance.now(),
    ultimoDibujo: 0,
    intervalo: op.reducirMovimiento ? 1000 / 30 : tramo,
    tAnim: 0,
    tBlink: 0,
    dibujado: false,
    lx: { v: 0, d: 0 },
    ly: { v: 0, d: 0 },
    gr: { v: 1, d: 0 },
    sq: { v: 0, d: 0 },
    hover: false,
    wave: 0,
    hop: 0,
    blinkNow: 0,
    entradaEn: op.interactivo ? performance.now() + 450 : 0,
    taps: [],
    enojoHasta: 0,
    abierta: 0,
    poses: { alegre: poseVacia(), triste: poseVacia(), enojo: poseVacia(), seguimiento: poseVacia() },
    acc: poseVacia(),
  };
  aplicarIntencion(i, op.intencion);
  op.canvas.width = op.canvas.height = i.pw;

  // Interacciones (solo avatares interactivos).
  let down: [number, number] | null = null;
  const onEnter = () => (i.hover = true);
  const onLeave = () => (i.hover = false);
  const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
  const onUp = (e: PointerEvent) => {
    if (!down || i.reducir) return;
    if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) {
      i.sq.d -= 4.5;
      i.wave = 1;
      i.blinkNow = 0.16;
      const now = performance.now();
      i.taps = i.taps.filter((t) => now - t < 2000);
      i.taps.push(now);
      if (i.taps.length >= 4) {
        i.enojoHasta = now + 3000;
        i.taps = [];
      }
    }
    down = null;
  };
  if (op.interactivo) {
    op.canvas.addEventListener("pointerenter", onEnter);
    op.canvas.addEventListener("pointerleave", onLeave);
    op.canvas.addEventListener("pointerdown", onDown);
    op.canvas.addEventListener("pointerup", onUp);
  }

  if (!escuchandoPuntero) {
    escuchandoPuntero = true;
    window.addEventListener("pointermove", alMoverPuntero, { passive: true });
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
  }
  instancias.add(i);
  i.io.observe(op.canvas);
  despertar();

  return {
    setIntencion: (n) => aplicarIntencion(i, n),
    setTamano: (px) => {
      const pw = pxDeTamano(px);
      if (pw !== i.pw) {
        i.pw = pw;
        op.canvas.width = op.canvas.height = pw;
        if (i.dibujado) dibujar(i);
      }
    },
    setActivo: (a) => {
      i.activo = a;
      if (a) despertar();
    },
    setReducirMovimiento: (r) => {
      i.reducir = r;
      i.intervalo = r ? 1000 / 30 : tramo;
    },
    destruir: () => {
      i.io.disconnect();
      instancias.delete(i);
      op.canvas.removeEventListener("pointerenter", onEnter);
      op.canvas.removeEventListener("pointerleave", onLeave);
      op.canvas.removeEventListener("pointerdown", onDown);
      op.canvas.removeEventListener("pointerup", onUp);
      rig.leafMat.dispose();
      if (instancias.size === 0 && escuchandoPuntero) {
        escuchandoPuntero = false;
        window.removeEventListener("pointermove", alMoverPuntero);
        document.removeEventListener("visibilitychange", alCambiarVisibilidad);
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}

function aplicarIntencion(i: Interno, n: Intencion) {
  i.intencion = n;
  if (n.pesos) i.pesosObj = n.pesos;
}
