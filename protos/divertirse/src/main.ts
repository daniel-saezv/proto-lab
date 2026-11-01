import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PointLight,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  FRIEND_IDS,
  ROSTER,
  TUNE,
  canSend,
  createState,
  restart,
  sendFriend,
  start,
  step,
  yawnPhase,
  type FriendId,
  type PartyEvent,
  type State,
} from "./sim";

type Actor = {
  group: Group;
  head: Mesh;
  leftArm: Group;
  rightArm: Group;
  ringMat: MeshBasicMaterial;
  bodyMat: MeshStandardMaterial;
};

type Bit = { mesh: Mesh; velocity: Vector3; life: number };

const KEYS: Record<string, FriendId> = {
  Digit1: "mira",
  Digit2: "teo",
  Digit3: "nia",
  Numpad1: "mira",
  Numpad2: "teo",
  Numpad3: "nia",
};

const EVENT_TEXT: Record<Exclude<PartyEvent, "none">, string> = {
  grab: "Lo tienen sujeto.",
  handoff: "¡Relevo!",
  tired: "Se soltó. Manda a otro.",
  uncharged: "Le falta ánimo: que baile un poco.",
  left: "Gamu cruzó la puerta.",
  hour: "La noche sigue. Gamu respira.",
};

const HINT = "Toca a un amigo que brille. Releva antes de que se apague.";

declare global {
  interface Window {
    __divertirse?: {
      start(): void;
      retry(): void;
      send(id: FriendId): string;
      phase(): State["phase"];
      score(): number;
      sleep(): number;
      time(): number;
  gamu(): { x: number; z: number };
  point(id: FriendId | "gamu"): { x: number; y: number } | null;
};
  }
}

function must<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Falta ${selector}`);
  return node;
}

function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function textTexture(label: string, color: string, size: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(label, 128, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function posterTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  ctx.fillStyle = "#2a1438";
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = "#ffd23f";
  ctx.font = "800 48px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FIESTA", 128, 78);
  ctx.fillStyle = "#ff5d8f";
  ctx.beginPath();
  ctx.arc(128, 176, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff6ea";
  ctx.font = "800 32px system-ui, sans-serif";
  ctx.fillText("quédate", 128, 276);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function solid(geometry: BoxGeometry | SphereGeometry | CylinderGeometry | CapsuleGeometry | CircleGeometry | PlaneGeometry | IcosahedronGeometry, color: number, roughness = 0.8, emissive = 0, intensity = 0): Mesh {
  return new Mesh(
    geometry,
    new MeshStandardMaterial({ color, roughness, metalness: 0.05, emissive, emissiveIntensity: intensity }),
  );
}

function flat(geometry: CircleGeometry | RingGeometry | PlaneGeometry, color: number, opacity = 1): Mesh {
  return new Mesh(
    geometry,
    new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false, depthWrite: false }),
  );
}

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;
const stage = must<HTMLElement>("#stage");
const roster = must<HTMLElement>("#roster");
const intro = must<HTMLElement>("#intro");
const again = must<HTMLElement>("#again");
const startButton = must<HTMLButtonElement>("#start");
const retryButton = must<HTMLButtonElement>("#retry");
const statusNode = must<HTMLElement>("#status");
const scoreNode = must<HTMLElement>("#score");
const clockNode = must<HTMLElement>("#clock");
const sleepMeter = must<HTMLElement>("#sleep");
const sleepFill = must<HTMLElement>("#sleep span");
const overScore = must<HTMLElement>("#over-score");
const webglError = must<HTMLElement>("#webgl-error");

let state = createState();
let best = 0;
let visual = 0;
let lastFrame = performance.now();
let lastSeq = 0;
let toastUntil = 0;
let toast = "";
let showedOver = false;
let lastStatus = "";
let audio: AudioContext | null = null;

function buzz(pattern: number | number[]): void {
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return;
  try {
    vibrate(pattern);
  } catch {
    // el iframe puede no permitir vibración
  }
}

function tone(freq: number, duration: number, gainValue = 0.045): void {
  try {
    if (!audio) audio = new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + duration);
  } catch {
    audio = null;
  }
}

function feedback(event: PartyEvent): void {
  if (event === "grab") {
    buzz(12);
    tone(520, 0.12);
  } else if (event === "handoff") {
    buzz([10, 28, 16]);
    tone(640, 0.08);
    tone(880, 0.14, 0.04);
  } else if (event === "tired") {
    buzz(18);
    tone(220, 0.12, 0.03);
  } else if (event === "uncharged") {
    buzz(8);
    tone(160, 0.08, 0.03);
  } else if (event === "left") {
    buzz([28, 40, 36]);
    tone(130, 0.28, 0.05);
  } else if (event === "hour") {
    tone(740, 0.16, 0.04);
  }
}

function note(next: State, now: number): void {
  if (next.eventSeq === lastSeq || next.event === "none") return;
  lastSeq = next.eventSeq;
  toast = EVENT_TEXT[next.event];
  toastUntil = now + 1500;
  feedback(next.event);
}

function begin(): void {
  if (state.phase === "ready") state = start(state);
  intro.hidden = true;
  stage.focus();
  tone(440, 0.08, 0.03);
}

function againNight(): void {
  state = restart();
  lastSeq = state.eventSeq;
  showedOver = false;
  again.hidden = true;
  toast = "";
  stage.focus();
}

function roleLabel(id: FriendId): string {
  const friend = state.friends.find((item) => item.id === id);
  if (!friend) return "";
  if (friend.role === "hold") return "lo sujeta";
  if (friend.role === "chase") return "va hacia él";
  if (friend.role === "return") return "vuelve";
  if (canSend(friend)) return id === "teo" ? "listo" : "lista";
  return "baila";
}

const buttons = new Map<FriendId, { root: HTMLButtonElement; meter: HTMLElement; label: HTMLElement }>();
for (const id of FRIEND_IDS) {
  const spec = ROSTER[id];
  const button = document.createElement("button");
  button.type = "button";
  button.className = "friend";
  button.dataset.testid = `send-${id}`;
  button.style.background = spec.color;
  const name = document.createElement("span");
  name.textContent = spec.name;
  const detail = document.createElement("small");
  const meter = document.createElement("span");
  meter.className = "meter";
  const bar = document.createElement("span");
  meter.append(bar);
  button.append(name, detail, meter);
  button.addEventListener("click", () => {
    if (state.phase !== "play") return;
    state = sendFriend(state, id, state.gamuX, state.gamuZ);
    note(state, performance.now());
  });
  roster.append(button);
  buttons.set(id, { root: button, meter: bar, label: detail });
}

startButton.addEventListener("click", begin);
retryButton.addEventListener("click", againNight);

let renderer: WebGLRenderer;
try {
  renderer = new WebGLRenderer({
    antialias: !coarse,
    alpha: false,
    powerPreference: coarse ? "low-power" : "high-performance",
  });
} catch {
  webglError.hidden = false;
  intro.hidden = true;
  throw new Error("webgl");
}

renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
renderer.setClearColor(0x140c18);
renderer.domElement.dataset.testid = "playfield";
stage.append(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0x140c18);
scene.fog = new Fog(0x140c18, 18, 36);
const camera = new PerspectiveCamera(46, 1, 0.1, 80);

scene.add(new HemisphereLight(0xffe4cc, 0x2a1844, 0.95));
const sun = new PointLight(0xfff0d4, 16, 30, 2);
sun.position.set(3.2, 8.5, 4.2);
scene.add(sun);
const danceLight = new PointLight(0xff4d8d, 7, 9, 2);
danceLight.position.set(TUNE.floorX, 1.7, TUNE.floorZ);
scene.add(danceLight);
const doorLight = new PointLight(0x78b0ff, 7, 9, 2);
doorLight.position.set(0, 1.8, TUNE.doorZ - 0.15);
scene.add(doorLight);
const partyLights = [0xff5d8f, 0x7af0ff, 0xffd23f].map((color) => {
  const light = new PointLight(color, 2.2, 6.5, 2);
  scene.add(light);
  return light;
});

function box(width: number, height: number, depth: number, x: number, y: number, z: number, color: number, emissive = 0, intensity = 0): Mesh {
  const mesh = solid(new BoxGeometry(width, height, depth), color, 0.9, emissive, intensity);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

const ground = solid(new BoxGeometry(11.4, 0.24, 13.4), 0x5a3a2c, 0.95);
ground.position.set(0, -0.12, -0.7);
scene.add(ground);
layCircle(new CircleGeometry(TUNE.floorRadius, 40), 0x3a214c, TUNE.floorX, TUNE.floorZ, 0.02);
const rug = flat(new CircleGeometry(TUNE.floorRadius + 0.18, 40), 0xff4d8d, 0.18);
rug.rotation.x = -Math.PI / 2;
rug.position.set(TUNE.floorX, 0.025, TUNE.floorZ);
scene.add(rug);
const threshold = flat(new PlaneGeometry(TUNE.doorHalf * 2, 0.28), 0x8eb6ff, 0.9);
threshold.rotation.x = -Math.PI / 2;
threshold.position.set(0, 0.03, TUNE.doorZ);
scene.add(threshold);

box(0.28, 2.5, 12.6, -5.55, 1.25, -0.7, 0x2a1d36);
box(0.28, 2.5, 12.6, 5.55, 1.25, -0.7, 0x2a1d36);
box(4.15, 2.5, 0.28, -3.4, 1.25, -6.95, 0x2a1d36);
box(4.15, 2.5, 0.28, 3.4, 1.25, -6.95, 0x2a1d36);
box(0.18, 2.5, 0.18, -1.25, 1.25, -6.95, 0xc8a16a);
box(0.18, 2.5, 0.18, 1.25, 1.25, -6.95, 0xc8a16a);
box(2.7, 0.22, 0.18, 0, 2.4, -6.95, 0xc8a16a);
const night = solid(new PlaneGeometry(2.2, 2.2), 0x10182e, 0.4, 0x24366e, 0.5);
night.position.set(0, 1.35, -7.2);
scene.add(night);
const moon = solid(new SphereGeometry(0.28, 16, 12), 0xfff1c2, 0.45, 0xffe7a8, 0.8);
moon.position.set(0.55, 1.85, -7.55);
scene.add(moon);
const casa = labelSprite("CASA", "#d5e6ff", 1.5, 0.4);
casa.position.set(0, 2.15, TUNE.doorZ - 0.15);
scene.add(casa);

const poster = new Mesh(
  new PlaneGeometry(1.15, 1.45),
  new MeshBasicMaterial({ map: posterTexture(), toneMapped: false }),
);
poster.position.set(-5.38, 1.55, 0.4);
poster.rotation.y = Math.PI / 2;
scene.add(poster);

box(0.5, 0.62, 0.38, -3.55, 0.31, TUNE.floorZ - 0.2, 0x1b1224, 0xff4d8d, 0.35);
box(0.5, 0.62, 0.38, 3.55, 0.31, TUNE.floorZ - 0.2, 0x1b1224, 0x7af0ff, 0.28);
box(1.3, 0.42, 0.7, -3.9, 0.28, 0.2, 0x6b422c);
box(0.16, 0.16, 0.16, -4.15, 0.56, 0.05, 0xfff6ea);
box(0.16, 0.16, 0.16, -3.7, 0.56, 0.28, 0xff5d8f);
const pole = solid(new CylinderGeometry(0.05, 0.05, 1.3, 8), 0xd7c4a4, 0.5);
pole.position.set(2.15, 0.65, -5.7);
scene.add(pole);
box(0.42, 0.55, 0.16, 2.15, 1.05, -5.7, 0x3e4d78);

const cord = solid(new CylinderGeometry(0.015, 0.015, 0.9, 6), 0xb9b4c9, 0.45);
cord.position.set(0, 2.85, TUNE.floorZ);
scene.add(cord);
const ball = solid(new IcosahedronGeometry(0.22, 1), 0xf4f7ff, 0.16, 0xffffff, 0.35);
ball.position.set(0, 2.28, TUNE.floorZ);
scene.add(ball);

for (const id of FRIEND_IDS) {
  const spec = ROSTER[id];
  const pad = flat(new CircleGeometry(0.34, 20), hex(spec.color), 0.35);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(spec.homeX, 0.028, spec.homeZ);
  scene.add(pad);
}

for (let index = 0; index < 8; index += 1) {
  const bulb = solid(new SphereGeometry(0.07, 8, 8), index % 2 === 0 ? 0xffd23f : 0xff5d8f, 0.4, 0xfff1c9, 0.7);
  const side = index < 4 ? -5.2 : 5.2;
  const along = -5.2 + (index % 4) * 2.5;
  bulb.position.set(side, 2.25, along);
  scene.add(bulb);
}

function layCircle(geometry: CircleGeometry, color: number, x: number, z: number, y: number): void {
  const mesh = solid(geometry, color, 0.62, 0xff4d8d, 0.22);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  scene.add(mesh);
}

function labelSprite(text: string, color: string, width: number, height: number): Sprite {
  const material = new SpriteMaterial({
    map: textTexture(text, color, text.length > 3 ? 42 : 64),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(width, height, 1);
  return sprite;
}

function makeActor(color: number, name: string, kind: FriendId | "gamu"): Actor {
  const group = new Group();
  const bodyMat = new MeshStandardMaterial({
    color,
    roughness: 0.5,
    metalness: 0.04,
    emissive: color,
    emissiveIntensity: 0.08,
  });
  const body = new Mesh(new CapsuleGeometry(0.3, 0.42, 4, 10), bodyMat);
  body.position.y = 0.62;
  const head = new Mesh(new SphereGeometry(0.28, 16, 12), bodyMat);
  head.position.y = 1.18;
  const eyeMat = new MeshStandardMaterial({ color: kind === "gamu" ? 0x241833 : 0x1a1220, roughness: 0.35 });
  const leftEye = new Mesh(new SphereGeometry(0.055, 8, 8), eyeMat);
  const rightEye = new Mesh(new SphereGeometry(0.055, 8, 8), eyeMat);
  leftEye.position.set(-0.1, 1.2, 0.22);
  rightEye.position.set(0.1, 1.2, 0.22);
  if (kind === "gamu") {
    leftEye.scale.y = 0.45;
    rightEye.scale.y = 0.45;
  }
  const armGeo = new CapsuleGeometry(0.07, 0.26, 3, 6);
  const leftArm = new Group();
  const rightArm = new Group();
  leftArm.position.set(-0.36, 0.92, 0);
  rightArm.position.set(0.36, 0.92, 0);
  const leftMesh = new Mesh(armGeo, bodyMat);
  const rightMesh = new Mesh(armGeo, bodyMat);
  leftMesh.position.y = -0.22;
  rightMesh.position.y = -0.22;
  leftArm.add(leftMesh);
  rightArm.add(rightMesh);
  const blob = flat(new CircleGeometry(0.38, 16), 0x000000, 0.28);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  const ringMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  const ring = new Mesh(new RingGeometry(0.42, 0.55, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.035;
  const nameTag = labelSprite(name, "#fff6ea", 1.35, 0.36);
  nameTag.position.y = 1.78;
  addHair(group, kind);
  group.add(blob, ring, body, head, leftEye, rightEye, leftArm, rightArm, nameTag);
  scene.add(group);
  return { group, head, leftArm, rightArm, ringMat, bodyMat };
}

function addHair(group: Group, kind: FriendId | "gamu"): void {
  if (kind === "mira") {
    const bun = solid(new SphereGeometry(0.16, 10, 8), 0x9a2454, 0.55);
    bun.position.set(0.02, 1.44, -0.04);
    group.add(bun);
  } else if (kind === "teo") {
    const cap = solid(new CylinderGeometry(0.3, 0.3, 0.12, 12), 0x176c99, 0.5);
    cap.position.set(0, 1.42, 0);
    group.add(cap);
  } else if (kind === "nia") {
    const left = solid(new SphereGeometry(0.12, 10, 8), 0xc49212, 0.5);
    const right = solid(new SphereGeometry(0.12, 10, 8), 0xc49212, 0.5);
    left.position.set(-0.2, 1.32, -0.02);
    right.position.set(0.2, 1.32, -0.02);
    group.add(left, right);
  } else {
    const hood = solid(new SphereGeometry(0.34, 14, 12), 0x5d4d86, 0.62);
    hood.position.set(0, 1.2, -0.06);
    hood.scale.set(1, 1.05, 0.95);
    group.add(hood);
  }
}

const actors = new Map<FriendId, Actor>();
for (const id of FRIEND_IDS) {
  actors.set(id, makeActor(hex(ROSTER[id].color), ROSTER[id].name, id));
}
const gamu = makeActor(0xc9b6f0, "Gamu", "gamu");

const zTexture = textTexture("Z", "#ddd4ff", 72);
const zees = [0, 1, 2].map((index) => {
  const sprite = new Sprite(new SpriteMaterial({ map: zTexture, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.9 }));
  sprite.scale.set(0.34, 0.28, 1);
  sprite.userData.index = index;
  gamu.group.add(sprite);
  return sprite;
});

const confetti: Bit[] = [];
const confettiColors = [0xff5d8f, 0x3ec6ff, 0xffd23f, 0xfff6ea];
for (let index = 0; index < 14; index += 1) {
  const mesh = new Mesh(
    new BoxGeometry(0.08, 0.08, 0.08),
    new MeshBasicMaterial({ color: confettiColors[index % confettiColors.length], toneMapped: false }),
  );
  mesh.visible = false;
  scene.add(mesh);
  confetti.push({ mesh, velocity: new Vector3(), life: 0 });
}

const linePositions = new Float32Array(6);
const lineGeo = new BufferGeometry();
lineGeo.setAttribute("position", new BufferAttribute(linePositions, 3));
const dragLine = new Line(lineGeo, new LineBasicMaterial({ color: 0xfff6ea, transparent: true, opacity: 0.85 }));
dragLine.frustumCulled = false;
dragLine.visible = false;
scene.add(dragLine);

const raycaster = new Raycaster();
const pointer = new Vector2();
const floorPlane = new Plane(new Vector3(0, 1, 0), 0);
const hitPoint = new Vector3();

function resize(): void {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (width < 2 || height < 2) return;
  const aspect = width / height;
  camera.aspect = aspect;
  if (aspect < 0.85) {
    camera.fov = 52;
    camera.position.set(5.6, 13.4, 10.4);
  } else if (aspect < 1.2) {
    camera.fov = 44;
    camera.position.set(6.4, 11.6, 9.2);
  } else {
    camera.fov = 36;
    camera.position.set(7.2, 10.4, 8.4);
  }
  camera.lookAt(0, 0.2, -1.15);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, true);
}

function floorAt(clientX: number, clientY: number): { x: number; z: number } | null {
  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.ray.intersectPlane(floorPlane, hitPoint);
  if (!hit) return null;
  return { x: hitPoint.x, z: hitPoint.z };
}

function nearestFriend(x: number, z: number): FriendId | null {
  let best: FriendId | null = null;
  let bestDist = 1.3;
  for (const friend of state.friends) {
    const dist = Math.hypot(friend.x - x, friend.z - z);
    if (dist < bestDist) {
      best = friend.id;
      bestDist = dist;
    }
  }
  return best;
}

function face(group: Group, fromX: number, fromZ: number, toX: number, toZ: number): void {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  if (dx * dx + dz * dz < 1e-4) return;
  group.rotation.y = Math.atan2(dx, dz);
}

function burst(x: number, z: number): void {
  if (reduced) return;
  for (const bit of confetti) {
    bit.life = 0.7 + Math.random() * 0.35;
    bit.mesh.visible = true;
    bit.mesh.position.set(x, 1.1, z);
    bit.velocity.set((Math.random() - 0.5) * 2.4, 1.6 + Math.random() * 1.8, (Math.random() - 0.5) * 2.4);
  }
}

let drag: { id: FriendId; pointer: number; sx: number; sy: number; moved: boolean } | null = null;

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (state.phase !== "play" || !intro.hidden) return;
  const point = floorAt(event.clientX, event.clientY);
  if (!point) return;
  const id = nearestFriend(point.x, point.z);
  if (!id) return;
  drag = { id, pointer: event.pointerId, sx: event.clientX, sy: event.clientY, moved: false };
  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (!drag || drag.pointer !== event.pointerId) return;
  if (Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) > 12) drag.moved = true;
  const point = floorAt(event.clientX, event.clientY);
  const friend = state.friends.find((item) => item.id === drag?.id);
  if (!point || !friend) return;
  linePositions[0] = friend.x;
  linePositions[1] = 0.45;
  linePositions[2] = friend.z;
  linePositions[3] = point.x;
  linePositions[4] = 0.45;
  linePositions[5] = point.z;
  lineGeo.attributes.position.needsUpdate = true;
  dragLine.visible = drag.moved;
});

function endDrag(event: PointerEvent): void {
  if (!drag || drag.pointer !== event.pointerId) return;
  const current = drag;
  drag = null;
  dragLine.visible = false;
  if (state.phase !== "play") return;
  const point = floorAt(event.clientX, event.clientY);
  const near = point ? Math.hypot(point.x - state.gamuX, point.z - state.gamuZ) <= TUNE.grabDrop : false;
  if (!current.moved || near) {
    state = sendFriend(state, current.id, state.gamuX, state.gamuZ);
    note(state, performance.now());
  }
}

renderer.domElement.addEventListener("pointerup", endDrag);
renderer.domElement.addEventListener("pointercancel", endDrag);
renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.key === "Enter" || event.key === " ") {
    if (!intro.hidden) {
      event.preventDefault();
      begin();
      return;
    }
    if (!again.hidden) {
      event.preventDefault();
      againNight();
      return;
    }
  }
  const id = KEYS[event.code];
  if (!id || state.phase !== "play") return;
  event.preventDefault();
  state = sendFriend(state, id, state.gamuX, state.gamuZ);
  note(state, performance.now());
});

function paintHud(now: number): void {
  scoreNode.textContent = String(Math.floor(state.score));
  clockNode.textContent = formatTime(state.time);
  const sleep = Math.round(state.sleep);
  sleepFill.style.width = `${sleep}%`;
  sleepMeter.setAttribute("aria-valuenow", String(sleep));
  const yawn = state.phase === "play" ? yawnPhase(state.time) : "calm";
  let message = HINT;
  if (toast && now < toastUntil) message = toast;
  else if (yawn === "yawn") message = "¡Bostezo! Que alguien lo sujete.";
  else if (yawn === "warning") message = "Gamu va a bostezar…";
  if (message !== lastStatus) {
    lastStatus = message;
    statusNode.textContent = message;
  }
  for (const id of FRIEND_IDS) {
    const friend = state.friends.find((item) => item.id === id);
    const button = buttons.get(id);
    if (!friend || !button) continue;
    button.meter.style.width = `${Math.round(friend.animo * 100)}%`;
    const text = `${ROSTER[id].blurb} · ${roleLabel(id)}`;
    if (button.label.textContent !== text) button.label.textContent = text;
    button.root.classList.toggle("is-ready", canSend(friend) && state.phase === "play");
    button.root.classList.toggle("is-hold", friend.role === "hold");
    button.root.classList.toggle("is-dim", !canSend(friend) && friend.role !== "hold" && friend.role !== "chase");
    button.root.setAttribute("aria-label", `${ROSTER[id].name}, ${text}`);
  }
  document.body.dataset.phase = state.phase;
}

function syncActor(actor: Actor, x: number, z: number, animo: number, moving: boolean, sleepy: boolean, time: number): void {
  const bob = reduced ? 0 : Math.abs(Math.sin(time * (moving ? 7 : 3) + x)) * (moving ? 0.07 : 0.03);
  actor.group.position.set(x, bob, z);
  actor.bodyMat.emissiveIntensity = 0.05 + animo * 0.55;
  actor.ringMat.opacity = 0.25 + animo * 0.7;
  const ring = actor.group.children.find((child) => child instanceof Mesh && child.geometry instanceof RingGeometry);
  if (ring) ring.scale.setScalar(0.75 + animo * 0.45);
  const swing = reduced || !moving ? 0.15 : Math.sin(time * 8 + z) * 0.7;
  actor.leftArm.rotation.x = swing;
  actor.rightArm.rotation.x = -swing;
  if (sleepy) actor.head.rotation.x = 0.2 + (state.sleep / 100) * 0.45;
  else actor.head.rotation.x = Math.sin(time * 2 + x) * 0.06;
}

function renderWorld(dt: number, time: number): void {
  const yawn = state.phase === "play" ? yawnPhase(state.time) : "calm";
  for (const id of FRIEND_IDS) {
    const friend = state.friends.find((item) => item.id === id);
    const actor = actors.get(id);
    if (!friend || !actor) continue;
    const moving = friend.role === "chase" || friend.role === "return";
    syncActor(actor, friend.x, friend.z, friend.animo, moving, false, time);
    if (friend.role === "chase" || friend.role === "hold") face(actor.group, friend.x, friend.z, state.gamuX, state.gamuZ);
    else face(actor.group, friend.x, friend.z, friend.x, friend.z - 1);
  }
  const gamuMoving = state.phase === "play" && !state.friends.some((friend) => friend.role === "hold");
  syncActor(gamu, state.gamuX, state.gamuZ, yawn === "calm" ? 0.2 : 0.9, gamuMoving, true, time);
  face(gamu.group, state.gamuX, state.gamuZ, 0, TUNE.doorZ);
  const showZ = state.sleep > 32 || yawn !== "calm";
  for (const sprite of zees) {
    const index = Number(sprite.userData.index);
    const wave = ((time * (yawn === "yawn" ? 0.85 : 0.4) + index * 0.33) % 1);
    sprite.visible = showZ;
    sprite.position.set(-0.05 + index * 0.16, 1.55 + wave * 0.7, 0.1);
    const material = sprite.material;
    if (material instanceof SpriteMaterial) material.opacity = showZ ? 1 - wave : 0;
  }
  const closeness = Math.min(1, Math.max(0, (TUNE.gamuStartZ - state.gamuZ) / (TUNE.gamuStartZ - TUNE.doorZ)));
  doorLight.intensity = 4 + closeness * 10 + (yawn === "yawn" ? 4 : 0);
  danceLight.intensity = reduced ? 6 : 5.5 + Math.sin(time * 4) * 1.3;
  if (!reduced) {
    partyLights.forEach((light, index) => {
      const angle = time * 0.65 + index * 2.1;
      light.position.set(Math.cos(angle) * 2.1, 1.8, TUNE.floorZ + Math.sin(angle) * 1.8);
    });
    ball.rotation.y += dt * 0.8;
    ball.rotation.x += dt * 0.3;
  }
  if (state.event === "grab" || state.event === "handoff") burst(state.gamuX, state.gamuZ);
  for (const bit of confetti) {
    if (bit.life <= 0) continue;
    bit.life -= dt;
    bit.velocity.y -= dt * 3.2;
    bit.mesh.position.addScaledVector(bit.velocity, dt);
    bit.mesh.visible = bit.life > 0 && bit.mesh.position.y > 0.05;
  }
}

function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  visual += dt;
  if (state.phase === "play") state = step(state, dt);
  note(state, now);
  if (state.phase === "over" && !showedOver) {
    showedOver = true;
    best = Math.max(best, Math.floor(state.score));
    overScore.textContent = `Aguantó ${formatTime(state.time)} en la pista. ${Math.floor(state.score)} puntos. Mejor de esta sesión: ${best}.`;
    again.hidden = false;
  }
  paintHud(now);
  renderWorld(dt, state.phase === "ready" ? visual : state.time);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
new ResizeObserver(() => resize()).observe(stage);
window.__divertirse = {
  start: begin,
  retry: againNight,
  send(id) {
    const before = state.eventSeq;
    state = sendFriend(state, id, state.gamuX, state.gamuZ);
    note(state, performance.now());
    return state.eventSeq !== before ? state.event : "ignored";
  },
  phase: () => state.phase,
  score: () => state.score,
  sleep: () => state.sleep,
  time: () => state.time,
  gamu: () => ({ x: state.gamuX, z: state.gamuZ }),
  point(id) {
    const spot = id === "gamu"
      ? { x: state.gamuX, z: state.gamuZ }
      : state.friends.find((friend) => friend.id === id);
    if (!spot) return null;
    const vector = new Vector3(spot.x, 0.7, spot.z);
    vector.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (vector.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-vector.y * 0.5 + 0.5) * rect.height,
    };
  },
};
requestAnimationFrame(frame);
