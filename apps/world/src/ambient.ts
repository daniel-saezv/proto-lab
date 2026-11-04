import type { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
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
import { addFridgeCorner, addStoryCorners, applyAnimalPose, tickCornerReactions, type DeskBeat } from "./ambient-corners";
import { addLoungeGroup, type LoungeNpcSpot } from "./ambient-lounge";
import type { DialogueCue } from "./dialogue-cues";
import { LAYOUT } from "./navigation";
import {
  createAnimal,
  createAnimalPose,
  createErrand,
  createErrandPose,
  pantryInView,
  snapErrandAtFridge,
  tickAnimal,
  tickErrand,
  type ErrandActor,
  type RoutineView,
} from "./pantry-routine";
import { PANTRY_POSTER, pantryPosterZ } from "./scene-lights";

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

export type PantryGaze = {
  cx: number;
  cz: number;
  fx: number;
  fz: number;
  hold: boolean;
};

export type PantryActor = {
  id: ErrandActor;
  x: number;
  z: number;
  away: boolean;
};

export type AmbientHandle = {
  colliders: AmbientCollider[];
  slacker: { x: number; z: number; radius: number; approach: { x: number; z: number } };
  npcs: LoungeNpcSpot[];
  nameplates: { id: string; element: HTMLElement; anchor: CSS2DObject }[];
  tick: (
    time: number,
    dt: number,
    player: Vector3,
    beatBass?: number,
    beatMid?: number,
    playerStill?: boolean,
    gaze?: PantryGaze,
  ) => void;
  posePantry: () => void;
  pantryActor: () => PantryActor;
  setTvSources: (still: string | null, clip: string) => void;
  setTvSuspended: (suspended: boolean) => void;
  setDialogueCue: (cue: DialogueCue | null) => void;
  pulseDialogue: () => void;
  setDeskBeat: (beat: DeskBeat) => void;
  dispose: () => void;
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
  const fridge = addFridgeCorner(f);

  group.bubble.textContent = pickSlackerLine(0);
  let lineShown = -1;

  let loungePulse = 0;
  let loungeCue: DialogueCue | null = null;
  const errand = createErrand();
  const errandPose = createErrandPose();
  const animal = createAnimal();
  const animalPose = createAnimalPose();
  const routineView: RoutineView = { visible: false, hold: false, playerX: 0, playerZ: 0 };
  const glanceCtx = {
    playerX: 0,
    playerZ: 0,
    playerStill: false,
    activeCue: null as DialogueCue | null,
    dialoguePulse: 0,
    nearSlacker: false,
    awayId: null as string | null,
    pet: null as { id: string; x: number; z: number } | null,
  };
  const actor: PantryActor = { id: errandPose.id, x: errandPose.x, z: errandPose.z, away: false };
  let deskBeat: DeskBeat = "off";

  function syncActor() {
    actor.id = errandPose.id;
    actor.x = errandPose.x;
    actor.z = errandPose.z;
    actor.away = errandPose.engaged;
  }

  return {
    colliders: [...group.colliders, ...corners.colliders],
    slacker: group.slacker,
    npcs: group.npcs,
    nameplates: group.nameplates,
    setTvSources(still, clip) {
      group.setTvSources(still, clip);
    },
    setTvSuspended(suspended) {
      group.setTvSuspended(suspended);
    },
    setDialogueCue(cue) {
      loungeCue = cue;
      group.setDialogueCue(cue);
    },
    pulseDialogue() {
      loungePulse = 0.45;
      group.pulseDialogue();
    },
    posePantry() {
      snapErrandAtFridge(errand, errandPose);
      group.applyErrand(errandPose, 0);
      fridge.door.rotation.y = 1.05;
      group.bubble.hidden = true;
      syncActor();
    },
    pantryActor() {
      return actor;
    },
    setDeskBeat(beat) {
      deskBeat = beat;
    },
    dispose() {
      group.disposeTv();
    },
    tick(time, dt, player, beatBass = 0, beatMid = 0, playerStill = false, gaze) {
      const near = Math.hypot(player.x - group.slacker.x, player.z - group.slacker.z) <= group.slacker.radius;
      if (near && lineShown < 0) {
        lineShown = Math.floor(time * 0.37);
        group.bubble.textContent = pickSlackerLine(lineShown);
      }
      if (!near) lineShown = -1;
      group.bubble.hidden = !near;

      group.syncTv(player.x, player.z, dt, f.reduced || Boolean(f.e2e));
      if (f.reduced || f.e2e) return;

      if (loungePulse > 0) loungePulse = Math.max(0, loungePulse - dt);

      const socialHold = gaze?.hold ?? false;
      routineView.playerX = player.x;
      routineView.playerZ = player.z;
      routineView.hold = socialHold || animal.phase !== "home";
      routineView.visible = gaze
        ? pantryInView(gaze.cx, gaze.cz, gaze.fx, gaze.fz, errand.x, errand.z)
        : false;
      tickErrand(errand, dt, routineView, errandPose);
      routineView.hold = socialHold || errand.phase !== "wait";
      routineView.visible = gaze
        ? pantryInView(gaze.cx, gaze.cz, gaze.fx, gaze.fz, animal.x, animal.z)
        : false;
      tickAnimal(animal, dt, routineView, animalPose);
      syncActor();
      fridge.door.rotation.y = 1.05 * errandPose.door;
      applyAnimalPose(corners.interact, animalPose);

      glanceCtx.playerX = player.x;
      glanceCtx.playerZ = player.z;
      glanceCtx.playerStill = playerStill;
      glanceCtx.activeCue = loungeCue;
      glanceCtx.dialoguePulse = loungePulse;
      glanceCtx.nearSlacker = near;
      glanceCtx.awayId = errandPose.engaged ? errandPose.id : null;
      glanceCtx.pet = animalPose.host ? { id: animalPose.host, x: animalPose.x, z: animalPose.z } : null;
      group.tick(time, dt, beatMid, glanceCtx, errandPose);
      if (errandPose.engaged && errandPose.id === "remolon") group.bubble.hidden = true;

      for (let i = 0; i < dust.length; i++) {
        const m = dust[i]!;
        const base = m.userData.base as { x: number; y: number; z: number; phase: number };
        const cycle = (time * 0.07 + base.phase) % 1;
        m.position.y = 0.35 + cycle * 2.15 + beatMid * 0.08;
        m.position.x = base.x + Math.sin(time * 0.22 + base.phase * 2) * 0.12;
        m.position.z = base.z + Math.cos(time * 0.18 + base.phase) * 0.1;
        m.scale.setScalar(1 + beatMid * 0.12);
      }

      fridge.hum.scale.set(1, 1 + Math.sin(time * 16) * 0.4, 1);
      tickCornerReactions(corners.interact, player, time, dt, f.reduced, beatBass, beatMid, deskBeat);
    },
  };
}

function addPosters(scene: Scene, f: AmbientFactories) {
  addPoster(scene, f, -9.38, 1.7, -6.7, PALETTE.posterB, "ZEN", Math.PI / 2);
  addPoster(scene, f, PANTRY_POSTER.x, PANTRY_POSTER.y, pantryPosterZ(), PALETTE.posterA, "ARCADE", -Math.PI / 2);
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
