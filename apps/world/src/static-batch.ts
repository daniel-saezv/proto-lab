import {
  BufferGeometry,
  InstancedMesh,
  Mesh,
  Object3D,
  Vector3,
  type Material,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Por debajo de este radio (mundo) un adorno no proyecta sombra. */
export const MIN_SHADOW_RADIUS = 0.22;

const MIN_INSTANCES = 3;
const worldScale = new Vector3();

export type BatchStats = {
  meshesBefore: number;
  meshesAfter: number;
  instancedSets: number;
  mergedSets: number;
  shadowCasters: number;
};

type Eligible = {
  mesh: Mesh;
  material: Material;
  interactId: string;
};

/**
 * Funde la geometría estática del lobby: instancias para la malla repetida
 * y un solo buffer por material para el resto. Las mallas con `userData.noBatch`
 * (o un ancestro así) y los materiales `userData.live` se quedan.
 */
export function batchStaticMeshes(root: Object3D, tracked: BufferGeometry[]): BatchStats {
  root.updateMatrixWorld(true);
  const { eligible, before } = collect(root);
  for (const item of eligible) relaxShadow(item.mesh);

  const instanceBuckets = new Map<string, Eligible[]>();
  for (const item of eligible) {
    const signature = geometrySignature(item.mesh.geometry);
    const key = signature
      ? `${signature}|${item.material.uuid}|${item.interactId}|${item.mesh.castShadow ? 1 : 0}|${item.mesh.receiveShadow ? 1 : 0}`
      : "";
    const bucket = instanceBuckets.get(key);
    if (bucket) bucket.push(item);
    else instanceBuckets.set(key, [item]);
  }

  let instancedSets = 0;
  const afterInstance: Eligible[] = [];
  for (const [key, items] of instanceBuckets) {
    if (!key || items.length < MIN_INSTANCES) {
      afterInstance.push(...items);
      continue;
    }
    buildInstances(root, items);
    instancedSets += 1;
  }

  const mergeBuckets = new Map<string, Eligible[]>();
  for (const item of afterInstance) {
    const key = `${item.material.uuid}|${item.interactId}|${item.mesh.castShadow ? 1 : 0}|${attributeKey(item.mesh.geometry)}`;
    const bucket = mergeBuckets.get(key);
    if (bucket) bucket.push(item);
    else mergeBuckets.set(key, [item]);
  }

  let mergedSets = 0;
  for (const items of mergeBuckets.values()) {
    if (items.length < 2) continue;
    if (buildMerged(root, items, tracked)) mergedSets += 1;
  }

  disposeUnused(root, tracked);

  let meshesAfter = 0;
  let shadowCasters = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshesAfter += 1;
    if (object.castShadow) shadowCasters += 1;
  });

  return { meshesBefore: before, meshesAfter, instancedSets, mergedSets, shadowCasters };
}

function collect(root: Object3D): { eligible: Eligible[]; before: number } {
  const eligible: Eligible[] = [];
  let before = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    before += 1;
    if (blocked(object) || !object.visible) return;
    const material = object.material;
    if (Array.isArray(material) || material.transparent || material.userData.live) return;
    eligible.push({ mesh: object, material, interactId: interactIdOf(object) });
  });
  return { eligible, before };
}

function blocked(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (current.userData.noBatch) return true;
    current = current.parent;
  }
  return false;
}

function interactIdOf(object: Object3D): string {
  let current: Object3D | null = object;
  while (current) {
    const id = current.userData.interactId;
    if (typeof id === "string") return id;
    current = current.parent;
  }
  return "";
}

function geometrySignature(geometry: BufferGeometry): string {
  const params = (geometry as BufferGeometry & { parameters?: Record<string, unknown> }).parameters;
  if (!params) return "";
  const parts: string[] = [];
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
      parts.push(`${key}:${value}`);
    } else {
      return "";
    }
  }
  return `${geometry.type}|${parts.join("|")}`;
}

function attributeKey(geometry: BufferGeometry): string {
  const names = Object.keys(geometry.attributes).sort().join(",");
  return `${geometry.index ? "i" : "n"}:${names}`;
}

function relaxShadow(mesh: Mesh) {
  if (!mesh.castShadow) return;
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere?.radius ?? 0;
  mesh.getWorldScale(worldScale);
  const worldRadius = radius * Math.max(worldScale.x, worldScale.y, worldScale.z);
  if (worldRadius < MIN_SHADOW_RADIUS) mesh.castShadow = false;
}

function buildInstances(root: Object3D, items: Eligible[]) {
  const sample = items[0]!;
  const mesh = new InstancedMesh(sample.mesh.geometry, sample.material, items.length);
  mesh.name = "static-instances";
  mesh.castShadow = sample.mesh.castShadow;
  mesh.receiveShadow = sample.mesh.receiveShadow;
  if (sample.interactId) mesh.userData.interactId = sample.interactId;
  for (let i = 0; i < items.length; i += 1) {
    const source = items[i]!.mesh;
    mesh.setMatrixAt(i, source.matrixWorld);
    source.removeFromParent();
  }
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
}

function buildMerged(root: Object3D, items: Eligible[], tracked: BufferGeometry[]): boolean {
  const clones: BufferGeometry[] = [];
  for (const item of items) {
    const clone = item.mesh.geometry.clone();
    clone.applyMatrix4(item.mesh.matrixWorld);
    clones.push(clone);
  }
  const merged = mergeGeometries(clones, false);
  for (const clone of clones) clone.dispose();
  if (!merged) return false;
  const mesh = new Mesh(merged, items[0]!.material);
  mesh.name = "static-merged";
  mesh.castShadow = items.every((item) => item.mesh.castShadow);
  mesh.receiveShadow = items.some((item) => item.mesh.receiveShadow);
  if (items[0]!.interactId) mesh.userData.interactId = items[0]!.interactId;
  tracked.push(merged);
  for (const item of items) item.mesh.removeFromParent();
  root.add(mesh);
  return true;
}

function disposeUnused(root: Object3D, tracked: BufferGeometry[]) {
  const used = new Set<BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof Mesh) used.add(object.geometry);
  });
  const next: BufferGeometry[] = [];
  const seen = new Set<BufferGeometry>();
  for (const geometry of tracked) {
    if (seen.has(geometry)) continue;
    seen.add(geometry);
    if (used.has(geometry)) next.push(geometry);
    else geometry.dispose();
  }
  tracked.length = 0;
  for (const geometry of next) tracked.push(geometry);
}
