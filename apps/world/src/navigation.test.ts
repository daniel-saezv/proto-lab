import { describe, expect, it } from "vitest";
import {
  CAMERA_NEAR,
  CAMERA_WALL_MARGIN,
  arcadeMachineCollider,
  cameraVolume,
  lobbyBounds,
  lobbyStaticColliders,
  moveWithSlide,
  playerLobbyBounds,
  CAMERA_CEILING_Y,
  ceilingArmScale,
  lobbyCameraBlockers,
  resolveCameraArm,
  walkToward,
  LAYOUT,
} from "./navigation";

describe("navegación del lobby", () => {
  const bounds = playerLobbyBounds();
  const spots = [...lobbyStaticColliders(), arcadeMachineCollider()];

  it("permite llegar al Inventor, a la arcade y recorrer el centro", () => {
    const start = { x: 0, z: 1.7 };
    const targets = [
      { x: -1.5, z: -2.2, label: "inventor" },
      { x: 1.2, z: 0.2, label: "arcade" },
      { x: 0, z: -1.5, label: "centro" },
      { x: -5.5, z: 2.5, label: "pasillo izquierdo" },
      { x: 2.5, z: 4.5, label: "pasillo delantero" },
    ];
    for (const target of targets) {
      const result = walkToward(start, target, spots, bounds, { steps: 420 });
      expect(result.moved, target.label).toBeGreaterThan(1.5);
      expect(result.remaining, target.label).toBeLessThan(1.0);
    }
  });

  it("cruza de un lado a otro sin quedarse atascado", () => {
    const left = walkToward({ x: -5.5, z: 0.5 }, { x: 5.5, z: 0.5 }, spots, bounds, { steps: 480 });
    expect(left.moved).toBeGreaterThan(6);
    expect(left.remaining).toBeLessThan(1.2);
  });

  it("llega a la zona de la nevera, al sur de la antigua pared invisible", () => {
    const start = { x: 0, z: 1.7 };
    const target = { x: 7.3, z: 5.1 };
    const result = walkToward(start, target, spots, bounds, { steps: 640 });
    expect(result.z).toBeGreaterThan(4.2);
    expect(result.x).toBeGreaterThan(5);
    expect(result.remaining).toBeLessThan(0.8);
    expect(Math.hypot(result.x - LAYOUT.fridge.x, result.z - LAYOUT.fridge.z)).toBeGreaterThan(LAYOUT.fridge.collider);
  });

  it("no recorta el fondo de la sala con la distancia de la cámara", () => {
    const desktop = lobbyBounds(true);
    const mobile = lobbyBounds(false);
    expect(desktop).toEqual(mobile);
    expect(desktop).toEqual(playerLobbyBounds());
    expect(desktop.maxZ).toBeGreaterThan(10);
    expect(desktop.minX).toBeLessThan(-8);
    expect(desktop.maxX).toBeGreaterThan(8);
  });

  it("se desliza a lo largo del muro cuando el otro eje está bloqueado", () => {
    const pos = { x: bounds.maxX - 0.02, z: 1 };
    moveWithSlide(pos, 2, 1.4, [], bounds);
    expect(pos.x).toBeLessThanOrEqual(bounds.maxX + 1e-6);
    expect(pos.z).toBeGreaterThan(2);
  });
});

describe("cámara del lobby", () => {
  const volume = cameraVolume();

  it("el near plane queda por dentro del margen contra el muro", () => {
    expect(CAMERA_NEAR).toBeLessThan(CAMERA_WALL_MARGIN);
    expect(CAMERA_NEAR).toBeLessThanOrEqual(0.08);
    expect(volume.maxY).toBeLessThanOrEqual(CAMERA_CEILING_Y);
    expect(volume.maxY).toBeLessThan(3.42);
    for (const box of lobbyCameraBlockers()) {
      expect(box.minY).toBeLessThan(2.4);
    }
  });

  it("acerca el brazo y deja la cámara dentro de la sala junto a la pared sur", () => {
    const pose = resolveCameraArm({
      playerX: 0.4,
      playerZ: volume.maxZ - 0.35,
      yaw: 0,
      pitch: 0.45,
      distance: 6.4,
    });
    expect(pose.distance).toBeLessThan(2);
    expect(pose.x).toBeGreaterThanOrEqual(volume.minX - 1e-4);
    expect(pose.x).toBeLessThanOrEqual(volume.maxX + 1e-4);
    expect(pose.z).toBeGreaterThanOrEqual(volume.minZ - 1e-4);
    expect(pose.z).toBeLessThanOrEqual(volume.maxZ + 1e-4);
    expect(pose.y).toBeGreaterThanOrEqual(volume.minY - 1e-4);
    expect(pose.y).toBeLessThanOrEqual(volume.maxY + 1e-4);
  });

  it("no saca la cámara por la pared este ni por encima del techo", () => {
    const east = resolveCameraArm({
      playerX: volume.maxX - 0.2,
      playerZ: 2,
      yaw: -Math.PI / 2,
      pitch: 0.7,
      distance: 6.4,
    });
    expect(east.x).toBeLessThanOrEqual(volume.maxX + 1e-4);
    expect(east.y).toBeLessThanOrEqual(volume.maxY + 1e-4);
    expect(east.distance).toBeLessThan(6.4);

    const north = resolveCameraArm({
      playerX: -1,
      playerZ: volume.minZ + 0.25,
      yaw: Math.PI,
      pitch: 0.2,
      distance: 3.8,
    });
    expect(north.z).toBeGreaterThanOrEqual(volume.minZ - 1e-4);
    expect(north.distance).toBeLessThan(3.8);
  });

  it("acorta el brazo antes de un mueble alto", () => {
    const pose = resolveCameraArm({
      playerX: 0,
      playerZ: 1,
      yaw: 0,
      pitch: 0,
      distance: 5,
      blockers: [{ minX: -1, maxX: 1, minY: 0, maxY: 4, minZ: 2.4, maxZ: 3.2 }],
    });
    expect(pose.z).toBeLessThan(2.4);
    expect(pose.distance).toBeLessThan(1.6);
  });

  it("en el centro de la sala conserva la distancia pedida", () => {
    const pose = resolveCameraArm({
      playerX: 0,
      playerZ: 2,
      yaw: 0.15,
      pitch: 0.15,
      distance: 3.8,
    });
    expect(pose.distance).toBeGreaterThan(3.5);
    expect(pose.y).toBeLessThanOrEqual(volume.maxY);
    expect(ceilingArmScale(2.55 + 0.15)).toBe(1);
  });

  it("al mirar casi en vertical se desliza bajo el techo sin clavarse", () => {
    const mild = resolveCameraArm({
      playerX: 0,
      playerZ: 2,
      yaw: 0.4,
      pitch: 0.15,
      distance: 3.8,
    });
    const yaws = [0, 0.8, 1.6, 2.4, 3.2, 4.2, 5.2, -0.6];
    for (const yaw of yaws) {
      const pose = resolveCameraArm({
        playerX: 0,
        playerZ: 2,
        yaw,
        pitch: 0.7,
        distance: 3.8,
      });
      expect(pose.y, `yaw ${yaw}`).toBeLessThanOrEqual(CAMERA_CEILING_Y + 1e-4);
      expect(pose.y, `yaw ${yaw}`).toBeGreaterThan(mild.y);
      expect(pose.distance, `yaw ${yaw}`).toBeGreaterThan(1.2);
      expect(pose.distance, `yaw ${yaw}`).toBeLessThan(mild.distance);
      expect(pose.x).toBeGreaterThanOrEqual(volume.minX - 1e-4);
      expect(pose.x).toBeLessThanOrEqual(volume.maxX + 1e-4);
      expect(pose.z).toBeGreaterThanOrEqual(volume.minZ - 1e-4);
      expect(pose.z).toBeLessThanOrEqual(volume.maxZ + 1e-4);
    }
    expect(ceilingArmScale(2.55 + 0.7)).toBeLessThan(ceilingArmScale(2.55 + 0.4));
    expect(ceilingArmScale(2.55 + 0.4)).toBeLessThan(1);
  });

  it("junto a la pared, con pitch alto, sigue dentro y bajo el techo", () => {
    const inward = resolveCameraArm({
      playerX: volume.maxX - 1.1,
      playerZ: volume.maxZ - 1.1,
      yaw: Math.PI * 0.75,
      pitch: 0.7,
      distance: 6.4,
    });
    expect(inward.y).toBeLessThanOrEqual(CAMERA_CEILING_Y + 1e-4);
    expect(inward.distance).toBeGreaterThan(0.8);
    expect(inward.distance).toBeLessThan(6.4);
    expect(inward.x).toBeLessThanOrEqual(volume.maxX + 1e-4);
    expect(inward.z).toBeLessThanOrEqual(volume.maxZ + 1e-4);

    const outward = resolveCameraArm({
      playerX: volume.maxX - 0.4,
      playerZ: volume.minZ + 0.4,
      yaw: -Math.PI / 2,
      pitch: 0.7,
      distance: 6.4,
    });
    expect(outward.y).toBeLessThanOrEqual(CAMERA_CEILING_Y + 1e-4);
    expect(outward.x).toBeLessThanOrEqual(volume.maxX + 1e-4);
    expect(outward.x).toBeGreaterThanOrEqual(volume.minX - 1e-4);
    expect(outward.z).toBeGreaterThanOrEqual(volume.minZ - 1e-4);
    expect(outward.z).toBeLessThanOrEqual(volume.maxZ + 1e-4);
    expect(outward.distance).toBeGreaterThan(0);
    expect(outward.distance).toBeLessThan(1);
  });
});
