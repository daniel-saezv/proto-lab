import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type BufferGeometry,
} from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { attachInput } from "./input";
import { addAmbient } from "./ambient";
import { drawTitleCard } from "./title-card";
import { arcadeMachineCollider, lobbyBounds, resolvePosition, walkToward, type ColliderSpot } from "./navigation";
import { DEBUG_MARKERS, VIEWPOINTS, viewpointById } from "./viewpoints";
import type { CatalogEntry } from "./types";

const PALETTE = {
  floor: 0x46547a,
  path: 0x5d6e9c,
  rug: 0x55648f,
  yard: 0x1b2136,
  wall: 0x2c3450,
  wallCap: 0x6a789c,
  trim: 0x6d4b32,
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
  setArcadeHighlight: (index: number) => void;
  setSelectorOpen: (open: boolean) => void;
  dispose: () => void;
};

type Spot = {
  id: string;
  kind: "npc" | "machine";
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
  onOpenSelector: () => void;
  onTarget: (label: string | null) => void;
}): WorldHandle {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shadows = !coarse;

  const scene = new Scene();
  scene.background = new Color(0x1a2140);
  scene.fog = new Fog(0x1a2140, 18, 36);

  const camera = new PerspectiveCamera(58, 1, 0.1, 80);
  const overviewCamera = new OrthographicCamera(-12, 12, 12, -12, 0.1, 90);
  overviewCamera.up.set(0, 0, -1);
  let cameraMode: "follow" | "top" = "follow";
  const renderer = new WebGLRenderer({ antialias: !coarse, alpha: false, powerPreference: coarse ? "low-power" : "default" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
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

  const hemi = new HemisphereLight(0xd5e4ff, 0x5a4638, 1.55);
  scene.add(hemi);
  const sun = new DirectionalLight(0xfff1d0, 1.85);
  sun.position.set(-3, 10, 4);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 28;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  scene.add(sun);

  const lampLight = new PointLight(0xffb703, 6, 7.5, 2);
  lampLight.position.set(-1.5, 2.6, -2.4);
  scene.add(lampLight);
  const arcadeLight = new PointLight(0xffb45a, 4.5, 5.2, 2);
  scene.add(arcadeLight);

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

  const yard = new Mesh(geo(new PlaneGeometry(36, 40)), mat(PALETTE.yard));
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(0, -0.03, 2);
  scene.add(yard);
  const floor = new Mesh(geo(new PlaneGeometry(20, 24)), mat(PALETTE.floor));
  floor.position.z = 2;
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = shadows;
  scene.add(floor);
  const rug = new Mesh(geo(new CircleGeometry(3.4, 28)), mat(PALETTE.rug));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.012;
  rug.receiveShadow = shadows;
  scene.add(rug);
  addFloorPaths();

  box(scene, 20, 2.8, 0.4, 0, 1.4, -7.6, PALETTE.wall);
  box(scene, 20, 2.8, 0.4, 0, 1.4, 12.2, PALETTE.wall);
  box(scene, 0.4, 2.8, 20.2, -9.8, 1.4, 2.2, PALETTE.wall);
  box(scene, 0.4, 2.8, 20.2, 9.8, 1.4, 2.2, PALETTE.wall);
  addWallTrim();
  const nameplates = new Map<string, HTMLElement>();
  const highlightRings = new Map<string, Mesh>();
  addMoon();
  addChalkboard(options.prototypes);
  addBench();
  addPlant();
  addLamp();

  const ambient = addAmbient({ scene, geo, mat, box, shadows, materials, pulses, reduced });

  const arcadeSpot = arcadeMachineCollider();
  const arcadeIndex = { current: 0 };
  let selectorOpen = false;
  let idleElapsed = 0;
  const textureLoader = new TextureLoader();
  let screenTextureDisposable: CanvasTexture | Texture | null = null;
  let screenLoadToken = 0;

  const inventor = buildInventor();
  inventor.position.set(-1.5, 0, -3.4);
  scene.add(inventor);

  const arcadeScreenMaterial = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  materials.push(arcadeScreenMaterial);
  const arcadeMachine = buildArcadeCabinet(arcadeScreenMaterial);
  arcadeMachine.position.set(arcadeSpot.x, 0, arcadeSpot.z);
  arcadeMachine.rotation.y = -0.42;
  scene.add(arcadeMachine);
  arcadeLight.position.set(arcadeSpot.x - 0.15, 1.35, arcadeSpot.z + 1.15);
  addArcadeGlow(arcadeSpot.x, arcadeSpot.z);

  function disposeScreenMap() {
    const map = arcadeScreenMaterial.map;
    if (map && map !== screenTextureDisposable) map.dispose();
    if (screenTextureDisposable) {
      screenTextureDisposable.dispose();
      screenTextureDisposable = null;
    }
    arcadeScreenMaterial.map = null;
  }

  function applyTitleCard(entry: CatalogEntry) {
    disposeScreenMap();
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 320;
    const context = canvas.getContext("2d");
    if (!context) return;
    drawTitleCard(context, entry, 512, 320);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    screenTextureDisposable = texture;
    arcadeScreenMaterial.map = texture;
    arcadeScreenMaterial.needsUpdate = true;
  }

  function setArcadeHighlight(index: number) {
    if (options.prototypes.length === 0) return;
    arcadeIndex.current = ((index % options.prototypes.length) + options.prototypes.length) % options.prototypes.length;
    idleElapsed = 0;
    const entry = options.prototypes[arcadeIndex.current];
    if (!entry) return;
    if (entry.previewHref) {
      const token = ++screenLoadToken;
      textureLoader.load(
        entry.previewHref,
        (texture) => {
          if (token !== screenLoadToken) {
            texture.dispose();
            return;
          }
          disposeScreenMap();
          texture.colorSpace = SRGBColorSpace;
          screenTextureDisposable = texture;
          arcadeScreenMaterial.map = texture;
          arcadeScreenMaterial.needsUpdate = true;
        },
        undefined,
        () => {
          if (token !== screenLoadToken) return;
          applyTitleCard(entry);
        },
      );
    } else {
      screenLoadToken += 1;
      applyTitleCard(entry);
    }
  }

  setArcadeHighlight(0);

  const player = buildPlayer();
  player.position.set(0, 0, 1.7);
  scene.add(player);

  const spots: Spot[] = [
    { id: "inventor", kind: "npc", x: -1.5, z: -3.4, radius: 2.25, collider: 0.42, label: "Hablar con el Inventor" },
    {
      id: "arcade",
      kind: "machine",
      x: arcadeSpot.x,
      z: arcadeSpot.z,
      radius: 2.55,
      collider: arcadeSpot.collider,
      label: "Usar la máquina",
    },
    { id: "bench", kind: "npc", x: 0.15, z: -3.15, radius: 0, collider: 0.48, label: "" },
    { id: "crates", kind: "npc", x: 5.85, z: 1.45, radius: 0, collider: 0.42, label: "" },
    { id: "plant", kind: "npc", x: -6, z: 1.3, radius: 0, collider: 0.22, label: "" },
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

  addRangeRing("inventor", -1.5, -3.4, PALETTE.amber);
  addRangeRing("arcade", arcadeSpot.x, arcadeSpot.z, 0xff6b9d);

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
      for (const material of pulses) {
        const data = material.userData as { pulseBase?: Color };
        if (!data.pulseBase) data.pulseBase = material.color.clone();
        material.color.copy(data.pulseBase).multiplyScalar(pulse);
      }
    }
    for (const ring of highlightRings.values()) {
      const material = ring.material as MeshBasicMaterial;
      if (!ring.visible) continue;
      material.opacity = reduced ? 0.92 : 0.58 + Math.sin(frame * 4) * 0.28;
    }
    ambient.tick(frame, dt, player.position);

    if (!selectorOpen && options.prototypes.length > 1 && !reduced) {
      idleElapsed += dt;
      if (idleElapsed >= 4.5) {
        idleElapsed = 0;
        setArcadeHighlight(arcadeIndex.current + 1);
      }
    }

    const activeCamera = cameraMode === "top" ? overviewCamera : camera;
    if (cameraMode === "top") {
      fitOverview();
    } else {
      const dist = cameraDistance();
      desired.set(player.position.x - Math.sin(yaw) * dist, 2.55 + pitch, player.position.z + Math.cos(yaw) * dist);
      if (snapped) {
        camera.position.copy(desired);
        snapped = false;
      } else {
        camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
      }
      camera.lookAt(player.position.x, 1.15, player.position.z);
    }
    updateTarget();
    renderer.render(scene, activeCamera);
    labelRenderer.render(scene, activeCamera);
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
    for (const [id, ring] of highlightRings) ring.visible = id === best?.id;
    for (const [id, plate] of nameplates) plate.classList.toggle("is-near", id === best?.id);
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
    if (spot.kind === "machine" && spot.id === "arcade") options.onOpenSelector();
  }

  function focus(id: string) {
    const spot = spots.find((item) => item.id === id && item.radius > 0);
    if (!spot) return;
    cameraMode = "follow";
    player.position.x = spot.x;
    player.position.z = spot.z + 1.7;
    resolve(player.position);
    yaw = 0;
    player.rotation.y = 0;
    snapped = true;
  }

  function applyViewpoint(id: string): boolean {
    const pose = viewpointById(id);
    if (!pose) return false;
    if (pose.kind === "top") {
      cameraMode = "top";
      player.position.set(0, 0, 1.7);
      player.rotation.y = 0.15;
      fitOverview();
      return true;
    }
    cameraMode = "follow";
    player.position.set(pose.x, 0, pose.z);
    player.rotation.y = pose.yaw;
    yaw = pose.yaw;
    pitch = pose.pitch;
    snapped = true;
    return true;
  }

  function fitOverview() {
    const aspect = Math.max(camera.aspect, 0.2);
    const needX = 11.2;
    const needZ = 11.2;
    let halfW = needX;
    let halfH = halfW / aspect;
    if (halfH < needZ) {
      halfH = needZ;
      halfW = halfH * aspect;
    }
    overviewCamera.left = -halfW;
    overviewCamera.right = halfW;
    overviewCamera.top = halfH;
    overviewCamera.bottom = -halfH;
    overviewCamera.position.set(0, 24, 2.2);
    overviewCamera.lookAt(0, 0, 2.2);
    overviewCamera.updateProjectionMatrix();
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
    const debugGroup = new Group();
    debugGroup.name = "shot-debug";
    debugGroup.visible = false;
    scene.add(debugGroup);
    for (const marker of DEBUG_MARKERS) {
      const ring = new Mesh(
        geo(new RingGeometry(0.85, 1.15, 28)),
        new MeshBasicMaterial({ color: marker.color, side: DoubleSide, transparent: true, opacity: 0.95 }),
      );
      materials.push(ring.material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(marker.x, 0.06, marker.z);
      debugGroup.add(ring);
    }
    const colliders = (): ColliderSpot[] =>
      spots.map((spot) => ({ id: spot.id, x: spot.x, z: spot.z, collider: spot.collider }));
    window.__protoLab = {
      focus,
      viewpoints: () => VIEWPOINTS.map((item) => ({ id: item.id, label: item.label })),
      setViewpoint: applyViewpoint,
      setDebug: (on: boolean) => {
        debugGroup.visible = on;
      },
      visitSlacker: () => {
        cameraMode = "follow";
        player.position.set(ambient.slacker.x + 0.9, 0, ambient.slacker.z + 1.4);
        resolve(player.position);
        snapped = true;
      },
      visitCorner: (which: "workshop" | "pinball") => {
        cameraMode = "follow";
        if (which === "workshop") player.position.set(5.2, 0, -3.2);
        else player.position.set(-3.2, 0, 4.0);
        resolve(player.position);
        yaw = which === "workshop" ? -0.6 : 2.4;
        snapped = true;
      },
      probeWalkable: () => {
        const bounds = lobbyBounds(true);
        const start = { x: 0, z: 1.7 };
        const checks = [
          { x: -1.5, z: -2.2 },
          { x: 1.2, z: 0.2 },
          { x: -5.5, z: 2.5 },
          { x: 5.5, z: 0.5 },
        ];
        return checks.map((target) => {
          const result = walkToward(start, target, colliders(), bounds, { steps: 320 });
          return { target, moved: result.moved, remaining: result.remaining };
        });
      },
    };
    options.viewport.dataset.ambient = "1";
  }

  return {
    focus,
    interact,
    getNearbySlug() {
      return null;
    },
    setArcadeHighlight,
    setSelectorOpen(open: boolean) {
      selectorOpen = open;
      if (!open) idleElapsed = 0;
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
      disposeScreenMap();
    },
  };

  function resolve(position: Vector3) {
    resolvePosition(position, spots, lobbyBounds(camera.aspect >= 0.9));
  }

  function cameraDistance(): number {
    return camera.aspect < 0.9 ? 6.4 : 3.8;
  }

  function addMoon() {
    const moon = new Mesh(geo(new SphereGeometry(0.45, 16, 12)), new MeshBasicMaterial({ color: PALETTE.moon }));
    materials.push(moon.material);
    moon.position.set(-4.5, 4.2, -7);
    scene.add(moon);
  }

  function addFloorPaths() {
    const lane = new Mesh(geo(new PlaneGeometry(0.7, 4.4)), mat(PALETTE.path));
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0.2, 0.016, 0.9);
    lane.receiveShadow = shadows;
    scene.add(lane);
    const branch = new Mesh(geo(new PlaneGeometry(0.55, 2.6)), mat(PALETTE.path));
    branch.rotation.x = -Math.PI / 2;
    branch.rotation.z = 0.62;
    branch.position.set(-0.85, 0.017, -1.7);
    branch.receiveShadow = shadows;
    scene.add(branch);
    const edge = mat(0x2a3148);
    for (const [w, d, x, z] of [
      [18.6, 0.16, 0, -6.9],
      [18.6, 0.16, 0, 11.4],
      [0.16, 18.2, -9.2, 2.2],
      [0.16, 18.2, 9.2, 2.2],
    ] as const) {
      const mark = new Mesh(geo(new PlaneGeometry(w, d)), edge);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(x, 0.018, z);
      scene.add(mark);
    }
  }

  function addWallTrim() {
    box(scene, 20.3, 0.16, 0.5, 0, 0.1, -7.55, PALETTE.trim, false);
    box(scene, 20.3, 0.16, 0.5, 0, 0.1, 12.15, PALETTE.trim, false);
    box(scene, 0.5, 0.16, 20.2, -9.75, 0.1, 2.2, PALETTE.trim, false);
    box(scene, 0.5, 0.16, 20.2, 9.75, 0.1, 2.2, PALETTE.trim, false);
    box(scene, 20.5, 0.12, 0.55, 0, 2.9, -7.6, PALETTE.wallCap, false);
    box(scene, 20.5, 0.12, 0.55, 0, 2.9, 12.2, PALETTE.wallCap, false);
    box(scene, 0.55, 0.12, 20.4, -9.8, 2.9, 2.2, PALETTE.wallCap, false);
    box(scene, 0.55, 0.12, 20.4, 9.8, 2.9, 2.2, PALETTE.wallCap, false);
    // La pizarra ocupa x ≈ [-6.3, -2.9]; la ventana izquierda queda a la derecha de ese hueco.
    for (const x of [-1.05, 2.6]) {
      box(scene, 1.7, 0.08, 0.06, x, 2.2, -7.32, PALETTE.trim, false);
      box(scene, 1.7, 0.08, 0.06, x, 1.0, -7.32, PALETTE.trim, false);
      box(scene, 0.08, 1.28, 0.06, x - 0.82, 1.6, -7.32, PALETTE.trim, false);
      box(scene, 0.08, 1.28, 0.06, x + 0.82, 1.6, -7.32, PALETTE.trim, false);
    }
  }

  function addArcadeGlow(x: number, z: number) {
    const glow = new Mesh(
      geo(new CircleGeometry(1.45, 28)),
      new MeshBasicMaterial({ color: 0xffb703, transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false }),
    );
    materials.push(glow.material);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.03, z);
    scene.add(glow);
    const halo = new Mesh(
      geo(new RingGeometry(1.35, 1.7, 28)),
      new MeshBasicMaterial({ color: 0xff6b9d, transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false, toneMapped: false }),
    );
    materials.push(halo.material);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(x, 0.032, z);
    scene.add(halo);
  }

  function addRangeRing(id: string, x: number, z: number, color: number) {
    const material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    materials.push(material);
    const ring = new Mesh(geo(new RingGeometry(0.78, 0.98, 32)), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.04, z);
    ring.visible = false;
    scene.add(ring);
    highlightRings.set(id, ring);
  }

  function addChalkboard(entries: CatalogEntry[]) {
    box(scene, 3.45, 0.12, 0.08, -4.6, 2.48, -7.3, PALETTE.trim, false);
    box(scene, 3.45, 0.12, 0.08, -4.6, 0.64, -7.3, PALETTE.trim, false);
    box(scene, 0.12, 1.95, 0.08, -6.28, 1.55, -7.3, PALETTE.trim, false);
    box(scene, 0.12, 1.95, 0.08, -2.92, 1.55, -7.3, PALETTE.trim, false);
    const board = new Mesh(geo(new PlaneGeometry(3.1, 1.7)), new MeshBasicMaterial({ map: chalkboardTexture(entries) }));
    materials.push(board.material);
    board.position.set(-4.6, 1.55, -7.33);
    scene.add(board);
    const label = new Group();
    label.position.set(-4.6, 0, -7.2);
    scene.add(label);
    tag(label, "Pizarra", 2.55, "chalkboard");
  }

  function addBench() {
    box(scene, 1.4, 0.12, 0.6, 0.15, 0.72, -3.15, PALETTE.bench);
    box(scene, 0.1, 0.7, 0.1, -0.45, 0.35, -2.95, PALETTE.bench);
    box(scene, 0.1, 0.7, 0.1, 0.75, 0.35, -2.95, PALETTE.bench);
    box(scene, 0.1, 0.7, 0.1, -0.45, 0.35, -3.35, PALETTE.bench);
    box(scene, 0.1, 0.7, 0.1, 0.75, 0.35, -3.35, PALETTE.bench);
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
    const x = -0.35;
    const z = -7.28;
    box(scene, 0.22, 0.1, 0.14, x, 2.25, z, 0x8d97a8, false);
    const bulb = new Mesh(geo(new SphereGeometry(0.11, 10, 8)), new MeshBasicMaterial({ color: PALETTE.amber, toneMapped: false }));
    materials.push(bulb.material);
    bulb.position.set(x, 2.08, -7.12);
    scene.add(bulb);
    lampLight.position.set(x, 2.05, -6.4);
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
    tag(group, "Inventor", 2.15, "inventor");
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

  function buildArcadeCabinet(screenMaterial: MeshBasicMaterial): Group {
    const group = new Group();
    group.userData.interactId = "arcade";
    box(group, 1.18, 1.28, 0.56, 0, 0.82, -0.02, PALETTE.cabinet);
    box(group, 0.12, 1.58, 0.68, -0.64, 0.9, 0.02, 0x171225);
    box(group, 0.12, 1.58, 0.68, 0.64, 0.9, 0.02, 0x171225);
    addGlowStrip(group, -0.71, 0xff5d73);
    addGlowStrip(group, 0.71, 0x3ec6ff);
    box(group, 1.28, 0.42, 0.16, 0, 1.7, 0.2, 0x1a1428, false);
    const marqueeMat = new MeshBasicMaterial({ map: marqueeTexture(), toneMapped: false });
    materials.push(marqueeMat);
    const marquee = new Mesh(geo(new PlaneGeometry(1.16, 0.32)), marqueeMat);
    marquee.position.set(0, 1.7, 0.32);
    group.add(marquee);
    box(group, 1.08, 0.74, 0.05, 0, 1.16, 0.3, 0x100c18, false);
    const screen = new Mesh(geo(new PlaneGeometry(0.94, 0.6)), screenMaterial);
    screen.position.set(0, 1.16, 0.35);
    group.add(screen);
    const deck = new Group();
    deck.position.set(0, 0.58, 0.34);
    deck.rotation.x = -0.62;
    box(deck, 1.08, 0.08, 0.48, 0, 0, 0, 0x241c38, false);
    const stick = new Mesh(geo(new CylinderGeometry(0.03, 0.045, 0.16, 8)), mat(0x2a2933));
    stick.position.set(-0.28, 0.12, 0.04);
    deck.add(stick);
    const ballMat = new MeshBasicMaterial({ color: 0xff5d73, toneMapped: false });
    materials.push(ballMat);
    const ball = new Mesh(geo(new SphereGeometry(0.07, 10, 8)), ballMat);
    ball.position.set(-0.28, 0.22, 0.04);
    deck.add(ball);
    for (const [index, color] of [0xffb703, 0x3ec6ff, 0x7dff6b].entries()) {
      const buttonMat = new MeshBasicMaterial({ color, toneMapped: false });
      materials.push(buttonMat);
      const button = new Mesh(geo(new CylinderGeometry(0.055, 0.055, 0.045, 10)), buttonMat);
      button.position.set(0.02 + index * 0.16, 0.06, 0.05);
      deck.add(button);
    }
    group.add(deck);
    addCabinetSide(group, -1);
    addCabinetSide(group, 1);
    box(group, 0.16, 0.1, 0.18, -0.4, 0.05, 0.12, 0x171225, false);
    box(group, 0.16, 0.1, 0.18, 0.4, 0.05, 0.12, 0x171225, false);
    tag(group, "Arcade", 2.15, "arcade");
    group.traverse((child) => {
      child.userData.interactId = "arcade";
    });
    return group;
  }

  function addGlowStrip(parent: Object3D, x: number, color: number) {
    const material = new MeshBasicMaterial({ color, toneMapped: false });
    materials.push(material);
    pulses.push(material);
    const strip = new Mesh(geo(new BoxGeometry(0.045, 0.95, 0.06)), material);
    strip.position.set(x, 1.05, 0.32);
    parent.add(strip);
  }

  function addCabinetSide(parent: Object3D, side: number) {
    const material = new MeshBasicMaterial({ map: cabinetSideTexture(side), toneMapped: false });
    materials.push(material);
    const art = new Mesh(geo(new PlaneGeometry(0.62, 1.05)), material);
    art.position.set(side * 0.71, 0.9, 0);
    art.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    parent.add(art);
  }

  function tag(parent: Object3D, text: string, y: number, id?: string) {
    const anchor = document.createElement("div");
    const plate = document.createElement("span");
    plate.className = "nameplate";
    plate.textContent = text;
    anchor.append(plate);
    if (id) nameplates.set(id, plate);
    const object = new CSS2DObject(anchor);
    object.position.set(0, y, 0);
    parent.add(object);
  }
}

function marqueeTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (!context) return texture;
  const gradient = context.createLinearGradient(0, 0, 512, 0);
  gradient.addColorStop(0, "#ff5d73");
  gradient.addColorStop(0.32, "#ffb703");
  gradient.addColorStop(0.66, "#3ec6ff");
  gradient.addColorStop(1, "#e86bff");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 128);
  context.fillStyle = "#1a1203";
  context.font = "800 58px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("PROTO ARCADE", 256, 66);
  return texture;
}

function cabinetSideTexture(side: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 384;
  const context = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (!context) return texture;
  context.fillStyle = side > 0 ? "#24183a" : "#1a2744";
  context.fillRect(0, 0, 256, 384);
  context.fillStyle = side > 0 ? "#ffb703" : "#ff5d73";
  context.fillRect(0, 0, 256, 28);
  context.fillRect(0, 356, 256, 28);
  context.fillStyle = "#f6f1e7";
  context.font = "800 42px sans-serif";
  context.textAlign = "center";
  context.fillText(side > 0 ? "PLAY" : "PROTO", 128, 150);
  context.fillStyle = side > 0 ? "#3ec6ff" : "#7dff6b";
  for (let i = 0; i < 5; i++) context.fillRect(36 + i * 38, 210, 22, 22);
  context.fillStyle = "#ffb703";
  context.beginPath();
  context.arc(128, 290, 28, 0, Math.PI * 2);
  context.fill();
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
      viewpoints?: () => { id: string; label: string }[];
      setViewpoint?: (id: string) => boolean;
      setDebug?: (on: boolean) => void;
      visitSlacker?: () => void;
      visitCorner?: (which: "workshop" | "pinball") => void;
      probeWalkable?: () => { target: { x: number; z: number }; moved: number; remaining: number }[];
    };
  }
}
