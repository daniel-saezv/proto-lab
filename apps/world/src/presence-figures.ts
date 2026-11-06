import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, Scene, SphereGeometry, type BufferGeometry } from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { dampAngle } from "./locomotion";
import type { PresencePeer } from "./presence-state";

/** Distintos del teal del jugador, para reconocer a otra persona sin ponerle nombre. */
const COLORS = [0xff5d73, 0xffb703, 0x3ec6ff, 0xb388ff, 0x7dff6b, 0xff8c42, 0xf2a2ff, 0x9ad1ff] as const;

type Figure = { group: Group; materials: MeshLambertMaterial[]; label: CSS2DObject | null };

export function createPresenceFigures(scene: Scene) {
  const geometries: BufferGeometry[] = [
    new CylinderGeometry(0.22, 0.26, 0.62, 8),
    new SphereGeometry(0.18, 8, 6),
    new BoxGeometry(0.08, 0.08, 0.12),
  ];
  const figures = new Map<string, Figure>();

  function makeLabel(name: string) {
    const wrap = document.createElement("div");
    wrap.className = "presence-peer-label";
    const span = document.createElement("span");
    span.className = "presence-peer-label__text";
    span.textContent = name;
    wrap.append(span);
    const label = new CSS2DObject(wrap);
    label.position.set(0, 1.35, 0);
    return label;
  }

  function spawn(id: string, peer: PresencePeer): Figure {
    const color = COLORS[colorIndex(id)] ?? COLORS[0];
    const group = new Group();
    group.position.set(peer.x, 0, peer.z);
    group.rotation.y = peer.yaw;
    const materials = [0, 1, 2].map(() => new MeshLambertMaterial({ color }));
    const body = new Mesh(geometries[0], materials[0]);
    body.position.y = 0.48;
    const head = new Mesh(geometries[1], materials[1]);
    head.position.y = 0.98;
    const nose = new Mesh(geometries[2], materials[2]);
    nose.position.set(0, 0.96, -0.2);
    for (const mesh of [body, head, nose]) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
    group.add(body, head, nose);
    let label: CSS2DObject | null = null;
    if (peer.name) {
      label = makeLabel(peer.name);
      group.add(label);
    }
    scene.add(group);
    const figure = { group, materials, label };
    figures.set(id, figure);
    return figure;
  }

  return {
    sync(peers: readonly PresencePeer[], dt: number, snap: boolean) {
      const seen = new Set<string>();
      const follow = snap ? 1 : 1 - Math.exp(-10 * dt);
      for (const peer of peers) {
        seen.add(peer.id);
        const figure = figures.get(peer.id) ?? spawn(peer.id, peer);
        figure.group.position.x += (peer.x - figure.group.position.x) * follow;
        figure.group.position.z += (peer.z - figure.group.position.z) * follow;
        figure.group.rotation.y = dampAngle(figure.group.rotation.y, peer.yaw, snap ? 1 : dt, snap ? 40 : 8);
        const want = peer.name ?? "";
        const el = figure.label?.element.querySelector(".presence-peer-label__text");
        if (want) {
          if (!figure.label) {
            figure.label = makeLabel(want);
            figure.group.add(figure.label);
          } else if (el) el.textContent = want;
        } else if (figure.label) {
          figure.group.remove(figure.label);
          figure.label = null;
        }
      }
      for (const [id, figure] of figures) {
        if (seen.has(id)) continue;
        scene.remove(figure.group);
        for (const material of figure.materials) material.dispose();
        figures.delete(id);
      }
    },
    dispose() {
      for (const figure of figures.values()) {
        scene.remove(figure.group);
        for (const material of figure.materials) material.dispose();
      }
      figures.clear();
      for (const geometry of geometries) geometry.dispose();
    },
  };
}

function colorIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return hash % COLORS.length;
}

export type PresenceFigures = ReturnType<typeof createPresenceFigures>;
