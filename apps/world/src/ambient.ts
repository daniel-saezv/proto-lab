import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import { addFridgeCorner, addStoryCorners, tickCornerReactions } from "./ambient-corners";
import { addLoungeGroup, type LoungeNpcSpot } from "./ambient-lounge";
import { LAYOUT } from "./navigation";

const PALETTE = {
  posterA: 0xff6b9d,
  posterB: 0x1f8a80,
  cable: 0x524c63,
  cablePlug: 0x8d97a8,
  dust: 0xf6f1e7,
};

export const SLOUCHER_LINES = [
  "Uy… qué pereza moverme…",
  "Shhh, estoy en modo zen.",
  "¿Una idea? Que repose en el sofá.",
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
  e2e?: boolean;
};

export type AmbientHandle = {
  colliders: AmbientCollider[];
  slacker: { x: number; z: number; radius: number; approach: { x: number; z: number } };
  npcs: LoungeNpcSpot[];
  nameplates: { id: string; element: HTMLElement }[];
  tick: (time: number, dt: number, player: Vector3, beatBass?: number, beatMid?: number) => void;
};

export function addAmbient(f: AmbientFactories): AmbientHandle {
  const lounge = new Group();
  lounge.name = "ambient-lounge";
  f.scene.add(lounge);

  const group = addLoungeGroup(lounge, f);
  addPosters(f.scene, f);
  addFloorCables(f.scene, f);
  const dust = f.e2e ? [] : addDust(f.scene, f);
  const corners = addStoryCorners(f);
  const fridgeHum = addFridgeCorner(f);

  group.bubble.textContent = pickSlackerLine(0);
  let lineShown = -1;

  return {
    colliders: [...group.colliders, ...corners.colliders],
    slacker: group.slacker,
    npcs: group.npcs,
    nameplates: group.nameplates,
    tick(time, dt, player, beatBass = 0, beatMid = 0) {
      const near = Math.hypot(player.x - group.slacker.x, player.z - group.slacker.z) <= group.slacker.radius;
      if (near && lineShown < 0) {
        lineShown = Math.floor(time * 0.37);
        group.bubble.textContent = pickSlackerLine(lineShown);
      }
      if (!near) lineShown = -1;
      group.bubble.hidden = !near;

      if (f.reduced || f.e2e) return;

      group.tick(time, dt, beatMid);

      for (let i = 0; i < dust.length; i++) {
        const m = dust[i]!;
        const base = m.userData.base as { x: number; y: number; z: number; phase: number };
        const cycle = (time * 0.07 + base.phase) % 1;
        m.position.y = 0.35 + cycle * 2.15 + beatMid * 0.08;
        m.position.x = base.x + Math.sin(time * 0.22 + base.phase * 2) * 0.12;
        m.position.z = base.z + Math.cos(time * 0.18 + base.phase) * 0.1;
        m.scale.setScalar(1 + beatMid * 0.12);
      }

      fridgeHum.scale.set(1, 1 + Math.sin(time * 16) * 0.4, 1);
      tickCornerReactions(corners.interact, player, time, dt, f.reduced, beatBass, beatMid);
    },
  };
}

function addPosters(scene: Scene, f: AmbientFactories) {
  addPoster(scene, f, -9.38, 1.7, -6.7, PALETTE.posterB, "ZEN", Math.PI / 2);
  addPoster(scene, f, 9.38, 1.65, 0.4, PALETTE.posterA, "ARCADE", -Math.PI / 2);
}

function addPoster(
  scene: Scene,
  f: AmbientFactories,
  x: number,
  y: number,
  z: number,
  accent: number,
  label: string,
  rotationY = 0,
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
  poster.rotation.y = rotationY;
  scene.add(poster);
}

function addFloorCables(scene: Scene, f: AmbientFactories) {
  const y = 0.03;
  const radius = 0.02;
  const cableMat = f.mat(PALETTE.cable);
  const alongZ = new Mesh(f.geo(new CylinderGeometry(radius, radius, 1.15, 6)), cableMat);
  alongZ.rotation.x = Math.PI / 2;
  alongZ.position.set(LAYOUT.arcade.x + 0.95, y, LAYOUT.arcade.z + 0.15);
  scene.add(alongZ);
  const alongWall = new Mesh(f.geo(new CylinderGeometry(radius, radius, 1.6, 6)), cableMat);
  alongWall.rotation.x = Math.PI / 2;
  alongWall.position.set(8.35, y, LAYOUT.desk.z + 0.85);
  scene.add(alongWall);
  f.box(scene, 0.06, 0.03, 0.06, LAYOUT.arcade.x + 0.95, y, LAYOUT.arcade.z - 0.45, PALETTE.cablePlug, false);
  f.box(scene, 0.06, 0.03, 0.06, 8.35, y, LAYOUT.desk.z + 0.05, PALETTE.cablePlug, false);
}

function addDust(scene: Scene, f: AmbientFactories): Mesh[] {
  const geo = f.geo(new SphereGeometry(0.018, 6, 4));
  const dustMat = new MeshBasicMaterial({ color: PALETTE.dust, transparent: true, opacity: 0.25 });
  f.materials.push(dustMat);
  const meshes: Mesh[] = [];
  const spots = [
    [-1.2, 1.1, 0.4],
    [0.4, 1.8, 1.6],
    [2.2, 0.9, 3.4],
    [-3.2, 1.4, 2.6],
    [5.4, 1.2, 4.8],
    [-0.6, 2.1, -1.2],
    [3.6, 1.5, -2.2],
    [-5.2, 1.3, -1.4],
    [1.1, 2.3, 2.2],
    [6.8, 1.1, 6.4],
    [-6.4, 1.6, 5.2],
    [0.2, 0.8, 6.8],
  ];
  for (let i = 0; i < spots.length; i++) {
    const [x, y, z] = spots[i]!;
    const m = new Mesh(geo, dustMat);
    m.userData.noBatch = true;
    m.position.set(x, y, z);
    m.userData.base = { x, y, z, phase: i * 0.7 };
    scene.add(m);
    meshes.push(m);
  }
  return meshes;
}
