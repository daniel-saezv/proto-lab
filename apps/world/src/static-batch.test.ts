import { BoxGeometry, Group, Mesh, MeshLambertMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";
import { batchStaticMeshes } from "./static-batch";

function countMeshes(root: Scene): { meshes: number; casters: number; instances: number; merged: number } {
  let meshes = 0;
  let casters = 0;
  let instances = 0;
  let merged = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshes += 1;
    if (object.castShadow) casters += 1;
    if (object.name === "static-instances") instances += 1;
    if (object.name === "static-merged") merged += 1;
  });
  return { meshes, casters, instances, merged };
}

describe("batch estático del lobby", () => {
  it("instancia la malla repetida y funde el resto del mismo material", () => {
    const scene = new Scene();
    const shared = new MeshLambertMaterial({ color: 0x445566 });
    const other = new MeshLambertMaterial({ color: 0x8899aa });
    const tracked = [];
    const small = new BoxGeometry(0.08, 0.16, 0.14);
    const wide = new BoxGeometry(2, 0.4, 0.4);
    const tall = new BoxGeometry(0.4, 2, 0.4);
    tracked.push(small, wide, tall);
    for (let i = 0; i < 6; i += 1) {
      const mesh = new Mesh(small, shared);
      mesh.position.set(i * 0.2, 0.2, 0);
      mesh.castShadow = true;
      scene.add(mesh);
    }
    for (const [w, x] of [
      [wide, -1],
      [tall, 1],
    ] as const) {
      const mesh = new Mesh(w, other);
      mesh.position.set(x, 1, 0);
      mesh.castShadow = true;
      scene.add(mesh);
    }
    const moving = new Group();
    moving.userData.noBatch = true;
    const kept = new Mesh(new BoxGeometry(0.3, 0.3, 0.3), shared);
    kept.castShadow = true;
    moving.add(kept);
    scene.add(moving);

    const stats = batchStaticMeshes(scene, tracked);
    const counts = countMeshes(scene);
    expect(stats.meshesBefore).toBe(9);
    expect(counts.instances).toBe(1);
    expect(counts.merged).toBe(1);
    expect(counts.meshes).toBe(3);
    expect(scene.children.some((child) => child === moving)).toBe(true);
    expect(kept.parent).toBe(moving);
    expect(counts.casters).toBe(2);
  });
});
