import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshLambertMaterial, Scene, type Material } from "three";
import type { AmbientFactories } from "./ambient";
import { addDeskTabletop } from "./ambient-corners";
import { addTable } from "./ambient-lounge";
import { LOUNGE_TABLE } from "./lounge-layout";
import { LAYOUT } from "./navigation";

const PINK = 0xff6b9d;

type Size = { w: number; h: number; d: number };

function factories() {
  const scene = new Scene();
  const materials: Material[] = [];
  const f: AmbientFactories = {
    scene,
    geo: (geometry) => geometry,
    mat: (color) => {
      const material = new MeshLambertMaterial({ color });
      materials.push(material);
      return material;
    },
    box(parent, w, h, d, x, y, z, color) {
      const material = new MeshLambertMaterial({ color });
      materials.push(material);
      const mesh = new Mesh(new BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.userData.size = { w, h, d } satisfies Size;
      parent.add(mesh);
      return mesh;
    },
    shadows: false,
    materials,
    pulses: [],
    reduced: true,
  };
  return { f, scene };
}

function sizeOf(mesh: Mesh): Size {
  return mesh.userData.size as Size;
}

function boxesOf(root: Scene | Group): Mesh[] {
  const boxes: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh && object.userData.size) boxes.push(object);
  });
  return boxes;
}

function bottom(mesh: Mesh): number {
  return mesh.position.y - sizeOf(mesh).h / 2;
}

function top(mesh: Mesh): number {
  return mesh.position.y + sizeOf(mesh).h / 2;
}

function overlaps(a: Mesh, b: Mesh): boolean {
  const sa = sizeOf(a);
  const sb = sizeOf(b);
  const overlapX = Math.abs(a.position.x - b.position.x) < (sa.w + sb.w) / 2;
  const overlapZ = Math.abs(a.position.z - b.position.z) < (sa.d + sb.d) / 2;
  return overlapX && overlapZ;
}

/** El borde inferior toca la superficie o la tapa de otra caja que hay debajo. */
function rests(mesh: Mesh, others: Mesh[], surfaceY: number): boolean {
  const y = bottom(mesh);
  if (Math.abs(y - surfaceY) <= 0.03) return true;
  return others.some((other) => other !== mesh && overlaps(mesh, other) && Math.abs(y - top(other)) <= 0.03);
}

function isPink(mesh: Mesh): boolean {
  const material = mesh.material;
  return material instanceof MeshLambertMaterial && material.color.getHex() === PINK;
}

describe("atrezzo apoyado", () => {
  it("las notas de la mesita, incluida la rosa, apoyan y no hay una losa flotando", () => {
    const { f } = factories();
    const parent = new Group();
    f.scene.add(parent);
    addTable(parent, f);
    const boxes = boxesOf(parent);
    const tableTop = 0.32;
    const clutter = boxes.filter((mesh) => mesh.position.y > 0.3);
    expect(clutter.length).toBeGreaterThan(5);
    for (const mesh of clutter) {
      expect(rests(mesh, clutter, tableTop), `${mesh.position.y}`).toBe(true);
    }
    const pink = clutter.filter(isPink);
    expect(pink.length).toBe(2);
    expect(Math.max(...pink.map((mesh) => mesh.position.y))).toBeLessThan(0.45);
    expect(pink.every((mesh) => sizeOf(mesh).h < 0.05)).toBe(true);
    expect(clutter.some((mesh) => mesh.position.x === LOUNGE_TABLE.x + 0.1 && isPink(mesh))).toBe(true);
  });

  it("el cartucho rosa del escritorio apoya y no hay una losa por encima del tablero", () => {
    const { f, scene } = factories();
    addDeskTabletop(f, LAYOUT.desk.x, LAYOUT.desk.z);
    const boxes = boxesOf(scene);
    const blotterTop = 0.76;
    expect(boxes).toHaveLength(8);
    for (const mesh of boxes) {
      expect(rests(mesh, boxes, blotterTop), `${mesh.position.y}`).toBe(true);
      expect(mesh.position.y).toBeLessThan(0.9);
    }
    const pink = boxes.filter(isPink);
    expect(pink).toHaveLength(1);
    expect(sizeOf(pink[0]!).h).toBeCloseTo(0.06);
    expect(bottom(pink[0]!)).toBeLessThan(blotterTop + 0.03);
  });
});
