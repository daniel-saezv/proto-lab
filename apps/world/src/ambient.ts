import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { addFridgeCorner, addStoryCorners, tickCornerReactions } from "./ambient-corners";

const PALETTE = {
  couch: 0x5c4038,
  couchDark: 0x3d2a24,
  skin: 0xf0c7a2,
  hair: 0x2a2933,
  shirt: 0x4a5568,
  tv: 0x1a1528,
  tvGlow: 0x8fd8ff,
  ember: 0xff6b2c,
  smoke: 0xc8ccd4,
  cat: 0xe07a3d,
  dog: 0x8d6e4a,
  posterA: 0xff6b9d,
  posterB: 0x1f8a80,
  radio: 0x6d4b32,
  fridge: 0xd8e4ef,
  wrapper: 0xffb703,
  cable: 0x2a2933,
  dust: 0xf6f1e7,
};

export const SLOUCHER_LINES = [
  "Uy… qué pereza moverme…",
  "Shhh, estoy en modo zen.",
  "¿Prototipo? Nah, hoy toca sofá.",
  "La tele no se va a ver sola.",
] as const;

export function pickSlackerLine(seed: number): string {
  const index = Math.abs(Math.floor(seed)) % SLOUCHER_LINES.length;
  return SLOUCHER_LINES[index]!;
}

export type AmbientCollider = {
  id: string;
  x: number;
  z: number;
  collider: number;
};

export type AmbientFactories = {
  scene: Scene;
  geo: <T extends BufferGeometry>(geometry: T) => T;
  mat: (color: number) => MeshLambertMaterial;
  box: (
    parent: Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: number,
    shadow?: boolean,
  ) => Mesh;
  shadows: boolean;
  materials: Material[];
  pulses: MeshBasicMaterial[];
  reduced: boolean;
};

export type AmbientHandle = {
  colliders: AmbientCollider[];
  slacker: { x: number; z: number; radius: number };
  tick: (time: number, dt: number, player: Vector3) => void;
};

export function addAmbient(f: AmbientFactories): AmbientHandle {
  const lounge = new Group();
  lounge.name = "ambient-lounge";
  f.scene.add(lounge);

  const slackerX = -7.15;
  const slackerZ = -4.65;

  addCouch(lounge, slackerX, slackerZ, f);
  const { arm, ember, smokes, tvLight, tvMaterial, tvCanvas, tvCtx } = addSlackerAndTv(lounge, slackerX, slackerZ, f);
  addSnackClutter(lounge, slackerX + 0.55, slackerZ + 0.35, f);
  addPosters(f.scene, f);
  addFloorCables(f.scene, f);
  const dust = addDust(f.scene, f);
  const corners = addStoryCorners(f);
  const fridgeHum = addFridgeCorner(f);

  const bubbleAnchor = document.createElement("div");
  bubbleAnchor.className = "speech-bubble";
  bubbleAnchor.hidden = true;
  bubbleAnchor.textContent = pickSlackerLine(0);
  const bubble = new CSS2DObject(bubbleAnchor);
  bubble.position.set(0, 1.05, 0.2);
  lounge.add(bubble);

  let tvTimer = 0;
  let lineShown = -1;

  return {
    colliders: [{ id: "couch", x: slackerX, z: slackerZ, collider: 0.48 }, ...corners.colliders],
    slacker: { x: slackerX, z: slackerZ, radius: 2.35 },
    tick(time, dt, player) {
      const near =
        Math.hypot(player.x - slackerX, player.z - slackerZ) <= 2.35;
      if (near && lineShown < 0) {
        lineShown = Math.floor(time * 0.37);
        bubbleAnchor.textContent = pickSlackerLine(lineShown);
      }
      if (!near) lineShown = -1;
      bubbleAnchor.hidden = !near;

      if (f.reduced) return;

      const chew = Math.sin(time * 1.4);
      arm.rotation.x = -0.35 + (chew > 0.6 ? 0.55 : 0.08);
      arm.rotation.z = 0.12 + Math.sin(time * 0.9) * 0.04;

      const emberMat = ember.material as MeshBasicMaterial;
      const emberPulse = 0.75 + Math.sin(time * 5.2) * 0.25;
      emberMat.color.setScalar(emberPulse);
      emberMat.opacity = 0.85 + Math.sin(time * 6) * 0.15;

      for (let i = 0; i < smokes.length; i++) {
        const puff = smokes[i]!;
        const phase = (time * 0.45 + i * 0.9) % 2.4;
        puff.position.y = 0.92 + phase * 0.55;
        puff.position.x = slackerX + 0.38 + Math.sin(time + i) * 0.06;
        puff.scale.setScalar(0.35 + phase * 0.22);
        (puff.material as MeshBasicMaterial).opacity = Math.max(0, 0.55 - phase * 0.22);
      }

      tvTimer += dt;
      if (tvTimer > 0.11) {
        tvTimer = 0;
        flickerTv(tvCtx, tvCanvas, tvMaterial);
      }
      const flick = 0.7 + Math.sin(time * 11) * 0.15 + Math.sin(time * 23.7) * 0.1;
      tvLight.intensity = 4.5 * flick;
      tvMaterial.color.setRGB(0.55 + flick * 0.35, 0.65 + flick * 0.25, 1);

      for (let i = 0; i < dust.length; i++) {
        const m = dust[i]!;
        const base = m.userData.base as { x: number; y: number; z: number; phase: number };
        m.position.y = base.y + Math.sin(time * 0.35 + base.phase) * 0.08;
        m.position.x = base.x + Math.sin(time * 0.22 + base.phase * 2) * 0.04;
      }

      fridgeHum.scale.set(1, 1 + Math.sin(time * 16) * 0.4, 1);
      tickCornerReactions(corners.interact, player, time, f.reduced);
    },
  };
}

function addCouch(parent: Group, x: number, z: number, f: AmbientFactories) {
  f.box(parent, 1.55, 0.28, 0.72, x, 0.32, z, PALETTE.couch);
  f.box(parent, 1.55, 0.52, 0.18, x, 0.68, z - 0.28, PALETTE.couchDark);
  f.box(parent, 0.16, 0.42, 0.68, x - 0.78, 0.48, z, PALETTE.couchDark);
  f.box(parent, 0.16, 0.42, 0.68, x + 0.78, 0.48, z, PALETTE.couchDark);
}

function addSlackerAndTv(
  parent: Group,
  x: number,
  z: number,
  f: AmbientFactories,
): {
  arm: Group;
  ember: Mesh;
  smokes: Mesh[];
  tvLight: PointLight;
  tvMaterial: MeshBasicMaterial;
  tvCanvas: HTMLCanvasElement;
  tvCtx: CanvasRenderingContext2D;
} {
  const body = new Group();
  body.position.set(x - 0.08, 0.52, z + 0.05);
  body.rotation.y = 0.08;
  parent.add(body);

  f.box(body, 0.42, 0.22, 0.55, 0, 0, 0.08, PALETTE.shirt, false);
  f.box(body, 0.38, 0.38, 0.32, 0, 0.28, -0.12, PALETTE.shirt);
  const head = new Mesh(f.geo(new SphereGeometry(0.19, 12, 10)), f.mat(PALETTE.skin));
  head.position.set(0.05, 0.58, -0.18);
  head.rotation.x = -0.35;
  body.add(head);
  const hair = new Mesh(f.geo(new SphereGeometry(0.17, 10, 8)), f.mat(PALETTE.hair));
  hair.scale.set(1, 0.65, 0.9);
  hair.position.set(0.05, 0.68, -0.22);
  body.add(hair);

  const leg = f.box(body, 0.14, 0.16, 0.55, -0.12, -0.02, 0.35, PALETTE.shirt, false);
  leg.rotation.x = -0.55;

  const arm = new Group();
  arm.position.set(0.22, 0.32, 0.05);
  const upper = f.box(arm, 0.1, 0.28, 0.1, 0, -0.08, 0, PALETTE.skin, false);
  upper.rotation.x = -0.4;
  const fore = f.box(arm, 0.09, 0.24, 0.09, 0, -0.32, 0.06, PALETTE.skin, false);
  fore.rotation.x = 0.65;
  body.add(arm);

  const joint = f.box(arm, 0.06, 0.14, 0.06, 0, -0.48, 0.12, 0x6b8f4e, false);
  joint.rotation.x = 0.2;
  const emberMat = new MeshBasicMaterial({ color: PALETTE.ember, transparent: true, opacity: 0.9 });
  f.materials.push(emberMat);
  const ember = new Mesh(f.geo(new SphereGeometry(0.035, 8, 6)), emberMat);
  ember.position.set(0, -0.54, 0.14);
  arm.add(ember);

  const smokeGeo = f.geo(new SphereGeometry(0.08, 8, 6));
  const smokes: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const smokeMat = new MeshBasicMaterial({ color: PALETTE.smoke, transparent: true, opacity: 0.4 });
    f.materials.push(smokeMat);
    const puff = new Mesh(smokeGeo, smokeMat);
    puff.position.set(x + 0.38, 0.92 + i * 0.15, z + 0.1);
    parent.add(puff);
    smokes.push(puff);
  }

  const tvX = x + 0.05;
  const tvZ = z - 1.35;
  f.box(parent, 0.55, 0.38, 0.42, tvX, 0.38, tvZ, PALETTE.tv);
  f.box(parent, 0.62, 0.08, 0.48, tvX, 0.62, tvZ, PALETTE.tv);
  const { canvas, ctx, material } = createTvTexture(f.materials);
  const screen = new Mesh(f.geo(new PlaneGeometry(0.48, 0.34)), material);
  screen.position.set(tvX, 0.42, tvZ + 0.22);
  parent.add(screen);

  const tvLight = new PointLight(PALETTE.tvGlow, 5, 3.2, 2);
  tvLight.position.set(tvX, 0.55, tvZ + 0.35);
  f.scene.add(tvLight);

  return { arm, ember, smokes, tvLight, tvMaterial: material, tvCanvas: canvas, tvCtx: ctx };
}

function createTvTexture(materials: Material[]): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  material: MeshBasicMaterial;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 48;
  const ctx = canvas.getContext("2d")!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture, color: 0xffffff });
  materials.push(material);
  flickerTv(ctx, canvas, material);
  return { canvas, ctx, material };
}

function flickerTv(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, material: MeshBasicMaterial) {
  const hues = ["#ff6b9d", "#8fd8ff", "#ffb703", "#1f8a80", "#c77dff", "#f6f1e7"];
  ctx.fillStyle = hues[Math.floor(Math.random() * hues.length)]!;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = hues[Math.floor(Math.random() * hues.length)]!;
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 4 + Math.random() * 14, 3 + Math.random() * 10);
  }
  if (Math.random() > 0.82) {
    ctx.fillStyle = "#14182b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 3) {
      ctx.fillStyle = `rgba(246,241,231,${Math.random() * 0.35})`;
      ctx.fillRect(0, y, canvas.width, 1);
    }
  }
  material.map!.needsUpdate = true;
}

function addSnackClutter(parent: Group, x: number, z: number, f: AmbientFactories) {
  f.box(parent, 0.12, 0.02, 0.18, x, 0.34, z, PALETTE.wrapper, false);
  f.box(parent, 0.1, 0.015, 0.14, x + 0.16, 0.335, z - 0.08, 0xf4efe4, false);
  f.box(parent, 0.08, 0.04, 0.08, x - 0.12, 0.355, z + 0.1, 0xc46b3a, false);
}

function addPosters(scene: Scene, f: AmbientFactories) {
  addPoster(scene, f, -2.1, 1.45, -7.34, PALETTE.posterA, "ARCADE");
  addPoster(scene, f, 4.8, 1.35, -7.34, PALETTE.posterB, "ZEN");
}

function addPoster(
  scene: Scene,
  f: AmbientFactories,
  x: number,
  y: number,
  z: number,
  accent: number,
  label: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 180;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `#${new Color(accent).getHexString()}`;
  ctx.fillRect(0, 0, 128, 180);
  ctx.fillStyle = "#14182b";
  ctx.fillRect(8, 8, 112, 164);
  ctx.fillStyle = `#${new Color(accent).getHexString()}`;
  ctx.font = "700 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, 64, 95);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture });
  f.materials.push(material);
  const poster = new Mesh(f.geo(new PlaneGeometry(0.55, 0.78)), material);
  poster.position.set(x, y, z);
  scene.add(poster);
}

function addFloorCables(scene: Scene, f: AmbientFactories) {
  f.box(scene, 0.02, 0.02, 2.4, 2.8, 0.015, -0.2, PALETTE.cable, false);
  f.box(scene, 1.1, 0.02, 0.02, 3.2, 0.015, 0.95, PALETTE.cable, false);
  f.box(scene, 0.02, 0.02, 1.2, 5.2, 0.015, 2.1, PALETTE.cable, false);
}

function addDust(scene: Scene, f: AmbientFactories): Mesh[] {
  const geo = f.geo(new SphereGeometry(0.018, 6, 4));
  const dustMat = new MeshBasicMaterial({ color: PALETTE.dust, transparent: true, opacity: 0.25 });
  f.materials.push(dustMat);
  const meshes: Mesh[] = [];
  const spots = [
    [-1.2, 0.35, 0.4],
    [0.8, 0.55, -1.1],
    [2.4, 0.42, 1.8],
    [-3.5, 0.48, 2.2],
    [4.2, 0.38, 3.1],
    [-0.4, 0.62, 2.8],
    [1.5, 0.28, -2.4],
    [-5.5, 0.52, -0.5],
  ];
  for (let i = 0; i < spots.length; i++) {
    const [x, y, z] = spots[i]!;
    const m = new Mesh(geo, dustMat);
    m.position.set(x, y, z);
    m.userData.base = { x, y, z, phase: i * 0.7 };
    scene.add(m);
    meshes.push(m);
  }
  return meshes;
}
