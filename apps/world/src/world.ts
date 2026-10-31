import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type BufferGeometry,
} from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { attachInput } from "./input";
import { addAmbient } from "./ambient";
import type { CatalogEntry } from "./types";

const PALETTE = {
  floor: 0x2a3148,
  rug: 0x3c4a68,
  wall: 0x465270,
  trim: 0x2c354c,
  coat: 0xe07a3d,
  coatDark: 0x9a4e22,
  skin: 0xf0c7a2,
  hair: 0x2a2933,
  lens: 0x8fd8ff,
  cabinet: 0x2a2140,
  amber: 0xffb703,
  teal: 0x1f8a80,
  crate: 0x8d5a34,
  leaf: 0x2f7d4a,
  pot: 0xc46b3a,
  bench: 0x6d4b32,
  moon: 0xf4efe4,
  window: 0x9ec0ff,
};

export type WorldHandle = {
  focus: (id: string) => void;
  interact: () => void;
  getNearbySlug: () => string | null;
  setInputEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

type Spot = {
  id: string;
  kind: "npc" | "proto";
  slug?: string;
  x: number;
  z: number;
  radius: number;
  collider: number;
  label: string;
};

export function startWorld(options: {
  viewport: HTMLElement;
  labels: HTMLElement;
  prototypes: CatalogEntry[];
  joystick: HTMLElement;
  knob: HTMLElement;
  e2e: boolean;
  onReady: () => void;
  onTalk: () => void;
  onPlay: (entry: CatalogEntry) => void;
  onTarget: (label: string | null) => void;
}): WorldHandle {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shadows = !coarse;

  const scene = new Scene();
  scene.background = new Color(0x1a2140);
  scene.fog = new Fog(0x1a2140, 14, 28);

  const camera = new PerspectiveCamera(58, 1, 0.1, 80);
  const renderer = new WebGLRenderer({ antialias: !coarse, alpha: false, powerPreference: coarse ? "low-power" : "default" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.shadowMap.enabled = shadows;
  options.viewport.append(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.inset = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  options.labels.append(labelRenderer.domElement);

  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const pulses: MeshBasicMaterial[] = [];

  const hemi = new HemisphereLight(0xc5d4ff, 0x3a2e28, 1.35);
  scene.add(hemi);
  const sun = new DirectionalLight(0xfff1d0, 2.4);
  sun.position.set(4, 10, 6);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 28;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  scene.add(sun);

  const lampLight = new PointLight(0xffb703, 18, 9, 2);
  lampLight.position.set(-5.1, 2.3, -1.1);
  scene.add(lampLight);

  function mat(color: number): MeshLambertMaterial {
    const material = new MeshLambertMaterial({ color });
    materials.push(material);
    return material;
  }

  function geo<T extends BufferGeometry>(geometry: T): T {
    geometries.push(geometry);
    return geometry;
  }

  function box(parent: Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number, shadow = true): Mesh {
    const mesh = new Mesh(geo(new BoxGeometry(w, h, d)), mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = shadows && shadow;
    mesh.receiveShadow = shadows;
    parent.add(mesh);
    return mesh;
  }

  const floor = new Mesh(geo(new PlaneGeometry(20, 24)), mat(PALETTE.floor));
  floor.position.z = 2;
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = shadows;
  scene.add(floor);
  const rug = new Mesh(geo(new CircleGeometry(3.4, 28)), mat(PALETTE.rug));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.01;
  rug.receiveShadow = shadows;
  scene.add(rug);

  box(scene, 20, 2.8, 0.4, 0, 1.4, -7.6, PALETTE.wall);
  box(scene, 20, 2.8, 0.4, 0, 1.4, 12.2, PALETTE.wall);
  box(scene, 0.4, 2.8, 20.2, -9.8, 1.4, 2.2, PALETTE.wall);
  box(scene, 0.4, 2.8, 20.2, 9.8, 1.4, 2.2, PALETTE.wall);
  box(scene, 18, 0.18, 0.18, 0, 2.8, -7.4, PALETTE.trim, false);
  addWindow(-3.2);
  addWindow(2.6);
  addMoon();
  addChalkboard(options.prototypes);
  addBench();
  addCrates();
  addPlant();
  addLamp();

  const ambient = addAmbient({ scene, geo, mat, box, shadows, materials, pulses, reduced });

  const inventor = buildInventor();
  inventor.position.set(-1.5, 0, -3.4);
  scene.add(inventor);

  const arcades: MeshBasicMaterial[] = [];
  for (const [index, entry] of options.prototypes.entries()) {
    const machine = buildArcade(entry);
    const column = index % 2 === 0 ? 1 : -1;
    machine.position.set(3.4 + index * 1.6 * column, 0, -1.5 - Math.floor(index / 2) * 1.8);
    scene.add(machine);
    arcades.push(...machine.userData.screens);
  }

  const player = buildPlayer();
  player.position.set(0, 0, 1.7);
  scene.add(player);

  const spots: Spot[] = [
    { id: "inventor", kind: "npc", x: -1.5, z: -3.4, radius: 2.25, collider: 0.48, label: "Hablar con el Inventor" },
    ...options.prototypes.map((entry, index) => {
      const column = index % 2 === 0 ? 1 : -1;
      return {
        id: entry.slug,
        kind: "proto" as const,
        slug: entry.slug,
        x: 3.4 + index * 1.6 * column,
        z: -1.5 - Math.floor(index / 2) * 1.8,
        radius: 2.45,
        collider: 0.72,
        label: `Jugar a ${entry.title}`,
      };
    }),
    { id: "bench", kind: "npc", x: 0.15, z: -3.15, radius: 0, collider: 0.7, label: "" },
    { id: "crates", kind: "npc", x: 5.9, z: 1.5, radius: 0, collider: 0.55, label: "" },
    { id: "plant", kind: "npc", x: -6, z: 1.3, radius: 0, collider: 0.4, label: "" },
    ...ambient.colliders.map((item) => ({
      id: item.id,
      kind: "npc" as const,
      x: item.x,
      z: item.z,
      radius: 0,
      collider: item.collider,
      label: "",
    })),
  ];

  let yaw = 0.15;
  let pitch = 0.15;
  let inputEnabled = true;
  let targetLabel: string | null = null;
  let snapped = true;
  const desired = new Vector3();
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let running = true;
  let frame = 0;
  let lastFrame = performance.now();
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDragged = false;

  const input = attachInput({
    canvas: renderer.domElement,
    joystick: options.joystick,
    knob: options.knob,
    isBlocked: () => !inputEnabled,
  });

  function resize() {
    const width = Math.max(options.viewport.clientWidth, 1);
    const height = Math.max(options.viewport.clientHeight, 1);
    camera.aspect = width / height;
    camera.fov = camera.aspect < 0.9 ? 78 : 58;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(options.viewport);
  resize();

  renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerDownX = event.clientX;
    pointerDownY = event.clientY;
    pointerDragged = false;
  });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY) > 8) pointerDragged = true;
  });
  renderer.domElement.addEventListener("pointerup", onClick);
  renderer.domElement.addEventListener("webglcontextlost", (event) => event.preventDefault());

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    frame += dt;
    const sample = input.read();
    input.resetLook();
    if (inputEnabled) {
      yaw -= sample.lookX * 0.005;
      pitch = clamp(pitch - sample.lookY * 0.003, -0.35, 0.7);
      const forwardX = Math.sin(yaw);
      const forwardZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = Math.sin(yaw);
      const speed = 4.2;
      const vx = (sample.right * rightX + sample.forward * forwardX) * speed;
      const vz = (sample.right * rightZ + sample.forward * forwardZ) * speed;
      player.position.x += vx * dt;
      player.position.z += vz * dt;
      resolve(player.position);
      const moving = Math.hypot(vx, vz) > 0.2;
      const facing = moving ? Math.atan2(vx, -vz) : yaw;
      player.rotation.y = dampAngle(player.rotation.y, facing, dt);
    }

    if (!reduced) {
      inventor.position.y = Math.sin(frame * 2) * 0.04;
      const arm = inventor.userData.arm as Object3D | undefined;
      if (arm) arm.rotation.x = Math.sin(frame * 1.6) * 0.25;
      const pulse = 0.82 + Math.sin(frame * 3) * 0.18;
      for (const material of pulses) material.color.setScalar(pulse);
    }
    ambient.tick(frame, dt, player.position);

    const dist = cameraDistance();
    desired.set(player.position.x - Math.sin(yaw) * dist, 2.55 + pitch, player.position.z + Math.cos(yaw) * dist);
    if (snapped) {
      camera.position.copy(desired);
      snapped = false;
    } else {
      camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
    }
    camera.lookAt(player.position.x, 1.15, player.position.z);
    updateTarget();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  function updateTarget() {
    let best: Spot | null = null;
    let bestDistance = Infinity;
    for (const spot of spots) {
      if (spot.radius <= 0) continue;
      const distance = Math.hypot(player.position.x - spot.x, player.position.z - spot.z);
      if (distance <= spot.radius && distance < bestDistance) {
        best = spot;
        bestDistance = distance;
      }
    }
    const label = best?.label ?? null;
    if (label !== targetLabel) {
      targetLabel = label;
      options.onTarget(label);
    }
  }

  function currentSpot(): Spot | null {
    let best: Spot | null = null;
    let bestDistance = Infinity;
    for (const spot of spots) {
      if (spot.radius <= 0) continue;
      const distance = Math.hypot(player.position.x - spot.x, player.position.z - spot.z);
      if (distance <= spot.radius && distance < bestDistance) {
        best = spot;
        bestDistance = distance;
      }
    }
    return best;
  }

  function interact() {
    const spot = currentSpot();
    if (!spot || !inputEnabled) return;
    if (spot.kind === "npc" && spot.id === "inventor") options.onTalk();
    if (spot.kind === "proto" && spot.slug) {
      const entry = options.prototypes.find((item) => item.slug === spot.slug);
      if (entry) options.onPlay(entry);
    }
  }

  function focus(id: string) {
    const spot = spots.find((item) => item.id === id && item.radius > 0);
    if (!spot) return;
    player.position.x = spot.x;
    player.position.z = spot.z + 1.7;
    resolve(player.position);
    yaw = 0;
    player.rotation.y = 0;
    snapped = true;
  }

  function onClick(event: PointerEvent) {
    if (!inputEnabled || event.button !== 0 || pointerDragged) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
      const id = interactId(hit.object);
      if (!id) continue;
      const spot = spots.find((item) => item.id === id);
      if (!spot) return;
      const distance = Math.hypot(player.position.x - spot.x, player.position.z - spot.z);
      if (distance <= spot.radius) interact();
      return;
    }
  }

  requestAnimationFrame(loop);
  options.onReady();
  if (options.e2e) {
    window.__protoLab = {
      focus,
      visitSlacker: () => {
        player.position.set(ambient.slacker.x + 0.9, 0, ambient.slacker.z + 1.4);
        resolve(player.position);
        snapped = true;
      },
    };
    options.viewport.dataset.ambient = "1";
  }

  return {
    focus,
    interact,
    getNearbySlug() {
      const near = spots
        .filter((spot) => spot.kind === "proto")
        .map((spot) => ({ spot, distance: Math.hypot(player.position.x - spot.x, player.position.z - spot.z) }))
        .filter((item) => item.distance <= item.spot.radius)
        .sort((a, b) => a.distance - b.distance)[0];
      return near?.spot.slug ?? null;
    },
    setInputEnabled(enabled: boolean) {
      inputEnabled = enabled;
      targetLabel = "\0";
    },
    dispose() {
      running = false;
      input.dispose();
      observer.disconnect();
      renderer.dispose();
      labelRenderer.domElement.remove();
      renderer.domElement.remove();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const material of arcades) material.dispose();
    },
  };

  function resolve(position: Vector3) {
    for (const spot of spots) {
      const dx = position.x - spot.x;
      const dz = position.z - spot.z;
      const min = spot.collider + 0.38;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= min * min) continue;
      const distance = Math.sqrt(distanceSq) || 0.0001;
      const push = (min - distance) / distance;
      position.x += dx * push;
      position.z += dz * push;
    }
    position.x = clamp(position.x, -7.4, 7.4);
    position.z = clamp(position.z, -6.3, 7.4 - cameraDistance());
  }

  function cameraDistance(): number {
    return camera.aspect < 0.9 ? 6.4 : 3.8;
  }

  function addWindow(x: number) {
    const pane = new Mesh(geo(new PlaneGeometry(1.5, 1.1)), new MeshBasicMaterial({ color: PALETTE.window }));
    materials.push(pane.material);
    pane.position.set(x, 1.6, -7.38);
    scene.add(pane);
  }

  function addMoon() {
    const moon = new Mesh(geo(new SphereGeometry(0.45, 16, 12)), new MeshBasicMaterial({ color: PALETTE.moon }));
    materials.push(moon.material);
    moon.position.set(-4.5, 4.2, -7);
    scene.add(moon);
  }

  function addChalkboard(entries: CatalogEntry[]) {
    const board = new Mesh(geo(new PlaneGeometry(3.1, 1.7)), new MeshBasicMaterial({ map: chalkboardTexture(entries) }));
    materials.push(board.material);
    board.position.set(-4.6, 1.55, -7.35);
    scene.add(board);
  }

  function addBench() {
    box(scene, 1.4, 0.12, 0.6, 0.15, 0.72, -3.15, PALETTE.bench);
    box(scene, 0.1, 0.7, 0.1, -0.45, 0.35, -2.95, PALETTE.bench);
    box(scene, 0.1, 0.7, 0.1, 0.75, 0.35, -2.95, PALETTE.bench);
    box(scene, 0.1, 0.7, 0.1, -0.45, 0.35, -3.35, PALETTE.bench);
    box(scene, 0.1, 0.7, 0.1, 0.75, 0.35, -3.35, PALETTE.bench);
  }

  function addCrates() {
    box(scene, 0.55, 0.55, 0.55, 5.7, 0.28, 1.35, PALETTE.crate);
    box(scene, 0.4, 0.4, 0.4, 6.15, 0.7, 1.6, PALETTE.crate);
  }

  function addPlant() {
    const pot = new Mesh(geo(new CylinderGeometry(0.22, 0.16, 0.28, 8)), mat(PALETTE.pot));
    pot.position.set(-6, 0.14, 1.3);
    pot.castShadow = shadows;
    scene.add(pot);
    const leaf = new Mesh(geo(new SphereGeometry(0.38, 10, 8)), mat(PALETTE.leaf));
    leaf.position.set(-6, 0.62, 1.3);
    leaf.castShadow = shadows;
    scene.add(leaf);
  }

  function addLamp() {
    const pole = new Mesh(geo(new CylinderGeometry(0.05, 0.05, 1.7, 8)), mat(0x8d97a8));
    pole.position.set(-5.2, 0.85, -1.1);
    scene.add(pole);
    const bulb = new Mesh(geo(new SphereGeometry(0.16, 12, 10)), new MeshBasicMaterial({ color: PALETTE.amber }));
    materials.push(bulb.material);
    bulb.position.set(-5.2, 1.8, -1.1);
    scene.add(bulb);
  }

  function buildInventor(): Group {
    const group = new Group();
    group.userData.interactId = "inventor";
    box(group, 0.34, 0.46, 0.28, 0, 0.23, 0, PALETTE.coatDark);
    box(group, 0.66, 0.78, 0.4, 0, 0.8, 0, PALETTE.coat);
    const head = new Mesh(geo(new SphereGeometry(0.26, 16, 12)), mat(PALETTE.skin));
    head.position.set(0, 1.42, 0);
    head.castShadow = shadows;
    group.add(head);
    const hair = new Mesh(geo(new SphereGeometry(0.22, 12, 10)), mat(PALETTE.hair));
    hair.scale.y = 0.7;
    hair.position.set(0, 1.58, -0.02);
    group.add(hair);
    const brim = new Mesh(geo(new CylinderGeometry(0.3, 0.3, 0.06, 12)), mat(PALETTE.hair));
    brim.position.set(0, 1.66, 0);
    group.add(brim);
    const top = new Mesh(geo(new CylinderGeometry(0.16, 0.18, 0.28, 10)), mat(PALETTE.coatDark));
    top.position.set(0, 1.84, 0);
    group.add(top);
    const lensL = new Mesh(geo(new CylinderGeometry(0.07, 0.07, 0.04, 10)), new MeshBasicMaterial({ color: PALETTE.lens }));
    const lensR = lensL.clone();
    materials.push(lensL.material);
    lensL.rotation.x = Math.PI / 2;
    lensR.rotation.x = Math.PI / 2;
    lensL.position.set(-0.1, 1.42, 0.24);
    lensR.position.set(0.1, 1.42, 0.24);
    group.add(lensL, lensR);
    const arm = new Group();
    arm.position.set(0.42, 1.05, 0);
    const armMesh = new Mesh(geo(new BoxGeometry(0.12, 0.48, 0.12)), mat(PALETTE.coat));
    armMesh.position.y = -0.2;
    arm.add(armMesh);
    group.add(arm);
    group.userData.arm = arm;
    tag(group, "Inventor", 2.15);
    group.traverse((child) => {
      child.userData.interactId = "inventor";
    });
    return group;
  }

  function buildPlayer(): Group {
    const group = new Group();
    box(group, 0.36, 0.55, 0.28, 0, 0.48, 0, PALETTE.teal);
    box(group, 0.12, 0.42, 0.12, -0.28, 0.52, 0, PALETTE.teal);
    box(group, 0.12, 0.42, 0.12, 0.28, 0.52, 0, PALETTE.teal);
    const head = new Mesh(geo(new SphereGeometry(0.2, 14, 12)), mat(PALETTE.skin));
    head.position.set(0, 0.98, 0);
    head.castShadow = shadows;
    group.add(head);
    const nose = new Mesh(geo(new BoxGeometry(0.08, 0.08, 0.1)), mat(PALETTE.coat));
    nose.position.set(0, 0.96, -0.2);
    group.add(nose);
    return group;
  }

  function buildArcade(entry: CatalogEntry): Group {
    const group = new Group();
    group.userData.interactId = entry.slug;
    box(group, 1.16, 1.5, 0.62, 0, 0.86, 0, PALETTE.cabinet);
    const marquee = new Mesh(geo(new BoxGeometry(1.05, 0.22, 0.66)), new MeshBasicMaterial({ color: PALETTE.amber }));
    materials.push(marquee.material);
    pulses.push(marquee.material);
    marquee.position.set(0, 1.68, 0);
    group.add(marquee);
    const screenMaterial = new MeshBasicMaterial({ map: screenTexture(entry), color: 0xffffff });
    materials.push(screenMaterial);
    pulses.push(screenMaterial);
    const screen = new Mesh(geo(new PlaneGeometry(0.86, 0.58)), screenMaterial);
    screen.position.set(0, 1.12, 0.32);
    group.add(screen);
    box(group, 0.7, 0.08, 0.28, 0, 0.62, 0.34, 0x171225);
    group.userData.screens = [screenMaterial];
    tag(group, entry.title, 2.05);
    group.traverse((child) => {
      child.userData.interactId = entry.slug;
    });
    return group;
  }

  function tag(parent: Object3D, text: string, y: number) {
    const anchor = document.createElement("div");
    const plate = document.createElement("span");
    plate.className = "nameplate";
    plate.textContent = text;
    anchor.append(plate);
    const object = new CSS2DObject(anchor);
    object.position.set(0, y, 0);
    parent.add(object);
  }
}

function screenTexture(entry: CatalogEntry): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);
  context.fillStyle = "#101826";
  context.fillRect(0, 0, 512, 320);
  context.strokeStyle = "#ffb703";
  context.lineWidth = 10;
  context.strokeRect(16, 16, 480, 288);
  context.fillStyle = "#f6f1e7";
  context.font = "700 54px sans-serif";
  context.textAlign = "center";
  const lines = wrap(context, entry.title, 420);
  lines.forEach((line, index) => context.fillText(line, 256, 130 + index * 62));
  context.fillStyle = "#ffb703";
  context.font = "28px sans-serif";
  context.fillText(entry.tags.join(" · "), 256, 270);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function chalkboardTexture(entries: CatalogEntry[]): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);
  context.fillStyle = "#1d3f36";
  context.fillRect(0, 0, 640, 360);
  context.fillStyle = "#f4efe4";
  context.font = "700 42px sans-serif";
  context.fillText("Proto Lab", 36, 70);
  context.font = "28px sans-serif";
  entries.slice(0, 6).forEach((entry, index) => {
    context.fillText(`· ${entry.title}`, 36, 130 + index * 36);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function interactId(object: Object3D): string | null {
  let current: Object3D | null = object;
  while (current) {
    const id = current.userData.interactId;
    if (typeof id === "string") return id;
    current = current.parent;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dampAngle(current: number, target: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-10 * dt));
}

declare global {
  interface Window {
    __protoLab?: {
      focus: (id: string) => void;
      visitSlacker?: () => void;
    };
  }
}
