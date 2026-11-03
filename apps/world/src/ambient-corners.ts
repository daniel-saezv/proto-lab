import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
} from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { AmbientCollider, AmbientFactories } from "./ambient";
import { blinkOpen, breathScale, windowPaintSlot } from "./graphics-idle";
import { fuseMeshes } from "./mesh-fuse";
import { CEILING_UNDERSIDE, LAYOUT, RADIO_USE_RADIUS } from "./navigation";
import { WORKSHOP_SEAT } from "./workshop-cinematic";
import { paintWorkshopMural } from "./workshop-mural";
import {
  FLOOR_GLOW,
  FLOOR_LAMPS,
  FLOOR_SHADE,
  FLOOR_SHADE_Y,
  LAMP_METAL,
  PANTRY_RUG_COLOR,
  addLampHead,
  pantryRug,
} from "./scene-lights";

const PAL = {
  desk: 0x6d4b32,
  deskDark: 0x3d2a24,
  monitor: 0x171225,
  shelf: 0x465270,
  cartridge: 0xff6b9d,
  trophy: 0xffb703,
  pinball: 0x2a2140,
  tool: 0x8d97a8,
  neon: 0xff6b9d,
  pizza: 0xc46b3a,
  leaf: 0x2f7d4a,
  pot: 0xc46b3a,
  fan: 0x465270,
  cat: 0xe07a3d,
  dog: 0x8d6e4a,
  radio: 0x6d4b32,
  wrapper: 0xffb703,
};

export type SwayPlant = { mesh: Object3D; phase: number };

export type CornerInteractables = {
  catHead: Mesh;
  catEyes: Object3D;
  catTail: Object3D;
  dogSnore: HTMLDivElement;
  dogChest: Object3D;
  radioDial: MeshBasicMaterial;
  fan: Group;
  windowMats: MeshBasicMaterial[];
  windowSlot: number;
  pcScreen: MeshBasicMaterial;
  neonMat: MeshBasicMaterial;
  sway: SwayPlant[];
  lamps: PointLight[];
};

export function addStoryCorners(f: AmbientFactories): {
  colliders: AmbientCollider[];
  interact: CornerInteractables;
} {
  const decor = ["desk", "shelves", "pinball", "fridge", "dog", "crates", "plant", "radio", "plantPinball", "plantRest"] as const;
  const colliders: AmbientCollider[] = decor.map((id) => ({
    id,
    x: LAYOUT[id].x,
    z: LAYOUT[id].z,
    collider: LAYOUT[id].collider,
  }));

  const work = addWorkCorner(f);
  addPinballRepair(f);
  addNeonAndPizza(f, work.neonMat);
  addWhiteboardDoodles(f);
  addExtraPlants(f, work.sway);
  addAccentRug(f);
  addWarmLamps(f, work.lamps);
  addCeilingFan(f, work.fan);
  upgradeWindows(f, work.windowMats);

  return { colliders, interact: work };
}

function addWorkCorner(f: AmbientFactories): CornerInteractables {
  const dx = LAYOUT.desk.x;
  const dz = LAYOUT.desk.z;
  f.box(f.scene, 1.4, 0.72, 0.7, dx, 0.36, dz, PAL.desk);
  f.box(f.scene, 0.9, 0.04, 0.5, dx + 0.12, 0.74, dz + 0.08, PAL.deskDark, false);
  f.box(f.scene, 0.38, 0.28, 0.08, dx - 0.28, 0.88, dz + 0.3, PAL.monitor);
  const pcScreen = createBlinkingScreen(f.materials, "#8fd8ff", "code");
  const screen = new Mesh(f.geo(new PlaneGeometry(0.32, 0.22)), pcScreen);
  screen.position.set(dx - 0.28, 0.9, dz + 0.35);
  f.scene.add(screen);
  f.box(f.scene, 0.08, 0.04, 0.2, dx + 0.4, 0.78, dz + 0.02, PAL.wrapper, false);
  f.box(f.scene, 0.25, 0.08, 0.18, dx + 0.15, 0.78, dz - 0.08, 0xf4efe4, false);
  f.box(f.scene, 0.14, 0.06, 0.14, dx + 0.42, 0.77, dz + 0.16, PAL.cartridge, false);
  f.box(f.scene, 0.06, 0.08, 0.05, dx - 0.05, 0.79, dz + 0.1, PAL.deskDark, false);
  f.box(f.scene, 0.045, 0.05, 0.045, dx - 0.02, 0.835, dz + 0.1, PAL.desk, false);
  f.box(f.scene, 0.09, 0.035, 0.07, dx + 0.28, 0.785, dz - 0.02, PAL.shelf, false);
  f.box(f.scene, 0.085, 0.03, 0.065, dx + 0.28, 0.815, dz - 0.02, PAL.tool, false);
  f.box(f.scene, 0.08, 0.025, 0.06, dx + 0.29, 0.84, dz - 0.02, PAL.wrapper, false);
  f.box(f.scene, 0.18, 0.12, 0.012, dx - 0.55, 1.05, dz + 0.38, PAL.cartridge, false);
  f.box(f.scene, 0.16, 0.1, 0.01, dx - 0.55, 1.05, dz + 0.392, PAL.neon, false);

  const sx = LAYOUT.shelves.x;
  const sz = LAYOUT.shelves.z;
  f.box(f.scene, 0.26, 1.35, 1.15, sx, 0.68, sz, PAL.shelf);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const color = col % 2 === 0 ? PAL.cartridge : 0x1f8a80;
      f.box(f.scene, 0.08, 0.16, 0.14, sx - 0.16, 0.32 + row * 0.4, sz - 0.4 + col * 0.26, color, false);
    }
  }
  const trophy = new Mesh(f.geo(new CylinderGeometry(0.08, 0.12, 0.22, 8)), new MeshBasicMaterial({ color: PAL.trophy }));
  f.materials.push(trophy.material);
  trophy.position.set(sx - 0.18, 1.42, sz);
  f.scene.add(trophy);

  const neonMat = new MeshBasicMaterial({ color: PAL.neon });
  f.materials.push(neonMat);
  const fan = new Group();
  fan.userData.noBatch = true;
  f.scene.add(fan);
  const windowMats: MeshBasicMaterial[] = [];
  const sway: SwayPlant[] = [];

  const cat = addCatOnCrates(f);
  const dog = addSleepingDog(f);
  addWorkshopSeat(f);
  addDeskGlassware(f);
  addDeskTools(f);
  return {
    catHead: cat.head,
    catEyes: cat.eyes,
    catTail: cat.tail,
    dogSnore: dog.snore,
    dogChest: dog.chest,
    radioDial: addRadio(f),
    fan,
    windowMats,
    windowSlot: -1,
    pcScreen,
    neonMat,
    sway,
    lamps: [],
  };
}

function addPinballRepair(f: AmbientFactories) {
  const x = LAYOUT.pinball.x;
  const z = LAYOUT.pinball.z;
  f.box(f.scene, 0.95, 0.55, 0.7, x, 0.28, z, PAL.pinball);
  f.box(f.scene, 0.7, 0.12, 0.55, x, 0.62, z, 0x171225, false);
  const glass = new Mesh(f.geo(new PlaneGeometry(0.62, 0.32)), new MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.45 }));
  f.materials.push(glass.material);
  glass.position.set(x, 0.66, z + 0.36);
  f.scene.add(glass);
  f.box(f.scene, 0.12, 0.04, 0.18, x - 0.35, 0.05, z + 0.45, PAL.tool, false);
  f.box(f.scene, 0.22, 0.04, 0.04, x + 0.2, 0.05, z + 0.35, PAL.tool, false);
  f.box(f.scene, 0.08, 0.08, 0.08, x + 0.35, 0.08, z - 0.25, PAL.trophy, false);
}

function addNeonAndPizza(f: AmbientFactories, neonMat: MeshBasicMaterial) {
  const sign = new Mesh(f.geo(new PlaneGeometry(1.35, 0.32)), neonMat);
  sign.position.set(0.78, 2.15, -7.33);
  f.scene.add(sign);
  f.pulses.push(neonMat);

  const stackX = LAYOUT.desk.x + 0.48;
  const stackZ = LAYOUT.desk.z + 0.02;
  for (let i = 0; i < 3; i++) {
    f.box(f.scene, 0.28, 0.045, 0.28, stackX, 0.78 + i * 0.05, stackZ, PAL.pizza, false);
  }
}

function addWhiteboardDoodles(f: AmbientFactories) {
  const width = 768;
  const height = 384;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  paintWorkshopMural(ctx, width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture });
  f.materials.push(material);
  const board = new Mesh(f.geo(new PlaneGeometry(2.56, 1.28)), material);
  board.position.set(6.4, 1.78, -7.32);
  board.castShadow = false;
  board.receiveShadow = false;
  f.scene.add(board);
}

/** Silla del banco. Mismas maderas que el escritorio, para que el batch se las quede. */
function addWorkshopSeat(f: AmbientFactories) {
  const { x, z } = WORKSHOP_SEAT;
  f.box(f.scene, 0.48, 0.08, 0.4, x, 0.32, z, PAL.desk, false);
  f.box(f.scene, 0.48, 0.58, 0.06, x, 0.64, z - 0.28, PAL.desk, false);
  const feet: Array<[number, number]> = [
    [-0.18, -0.14],
    [0.18, -0.14],
    [-0.18, 0.14],
    [0.18, 0.14],
  ];
  for (const [ox, oz] of feet) {
    f.box(f.scene, 0.05, 0.28, 0.05, x + ox, 0.14, z + oz, PAL.deskDark, false);
  }
}

/** Tubos de ensayo sobre el tablero. Una sola malla; el del medio es café. */
function addDeskGlassware(f: AmbientFactories) {
  const dx = LAYOUT.desk.x;
  const dz = LAYOUT.desk.z;
  const geo = f.geo(new CylinderGeometry(0.03, 0.036, 0.24, 8));
  const material = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  f.materials.push(material);
  const spots = [
    { x: dx - 0.55, z: dz - 0.22, h: 1, color: 0x8fd8ff },
    { x: dx - 0.42, z: dz - 0.24, h: 0.85, color: 0x8fd8ff },
    { x: dx - 0.3, z: dz - 0.2, h: 1.05, color: 0xc46b3a },
    { x: dx - 0.18, z: dz - 0.24, h: 0.75, color: 0x8fd8ff },
    { x: dx - 0.06, z: dz - 0.21, h: 0.95, color: 0xd7f4ff },
  ];
  const mesh = new InstancedMesh(geo, material, spots.length);
  mesh.userData.noBatch = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new Object3D();
  const tint = new Color();
  spots.forEach((spot, index) => {
    dummy.position.set(spot.x, 0.72 + 0.12 * spot.h, spot.z);
    dummy.scale.set(1, spot.h, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, tint.setHex(spot.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  f.scene.add(mesh);
}

/** Herramientas del banco, un solo lote, sin sombra propia. */
function addDeskTools(f: AmbientFactories) {
  const dx = LAYOUT.desk.x;
  const dz = LAYOUT.desk.z;
  const geo = f.geo(new BoxGeometry(0.2, 0.025, 0.05));
  const mesh = new InstancedMesh(geo, f.mat(PAL.tool), 4);
  mesh.userData.noBatch = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new Object3D();
  const tools = [
    { x: dx - 0.5, z: dz + 0.08, ry: 1.15 },
    { x: dx + 0.08, z: dz + 0.26, ry: 0.45 },
    { x: dx + 0.28, z: dz + 0.24, ry: -0.55 },
    { x: dx + 0.5, z: dz + 0.18, ry: 0.2 },
  ];
  tools.forEach((tool, index) => {
    dummy.position.set(tool.x, 0.78, tool.z);
    dummy.rotation.set(0, tool.ry, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  f.scene.add(mesh);
}

function addExtraPlants(f: AmbientFactories, sway: SwayPlant[]) {
  sway.push(addPottedPlant(f, LAYOUT.plant.x, LAYOUT.plant.z, 1.15, 0.4));
  sway.push(addPottedPlant(f, LAYOUT.plantPinball.x, LAYOUT.plantPinball.z, 0.9, 1.7));
  sway.push(addPottedPlant(f, LAYOUT.plantRest.x, LAYOUT.plantRest.z, 0.85, 2.4));
}

function addPottedPlant(f: AmbientFactories, x: number, z: number, scale: number, phase: number): SwayPlant {
  const pot = new Mesh(f.geo(new CylinderGeometry(0.16 * scale, 0.12 * scale, 0.2 * scale, 8)), f.mat(PAL.pot));
  pot.position.set(x, 0.1 * scale, z);
  pot.castShadow = f.shadows;
  f.scene.add(pot);
  const crown = new Group();
  crown.userData.noBatch = true;
  crown.position.set(x, 0.36 * scale, z);
  const leafGeo = f.geo(new SphereGeometry(0.16 * scale, 7, 5));
  const leafMat = f.mat(PAL.leaf);
  for (let i = 0; i < 3; i++) {
    const leaf = new Mesh(leafGeo, leafMat);
    const angle = (i / 3) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.08 * scale, 0.1 * scale, Math.sin(angle) * 0.08 * scale);
    leaf.scale.set(0.85, 1.25, 0.85);
    crown.add(leaf);
  }
  f.scene.add(crown);
  return { mesh: crown, phase };
}

function addAccentRug(f: AmbientFactories) {
  const rugPlace = pantryRug();
  const rug = new Mesh(f.geo(new PlaneGeometry(rugPlace.width, rugPlace.depth)), f.mat(PANTRY_RUG_COLOR));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(rugPlace.x, 0.008, rugPlace.z);
  rug.receiveShadow = f.shadows;
  f.scene.add(rug);
}

function addWarmLamps(f: AmbientFactories, lamps: PointLight[]) {
  // El charco va en el lightmap. La pantalla no añade otra PointLight.
  void lamps;
  for (const lamp of FLOOR_LAMPS) addFloorLamp(f, lamp.x, lamp.z);
}

function addFloorLamp(f: AmbientFactories, x: number, z: number) {
  const mouth = FLOOR_SHADE_Y - FLOOR_SHADE.height / 2;
  const poleHeight = mouth - 0.04;
  const base = new Mesh(f.geo(new CylinderGeometry(0.15, 0.18, 0.04, 8)), f.mat(LAMP_METAL));
  base.position.set(x, 0.02, z);
  base.castShadow = f.shadows;
  f.scene.add(base);
  const pole = new Mesh(f.geo(new CylinderGeometry(0.016, 0.02, poleHeight, 6)), f.mat(LAMP_METAL));
  pole.position.set(x, 0.04 + poleHeight / 2, z);
  pole.castShadow = f.shadows;
  f.scene.add(pole);
  addLampHead(
    { parent: f.scene, geo: f.geo, mat: f.mat, materials: f.materials, shadows: f.shadows },
    {
      x,
      z,
      shadeY: FLOOR_SHADE_Y,
      shade: FLOOR_SHADE,
      glow: FLOOR_GLOW,
      lit: true,
    },
  );
}

function addCeilingFan(f: AmbientFactories, fan: Group) {
  fan.position.set(0.2, CEILING_UNDERSIDE - 0.08, 1.7);
  const hub = new Mesh(f.geo(new CylinderGeometry(0.07, 0.07, 0.08, 8)), f.mat(PAL.fan));
  fan.add(hub);
  const bladeGeo = f.geo(new PlaneGeometry(0.72, 0.12));
  const bladeMat = f.mat(PAL.fan);
  for (let i = 0; i < 3; i++) {
    const pivot = new Group();
    pivot.rotation.y = (i * Math.PI * 2) / 3;
    const blade = new Mesh(bladeGeo, bladeMat);
    blade.rotation.x = -Math.PI / 2;
    blade.position.x = 0.4;
    pivot.add(blade);
    fan.add(pivot);
  }
}

function upgradeWindows(f: AmbientFactories, mats: MeshBasicMaterial[]) {
  const positions = [-1.05, 2.6];
  for (const x of positions) {
    const { material, canvas, ctx } = createNightWindow(f.materials);
    mats.push(material);
    const pane = new Mesh(f.geo(new PlaneGeometry(1.5, 1.1)), material);
    pane.position.set(x, 1.6, -7.36);
    pane.userData.nightWindow = { canvas, ctx, material };
    f.scene.add(pane);
  }
}

export function paintNightWindows(mats: MeshBasicMaterial[], time: number) {
  for (const material of mats) {
    const canvas = material.map?.image as HTMLCanvasElement | undefined;
    if (!canvas) continue;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    drawNightSky(ctx, canvas.width, canvas.height, time + canvas.width);
    material.map!.needsUpdate = true;
  }
}

function drawNightSky(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
  ctx.fillStyle = "#14182b";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 24; i++) {
    const sx = (i * 37) % w;
    const sy = (i * 19) % (h * 0.55);
    ctx.fillStyle = i % 5 === 0 ? "#ffb703" : "#f6f1e7";
    ctx.fillRect(sx, sy, 2, 2);
  }
  const cloudX = ((time * 12) % (w + 40)) - 20;
  ctx.fillStyle = "rgba(70,82,112,0.55)";
  ctx.fillRect(cloudX, h * 0.55, 36, 8);
  ctx.fillRect(cloudX + 14, h * 0.52, 28, 10);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = `rgba(255,183,3,${0.35 + (i % 3) * 0.15})`;
    ctx.fillRect(8 + i * 14, h - 14 - (i % 2) * 4, 4, 6);
  }
}

function createNightWindow(materials: Material[]): {
  material: MeshBasicMaterial;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 72;
  const ctx = canvas.getContext("2d")!;
  drawNightSky(ctx, canvas.width, canvas.height, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture });
  material.userData.live = true;
  materials.push(material);
  return { material, canvas, ctx };
}

function createBlinkingScreen(materials: Material[], accent: string, mode: "code" | "tv"): MeshBasicMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 48;
  const ctx = canvas.getContext("2d")!;
  paintScreen(ctx, canvas, accent, mode, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture, color: 0xffffff });
  material.userData.live = true;
  materials.push(material);
  material.userData.screenPaint = { canvas, ctx, accent, mode };
  return material;
}

export function blinkScreenMaterial(material: MeshBasicMaterial, time: number) {
  const data = material.userData.screenPaint as
    | { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; accent: string; mode: "code" | "tv" }
    | undefined;
  if (!data) return;
  if (Math.sin(time * 4) > 0.92) {
    paintScreen(data.ctx, data.canvas, data.accent, data.mode, time);
    material.map!.needsUpdate = true;
  }
}

function paintScreen(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  accent: string,
  mode: "code" | "tv",
  time: number,
) {
  ctx.fillStyle = "#101826";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = accent;
  if (mode === "code") {
    for (let row = 0; row < 6; row++) {
      ctx.fillRect(6, 6 + row * 7, 20 + ((time + row) % 3) * 8, 3);
    }
  } else {
    ctx.fillRect(8, 10, 48, 28);
  }
}

function addCatOnCrates(f: AmbientFactories): { head: Mesh; eyes: Object3D; tail: Object3D } {
  const x = LAYOUT.crates.x;
  const z = LAYOUT.crates.z;
  f.box(f.scene, 0.56, 0.4, 0.5, x, 0.2, z, 0x8d5a34);
  f.box(f.scene, 0.48, 0.34, 0.42, x, 0.57, z, 0x734826);
  const y = 0.84;
  f.box(f.scene, 0.28, 0.16, 0.32, x, y, z, PAL.cat);

  const pivot = new Group();
  pivot.position.set(x - 0.14, y + 0.05, z);
  f.scene.add(pivot);
  const skull = new Mesh(f.geo(new SphereGeometry(0.13, 10, 8)), f.mat(PAL.cat));
  const earGeo = f.geo(new BoxGeometry(0.04, 0.08, 0.026));
  const earL = new Mesh(earGeo, f.mat(PAL.cat));
  earL.position.set(-0.045, 0.1, 0.01);
  earL.rotation.z = 0.45;
  const earR = new Mesh(earGeo, f.mat(PAL.cat));
  earR.position.set(0.045, 0.1, 0.01);
  earR.rotation.z = -0.45;
  pivot.add(skull, earL, earR);
  const head = fuseMeshes([skull, earL, earR]);
  f.geo(head.geometry);
  head.userData.noBatch = true;
  head.castShadow = f.shadows;

  const eyeGeo = f.geo(new BoxGeometry(0.03, 0.024, 0.014));
  const eyeMat = f.mat(0x1a1a22);
  const eyeL = new Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.038, 0.02, 0.11);
  const eyeR = new Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.038, 0.02, 0.11);
  head.add(eyeL, eyeR);
  const eyes = fuseMeshes([eyeL, eyeR]);
  f.geo(eyes.geometry);
  eyes.userData.noBatch = true;
  eyes.castShadow = false;

  const tail = new Group();
  tail.userData.noBatch = true;
  tail.position.set(x + 0.1, y - 0.02, z);
  const seg = new Mesh(f.geo(new BoxGeometry(0.16, 0.04, 0.04)), f.mat(PAL.cat));
  seg.position.x = 0.06;
  tail.add(seg);
  f.scene.add(tail);
  return { head, eyes, tail };
}

function addRadio(f: AmbientFactories): MeshBasicMaterial {
  const radio = new Group();
  radio.name = "radio";
  radio.userData.interactId = "radio";
  radio.position.set(LAYOUT.radio.x, 0, LAYOUT.radio.z);
  radio.rotation.y = -Math.PI / 2;
  f.scene.add(radio);
  f.box(radio, 0.42, 0.36, 0.36, 0, 0.18, 0, 0x6d4b32);
  f.box(radio, 0.36, 0.2, 0.22, 0, 0.48, 0, PAL.radio);
  f.box(radio, 0.03, 0.16, 0.03, 0.1, 0.64, 0, 0x8d97a8, false);
  const dialMat = new MeshBasicMaterial({ color: PAL.wrapper });
  f.materials.push(dialMat);
  f.pulses.push(dialMat);
  const dial = new Mesh(f.geo(new CylinderGeometry(0.045, 0.045, 0.02, 10)), dialMat);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(-0.08, 0.5, 0.12);
  radio.add(dial);
  return dialMat;
}

function addSleepingDog(f: AmbientFactories): { snore: HTMLDivElement; chest: Object3D } {
  const x = LAYOUT.dog.x;
  const z = LAYOUT.dog.z;
  f.box(f.scene, 0.55, 0.14, 0.24, x, 0.08, z, PAL.dog);
  const head = new Mesh(f.geo(new SphereGeometry(0.12, 10, 8)), f.mat(PAL.dog));
  head.position.set(x - 0.32, 0.1, z + 0.04);
  head.castShadow = f.shadows;
  f.scene.add(head);
  f.box(f.scene, 0.04, 0.07, 0.03, x - 0.36, 0.2, z + 0.09, PAL.dog, false);
  f.box(f.scene, 0.04, 0.07, 0.03, x - 0.36, 0.2, z - 0.01, PAL.dog, false);
  const chest = new Mesh(f.geo(new BoxGeometry(0.32, 0.06, 0.16)), f.mat(PAL.dog));
  chest.position.set(x, 0.16, z);
  chest.userData.noBatch = true;
  chest.castShadow = false;
  f.scene.add(chest);
  f.box(f.scene, 0.016, 0.008, 0.028, x - 0.42, 0.125, z + 0.01, 0x1a1a22, false);
  f.box(f.scene, 0.016, 0.008, 0.028, x - 0.42, 0.125, z + 0.07, 0x1a1a22, false);
  f.box(f.scene, 0.16, 0.08, 0.1, x + 0.26, 0.06, z - 0.06, PAL.dog, false);

  const snore = document.createElement("div");
  snore.className = "speech-bubble snore-bubble";
  snore.hidden = true;
  snore.textContent = "Zzz…";
  const label = new CSS2DObject(snore);
  label.position.set(x - 0.1, 0.35, z);
  f.scene.add(label);
  return { snore, chest };
}

export function tickCornerReactions(
  interact: CornerInteractables,
  player: Vector3,
  time: number,
  dt: number,
  reduced: boolean,
  beatBass = 0,
  beatMid = 0,
) {
  const catX = LAYOUT.crates.x - 0.14;
  const catZ = LAYOUT.crates.z;
  const nearCat = Math.hypot(player.x - catX, player.z - catZ) < 2.4;
  if (nearCat) {
    const angle = Math.atan2(player.x - catX, player.z - catZ);
    interact.catHead.rotation.y = angle;
  } else {
    interact.catHead.rotation.y *= 0.92;
  }

  const nearDog = Math.hypot(player.x - LAYOUT.dog.x, player.z - LAYOUT.dog.z) < 2.2;
  interact.dogSnore.hidden = !nearDog;

  const nearRadio = Math.hypot(player.x - LAYOUT.radio.x, player.z - LAYOUT.radio.z) < RADIO_USE_RADIUS;
  if (nearRadio && !reduced) {
    const hue = 0.55 + Math.sin(time * 2.3) * 0.45;
    interact.radioDial.color.setHSL(hue, 0.85, 0.55);
  }

  if (!reduced) {
    interact.fan.rotation.y += dt * 1.7 * (1 + beatBass * 0.35);
    for (const plant of interact.sway) {
      const sway = 0.09 + beatMid * 0.02;
      plant.mesh.rotation.z = Math.sin(time * 1.15 + plant.phase) * sway;
      plant.mesh.rotation.x = Math.cos(time * 0.9 + plant.phase) * 0.04;
    }
    for (const lamp of interact.lamps) {
      const phase = (lamp.userData.phase as number) ?? 0;
      const base = (lamp.userData.base as number) ?? 2;
      const blink = Math.sin(time * 7.4 + phase) > 0.984 ? 0.72 : 1;
      lamp.intensity = base * (0.93 + Math.sin(time * 1.8 + phase) * 0.07) * blink * (1 + beatBass * 0.18);
    }
    const slot = windowPaintSlot(time);
    if (slot !== interact.windowSlot) {
      interact.windowSlot = slot;
      paintNightWindows(interact.windowMats, time);
    }
    interact.catEyes.scale.y = blinkOpen(time, 0.6);
    interact.catTail.rotation.z = Math.sin(time * 2.4) * 0.4;
    interact.dogChest.scale.y = breathScale(time, 1.3);
    blinkScreenMaterial(interact.pcScreen, time);
    interact.pcScreen.color.setScalar(1 + beatMid * 0.22);
    const neonPulse = (0.75 + Math.sin(time * 2.8) * 0.25) * (1 + beatMid * 0.12);
    interact.neonMat.color.setScalar(neonPulse);
  }
}

function addFridgeHum(f: AmbientFactories): Mesh {
  const x = LAYOUT.fridge.x;
  const z = LAYOUT.fridge.z;
  f.box(f.scene, 0.72, 1.35, 0.58, x, 0.68, z, 0xd8e4ef);
  f.box(f.scene, 0.68, 0.04, 0.54, x, 1.36, z, 0xb8c5d0, false);
  f.box(f.scene, 0.04, 0.35, 0.06, x - 0.32, 0.85, z + 0.32, PAL.tool, false);
  f.box(f.scene, 0.14, 0.18, 0.008, x, 1.02, z + 0.31, PAL.cartridge, false);
  f.box(f.scene, 0.12, 0.14, 0.006, x, 1.02, z + 0.318, PAL.neon, false);
  const hum = new Mesh(f.geo(new SphereGeometry(0.02, 6, 4)), new MeshBasicMaterial({ color: 0xffffff }));
  hum.userData.noBatch = true;
  f.materials.push(hum.material);
  hum.position.set(x + 0.28, 0.15, z + 0.32);
  f.scene.add(hum);
  return hum;
}

export function addFridgeCorner(f: AmbientFactories): Mesh {
  return addFridgeHum(f);
}
