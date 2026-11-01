import { BufferGeometry, Mesh } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Funde mallas hermanas en el espacio del padre.
 * La malla resultante queda en el origen local: la posición va horneada.
 */
export function fuseMeshes(meshes: Mesh[]): Mesh {
  const first = meshes[0];
  if (!first) throw new Error("fuseMeshes vacío");
  if (meshes.length === 1) return first;
  const parent = first.parent;
  const clones: BufferGeometry[] = [];
  for (const mesh of meshes) {
    mesh.updateMatrix();
    const clone = mesh.geometry.clone();
    clone.applyMatrix4(mesh.matrix);
    clones.push(clone);
  }
  const merged = mergeGeometries(clones, false);
  for (const clone of clones) clone.dispose();
  if (!merged) throw new Error("no se pudo fundir la geometría");
  const fused = new Mesh(merged, first.material);
  fused.castShadow = meshes.some((mesh) => mesh.castShadow);
  fused.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
  for (const mesh of meshes) mesh.removeFromParent();
  parent?.add(fused);
  return fused;
}
