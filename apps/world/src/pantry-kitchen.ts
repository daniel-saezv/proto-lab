import { BoxGeometry, CylinderGeometry, Group, Mesh, SphereGeometry } from "three";
import type { AmbientFactories } from "./ambient";
import { CEILING_UNDERSIDE } from "./navigation";
import { fuseMeshes } from "./mesh-fuse";
import {
  CAT_BED,
  DOG_BED,
  FRIDGE_DEPTH,
  FRIDGE_HINGE,
  FRIDGE_PLACE,
  FRIDGE_WIDTH,
  KITCHEN_BIN,
  KITCHEN_TABLE,
  PANTRY_COUNTER,
} from "./pantry-layout";
import {
  HANGING_GLOW,
  HANGING_SHADE,
  LAMP_METAL,
  addLampHead,
} from "./scene-lights";

const WOOD = 0x6d4b32;
const WOOD_DARK = 0x3d2a24;
const STONE = 0x8d97a8;
const INK = 0x171225;
const CUPBOARD = 0x465270;
const FRIDGE = 0xd8e4ef;
const PINK = 0xff6b9d;
const LEAF = 0x2f7d4a;
const DOG_CLOTH = 0x8d6e4a;
const CAT_CLOTH = 0xe07a3d;

/**
 * Muebles bajos, fregadero, vitro, altos, microondas, mesa, taburetes,
 * cubo, camas y una lámpara colgada. Colores que `mat()` ya usa.
 * La puerta de la nevera va aparte para poder abrirse.
 */
export function addPantryKitchen(f: AmbientFactories): void {
  addCabinetRun(f);
  addWallCupboards(f);
  addTable(f);
  addBin(f);
  addPetBeds(f);
  addPendant(f);
  addFridgeCavity(f);
}

/** Puerta con el tirador fundido. Una sola malla, fuera del batch. */
export function addFridgeDoor(f: AmbientFactories): Group {
  const hinge = new Group();
  hinge.name = "fridge-door";
  hinge.userData.noBatch = true;
  hinge.position.set(FRIDGE_HINGE.x, FRIDGE_HINGE.y, FRIDGE_HINGE.z);
  f.scene.add(hinge);
  const panel = new Mesh(f.geo(new BoxGeometry(0.04, 1.02, 0.7)), f.mat(FRIDGE));
  panel.position.set(-0.028, 0, -0.36);
  const handle = new Mesh(f.geo(new BoxGeometry(0.035, 0.26, 0.04)), f.mat(FRIDGE));
  handle.position.set(-0.055, 0.02, -0.66);
  hinge.add(panel, handle);
  const door = fuseMeshes([panel, handle]);
  f.geo(door.geometry);
  door.userData.noBatch = true;
  door.castShadow = f.shadows;
  door.receiveShadow = false;
  const window = new Mesh(f.geo(new BoxGeometry(0.012, 0.16, 0.2)), f.mat(INK));
  window.position.set(-0.052, 0.28, -0.32);
  window.userData.noBatch = true;
  window.castShadow = false;
  hinge.add(window);
  return hinge;
}

function addCabinetRun(f: AmbientFactories): void {
  const x = PANTRY_COUNTER.x;
  const z = PANTRY_COUNTER.z;
  f.box(f.scene, 0.5, 0.64, 1.84, x + 0.02, 0.32, z, WOOD_DARK, false);
  f.box(f.scene, 0.62, 0.045, 1.96, x - 0.04, 0.68, z, STONE, false);
  for (const doorZ of [z - 0.6, z, z + 0.6]) {
    f.box(f.scene, 0.02, 0.5, 0.5, x - 0.25, 0.32, doorZ, WOOD, false);
  }

  const sinkZ = z;
  f.box(f.scene, 0.3, 0.04, 0.24, x - 0.06, 0.69, sinkZ, INK, false);
  f.box(f.scene, 0.03, 0.16, 0.03, x - 0.02, 0.8, sinkZ - 0.08, STONE, false);
  f.box(f.scene, 0.14, 0.025, 0.03, x - 0.08, 0.88, sinkZ - 0.02, STONE, false);

  const hobZ = z + 0.6;
  f.box(f.scene, 0.34, 0.02, 0.32, x - 0.06, 0.715, hobZ, INK, false);
  f.box(f.scene, 0.1, 0.012, 0.1, x - 0.1, 0.73, hobZ - 0.06, WOOD_DARK, false);
  f.box(f.scene, 0.1, 0.012, 0.1, x - 0.02, 0.73, hobZ + 0.06, WOOD_DARK, false);

  const microZ = z - 0.6;
  f.box(f.scene, 0.28, 0.18, 0.24, x - 0.08, 0.82, microZ, STONE, false);
  f.box(f.scene, 0.012, 0.1, 0.14, x - 0.22, 0.83, microZ, INK, false);
  f.box(f.scene, 0.02, 0.04, 0.02, x - 0.2, 0.78, microZ + 0.08, WOOD_DARK, false);
}

function addWallCupboards(f: AmbientFactories): void {
  const x = 9.44;
  const z = PANTRY_COUNTER.z + 0.12;
  f.box(f.scene, 0.28, 0.46, 1.28, x, 1.55, z, CUPBOARD, false);
  f.box(f.scene, 0.02, 0.38, 0.56, x - 0.15, 1.55, z - 0.32, WOOD_DARK, false);
  f.box(f.scene, 0.02, 0.38, 0.56, x - 0.15, 1.55, z + 0.32, WOOD_DARK, false);
}

function addTable(f: AmbientFactories): void {
  const x = KITCHEN_TABLE.x;
  const z = KITCHEN_TABLE.z;
  f.box(f.scene, 0.74, 0.04, 0.52, x, 0.6, z, WOOD, false);
  for (const lx of [-0.3, 0.3]) {
    for (const lz of [-0.18, 0.18]) {
      f.box(f.scene, 0.05, 0.56, 0.05, x + lx, 0.28, z + lz, WOOD_DARK, false);
    }
  }
  const bowl = new Mesh(f.geo(new CylinderGeometry(0.07, 0.05, 0.04, 8)), f.mat(WOOD_DARK));
  bowl.position.set(x + 0.08, 0.64, z);
  bowl.castShadow = false;
  f.scene.add(bowl);
  const apple = new Mesh(f.geo(new SphereGeometry(0.035, 6, 5)), f.mat(PINK));
  apple.position.set(x + 0.05, 0.68, z - 0.02);
  apple.castShadow = false;
  f.scene.add(apple);
  const citrus = new Mesh(f.geo(new SphereGeometry(0.03, 6, 5)), f.mat(LEAF));
  citrus.position.set(x + 0.1, 0.675, z + 0.03);
  citrus.castShadow = false;
  f.scene.add(citrus);

  for (const stoolZ of [z - 0.28, z + 0.28]) {
    const seat = new Mesh(f.geo(new CylinderGeometry(0.13, 0.13, 0.04, 8)), f.mat(0xc46b3a));
    seat.position.set(x - 0.38, 0.46, stoolZ);
    seat.castShadow = false;
    f.scene.add(seat);
    const leg = new Mesh(f.geo(new CylinderGeometry(0.035, 0.04, 0.44, 6)), f.mat(WOOD_DARK));
    leg.position.set(x - 0.38, 0.22, stoolZ);
    leg.castShadow = false;
    f.scene.add(leg);
  }
}

function addBin(f: AmbientFactories): void {
  const x = KITCHEN_BIN.x;
  const z = KITCHEN_BIN.z;
  f.box(f.scene, 0.26, 0.36, 0.22, x, 0.18, z, WOOD_DARK, false);
  f.box(f.scene, 0.28, 0.035, 0.24, x, 0.38, z, CUPBOARD, false);
}

function addPetBeds(f: AmbientFactories): void {
  f.box(f.scene, 0.62, 0.045, 0.4, DOG_BED.x, 0.03, DOG_BED.z, WOOD_DARK, false);
  f.box(f.scene, 0.48, 0.035, 0.28, DOG_BED.x, 0.065, DOG_BED.z, DOG_CLOTH, false);
  f.box(f.scene, 0.44, 0.04, 0.32, CAT_BED.x, 0.028, CAT_BED.z, WOOD_DARK, false);
  f.box(f.scene, 0.32, 0.03, 0.22, CAT_BED.x, 0.058, CAT_BED.z, CAT_CLOTH, false);
}

function addPendant(f: AmbientFactories): void {
  const x = KITCHEN_TABLE.x;
  const z = KITCHEN_TABLE.z;
  const shadeY = 1.92;
  const cordTop = CEILING_UNDERSIDE;
  const cordBottom = shadeY + HANGING_SHADE.height / 2;
  const cord = new Mesh(
    f.geo(new CylinderGeometry(0.012, 0.012, cordTop - cordBottom, 6)),
    f.mat(LAMP_METAL),
  );
  cord.position.set(x, (cordTop + cordBottom) / 2, z);
  cord.castShadow = false;
  f.scene.add(cord);
  addLampHead(
    { parent: f.scene, geo: f.geo, mat: f.mat, materials: f.materials, shadows: f.shadows },
    { x, z, shadeY, shade: HANGING_SHADE, glow: HANGING_GLOW, lit: true },
  );
}

function addFridgeCavity(f: AmbientFactories): void {
  const x = FRIDGE_HINGE.x + 0.1;
  const z = FRIDGE_PLACE.z;
  f.box(f.scene, 0.02, 0.86, FRIDGE_WIDTH - 0.14, x, 0.62, z, INK, false);
  f.box(f.scene, 0.06, 0.12, 0.06, x + 0.06, 0.42, z - 0.12, PINK, false);
  f.box(f.scene, FRIDGE_DEPTH - 0.06, 0.04, FRIDGE_WIDTH - 0.06, FRIDGE_PLACE.x, 1.34, z, 0xb8c5d0, false);
}
