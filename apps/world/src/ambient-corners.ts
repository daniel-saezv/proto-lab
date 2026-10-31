import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
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
  rugAccent: 0x3c4a68,
  cat: 0xe07a3d,
  dog: 0x8d6e4a,
  radio: 0x6d4b32,
  wrapper: 0xffb703,
};

export type CornerInteractables = {
  catHead: Mesh;
  dogSnore: HTMLDivElement;
  radioDial: MeshBasicMaterial;
  fan: Group;
  windowMats: MeshBasicMaterial[];
  pcScreen: MeshBasicMaterial;
  neonMat: MeshBasicMaterial;
};

export function addStoryCorners(f: AmbientFactories): {
  colliders: AmbientCollider[];
  interact: CornerInteractables;
} {
  const colliders: AmbientCollider[] = [
    { id: "desk", x: 6.55, z: -5.35, collider: 0.38 },
    { id: "shelves", x: 7.05, z: -4.15, collider: 0.28 },
    { id: "pinball", x: -4.85, z: 5.55, collider: 0.4 },
    { id: "fridge", x: 7.35, z: 5.2, collider: 0.32 },
    { id: "dog", x: 6.15, z: 5.85, collider: 0.24 },
  ];

  const work = addWorkCorner(f);
  addPinballRepair(f);
  addNeonAndPizza(f, work.neonMat);
  addWhiteboardDoodles(f);
  addExtraPlants(f);
  addAccentRug(f);
  addWarmLamps(f);
  addCeilingFan(f, work.fan);
  upgradeWindows(f, work.windowMats);

  return { colliders, interact: work };
}

function addWorkCorner(f: AmbientFactories): CornerInteractables {
  const dx = 6.55;
  const dz = -5.35;
  f.box(f.scene, 1.35, 0.72, 0.75, dx, 0.36, dz, PAL.desk);
  f.box(f.scene, 0.9, 0.04, 0.55, dx + 0.15, 0.74, dz + 0.05, PAL.deskDark, false);
  f.box(f.scene, 0.38, 0.28, 0.08, dx - 0.35, 0.88, dz + 0.28, PAL.monitor);
  const pcScreen = createBlinkingScreen(f.materials, "#8fd8ff", "code");
  const screen = new Mesh(f.geo(new PlaneGeometry(0.32, 0.22)), pcScreen);
  screen.position.set(dx - 0.35, 0.9, dz + 0.33);
  f.scene.add(screen);
  f.box(f.scene, 0.08, 0.04, 0.2, dx + 0.42, 0.78, dz - 0.05, PAL.wrapper, false);
  f.box(f.scene, 0.25, 0.08, 0.18, dx - 0.05, 0.78, dz - 0.18, 0xf4efe4, false);
  f.box(f.scene, 0.14, 0.06, 0.14, dx + 0.28, 0.77, dz + 0.12, PAL.cartridge, false);

  const sx = 7.05;
  const sz = -4.15;
  f.box(f.scene, 0.95, 1.25, 0.32, sx, 0.62, sz, PAL.shelf);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const color = col % 2 === 0 ? PAL.cartridge : 0x1f8a80;
      f.box(f.scene, 0.14, 0.18, 0.1, sx - 0.28 + col * 0.18, 0.35 + row * 0.38, sz + 0.18, color, false);
    }
  }
  const trophy = new Mesh(f.geo(new CylinderGeometry(0.08, 0.12, 0.22, 8)), new MeshBasicMaterial({ color: PAL.trophy }));
  f.materials.push(trophy.material);
  trophy.position.set(sx, 1.32, sz + 0.12);
  f.scene.add(trophy);

  const neonMat = new MeshBasicMaterial({ color: PAL.neon });
  f.materials.push(neonMat);
  const fan = new Group();
  fan.position.set(-6.3, 2.95, -4.3);
  f.scene.add(fan);
  const windowMats: MeshBasicMaterial[] = [];

  return {
    catHead: addCatOnCrates(f),
    dogSnore: addSleepingDog(f),
    radioDial: addRadio(f),
    fan,
    windowMats,
    pcScreen,
    neonMat,
  };
}

function addPinballRepair(f: AmbientFactories) {
  const x = -4.85;
  const z = 5.55;
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
  const sign = new Mesh(f.geo(new PlaneGeometry(1.4, 0.35)), neonMat);
  sign.position.set(1.2, 2.05, -7.33);
  f.scene.add(sign);
  f.pulses.push(neonMat);

  const stackX = 7.1;
  const stackZ = -2.2;
  for (let i = 0; i < 3; i++) {
    f.box(f.scene, 0.42, 0.06, 0.42, stackX, 0.05 + i * 0.07, stackZ, PAL.pizza, false);
  }
  f.box(f.scene, 0.35, 0.04, 0.35, stackX + 0.05, 0.26, stackZ + 0.08, 0xf4efe4, false);
}

function addWhiteboardDoodles(f: AmbientFactories) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = "#465270";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(80, 70, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffb703";
  ctx.font = "700 22px sans-serif";
  ctx.fillText("idea???", 120, 60);
  ctx.strokeStyle = "#1f8a80";
  ctx.beginPath();
  ctx.moveTo(30, 120);
  ctx.lineTo(220, 100);
  ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture });
  f.materials.push(material);
  const board = new Mesh(f.geo(new PlaneGeometry(1.1, 0.72)), material);
  board.position.set(5.6, 1.45, -7.34);
  f.scene.add(board);
}

function addExtraPlants(f: AmbientFactories) {
  addPottedPlant(f, -2.2, 4.8);
  addPottedPlant(f, 4.5, 6.0, 0.85);
}

function addPottedPlant(f: AmbientFactories, x: number, z: number, scale = 1) {
  const pot = new Mesh(f.geo(new CylinderGeometry(0.18 * scale, 0.14 * scale, 0.22 * scale, 8)), f.mat(PAL.pot));
  pot.position.set(x, 0.11 * scale, z);
  pot.castShadow = f.shadows;
  f.scene.add(pot);
  const leaf = new Mesh(f.geo(new SphereGeometry(0.28 * scale, 8, 6)), f.mat(PAL.leaf));
  leaf.position.set(x, 0.48 * scale, z);
  leaf.castShadow = f.shadows;
  f.scene.add(leaf);
}

function addAccentRug(f: AmbientFactories) {
  const rug = new Mesh(f.geo(new PlaneGeometry(2.2, 1.4)), f.mat(PAL.rugAccent));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-4.2, 0.008, 4.6);
  rug.receiveShadow = f.shadows;
  f.scene.add(rug);
}

function addWarmLamps(f: AmbientFactories) {
  addFloorLamp(f, -8.55, 6.4, 0.55);
  addFloorLamp(f, 8.55, -6.15, 0.55);
}

function addFloorLamp(f: AmbientFactories, x: number, z: number, intensityScale = 1) {
  f.box(f.scene, 0.06, 0.05, 0.06, x, 0.025, z, 0x8d97a8, false);
  const pole = new Mesh(f.geo(new CylinderGeometry(0.03, 0.03, 1.1, 8)), f.mat(0x8d97a8));
  pole.position.set(x, 0.58, z);
  f.scene.add(pole);
  const bulbMat = new MeshBasicMaterial({ color: PAL.wrapper });
  f.materials.push(bulbMat);
  const bulb = new Mesh(f.geo(new SphereGeometry(0.11, 10, 8)), bulbMat);
  bulb.position.set(x, 1.18, z);
  f.scene.add(bulb);
  const light = new PointLight(PAL.wrapper, 5 * intensityScale, 4.2, 2);
  light.position.set(x, 1.15, z);
  f.scene.add(light);
}

function addCeilingFan(f: AmbientFactories, fan: Group) {
  const hub = new Mesh(f.geo(new CylinderGeometry(0.08, 0.08, 0.12, 10)), f.mat(PAL.fan));
  hub.position.set(0, 0, 0);
  fan.add(hub);
  const bladeGeo = f.geo(new PlaneGeometry(0.75, 0.12));
  for (let i = 0; i < 3; i++) {
    const blade = new Mesh(bladeGeo, f.mat(PAL.fan));
    blade.rotation.z = (i * Math.PI * 2) / 3;
    blade.position.y = -0.04;
    fan.add(blade);
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

function addCatOnCrates(f: AmbientFactories): Mesh {
  const x = 5.75;
  const z = 1.45;
  const y = 0.62;
  f.box(f.scene, 0.55, 0.55, 0.55, 5.7, 0.28, 1.35, 0x8d5a34);
  f.box(f.scene, 0.4, 0.4, 0.4, 6.15, 0.7, 1.6, 0x8d5a34);
  f.box(f.scene, 0.28, 0.18, 0.38, x, y, z, PAL.cat);
  const head = new Mesh(f.geo(new SphereGeometry(0.14, 10, 8)), f.mat(PAL.cat));
  head.position.set(x + 0.18, y + 0.08, z);
  head.castShadow = f.shadows;
  f.scene.add(head);
  f.box(f.scene, 0.04, 0.04, 0.04, x + 0.28, y + 0.12, z - 0.02, PAL.cat, false);
  f.box(f.scene, 0.04, 0.04, 0.04, x + 0.28, y + 0.12, z + 0.02, PAL.cat, false);
  return head;
}

function addRadio(f: AmbientFactories): MeshBasicMaterial {
  const x = -4.35;
  const z = -0.85;
  f.box(f.scene, 0.38, 0.22, 0.24, x, 0.92, z, PAL.radio);
  f.box(f.scene, 0.04, 0.18, 0.04, x + 0.12, 1.08, z, 0x8d97a8, false);
  const dialMat = new MeshBasicMaterial({ color: PAL.wrapper });
  f.materials.push(dialMat);
  f.pulses.push(dialMat);
  const dial = new Mesh(f.geo(new CylinderGeometry(0.045, 0.045, 0.02, 10)), dialMat);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(x - 0.08, 0.94, z + 0.13);
  f.scene.add(dial);
  return dialMat;
}

function addSleepingDog(f: AmbientFactories): HTMLDivElement {
  const x = 6.15;
  const z = 5.85;
  f.box(f.scene, 0.55, 0.14, 0.24, x, 0.08, z, PAL.dog);
  const head = new Mesh(f.geo(new SphereGeometry(0.12, 10, 8)), f.mat(PAL.dog));
  head.position.set(x - 0.32, 0.1, z + 0.04);
  head.castShadow = f.shadows;
  f.scene.add(head);
  f.box(f.scene, 0.16, 0.08, 0.1, x + 0.26, 0.06, z - 0.06, PAL.dog, false);

  const snore = document.createElement("div");
  snore.className = "speech-bubble snore-bubble";
  snore.hidden = true;
  snore.textContent = "Zzz…";
  const label = new CSS2DObject(snore);
  label.position.set(x - 0.1, 0.35, z);
  f.scene.add(label);
  return snore;
}

export function tickCornerReactions(
  interact: CornerInteractables,
  player: Vector3,
  time: number,
  reduced: boolean,
) {
  const catX = 5.93;
  const catZ = 1.45;
  const nearCat = Math.hypot(player.x - catX, player.z - catZ) < 2.4;
  if (nearCat) {
    const angle = Math.atan2(player.x - catX, player.z - catZ);
    interact.catHead.rotation.y = angle;
  } else {
    interact.catHead.rotation.y *= 0.92;
  }

  const nearDog = Math.hypot(player.x - 6.15, player.z - 5.85) < 2.2;
  interact.dogSnore.hidden = !nearDog;

  const nearRadio = Math.hypot(player.x + 4.35, player.z + 0.85) < 2.1;
  if (nearRadio && !reduced) {
    const hue = 0.55 + Math.sin(time * 2.3) * 0.45;
    interact.radioDial.color.setHSL(hue, 0.85, 0.55);
  }

  if (!reduced) {
    interact.fan.rotation.y += 0.02;
    paintNightWindows(interact.windowMats, time);
    blinkScreenMaterial(interact.pcScreen, time);
    const neonPulse = 0.75 + Math.sin(time * 2.8) * 0.25;
    interact.neonMat.color.setScalar(neonPulse);
  }
}

function addFridgeHum(f: AmbientFactories): Mesh {
  const x = 7.35;
  const z = 5.2;
  f.box(f.scene, 0.72, 1.35, 0.58, x, 0.68, z, 0xd8e4ef);
  f.box(f.scene, 0.68, 0.04, 0.54, x, 1.36, z, 0xb8c5d0, false);
  f.box(f.scene, 0.04, 0.35, 0.06, x - 0.32, 0.85, z + 0.32, 0x8d97a8, false);
  const hum = new Mesh(f.geo(new SphereGeometry(0.02, 6, 4)), new MeshBasicMaterial({ color: 0xffffff }));
  f.materials.push(hum.material);
  hum.position.set(x + 0.28, 0.15, z + 0.32);
  f.scene.add(hum);
  return hum;
}

export function addFridgeCorner(f: AmbientFactories): Mesh {
  return addFridgeHum(f);
}
