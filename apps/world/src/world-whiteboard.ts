import type { Material, Mesh, PlaneGeometry } from "three";
import type { WhiteboardStatusController } from "./whiteboard-status";

/** Enganche mínimo entre la escena 3D y el tablón dinámico. */
export type LobbyWhiteboardBinding = {
  mesh: Mesh;
  controller: WhiteboardStatusController;
};

export function bindWhiteboardMesh(
  mesh: Mesh,
  controller: WhiteboardStatusController,
  registerMaterial: (material: Material) => void,
): LobbyWhiteboardBinding {
  registerMaterial(mesh.material as Material);
  return { mesh, controller };
}

export type WhiteboardPlaneFactory = (geometry: PlaneGeometry, material: Material) => Mesh;
