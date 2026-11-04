import { BoxGeometry, CylinderGeometry, Group, Mesh, SphereGeometry } from "three";
import type { AmbientFactories } from "./ambient";
import { fuseMeshes } from "./mesh-fuse";
import { LAYOUT } from "./navigation";
import { PANTRY_COUNTER } from "./pantry-layout";

const DESK = 0x6d4b32;
const DESK_DARK = 0x3d2a24;
const MONITOR = 0x171225;
const SHELF = 0x465270;
const TOOL = 0x8d97a8;
const PIZZA = 0xc46b3a;
const LEAF = 0x2f7d4a;
const TROPHY = 0xffb703;
const PINK = 0xff6b9d;
const FRIDGE = 0xd8e4ef;

/** Encimera, café, taza, tostadora, frutero y balda. Colores que `mat()` ya usa. */
export function addPantryKitchen(f: AmbientFactories): void {
  const x = PANTRY_COUNTER.x;
  const z = PANTRY_COUNTER.z;
  f.box(f.scene, 0.64, 0.66, 0.36, x, 0.33, z, DESK_DARK, false);
  f.box(f.scene, 0.7, 0.04, 0.42, x, 0.68, z, DESK, false);
  f.box(f.scene, 0.16, 0.22, 0.14, x - 0.18, 0.81, z - 0.02, TOOL, false);
  f.box(f.scene, 0.12, 0.03, 0.1, x - 0.18, 0.935, z - 0.02, MONITOR, false);
  f.box(f.scene, 0.04, 0.06, 0.04, x - 0.18, 0.78, z + 0.08, MONITOR, false);

  const cup = new Mesh(f.geo(new CylinderGeometry(0.035, 0.03, 0.07, 8)), f.mat(TROPHY));
  cup.position.set(x + 0.02, 0.755, z + 0.1);
  cup.castShadow = false;
  f.scene.add(cup);

  f.box(f.scene, 0.18, 0.11, 0.14, x + 0.2, 0.775, z - 0.04, PIZZA, false);
  f.box(f.scene, 0.05, 0.02, 0.07, x + 0.16, 0.84, z - 0.04, MONITOR, false);
  f.box(f.scene, 0.05, 0.02, 0.07, x + 0.24, 0.84, z - 0.04, MONITOR, false);

  const bowl = new Mesh(f.geo(new CylinderGeometry(0.07, 0.05, 0.045, 8)), f.mat(DESK_DARK));
  bowl.position.set(x + 0.08, 0.72, z + 0.08);
  bowl.castShadow = false;
  f.scene.add(bowl);
  const apple = new Mesh(f.geo(new SphereGeometry(0.04, 6, 5)), f.mat(LEAF));
  apple.position.set(x + 0.05, 0.77, z + 0.08);
  apple.castShadow = false;
  f.scene.add(apple);
  const citrus = new Mesh(f.geo(new SphereGeometry(0.035, 6, 5)), f.mat(PINK));
  citrus.position.set(x + 0.11, 0.765, z + 0.1);
  citrus.castShadow = false;
  f.scene.add(citrus);

  f.box(f.scene, 0.42, 0.035, 0.14, 9.48, 1.48, 7.32, SHELF, false);
  const jar = new Mesh(f.geo(new CylinderGeometry(0.04, 0.045, 0.1, 8)), f.mat(TROPHY));
  jar.position.set(9.46, 1.56, 7.28);
  jar.castShadow = false;
  f.scene.add(jar);
  f.box(f.scene, 0.08, 0.06, 0.06, 9.46, 1.54, 7.4, LEAF, false);

  // Hueco justo por delante del cuerpo y detrás de la puerta cerrada.
  f.box(f.scene, 0.5, 0.66, 0.012, LAYOUT.fridge.x - 0.02, 0.64, LAYOUT.fridge.z + 0.305, MONITOR, false);
  f.box(f.scene, 0.05, 0.09, 0.02, LAYOUT.fridge.x - 0.12, 0.48, LAYOUT.fridge.z + 0.316, PINK, false);
}

/**
 * Puerta con el tirador fundido en el mismo material que el cuerpo.
 * Una sola malla, fuera del batch, para poder abrirla.
 */
export function addFridgeDoor(f: AmbientFactories): Group {
  const hinge = new Group();
  hinge.name = "fridge-door";
  hinge.userData.noBatch = true;
  hinge.position.set(LAYOUT.fridge.x + 0.34, 0.64, LAYOUT.fridge.z + 0.3);
  f.scene.add(hinge);
  const panel = new Mesh(f.geo(new BoxGeometry(0.64, 0.78, 0.03)), f.mat(FRIDGE));
  panel.position.set(-0.32, 0, 0.045);
  const handle = new Mesh(f.geo(new BoxGeometry(0.04, 0.26, 0.045)), f.mat(FRIDGE));
  handle.position.set(-0.58, 0.06, 0.07);
  hinge.add(panel, handle);
  const door = fuseMeshes([panel, handle]);
  f.geo(door.geometry);
  door.userData.noBatch = true;
  door.castShadow = f.shadows;
  door.receiveShadow = false;
  return hinge;
}
