import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { WORKSHOP_SEAT, workshopThinkCamera } from "./workshop-cinematic";
import {
  CLOUD_AURA_SCALE,
  CLOUD_LABEL,
  IDEA_FONT_FAMILY,
  IDEA_FONT_URL,
  IDEA_TRIANGLE_CAP,
  buildIdeaGeometry,
  cloudAnchor,
  cloudPop,
  createCloudAuraMaterial,
  createCloudCottonMaterial,
  ideaPalette,
  ideaTriangleCount,
  layoutCloudSlots,
  slotNdcHalf,
  workshopIdeaMeshes,
} from "./workshop-letters";

const here = dirname(fileURLToPath(import.meta.url));

describe("letras del taller", () => {
  it("una nube tiene lóbulos suaves y cuatro, con halo y rótulo, caben en el cupo", () => {
    const cloud = buildIdeaGeometry();
    const triangles = ideaTriangleCount(cloud);
    const glowTriangles = triangles;
    cloud.computeBoundingBox();
    const box = cloud.boundingBox;
    expect(box).toBeTruthy();
    const width = box!.max.x - box!.min.x;
    const height = box!.max.y - box!.min.y;
    const depth = box!.max.z - box!.min.z;
    expect(width).toBeGreaterThan(0.95);
    expect(width).toBeLessThan(1.05);
    expect(height).toBeGreaterThan(0.7);
    expect(depth).toBeGreaterThan(0.2);
    expect(depth).toBeLessThan(width * 0.75);
    expect(cloud.getAttribute("normal")).toBeTruthy();
    expect(Number(cloud.userData.faceZ)).toBeGreaterThan(0.05);
    expect(triangles).toBeGreaterThan(1_000);
    expect(triangles).toBeLessThanOrEqual(IDEA_TRIANGLE_CAP);
    expect(lobePeaks(cloud)).toBeGreaterThanOrEqual(4);
    expect(silhouetteStep(cloud)).toBeLessThan(0.12);
    expect(normalsFaceOut(cloud)).toBe(true);
    const textTriangles = 2;
    expect((triangles + glowTriangles + textTriangles) * 4 + 4_000).toBeLessThanOrEqual(40_000);
    expect(CLOUD_AURA_SCALE).toBeGreaterThan(1);
    expect(CLOUD_AURA_SCALE).toBeLessThan(1.45);
    expect(cloudPop(0)).toBeCloseTo(0, 5);
    expect(cloudPop(1)).toBeCloseTo(1, 5);
    expect(cloudPop(0.7)).toBeGreaterThan(1);
    cloud.dispose();
  });

  it("el resplandor es opaco, para no dejar ver el verde del mural", () => {
    const aura = createCloudAuraMaterial();
    const cotton = createCloudCottonMaterial();
    expect(aura.transparent).toBe(false);
    expect(aura.depthWrite).toBe(true);
    expect(aura.toneMapped).toBe(false);
    expect(aura.fragmentShader).toContain("gl_FragColor = vec4(color, 1.0)");
    expect(aura.fragmentShader).not.toContain("discard");
    expect(aura.fragmentShader).not.toContain("texture");
    expect(cotton.transparent).toBe(false);
    expect(cotton.toneMapped).toBe(true);
    expect(cotton.fragmentShader).toContain("uSunDir");
    expect(cotton.fragmentShader).toContain("uDeskPos");
    expect(cotton.fragmentShader).toContain("fiberNoise");
    expect(cotton.fragmentShader).toContain("gl_FragColor = vec4(color, 1.0)");
    aura.dispose();
    cotton.dispose();
  });

  it("el rótulo grande cabe en la nube", () => {
    const cloud = buildIdeaGeometry();
    cloud.computeBoundingBox();
    const box = cloud.boundingBox!;
    const halfW = CLOUD_LABEL.width / 2;
    const halfH = CLOUD_LABEL.height / 2;
    expect(CLOUD_LABEL.minPx).toBeGreaterThanOrEqual(80);
    expect(-halfW).toBeGreaterThan(box.min.x);
    expect(halfW).toBeLessThan(box.max.x);
    expect(CLOUD_LABEL.y - halfH).toBeGreaterThan(box.min.y);
    expect(CLOUD_LABEL.y + halfH).toBeLessThan(box.max.y);
    cloud.dispose();
  });

  it("escribe en negro sobre nube clara y marca la elegida con amarillo", () => {
    const idle = ideaPalette(false);
    const picked = ideaPalette(true);
    expect(luminance(idle.ink)).toBeLessThan(0.15);
    expect(luminance(idle.cloud)).toBeGreaterThan(0.9);
    expect(picked.ink).toBe(idle.ink);
    expect(picked.glow).not.toBe(idle.glow);
    const value = Number.parseInt(picked.glow.slice(1), 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    expect(red).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(blue + 40);
  });

  it("la letra es la Fredoka redondeada incluida en el repo", () => {
    const font = readFileSync(join(here, "../public/fonts/fredoka-latin-700.woff2"));
    const license = readFileSync(join(here, "../public/fonts/OFL-fredoka.txt"), "utf8");
    expect(font.subarray(0, 4).toString("ascii")).toBe("wOF2");
    expect(font.byteLength).toBeLessThan(40_000);
    expect(license).toContain("SIL OPEN FONT LICENSE");
    expect(license).toContain("Fredoka");
    expect(IDEA_FONT_FAMILY).toBe("ProtoFredoka");
    expect(IDEA_FONT_URL).toBe("/fonts/fredoka-latin-700.woff2");
  });

  it("rodea al Inventor y deja las nubes dentro del encuadre", () => {
    for (const [aspect, fov] of [
      [390 / 844, 78],
      [844 / 390, 58],
      [1280 / 800, 58],
    ] as const) {
      const slots = layoutCloudSlots(4, aspect, fov);
      expect(slots).toHaveLength(4);
      for (const slot of slots) {
        expect(slot.ndcY).toBeGreaterThan(-0.7);
        expect(Math.abs(slot.ndcX)).toBeLessThanOrEqual(0.95);
        expect(slot.scale).toBeGreaterThan(0.05);
        expect(slot.aspect).toBe(1);
      }
      expect(slots.filter((slot) => slot.ndcX < 0).length).toBeGreaterThan(0);
      expect(slots.filter((slot) => slot.ndcX > 0).length).toBeGreaterThan(0);
    }
  });

  it("las cajas de una ronda no se solapan en los encuadres del laboratorio", () => {
    const cloud = buildIdeaGeometry();
    cloud.computeBoundingBox();
    const height = cloud.boundingBox!.max.y - cloud.boundingBox!.min.y;
    cloud.dispose();
    const views = [
      [390 / 844, 78],
      [412 / 915, 78],
      [844 / 390, 58],
      [1280 / 800, 58],
    ] as const;
    for (const [aspect, fov] of views) {
      const slots = layoutCloudSlots(4, aspect, fov);
      const boxes = slots.map((slot) => {
        const half = slotNdcHalf(slot, aspect, fov, height, CLOUD_AURA_SCALE);
        return {
          x0: slot.ndcX - half.halfW,
          x1: slot.ndcX + half.halfW,
          y0: slot.ndcY - half.halfH,
          y1: slot.ndcY + half.halfH,
        };
      });
      for (const box of boxes) {
        expect(box.x0, `${aspect}`).toBeGreaterThan(-1);
        expect(box.x1, `${aspect}`).toBeLessThan(1);
        expect(box.y0, `${aspect}`).toBeGreaterThan(-0.72);
        expect(box.y1, `${aspect}`).toBeLessThan(1);
      }
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const separated = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
          expect(separated, `${aspect} ${i}-${j}`).toBe(true);
        }
      }
    }
  });

  it("apoya cada nube entre la cámara y el Inventor", () => {
    const pose = workshopThinkCamera(390 / 844, 78);
    const camera = new PerspectiveCamera(78, 390 / 844, 0.05, 80);
    camera.position.set(pose.x, pose.y, pose.z);
    camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const slot = layoutCloudSlots(4, camera.aspect, camera.fov)[0];
    expect(slot).toBeTruthy();
    const point = cloudAnchor(camera, slot!, new Vector3());
    expect(point.distanceTo(camera.position)).toBeCloseTo(slot!.depth, 1);
    expect(point.z).toBeLessThan(camera.position.z);
    expect(point.z).toBeGreaterThan(WORKSHOP_SEAT.z + 0.15);
  });

  it("prepara una malla por idea de la ronda y no arrastra las ya elegidas", () => {
    const meshes = workshopIdeaMeshes(
      ["¿Y si brillara?", "¿Y si sonara?"],
      new Set(["¿Y si brillara?"]),
    );
    expect(meshes.map((idea) => idea.id)).toEqual(["now-0", "now-1"]);
    expect(meshes.filter((idea) => idea.picked).map((idea) => idea.text)).toEqual(["¿Y si brillara?"]);
    expect(meshes.every((idea) => idea.role === "now")).toBe(true);
  });
});

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function lobePeaks(geometry: ReturnType<typeof buildIdeaGeometry>): number {
  const position = geometry.getAttribute("position");
  const bins = new Array<number>(36).fill(0);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const bin = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * bins.length) % bins.length;
    const radial = Math.hypot(x, y);
    const current = bins[bin] ?? 0;
    if (radial > current) bins[bin] = radial;
  }
  let peaks = 0;
  for (let i = 0; i < bins.length; i += 1) {
    const prev = bins[(i + bins.length - 1) % bins.length] ?? 0;
    const next = bins[(i + 1) % bins.length] ?? 0;
    const value = bins[i] ?? 0;
    if (value > prev && value > next && value > 0.2) peaks += 1;
  }
  return peaks;
}

function silhouetteStep(geometry: ReturnType<typeof buildIdeaGeometry>): number {
  const position = geometry.getAttribute("position");
  const bins = new Array<number>(36).fill(0);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const bin = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * bins.length) % bins.length;
    const radial = Math.hypot(x, y);
    const current = bins[bin] ?? 0;
    if (radial > current) bins[bin] = radial;
  }
  let step = 0;
  for (let i = 0; i < bins.length; i += 1) {
    const next = bins[(i + 1) % bins.length] ?? 0;
    step = Math.max(step, Math.abs((bins[i] ?? 0) - next));
  }
  return step;
}

function normalsFaceOut(geometry: ReturnType<typeof buildIdeaGeometry>): boolean {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  if (!normal) return false;
  let facing = 0;
  const sample = Math.min(position.count, 80);
  for (let i = 0; i < sample; i += 1) {
    const dot =
      position.getX(i) * normal.getX(i) +
      position.getY(i) * normal.getY(i) +
      position.getZ(i) * normal.getZ(i);
    if (dot > 0) facing += 1;
  }
  return facing > sample * 0.9;
}
