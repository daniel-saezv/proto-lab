import {
  ACESFilmicToneMapping,
  BufferAttribute,
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
  Matrix4,
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
  LinearSRGBColorSpace,
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
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { blinkOpen, breathScale, rigSway } from "./graphics-idle";
import {
  createNameplateElement,
  estimateNameWidth,
  planarGaze,
  projectToScreen,
  resolveNameplates,
  type NameplateCandidate,
} from "./nameplates";
import { attachInput } from "./input";
import { getMusicEnergy } from "./ambience-music";
import { addAmbient } from "./ambient";
import { dialogueCameraPose, dialogueSubject, dialogueTransitionSeconds, type DialogueSubject } from "./dialogue-camera";
import type { DialogueCue } from "./dialogue-cues";
import { drawTitleCard } from "./title-card";
import {
  TOUCH_LOOK_FOLLOW,
  WALK_SPEED,
  applyLook,
  approachVelocity,
  dampAngle,
  dampBlockedAxis,
  facingYaw,
  lookFacingYaw,
  lookRateFromDeflection,
  moveWish,
  smoothLookInput,
  softenTowardLimit,
} from "./locomotion";
import {
  CAMERA_NEAR,
  CEILING_UNDERSIDE,
  LAYOUT,
  RADIO_APPROACH,
  RADIO_USE_RADIUS,
  arcadeMachineCollider,
  moveWithSlide,
  playerLobbyBounds,
  resolveCameraArm,
  resolvePosition,
  walkToward,
  type ColliderSpot,
} from "./navigation";
import { DEBUG_MARKERS, VIEWPOINTS, viewpointById } from "./viewpoints";
import {
  homePose,
  poseAlong,
  remainingBlend,
  seatPose,
  workshopSeatCamera,
  workshopSeatSubject,
  workshopTripSeconds,
  type InventorPose,
} from "./workshop-cinematic";
import {
  FLOOR_LAMPS,
  HANGING_GLOW,
  HANGING_LIGHT,
  HANGING_SHADE,
  HANGING_SHADE_DROP,
  LAMP_GLOW,
  LAMP_METAL,
  SCONCE_GLOW,
  SCONCE_LIGHT,
  SCONCE_SHADE,
  SCONCE_SHADE_Y,
  addLampHead,
} from "./scene-lights";
import {
  smoothstep01,
  whiteboardCameraPose,
  whiteboardTransitionSeconds,
  WHITEBOARD_FRAME,
} from "./whiteboard-view";
import type { CatalogEntry } from "./types";
import type { BoardNavAction, BoardUiSnapshot } from "./proposals-board-actions";
import { WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from "./proposals-board-metrics";
import { createWhiteboardStatus, type WhiteboardStatusController } from "./whiteboard-status";
import { bindWhiteboardMesh } from "./world-whiteboard";
import { LOUNGE_TABLE, NORTH_COUCH, SLACKER_COUCH, SOUTH_COUCH } from "./lounge-layout";
import { fuseMeshes } from "./mesh-fuse";
import { batchStaticMeshes, type BatchStats } from "./static-batch";
import { applyShade, floorShade, floorUv, wallShade, type ShadeSpot } from "./vertex-ao";
import type { ProposalStatusItem } from "./proposals-status-api";

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
  setInputEnabled: (enabled: boolean) => void;
  setArcadeHighlight: (index: number) => void;
  setSelectorOpen: (open: boolean) => void;
  setProposalBoardItems: (items: ProposalStatusItem[], partial: boolean) => void;
  isViewingWhiteboard: () => boolean;
  exitWhiteboard: () => void;
  handleBoardKey: (key: string) => boolean;
  clearBoardSelection: () => boolean;
  /** Encuadre al hablante. `null` devuelve la cámara de paseo. */
  setDialogueFocus: (focus: { speakerId: string; cue: DialogueCue | null } | null) => void;
  isDialogueFraming: () => boolean;
  /** Gesto corto al revelar un énfasis. */
  pulseDialogue: () => void;
  /** Pausa el bucle, el análisis de audio y el resto del trabajo por frame. */
  setSuspended: (suspended: boolean) => void;
  /** Suelta el contexto WebGL del laboratorio. La escena y el jugador siguen en memoria. */
  releaseRenderer: () => void;
  /** Vuelve a crear el renderer sobre la misma escena, sin mover al jugador. */
  restoreRenderer: () => void;
  /** Lleva al Inventor al escritorio o a su sitio. `movesCamera` false deja la cámara en paz. */
  playWorkshopTrip: (dest: "desk" | "home", onDone: () => void, movesCamera?: boolean) => void;
  skipWorkshopTrip: () => void;
  /** Si se quedó a medias, lo devuelve a (−1,5, −3,4) antes de un diálogo nuevo. */
  ensureInventorHome: () => void;
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
  approach?: { x: number; z: number };
};

export function startWorld(options: {
  viewport: HTMLElement;
  labels: HTMLElement;
  prototypes: CatalogEntry[];
  touchControls?: {
    zoneMove: HTMLElement;
    zoneLook: HTMLElement;
    activeMarker: HTMLElement;
  };
  e2e: boolean;
  onReady: () => void;
  onE2eReady?: () => void;
  onTalk: () => void;
  onTalkNpc?: (id: string) => void;
  onTune?: () => void;
  onOpenSelector: () => void;
  onTarget: (label: string | null) => void;
  onWhiteboardReady?: (controller: WhiteboardStatusController) => void;
  onBoardView?: (open: boolean) => void;
  onBoardUi?: (ui: BoardUiSnapshot) => void;
  onBoardAction?: (action: BoardNavAction) => void;
  /** `true` mientras la cámara entra o vuelve del diálogo. */
  onDialogueFrame?: (open: boolean) => void;
  onGesture?: () => void;
  /** `false` deja cada malla suelta para medir renderer.info. */
  batch?: boolean;
  perf?: boolean;
  isPrototypeUnseen?: (slug: string) => boolean;
}): WorldHandle {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const e2eRender = options.e2e;
  const shadows = e2eRender ? false : !coarse;

  const scene = new Scene();
  scene.background = new Color(0x1a2140);
  scene.fog = new Fog(0x1a2140, 18, 36);

  const camera = new PerspectiveCamera(58, 1, CAMERA_NEAR, 80);
  const overviewCamera = new OrthographicCamera(-12, 12, 12, -12, 0.1, 90);
  overviewCamera.up.set(0, 0, -1);
  let cameraMode: "follow" | "top" = "follow";
  const pixelRatio = e2eRender ? 1 : Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
  let gpuLive = false;

  function createRenderer(): WebGLRenderer {
    const next = new WebGLRenderer({
      antialias: e2eRender ? false : !coarse,
      alpha: false,
      powerPreference: coarse ? "low-power" : "default",
    });
    next.outputColorSpace = SRGBColorSpace;
    next.toneMapping = ACESFilmicToneMapping;
    next.toneMappingExposure = 1.2;
    next.setPixelRatio(pixelRatio);
    next.shadowMap.enabled = shadows;
    return next;
  }

  let renderer = createRenderer();
  options.viewport.append(renderer.domElement);
  gpuLive = true;
  options.viewport.dataset.gpu = "1";

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.inset = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  options.labels.append(labelRenderer.domElement);

  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const pulses: MeshBasicMaterial[] = [];
  let contactMat: MeshBasicMaterial | null = null;

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

  const lampLight = new PointLight(LAMP_GLOW, SCONCE_LIGHT.intensity, SCONCE_LIGHT.distance, SCONCE_LIGHT.decay);
  lampLight.userData.base = SCONCE_LIGHT.intensity;
  lampLight.userData.phase = 0.4;
  scene.add(lampLight);
  const arcadeLight = new PointLight(LAMP_GLOW, 2.4, 8.5, 2);
  scene.add(arcadeLight);

  const lambertByColor = new Map<number, MeshLambertMaterial>();
  function mat(color: number): MeshLambertMaterial {
    const cached = lambertByColor.get(color);
    if (cached) return cached;
    const material = new MeshLambertMaterial({ color });
    materials.push(material);
    lambertByColor.set(color, material);
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
  const floorGeo = geo(new PlaneGeometry(20, 24, 16, 20));
  applyShade(floorGeo, (x, y) => floorShade(x, y, 10, 12, floorShadeSpots()));
  const floorPos = floorGeo.getAttribute("position");
  const floorUv2 = new Float32Array(floorPos.count * 2);
  for (let i = 0; i < floorPos.count; i += 1) {
    const uv = floorUv(floorPos.getX(i), 2 - floorPos.getY(i));
    floorUv2[i * 2] = uv.u;
    floorUv2[i * 2 + 1] = uv.v;
  }
  floorGeo.setAttribute("uv2", new BufferAttribute(floorUv2, 2));
  const floorMat = new MeshLambertMaterial({ color: PALETTE.floor, vertexColors: true });
  floorMat.lightMap = floorLightMap();
  floorMat.lightMapIntensity = 0.65;
  materials.push(floorMat);
  const floor = new Mesh(floorGeo, floorMat);
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

  const wallH = CEILING_UNDERSIDE + 0.1;
  const wallY = wallH / 2;
  const wallMat = new MeshLambertMaterial({ color: PALETTE.wall, vertexColors: true });
  materials.push(wallMat);
  addAoWall(20, wallH, 0.4, 0, wallY, -7.6, wallMat);
  addAoWall(20, wallH, 0.4, 0, wallY, 12.2, wallMat);
  addAoWall(0.4, wallH, 20.2, -9.8, wallY, 2.2, wallMat);
  addAoWall(0.4, wallH, 20.2, 9.8, wallY, 2.2, wallMat);
  addWallTrim();
  const hangingLights: PointLight[] = [];
  addCeiling(hangingLights);
  addMoon();
  type PlateRecord = {
    anchorEl: HTMLElement;
    plate: HTMLElement;
    object: CSS2DObject;
    label: string;
    update: boolean;
    mode: string;
    near: boolean;
  };
  const plateById = new Map<string, PlateRecord>();
  const nameWorld = new Vector3();
  const nameViewProjection = new Matrix4();
  let nameFocusId: string | null = null;
  let labelViewW = 1;
  let labelViewH = 1;
  const highlightRings = new Map<string, Mesh>();
  const lobbyWhiteboard = createWhiteboardStatus({
    reducedMotion: reduced,
    knownSlugs: options.prototypes.map((entry) => entry.slug),
    onSummaryChange: (summary) => {
      options.viewport.dataset.whiteboardItems = summary;
    },
    onUi: (ui) => {
      options.viewport.dataset.boardScreen = ui.screen;
      options.viewport.dataset.boardSelected = ui.selectedNumber == null ? "" : String(ui.selectedNumber);
      options.viewport.dataset.boardAction = ui.detail?.action?.kind ?? "";
      options.viewport.dataset.boardActionLabel = ui.detail?.action?.label ?? "";
      options.viewport.dataset.boardMotion = ui.moving ? "1" : "0";
      options.viewport.dataset.boardInteractive = ui.interactive ? "1" : "0";
      options.onBoardUi?.(ui);
    },
    onAction: (action) => options.onBoardAction?.(action),
  });
  let boardMesh: Mesh | null = null;
  addChalkboard(lobbyWhiteboard);
  addBench();
  addLamp();

  const ambient = addAmbient({ scene, geo, mat, box, shadows, materials, pulses, reduced, e2e: e2eRender });

  const arcadeSpot = arcadeMachineCollider();
  const arcadeIndex = { current: 0 };
  let selectorOpen = false;
  let idleElapsed = 0;
  const textureLoader = new TextureLoader();
  let screenTextureDisposable: CanvasTexture | Texture | null = null;
  let screenLoadToken = 0;

  const inventor = buildInventor();
  inventor.position.set(LAYOUT.inventor.x, 0, LAYOUT.inventor.z);
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

  function syncArcadeUpdateBadge(entry: CatalogEntry) {
    const plate = plateById.get("arcade");
    if (plate) {
      const unseen = options.isPrototypeUnseen?.(entry.slug) ?? false;
      plate.update = unseen;
      plate.plate.classList.toggle("nameplate--proto-update", unseen);
    }
  }

  function setArcadeHighlight(index: number) {
    if (options.prototypes.length === 0) return;
    arcadeIndex.current = ((index % options.prototypes.length) + options.prototypes.length) % options.prototypes.length;
    idleElapsed = 0;
    const entry = options.prototypes[arcadeIndex.current];
    if (!entry) return;
    syncArcadeUpdateBadge(entry);
    ambient.setTvSources(entry.previewHref, `/protos/${entry.slug}/preview.mp4`);
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
    { id: "inventor", kind: "npc", x: LAYOUT.inventor.x, z: LAYOUT.inventor.z, radius: 2.25, collider: LAYOUT.inventor.collider, label: "Hablar con el Inventor" },
    {
      id: "arcade",
      kind: "machine",
      x: arcadeSpot.x,
      z: arcadeSpot.z,
      radius: 2.55,
      collider: arcadeSpot.collider,
      label: "Usar la máquina",
    },
    { id: "chalkboard", kind: "npc", x: LAYOUT.chalkboard.x, z: LAYOUT.chalkboard.z, radius: 2.2, collider: LAYOUT.chalkboard.collider, label: "Ver la pizarra" },
    {
      id: "radio",
      kind: "npc",
      x: LAYOUT.radio.x,
      z: LAYOUT.radio.z,
      radius: RADIO_USE_RADIUS,
      collider: 0,
      label: "Cambiar la música",
      approach: RADIO_APPROACH,
    },
    { id: "bench", kind: "npc", x: LAYOUT.bench.x, z: LAYOUT.bench.z, radius: 0, collider: LAYOUT.bench.collider, label: "" },
    ...ambient.colliders.map((item) => ({
      id: item.id,
      kind: "npc" as const,
      x: item.x,
      z: item.z,
      radius: 0,
      collider: item.collider,
      label: "",
    })),
    ...ambient.npcs.map((npc) => ({
      id: npc.id,
      kind: "npc" as const,
      x: npc.x,
      z: npc.z,
      radius: npc.radius,
      collider: 0,
      label: npc.label,
      approach: npc.approach,
    })),
  ];
  const loungeIds = new Set(ambient.npcs.map((npc) => npc.id));
  for (const plate of ambient.nameplates) trackPlate(plate.id, plate.element, plate.anchor, plate.element.textContent ?? "");

  addRangeRing("inventor", LAYOUT.inventor.x, LAYOUT.inventor.z, PALETTE.amber);
  addRangeRing("arcade", arcadeSpot.x, arcadeSpot.z, 0xff6b9d);
  addRangeRing("chalkboard", LAYOUT.chalkboard.x, LAYOUT.chalkboard.z, 0x8fd8ff);
  addRangeRing("radio", LAYOUT.radio.x, LAYOUT.radio.z, PALETTE.amber);
  const radioSet = scene.getObjectByName("radio");
  if (radioSet) tag(radioSet, "Radio", 1.05, "radio", "note");
  for (const npc of ambient.npcs) addRangeRing(npc.id, npc.x, npc.z, npc.color);

  let yaw = 0.15;
  let pitch = 0.15;
  let viewYaw = yaw;
  let viewPitch = pitch;
  let lookSmoothX = 0;
  let lookSmoothY = 0;
  let lookRateYaw = 0;
  let lookRatePitch = 0;
  const pitchMin = -0.35;
  const pitchMax = 0.7;
  let velX = 0;
  let velZ = 0;
  let arm = 3.8;
  let inputEnabled = true;
  let targetLabel: string | null = null;
  let snapped = true;
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let running = true;
  let suspended = false;
  let loopQueued = false;
  let frame = 0;
  let lastFrame = performance.now();
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDragged = false;
  let boardPhase: "idle" | "enter" | "hold" | "leave" = "idle";
  let boardElapsed = 0;
  const boardFrom = new Vector3();
  const boardTo = new Vector3();
  const boardLookFrom = new Vector3();
  const boardLookTo = new Vector3();
  const boardLook = new Vector3();
  let dialoguePhase: "idle" | "enter" | "hold" | "leave" = "idle";
  let dialogueElapsed = 0;
  let dialogueSpeaker = "";
  let dialogueFlourish = 0;
  let returnFlourish = 0;
  let returnMarqueePulse = 0;
  const dialogueFrom = new Vector3();
  const dialogueTo = new Vector3();
  const dialogueLookFrom = new Vector3();
  const dialogueLookTo = new Vector3();
  const dialogueLook = new Vector3();
  const calmDialogue = reduced || e2eRender;
  let dialoguePlace: "stand" | "desk" = "stand";
  let inventorPose: InventorPose = homePose();
  let workshopToken = 0;
  type WorkshopTrip = {
    dest: "desk" | "home";
    from: InventorPose;
    u: number;
    rebaseU: number;
    movesCamera: boolean;
    onDone: () => void;
  };
  let workshopTrip: WorkshopTrip | null = null;
  let perfWorkMs = 0;
  const workshopCamFrom = new Vector3();
  const workshopCamTo = new Vector3();
  const workshopLookFrom = new Vector3();
  const workshopLookTo = new Vector3();
  const workshopLook = new Vector3();

  let handlePrimaryTap: (clientX: number, clientY: number) => void = () => {};

  const input = attachInput({
    canvas: renderer.domElement,
    isBlocked: () => !inputEnabled,
    onGesture: options.onGesture,
    onSurfaceTap: (clientX, clientY) => handlePrimaryTap(clientX, clientY),
    touch: options.touchControls,
  });

  function resize() {
    const width = Math.max(options.viewport.clientWidth, 1);
    const height = Math.max(options.viewport.clientHeight, 1);
    labelViewW = width;
    labelViewH = height;
    camera.aspect = width / height;
    camera.fov = camera.aspect < 0.9 ? 78 : 58;
    camera.updateProjectionMatrix();
    if (gpuLive) renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
    if (boardPhase !== "idle") {
      if (cameraMode === "top") return;
      const framed = whiteboardCameraPose(camera.aspect, camera.fov);
      boardLookTo.set(framed.lookX, framed.lookY, framed.lookZ);
      if (boardPhase === "leave") return;
      boardTo.set(framed.x, framed.y, framed.z);
      if (boardPhase === "hold") {
        camera.position.copy(boardTo);
        boardLook.copy(boardLookTo);
        camera.lookAt(boardLook);
      }
      return;
    }
    if (workshopTrip?.movesCamera) {
      retargetWorkshopCamera();
      return;
    }
    if (dialoguePhase !== "idle") syncDialogueTarget();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(options.viewport);
  resize();

  const onSurfaceDown = (event: PointerEvent) => {
    pointerDownX = event.clientX;
    pointerDownY = event.clientY;
    pointerDragged = false;
  };
  const onSurfaceMove = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY) > 8) pointerDragged = true;
    if (boardPhase !== "hold") return;
    const uv = boardSurfaceUv(event.clientX, event.clientY);
    if (!uv) lobbyWhiteboard.clearHover();
    else lobbyWhiteboard.hoverAt(uv.u, uv.v);
  };
  const onSurfaceLeave = () => {
    lobbyWhiteboard.clearHover();
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
  };
  function bindSurface(canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointerdown", onSurfaceDown);
    canvas.addEventListener("pointermove", onSurfaceMove);
    canvas.addEventListener("pointerleave", onSurfaceLeave);
    canvas.addEventListener("pointerup", onClick);
    canvas.addEventListener("webglcontextlost", onContextLost);
  }
  function unbindSurface(canvas: HTMLCanvasElement) {
    canvas.removeEventListener("pointerdown", onSurfaceDown);
    canvas.removeEventListener("pointermove", onSurfaceMove);
    canvas.removeEventListener("pointerleave", onSurfaceLeave);
    canvas.removeEventListener("pointerup", onClick);
    canvas.removeEventListener("webglcontextlost", onContextLost);
  }
  bindSurface(renderer.domElement);

  function releaseRenderer() {
    if (!gpuLive) return;
    ambient.setTvSuspended(true);
    gpuLive = false;
    options.viewport.dataset.gpu = "0";
    const canvas = renderer.domElement;
    unbindSurface(canvas);
    const gl = renderer.getContext();
    sun.shadow.dispose();
    sun.shadow.map = null;
    sun.shadow.mapPass = null;
    renderer.dispose();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
  }

  function restoreRenderer() {
    if (gpuLive) return;
    renderer = createRenderer();
    options.viewport.append(renderer.domElement);
    bindSurface(renderer.domElement);
    input.rebind(renderer.domElement);
    gpuLive = true;
    options.viewport.dataset.gpu = "1";
    resize();
    if (!calmDialogue) {
      returnFlourish = 0.45;
      returnMarqueePulse = 0.55;
    }
    kickLoop();
  }

  function loop() {
    loopQueued = false;
    if (!running || suspended || !gpuLive) return;
    loopQueued = true;
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    frame += dt;
    if (dialogueFlourish > 0) dialogueFlourish = Math.max(0, dialogueFlourish - dt);
    if (returnFlourish > 0) returnFlourish = Math.max(0, returnFlourish - dt);
    if (returnMarqueePulse > 0) returnMarqueePulse = Math.max(0, returnMarqueePulse - dt);
    const sample = input.read();
    input.resetLook();
    const readingBoard = boardPhase === "enter" || boardPhase === "hold";
    if (readingBoard && Math.hypot(sample.forward, sample.right) > 0.08) beginLeaveBoard();
    if (inputEnabled && boardPhase === "idle" && dialoguePhase === "idle") {
      const lookSens = coarse ? 0.0042 : 0.00315;
      if (options.touchControls) {
        // El stick es una velocidad, no un delta de píxeles. Se sigue en rad/s
        // (ataque y freno suaves) y el paso vertical se afloja antes del tope.
        const targetYaw = -lookRateFromDeflection(sample.lookX, lookSens);
        const targetPitch = -lookRateFromDeflection(sample.lookY, lookSens * 0.72);
        lookRateYaw = smoothLookInput(lookRateYaw, targetYaw, dt, TOUCH_LOOK_FOLLOW);
        lookRatePitch = smoothLookInput(lookRatePitch, targetPitch, dt, TOUCH_LOOK_FOLLOW);
        yaw += lookRateYaw * dt;
        const pitchStep = softenTowardLimit(pitch, lookRatePitch, pitchMin, pitchMax, 0.16);
        pitch = clamp(pitch + pitchStep * dt, pitchMin, pitchMax);
      } else {
        lookRateYaw = 0;
        lookRatePitch = 0;
        lookSmoothX = smoothLookInput(lookSmoothX, sample.lookX, dt);
        lookSmoothY = smoothLookInput(lookSmoothY, sample.lookY, dt);
        yaw -= applyLook(lookSmoothX, lookSens, 0.11);
        pitch = clamp(pitch - applyLook(lookSmoothY, lookSens * 0.72, 0.08), pitchMin, pitchMax);
      }
      const wish = moveWish(yaw, sample.forward, sample.right);
      const wishX = wish.x * WALK_SPEED;
      const wishZ = wish.z * WALK_SPEED;
      velX = approachVelocity(velX, wishX, dt);
      velZ = approachVelocity(velZ, wishZ, dt);
      const slide = moveWithSlide(player.position, velX * dt, velZ * dt, spots, playerLobbyBounds());
      velX = dampBlockedAxis(velX, slide.movedX, dt);
      velZ = dampBlockedAxis(velZ, slide.movedZ, dt);
      const moving = Math.hypot(velX, velZ) > 0.45;
      const facing = moving ? facingYaw(velX, velZ) : lookFacingYaw(yaw);
      player.rotation.y = dampAngle(player.rotation.y, facing, dt, moving ? 7.5 : 4.5);
    } else {
      velX = 0;
      velZ = 0;
      lookRateYaw = 0;
      lookRatePitch = 0;
    }

    const beat = getMusicEnergy();
    const bass = reduced ? 0 : beat.bass;
    const mid = reduced ? 0 : beat.mid;
    if (!reduced) {
      const lampBeat = 1 + bass * 0.15;
      for (const light of hangingLights) {
        const phase = (light.userData.phase as number) ?? 0;
        const base = (light.userData.base as number) ?? 3.2;
        const blink = Math.sin(frame * 8.5 + phase) > 0.985 ? 0.7 : 1;
        light.intensity = base * (0.92 + Math.sin(frame * 1.7 + phase) * 0.08) * blink * lampBeat;
      }
      const sconceBase = (lampLight.userData.base as number) ?? SCONCE_LIGHT.intensity;
      lampLight.intensity = sconceBase * (0.94 + Math.sin(frame * 2.2) * 0.06) * lampBeat;
      if (!e2eRender) {
        const arm = inventor.userData.arm as Object3D | undefined;
        const armL = inventor.userData.armL as Object3D | undefined;
        const posing = workshopTrip !== null || inventorPose.sit > 0.001;
        if (!posing) {
          inventor.position.y = Math.sin(frame * 2) * 0.04;
          const flourishAmt = Math.max(dialogueFlourish, returnFlourish);
          if (arm) {
            const flourish = flourishAmt > 0 ? Math.sin(frame * 14) * 0.4 * (flourishAmt / 0.45) : 0;
            arm.rotation.x = Math.sin(frame * 1.6) * 0.25 + flourish;
          }
          if (armL) armL.rotation.x = Math.sin(frame * 1.6 + 2.1) * 0.18;
        } else if (inventorPose.sit > 0.35) {
          if (arm) arm.rotation.x = -0.55 * inventorPose.sit;
          if (armL) armL.rotation.x = -0.35 * inventorPose.sit;
        } else {
          if (arm) arm.rotation.x = Math.sin(frame * 8) * 0.45;
          if (armL) armL.rotation.x = Math.sin(frame * 8 + Math.PI) * 0.45;
        }
        const torso = inventor.userData.torso as Object3D | undefined;
        if (torso) torso.scale.y = breathScale(frame, 0.4);
        const inventorEyes = inventor.userData.eyes as Object3D | undefined;
        if (inventorEyes) inventorEyes.scale.y = blinkOpen(frame, 0.3);
        const rig = player.userData.rig as Object3D | undefined;
        if (rig) {
          const sway = rigSway(frame, Math.hypot(velX, velZ) > 0.45);
          rig.rotation.z = sway.z;
          rig.position.y = sway.y;
        }
        const playerEyes = player.userData.eyes as Object3D | undefined;
        if (playerEyes) playerEyes.scale.y = blinkOpen(frame, 1.4);
      }
      const pulse = (0.82 + Math.sin(frame * 3) * 0.18) * (1 + mid * 0.08);
      for (const material of pulses) {
        const data = material.userData as { pulseBase?: Color };
        if (!data.pulseBase) data.pulseBase = material.color.clone();
        material.color.copy(data.pulseBase).multiplyScalar(pulse);
      }
      const marqueeMat = arcadeMachine.userData.marqueeMat as MeshBasicMaterial | undefined;
      if (marqueeMat && returnMarqueePulse > 0) {
        const phase = 1 - returnMarqueePulse / 0.55;
        marqueeMat.color.setScalar(0.82 + Math.sin(phase * Math.PI) * 0.45);
      }
    }
    for (const ring of highlightRings.values()) {
      const material = ring.material as MeshBasicMaterial;
      if (!ring.visible) continue;
      material.opacity = reduced || e2eRender ? 0.92 : 0.58 + Math.sin(frame * 4) * 0.28;
    }
    const playerStill = Math.hypot(velX, velZ) <= 0.12;
    ambient.tick(frame, dt, player.position, bass, mid, playerStill);
    lobbyWhiteboard.tick(now);

    if (!selectorOpen && options.prototypes.length > 1 && !reduced && !e2eRender) {
      idleElapsed += dt;
      if (idleElapsed >= 4.5) {
        idleElapsed = 0;
        setArcadeHighlight(arcadeIndex.current + 1);
      }
    }

    if (workshopTrip) stepWorkshopTrip(dt);
    const activeCamera = cameraMode === "top" ? overviewCamera : camera;
    if (boardPhase !== "idle") {
      stepBoardCamera(dt);
    } else if (workshopTrip?.movesCamera) {
      camera.lookAt(workshopLook);
    } else if (dialoguePhase !== "idle") {
      stepDialogueCamera(dt);
    } else if (cameraMode === "top") {
      fitOverview();
    } else {
      const ideal = cameraDistance();
      if (snapped) {
        viewYaw = yaw;
        viewPitch = pitch;
        arm = ideal;
      }
      viewYaw = dampAngle(viewYaw, yaw, dt, 12);
      viewPitch += (pitch - viewPitch) * (1 - Math.exp(-12 * dt));
      const safe = resolveCameraArm({
        playerX: player.position.x,
        playerZ: player.position.z,
        yaw: viewYaw,
        pitch: viewPitch,
        distance: ideal,
      });
      if (arm > safe.distance) arm = safe.distance;
      else arm += (safe.distance - arm) * (1 - Math.exp(-5 * dt));
      const pose = resolveCameraArm({
        playerX: player.position.x,
        playerZ: player.position.z,
        yaw: viewYaw,
        pitch: viewPitch,
        distance: arm,
      });
      camera.position.set(pose.x, pose.y, pose.z);
      snapped = false;
      camera.lookAt(player.position.x, 1.15, player.position.z);
    }
    updateTarget();
    renderer.render(scene, activeCamera);
    labelRenderer.render(scene, activeCamera);
    if (options.perf) perfWorkMs = performance.now() - now;
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
    for (const [id, ring] of highlightRings) ring.visible = boardPhase === "idle" && id === best?.id;
    syncNameplates();
  }

  function trackPlate(id: string, plate: HTMLElement, object: CSS2DObject, label: string) {
    plateById.set(id, {
      anchorEl: object.element,
      plate,
      object,
      label,
      update: plate.classList.contains("nameplate--proto-update"),
      mode: "",
      near: false,
    });
  }

  function syncNameplates() {
    const active = cameraMode === "top" ? overviewCamera : camera;
    active.updateMatrixWorld();
    nameViewProjection.multiplyMatrices(active.projectionMatrix, active.matrixWorldInverse);
    const forwardX = Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const elements = nameViewProjection.elements;
    const candidates: NameplateCandidate[] = [];
    for (const [id, plate] of plateById) {
      plate.object.getWorldPosition(nameWorld);
      const screen = projectToScreen(nameWorld.x, nameWorld.y, nameWorld.z, elements, labelViewW, labelViewH);
      // El mueble croquis comparte id con el NPC y entra en la lista con radio 0.
      const spot = spots.find((item) => item.id === id && item.radius > 0);
      const targetX = spot?.x ?? nameWorld.x;
      const targetZ = spot?.z ?? nameWorld.z;
      const distance = Math.hypot(player.position.x - targetX, player.position.z - targetZ);
      candidates.push({
        id,
        x: screen.x,
        y: screen.y,
        inView: screen.inView,
        distance,
        inRange: !!spot && spot.radius > 0 && distance <= spot.radius,
        gaze: planarGaze(player.position.x, player.position.z, forwardX, forwardZ, targetX, targetZ),
        nameWidth: estimateNameWidth(plate.label, plate.update),
      });
    }
    const layout = resolveNameplates(candidates, nameFocusId);
    nameFocusId = layout.focusId;
    for (const decision of layout.decisions) {
      const plate = plateById.get(decision.id);
      if (!plate || (plate.mode === decision.mode && plate.near === decision.near)) continue;
      plate.mode = decision.mode;
      plate.near = decision.near;
      plate.anchorEl.dataset.mode = decision.mode;
      plate.plate.classList.toggle("is-near", decision.near);
      plate.plate.setAttribute("aria-hidden", decision.mode === "name" ? "false" : "true");
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
    if (!spot || !inputEnabled || dialoguePhase !== "idle") return;
    if (spot.kind === "npc" && spot.id === "inventor") options.onTalk();
    else if (spot.kind === "npc" && spot.id === "chalkboard") enterBoardView();
    else if (spot.kind === "npc" && loungeIds.has(spot.id)) options.onTalkNpc?.(spot.id);
    else if (spot.id === "radio") options.onTune?.();
    else if (spot.kind === "machine" && spot.id === "arcade") options.onOpenSelector();
  }

  function cancelDialogueTravel() {
    if (dialoguePhase === "idle") return;
    dialoguePhase = "idle";
    dialogueSpeaker = "";
    if (boardPhase === "idle") player.visible = true;
    ambient.setDialogueCue(null);
    options.onDialogueFrame?.(false);
  }

  function focus(id: string) {
    const spot = spots.find((item) => item.id === id && item.radius > 0);
    if (!spot) return;
    cancelDialogueTravel();
    cameraMode = "follow";
    player.position.x = spot.approach?.x ?? spot.x;
    player.position.z = spot.approach?.z ?? spot.z + 1.7;
    resolve(player.position);
    if (spot.approach) {
      yaw = Math.atan2(spot.x - player.position.x, -(spot.z - player.position.z));
    } else {
      yaw = 0;
    }
    player.rotation.y = lookFacingYaw(yaw);
    snapped = true;
  }

  function applyViewpoint(id: string): boolean {
    const pose = viewpointById(id);
    if (!pose) return false;
    if (pose.kind === "top") {
      cameraMode = "top";
      player.position.set(0, 0, 1.7);
      player.rotation.y = lookFacingYaw(0.15);
      fitOverview();
      return true;
    }
    cameraMode = "follow";
    player.position.set(pose.x, 0, pose.z);
    player.rotation.y = lookFacingYaw(pose.yaw);
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
    if (event.button !== 0 || pointerDragged) return;
    handlePrimaryTap(event.clientX, event.clientY);
  }

  function boardSurfaceUv(clientX: number, clientY: number): { u: number; v: number } | null {
    if (!gpuLive || !boardMesh) return null;
    const bounds = renderer.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const uv = raycaster.intersectObject(boardMesh, false)[0]?.uv;
    if (!uv) return null;
    return { u: uv.x, v: uv.y };
  }

  function projectCanvas(px: number, py: number): { x: number; y: number } | null {
    const point = new Vector3(
      WHITEBOARD_FRAME.x + (px / WHITEBOARD_WIDTH - 0.5) * WHITEBOARD_FRAME.width,
      WHITEBOARD_FRAME.y + (0.5 - py / WHITEBOARD_HEIGHT) * WHITEBOARD_FRAME.height,
      WHITEBOARD_FRAME.z,
    );
    point.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: (point.x * 0.5 + 0.5) * rect.width,
      y: (-point.y * 0.5 + 0.5) * rect.height,
    };
  }

  function projectBoardRect(zone: "row" | "back" | "action", number?: number) {
    const area = lobbyWhiteboard.targetRect(zone, number);
    if (!area) return null;
    const topLeft = projectCanvas(area.x, area.y);
    const bottomRight = projectCanvas(area.x + area.w, area.y + area.h);
    if (!topLeft || !bottomRight) return null;
    const x = Math.min(topLeft.x, bottomRight.x);
    const y = Math.min(topLeft.y, bottomRight.y);
    return {
      x,
      y,
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
    };
  }

  function rayHitIdAt(clientX: number, clientY: number): string | null {
    if (!gpuLive) return null;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
      const id = interactId(hit.object);
      if (id) return id;
    }
    return null;
  }

  handlePrimaryTap = (clientX, clientY) => {
    const hitId = rayHitIdAt(clientX, clientY);
    if (boardPhase === "hold") {
      const uv = boardSurfaceUv(clientX, clientY);
      if (uv) {
        lobbyWhiteboard.pointerAt(uv.u, uv.v);
        return;
      }
      if (hitId !== "chalkboard") beginLeaveBoard();
      return;
    }
    if (boardPhase !== "idle") {
      if (hitId !== "chalkboard") beginLeaveBoard();
      return;
    }
    if (!inputEnabled) return;
    if (hitId === "chalkboard") {
      enterBoardView();
      return;
    }
    if (!hitId) return;
    const spot = spots.find((item) => item.id === hitId && item.radius > 0);
    if (!spot) return;
    const distance = Math.hypot(player.position.x - spot.x, player.position.z - spot.z);
    if (distance <= spot.radius) interact();
  };

  function publishBoardView(open: boolean) {
    options.viewport.dataset.boardView = open ? "1" : "0";
    options.onBoardView?.(open);
  }

  function enterBoardView() {
    if (boardPhase !== "idle" || cameraMode === "top") return;
    if (dialoguePhase === "enter" || dialoguePhase === "hold") return;
    if (dialoguePhase === "leave") {
      dialoguePhase = "idle";
      dialogueSpeaker = "";
      options.onDialogueFrame?.(false);
    }
    boardFrom.copy(camera.position);
    boardLookFrom.set(player.position.x, 1.15, player.position.z);
    boardLook.copy(boardLookFrom);
    const framed = whiteboardCameraPose(camera.aspect, camera.fov);
    boardTo.set(framed.x, framed.y, framed.z);
    boardLookTo.set(framed.lookX, framed.lookY, framed.lookZ);
    boardElapsed = 0;
    boardPhase = "enter";
    velX = 0;
    velZ = 0;
    player.visible = false;
    publishBoardView(true);
  }

  function beginLeaveBoard() {
    if (boardPhase === "idle" || boardPhase === "leave") return;
    lobbyWhiteboard.setInteractive(false);
    boardFrom.copy(camera.position);
    boardLookFrom.copy(boardLook);
    const pose = resolveCameraArm({
      playerX: player.position.x,
      playerZ: player.position.z,
      yaw,
      pitch,
      distance: cameraDistance(),
    });
    boardTo.set(pose.x, pose.y, pose.z);
    boardLookTo.set(player.position.x, 1.15, player.position.z);
    boardElapsed = 0;
    boardPhase = "leave";
    player.visible = true;
    if (whiteboardTransitionSeconds(reduced) <= 0) stepBoardCamera(0);
  }

  function stepBoardCamera(dt: number) {
    const duration = whiteboardTransitionSeconds(reduced);
    boardElapsed += dt;
    const u = duration <= 0 ? 1 : smoothstep01(boardElapsed / duration);
    boardLook.lerpVectors(boardLookFrom, boardLookTo, u);
    camera.position.lerpVectors(boardFrom, boardTo, u);
    camera.lookAt(boardLook);
    if (u < 1) return;
    if (boardPhase === "enter") {
      boardPhase = "hold";
      lobbyWhiteboard.setInteractive(true);
    }
    if (boardPhase === "leave") {
      boardPhase = "idle";
      snapped = true;
      publishBoardView(false);
    }
  }

  function subjectForDialogue(): DialogueSubject | undefined {
    if (dialoguePlace === "desk") return workshopSeatSubject();
    return dialogueSubject(dialogueSpeaker);
  }

  function aimWorkshopEnd(dest: "desk" | "home") {
    const subject = dest === "desk" ? workshopSeatSubject() : dialogueSubject("inventor");
    if (!subject) return;
    const framed = dest === "desk" ? workshopSeatCamera(camera.aspect, camera.fov) : dialogueCameraPose(subject, camera.aspect, camera.fov);
    workshopCamTo.set(framed.x, framed.y, framed.z);
    workshopLookTo.set(framed.lookX, framed.lookY, framed.lookZ);
  }

  function retargetWorkshopCamera() {
    if (!workshopTrip?.movesCamera) return;
    workshopCamFrom.copy(camera.position);
    workshopLookFrom.copy(workshopLook);
    workshopTrip.rebaseU = workshopTrip.u;
    aimWorkshopEnd(workshopTrip.dest);
  }

  function applyInventorPose(pose: InventorPose) {
    inventor.position.set(pose.x, pose.y, pose.z);
    inventor.rotation.y = pose.yaw;
    const hips = inventor.userData.hips as Object3D | undefined;
    if (hips) hips.rotation.x = -1.35 * pose.sit;
  }

  function playWorkshopTrip(dest: "desk" | "home", onDone: () => void, movesCamera = true) {
    const token = ++workshopToken;
    workshopTrip = {
      dest,
      from: {
        x: inventor.position.x,
        y: inventor.position.y,
        z: inventor.position.z,
        yaw: inventor.rotation.y,
        sit: inventorPose.sit,
      },
      u: 0,
      rebaseU: 0,
      movesCamera,
      onDone: () => {
        if (token !== workshopToken) return;
        onDone();
      },
    };
    if (movesCamera) {
      workshopCamFrom.copy(camera.position);
      if (dialoguePhase !== "idle") workshopLookFrom.copy(dialogueLook);
      else workshopLookFrom.set(player.position.x, 1.15, player.position.z);
      workshopLook.copy(workshopLookFrom);
      aimWorkshopEnd(dest);
      player.visible = false;
    }
    if (workshopTripSeconds(calmDialogue) <= 0) stepWorkshopTrip(0);
  }

  function skipWorkshopTrip() {
    if (!workshopTrip) return;
    workshopTrip.u = 1;
    stepWorkshopTrip(0);
  }

  function ensureInventorHome() {
    if (dialoguePlace === "desk" && dialoguePhase !== "idle") return;
    workshopToken += 1;
    workshopTrip = null;
    inventorPose = homePose();
    applyInventorPose(inventorPose);
    dialoguePlace = "stand";
  }

  function stepWorkshopTrip(dt: number) {
    const trip = workshopTrip;
    if (!trip) return;
    const duration = workshopTripSeconds(calmDialogue);
    if (duration <= 0) trip.u = 1;
    else trip.u = Math.min(1, trip.u + dt / duration);
    inventorPose = poseAlong(trip.from, trip.dest === "desk" ? seatPose() : homePose(), trip.u);
    applyInventorPose(inventorPose);
    if (trip.movesCamera) {
      const blend = remainingBlend(trip.u, trip.rebaseU);
      workshopLook.lerpVectors(workshopLookFrom, workshopLookTo, blend);
      camera.position.lerpVectors(workshopCamFrom, workshopCamTo, blend);
      camera.lookAt(workshopLook);
      dialogueLook.copy(workshopLook);
    }
    if (trip.u < 1) return;
    workshopTrip = null;
    if (trip.movesCamera) {
      dialoguePlace = trip.dest === "desk" ? "desk" : "stand";
      dialogueFrom.copy(camera.position);
      dialogueTo.copy(camera.position);
      dialogueLookFrom.copy(workshopLook);
      dialogueLookTo.copy(workshopLook);
      dialogueLook.copy(workshopLook);
      dialogueElapsed = dialogueTransitionSeconds(calmDialogue);
      if (dialoguePhase === "enter" || dialoguePhase === "hold") dialogueSpeaker = "inventor";
    } else if (trip.dest === "home") {
      dialoguePlace = "stand";
    }
    trip.onDone();
  }

  function workshopView() {
    return {
      place: dialoguePlace,
      x: Number(inventor.position.x.toFixed(3)),
      y: Number(inventor.position.y.toFixed(3)),
      z: Number(inventor.position.z.toFixed(3)),
      yaw: Number(inventor.rotation.y.toFixed(3)),
      sit: Number(inventorPose.sit.toFixed(3)),
      camX: Number(camera.position.x.toFixed(3)),
      camY: Number(camera.position.y.toFixed(3)),
      camZ: Number(camera.position.z.toFixed(3)),
    };
  }

  function syncDialogueTarget() {
    const subject = subjectForDialogue();
    if (!subject) return;
    const framed =
      dialoguePlace === "desk" && subject.id === "inventor"
        ? workshopSeatCamera(camera.aspect, camera.fov)
        : dialogueCameraPose(subject, camera.aspect, camera.fov);
    dialogueLookTo.set(framed.lookX, framed.lookY, framed.lookZ);
    if (dialoguePhase === "leave") return;
    dialogueTo.set(framed.x, framed.y, framed.z);
    if (dialoguePhase === "hold") {
      camera.position.copy(dialogueTo);
      dialogueLook.copy(dialogueLookTo);
      camera.lookAt(dialogueLook);
    }
  }

  function beginEnterDialogue(id: string) {
    if (boardPhase !== "idle") return;
    dialoguePlace = "stand";
    const subject = dialogueSubject(id);
    if (!subject) return;
    const wasIdle = dialoguePhase === "idle";
    dialogueFrom.copy(camera.position);
    if (wasIdle) dialogueLookFrom.set(player.position.x, 1.15, player.position.z);
    else dialogueLookFrom.copy(dialogueLook);
    dialogueLook.copy(dialogueLookFrom);
    const framed = dialogueCameraPose(subject, camera.aspect, camera.fov);
    dialogueTo.set(framed.x, framed.y, framed.z);
    dialogueLookTo.set(framed.lookX, framed.lookY, framed.lookZ);
    dialogueElapsed = 0;
    dialoguePhase = "enter";
    dialogueSpeaker = id;
    velX = 0;
    velZ = 0;
    player.visible = false;
    if (dialogueTransitionSeconds(calmDialogue) <= 0) stepDialogueCamera(0);
    if (wasIdle) options.onDialogueFrame?.(true);
  }

  function beginLeaveDialogue() {
    if (dialoguePhase === "idle" || dialoguePhase === "leave") return;
    dialoguePlace = "stand";
    dialogueFrom.copy(camera.position);
    dialogueLookFrom.copy(dialogueLook);
    const pose = resolveCameraArm({
      playerX: player.position.x,
      playerZ: player.position.z,
      yaw,
      pitch,
      distance: cameraDistance(),
    });
    dialogueTo.set(pose.x, pose.y, pose.z);
    dialogueLookTo.set(player.position.x, 1.15, player.position.z);
    dialogueElapsed = 0;
    dialoguePhase = "leave";
    dialogueSpeaker = "";
    if (boardPhase === "idle") player.visible = true;
    if (dialogueTransitionSeconds(calmDialogue) <= 0) stepDialogueCamera(0);
  }

  function stepDialogueCamera(dt: number) {
    const duration = dialogueTransitionSeconds(calmDialogue);
    dialogueElapsed += dt;
    const u = duration <= 0 ? 1 : smoothstep01(dialogueElapsed / duration);
    dialogueLook.lerpVectors(dialogueLookFrom, dialogueLookTo, u);
    camera.position.lerpVectors(dialogueFrom, dialogueTo, u);
    camera.lookAt(dialogueLook);
    if (u < 1) return;
    if (dialoguePhase === "enter") dialoguePhase = "hold";
    if (dialoguePhase === "leave") {
      dialoguePhase = "idle";
      dialogueSpeaker = "";
      snapped = true;
      if (boardPhase === "idle") player.visible = true;
      options.onDialogueFrame?.(false);
    }
  }

  function setDialogueFocus(focus: { speakerId: string; cue: DialogueCue | null } | null) {
    if (!focus) {
      ambient.setDialogueCue(null);
      beginLeaveDialogue();
      return;
    }
    ambient.setDialogueCue(focus.cue);
    if ((dialoguePhase === "enter" || dialoguePhase === "hold") && dialogueSpeaker === focus.speakerId) return;
    beginEnterDialogue(focus.speakerId);
  }

  function pulseDialogue() {
    if (calmDialogue) return;
    dialogueFlourish = 0.45;
    ambient.pulseDialogue();
  }

  for (const material of pulses) material.userData.live = true;
  if (!shadows) addStaticContactShadows();
  player.userData.noBatch = true;
  inventor.userData.noBatch = true;
  for (const ring of highlightRings.values()) ring.userData.noBatch = true;
  const batchStats: BatchStats | null = options.batch === false ? null : batchStaticMeshes(scene, geometries);
  options.viewport.dataset.renderSuspended = "0";
  if (batchStats && (options.e2e || options.perf)) {
    options.viewport.dataset.batchMeshes = `${batchStats.meshesBefore}>${batchStats.meshesAfter}`;
  }

  function rendererStats() {
    if (!gpuLive) return { calls: 0, triangles: 0, geometries: 0, textures: 0 };
    const render = renderer.info.render;
    return {
      calls: render.calls,
      triangles: render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    };
  }

  function kickLoop() {
    if (!running || suspended || loopQueued) return;
    lastFrame = performance.now();
    loopQueued = true;
    requestAnimationFrame(loop);
  }

  function setSuspended(next: boolean) {
    if (suspended === next) return;
    suspended = next;
    ambient.setTvSuspended(next);
    options.viewport.dataset.renderSuspended = next ? "1" : "0";
    velX = 0;
    velZ = 0;
    lookRateYaw = 0;
    lookRatePitch = 0;
    input.resetLook();
    if (!next) kickLoop();
  }

  kickLoop();
  options.onReady();
  options.onWhiteboardReady?.(lobbyWhiteboard);
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
        player.position.set(ambient.slacker.approach.x, 0, ambient.slacker.approach.z);
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
      whiteboardView: () => ({
        phase: boardPhase,
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        playerVisible: player.visible,
      }),
      boardPoint: (zone: "row" | "back" | "action", number?: number) => {
        const box = projectBoardRect(zone, number);
        if (!box) return null;
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      },
      boardBox: (zone: "row" | "back" | "action", number?: number) => projectBoardRect(zone, number),
      renderFrame: () => frame,
      renderSuspended: () => suspended,
      visibleApps: () => options.prototypes.map((entry) => entry.slug),
      playerPose: () => ({
        x: Number(player.position.x.toFixed(4)),
        z: Number(player.position.z.toFixed(4)),
        yaw: Number(yaw.toFixed(4)),
      }),
      rendererStats,
      batchStats: () => batchStats,
      workshopView,
      probeWalkable: () => {
        const bounds = playerLobbyBounds();
        const start = { x: 0, z: 1.7 };
        const checks = [
          { x: -1.5, z: -2.2 },
          { x: 1.2, z: 0.2 },
          { x: -5.5, z: 2.5 },
          { x: 5.5, z: 0.5 },
          { x: 7.3, z: 5.1 },
        ];
        return checks.map((target) => {
          const result = walkToward(start, target, colliders(), bounds, { steps: 640 });
          return { target, moved: result.moved, remaining: result.remaining };
        });
      },
    };
    options.onE2eReady?.();
    options.viewport.dataset.ambient = "1";
  } else if (options.perf) {
    window.__protoLab = {
      focus,
      renderFrame: () => frame,
      renderSuspended: () => suspended,
      rendererStats,
      batchStats: () => batchStats,
      workshopView,
      frameWorkMs: () => Number(perfWorkMs.toFixed(2)),
    };
  }

  return {
    focus,
    interact,
    setArcadeHighlight,
    setSelectorOpen(open: boolean) {
      selectorOpen = open;
      if (!open) idleElapsed = 0;
    },
    setInputEnabled(enabled: boolean) {
      inputEnabled = enabled;
      targetLabel = "\0";
    },
    setProposalBoardItems(items: ProposalStatusItem[], partial: boolean) {
      lobbyWhiteboard.setItems(items, partial);
    },
    isViewingWhiteboard() {
      return boardPhase !== "idle";
    },
    exitWhiteboard() {
      beginLeaveBoard();
    },
    handleBoardKey(key: string) {
      if (boardPhase !== "hold") return false;
      return lobbyWhiteboard.handleKey(key);
    },
    clearBoardSelection() {
      if (boardPhase !== "hold") return false;
      return lobbyWhiteboard.clearSelection();
    },
    setDialogueFocus,
    isDialogueFraming() {
      return dialoguePhase !== "idle";
    },
    pulseDialogue,
    setSuspended,
    releaseRenderer,
    restoreRenderer,
    playWorkshopTrip,
    skipWorkshopTrip,
    ensureInventorHome,
    dispose() {
      running = false;
      ambient.dispose();
      input.dispose();
      observer.disconnect();
      releaseRenderer();
      labelRenderer.domElement.remove();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      disposeScreenMap();
      lobbyWhiteboard.dispose();
    },
  };

  function resolve(position: Vector3) {
    resolvePosition(position, spots, playerLobbyBounds());
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

  function addCeiling(lights: PointLight[]) {
    const y = CEILING_UNDERSIDE;
    const panels: Array<[number, number, number, number]> = [
      [19, 7.8, 0, -3.4],
      [19, 8.6, 0, 7.6],
      [7.8, 2.8, -5.6, 1.9],
      [7.8, 2.8, 5.6, 1.9],
    ];
    const ceilMat = new MeshBasicMaterial({ color: 0x465278 });
    const insetMat = new MeshBasicMaterial({ color: 0x323a56 });
    materials.push(ceilMat, insetMat);
    for (const [w, d, x, z] of panels) {
      const panel = new Mesh(geo(new PlaneGeometry(w, d)), ceilMat);
      panel.rotation.x = Math.PI / 2;
      panel.position.set(x, y, z);
      scene.add(panel);
      const inset = new Mesh(geo(new PlaneGeometry(w * 0.52, d * 0.42)), insetMat);
      inset.rotation.x = Math.PI / 2;
      inset.position.set(x, y - 0.03, z);
      scene.add(inset);
    }
    for (const z of [-5.6, -1.1, 4.6, 8.8]) {
      box(scene, 18.4, 0.28, 0.18, 0, y - 0.2, z, PALETTE.trim, false);
    }
    box(scene, 0.18, 0.28, 18, -6.2, y - 0.2, 2.2, PALETTE.trim, false);
    box(scene, 0.18, 0.28, 18, 6.2, y - 0.2, 2.2, PALETTE.trim, false);
    const hz = 1.9;
    box(scene, 3.6, 0.08, 0.1, 0, y - 0.02, hz - 1.46, PALETTE.wallCap, false);
    box(scene, 3.6, 0.08, 0.1, 0, y - 0.02, hz + 1.46, PALETTE.wallCap, false);
    box(scene, 0.1, 0.08, 2.8, -1.74, y - 0.02, hz, PALETTE.wallCap, false);
    box(scene, 0.1, 0.08, 2.8, 1.74, y - 0.02, hz, PALETTE.wallCap, false);

    const skyMat = new MeshBasicMaterial({ map: skyGradient(), toneMapped: false });
    materials.push(skyMat);
    const sky = new Mesh(geo(new PlaneGeometry(22, 24)), skyMat);
    sky.rotation.x = Math.PI / 2;
    sky.position.set(0, y + 0.38, 2.2);
    scene.add(sky);

    addHangingLamp(lights, -1.5, -5.05, 0, true);
    addHangingLamp(lights, 2.15, -0.2, 1.4, true);
    addHangingLamp(lights, 7.85, 5.9, 2.6, false);
  }

  function addHangingLamp(lights: PointLight[], x: number, z: number, phase: number, castsLight: boolean) {
    const y0 = CEILING_UNDERSIDE;
    const shadeY = y0 - HANGING_SHADE_DROP;
    const cord = HANGING_SHADE_DROP - HANGING_SHADE.height / 2;
    box(scene, 0.02, cord, 0.02, x, y0 - cord / 2, z, LAMP_METAL, false);
    const light = addLampHead(
      { parent: scene, geo, mat, materials, shadows },
      {
        x,
        z,
        shadeY,
        shade: HANGING_SHADE,
        glow: HANGING_GLOW,
        lit: true,
        light: castsLight ? { ...HANGING_LIGHT, phase } : undefined,
      },
    );
    if (light) lights.push(light);
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
    box(scene, 20.5, 0.12, 0.55, 0, wallH - 0.04, -7.6, PALETTE.wallCap, false);
    box(scene, 20.5, 0.12, 0.55, 0, wallH - 0.04, 12.2, PALETTE.wallCap, false);
    box(scene, 0.55, 0.12, 20.4, -9.8, wallH - 0.04, 2.2, PALETTE.wallCap, false);
    box(scene, 0.55, 0.12, 20.4, 9.8, wallH - 0.04, 2.2, PALETTE.wallCap, false);
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

  function addChalkboard(whiteboard: WhiteboardStatusController) {
    box(scene, 3.45, 0.12, 0.08, -4.6, 2.48, -7.3, PALETTE.trim, false);
    box(scene, 3.45, 0.12, 0.08, -4.6, 0.64, -7.3, PALETTE.trim, false);
    box(scene, 0.12, 1.95, 0.08, -6.28, 1.55, -7.3, PALETTE.trim, false);
    box(scene, 0.12, 1.95, 0.08, -2.92, 1.55, -7.3, PALETTE.trim, false);
    const material = new MeshBasicMaterial({ map: whiteboard.texture });
    materials.push(material);
    const board = new Mesh(geo(new PlaneGeometry(WHITEBOARD_FRAME.width, WHITEBOARD_FRAME.height)), material);
    board.position.set(WHITEBOARD_FRAME.x, WHITEBOARD_FRAME.y, WHITEBOARD_FRAME.z);
    board.userData.interactId = "chalkboard";
    board.userData.noBatch = true;
    boardMesh = board;
    scene.add(board);
    bindWhiteboardMesh(board, whiteboard, (item) => materials.push(item));
    const label = new Group();
    label.position.set(-4.6, 0, -7.2);
    scene.add(label);
    tag(label, "Pizarra", 2.55, "chalkboard");
  }

  function addBench() {
    const x = LAYOUT.bench.x;
    const z = LAYOUT.bench.z;
    box(scene, 1.5, 0.1, 0.62, x, 0.72, z, PALETTE.bench);
    for (const sx of [-0.62, 0.62]) {
      for (const sz of [-0.22, 0.22]) {
        box(scene, 0.08, 0.7, 0.08, x + sx, 0.35, z + sz, PALETTE.bench);
      }
    }
    box(scene, 0.22, 0.05, 0.1, x - 0.4, 0.8, z, 0x8d97a8, false);
    box(scene, 0.12, 0.08, 0.16, x + 0.32, 0.8, z + 0.06, PALETTE.crate, false);
    box(scene, 0.08, 0.14, 0.08, x + 0.05, 0.84, z - 0.12, PALETTE.trim, false);
  }

  function addLamp() {
    const x = -0.35;
    const z = -7.22;
    box(scene, 0.14, 0.18, 0.05, x, SCONCE_SHADE_Y + 0.08, z, LAMP_METAL, false);
    box(scene, 0.04, 0.04, 0.12, x, SCONCE_SHADE_Y + 0.02, z + 0.07, LAMP_METAL, false);
    addLampHead(
      { parent: scene, geo, mat, materials, shadows },
      {
        x,
        z: z + 0.16,
        shadeY: SCONCE_SHADE_Y,
        shade: SCONCE_SHADE,
        glow: SCONCE_GLOW,
        lit: true,
      },
    );
    lampLight.position.set(x, SCONCE_SHADE_Y + SCONCE_GLOW.dy - 0.06, z + 0.22);
  }

  function addAoWall(w: number, h: number, d: number, x: number, y: number, z: number, material: MeshLambertMaterial) {
    const geometry = geo(new BoxGeometry(w, h, d, 1, 4, 1));
    applyShade(geometry, (_px, py) => wallShade(py + h / 2, h));
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    scene.add(mesh);
  }

  function floorShadeSpots(): ShadeSpot[] {
    const spots = [
      { x: LAYOUT.inventor.x, z: LAYOUT.inventor.z, r: 0.95 },
      { x: LAYOUT.arcade.x, z: LAYOUT.arcade.z, r: 1.2 },
      { x: LAYOUT.bench.x, z: LAYOUT.bench.z, r: 0.75 },
      { x: LAYOUT.fridge.x, z: LAYOUT.fridge.z, r: 0.85 },
      { x: SLACKER_COUCH.x, z: SLACKER_COUCH.z, r: 1.05 },
      { x: NORTH_COUCH.x, z: NORTH_COUCH.z, r: 1.05 },
      { x: SOUTH_COUCH.x, z: SOUTH_COUCH.z, r: 1.05 },
      { x: LOUNGE_TABLE.x, z: LOUNGE_TABLE.z, r: 0.7 },
    ];
    return spots.map((spot) => ({ x: spot.x, y: 2 - spot.z, r: spot.r }));
  }

  function contactMaterial(): MeshBasicMaterial {
    if (contactMat) return contactMat;
    contactMat = new MeshBasicMaterial({
      color: 0x121624,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    materials.push(contactMat);
    return contactMat;
  }

  function addStaticContactShadows() {
    const spots = [
      { x: LAYOUT.inventor.x, z: LAYOUT.inventor.z, r: 0.46 },
      { x: LAYOUT.arcade.x, z: LAYOUT.arcade.z, r: 0.78 },
      { x: SLACKER_COUCH.x, z: SLACKER_COUCH.z, r: 0.72 },
      { x: NORTH_COUCH.x, z: NORTH_COUCH.z, r: 0.72 },
      { x: SOUTH_COUCH.x, z: SOUTH_COUCH.z, r: 0.72 },
      { x: LOUNGE_TABLE.x, z: LOUNGE_TABLE.z, r: 0.48 },
      { x: LAYOUT.fridge.x, z: LAYOUT.fridge.z, r: 0.4 },
    ];
    const parts = spots.map((spot) => {
      const geometry = new CircleGeometry(spot.r, 12);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(spot.x, 0.028, spot.z);
      return geometry;
    });
    const merged = mergeGeometries(parts, false);
    for (const geometry of parts) geometry.dispose();
    if (!merged) return;
    geo(merged);
    const blob = new Mesh(merged, contactMaterial());
    scene.add(blob);
  }

  function trackedFuse(meshes: Mesh[]): Mesh {
    const fused = fuseMeshes(meshes);
    if (!geometries.includes(fused.geometry)) geo(fused.geometry);
    return fused;
  }

  function buildInventor(): Group {
    const group = new Group();
    group.userData.interactId = "inventor";
    const hips = new Group();
    hips.position.set(0, 0.46, 0);
    group.add(hips);
    group.userData.hips = hips;
    const legL = box(hips, 0.14, 0.42, 0.16, -0.1, -0.25, 0, PALETTE.coatDark);
    const legR = box(hips, 0.14, 0.42, 0.16, 0.1, -0.25, 0, PALETTE.coatDark);
    trackedFuse([legL, legR]);

    const pelvis = box(group, 0.36, 0.18, 0.28, 0, 0.46, 0, PALETTE.coatDark);
    const hat = new Mesh(geo(new CylinderGeometry(0.16, 0.18, 0.28, 10)), mat(PALETTE.coatDark));
    hat.position.set(0, 1.84, 0);
    group.add(hat);
    trackedFuse([pelvis, hat]);

    const torso = box(group, 0.66, 0.78, 0.4, 0, 0.8, 0, PALETTE.coat);
    group.userData.torso = torso;
    const pin = new Mesh(geo(new BoxGeometry(0.08, 0.08, 0.02)), new MeshBasicMaterial({ color: PALETTE.amber, toneMapped: false }));
    materials.push(pin.material);
    pin.position.set(0.16, 0.12, 0.22);
    torso.add(pin);

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
    trackedFuse([hair, brim]);

    const lensMat = new MeshBasicMaterial({ color: PALETTE.lens });
    materials.push(lensMat);
    const lensL = new Mesh(geo(new CylinderGeometry(0.07, 0.07, 0.04, 10)), lensMat);
    const lensR = new Mesh(geo(new CylinderGeometry(0.07, 0.07, 0.04, 10)), lensMat);
    const bridge = new Mesh(geo(new BoxGeometry(0.08, 0.02, 0.02)), lensMat);
    lensL.rotation.x = Math.PI / 2;
    lensR.rotation.x = Math.PI / 2;
    lensL.position.set(-0.1, 1.42, 0.24);
    lensR.position.set(0.1, 1.42, 0.24);
    bridge.position.set(0, 1.45, 0.24);
    group.add(lensL, lensR, bridge);
    trackedFuse([lensL, lensR, bridge]);

    const eyeGeo = geo(new BoxGeometry(0.06, 0.045, 0.02));
    const eyeMat = mat(PALETTE.hair);
    const eyeL = new Mesh(eyeGeo, eyeMat);
    const eyeR = new Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.1, 0.03, 0.22);
    eyeR.position.set(0.1, 0.03, 0.22);
    head.add(eyeL, eyeR);
    const eyes = trackedFuse([eyeL, eyeR]);
    eyes.castShadow = false;
    group.userData.eyes = eyes;

    const arm = makeArm(0.42);
    const armL = makeArm(-0.42);
    group.add(arm, armL);
    group.userData.arm = arm;
    group.userData.armL = armL;
    tag(group, "Inventor", 2.15, "inventor");
    group.traverse((child) => {
      child.userData.interactId = "inventor";
    });
    return group;
  }

  function makeArm(x: number): Group {
    const arm = new Group();
    arm.position.set(x, 1.05, 0);
    const armMesh = new Mesh(geo(new BoxGeometry(0.12, 0.48, 0.12)), mat(PALETTE.coat));
    armMesh.position.y = -0.2;
    arm.add(armMesh);
    return arm;
  }

  function buildPlayer(): Group {
    const group = new Group();
    const rig = new Group();
    group.add(rig);
    group.userData.rig = rig;
    const torso = box(rig, 0.36, 0.55, 0.28, 0, 0.48, 0, PALETTE.teal);
    const armL = box(rig, 0.12, 0.42, 0.12, -0.28, 0.52, 0, PALETTE.teal);
    const armR = box(rig, 0.12, 0.42, 0.12, 0.28, 0.52, 0, PALETTE.teal);
    trackedFuse([torso, armL, armR]);
    const head = new Mesh(geo(new SphereGeometry(0.2, 14, 12)), mat(PALETTE.skin));
    head.position.set(0, 0.98, 0);
    head.castShadow = shadows;
    rig.add(head);
    const nose = new Mesh(geo(new BoxGeometry(0.08, 0.08, 0.1)), mat(PALETTE.coat));
    nose.position.set(0, 0.96, -0.2);
    rig.add(nose);
    const eyeGeo = geo(new BoxGeometry(0.05, 0.035, 0.016));
    const eyeMat = mat(PALETTE.hair);
    const eyeL = new Mesh(eyeGeo, eyeMat);
    const eyeR = new Mesh(eyeGeo, eyeMat);
    // La cara es −Z, el mismo lado que la boca naranja. +Z es la nuca.
    eyeL.position.set(-0.07, 0.05, -0.18);
    eyeR.position.set(0.07, 0.05, -0.18);
    head.add(eyeL, eyeR);
    const eyes = trackedFuse([eyeL, eyeR]);
    eyes.castShadow = false;
    group.userData.eyes = eyes;
    if (!shadows) {
      const disc = new Mesh(geo(new CircleGeometry(0.34, 12)), contactMaterial());
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.028;
      group.add(disc);
    }
    return group;
  }

  function buildArcadeCabinet(screenMaterial: MeshBasicMaterial): Group {
    const group = new Group();
    group.userData.interactId = "arcade";
    box(group, 1.18, 1.28, 0.56, 0, 0.82, -0.02, PALETTE.cabinet);
    box(group, 0.12, 1.58, 0.68, -0.64, 0.9, 0.02, 0x171225);
    box(group, 0.12, 1.58, 0.68, 0.64, 0.9, 0.02, 0x171225);
    for (const [ex, ez] of [
      [-0.59, -0.3],
      [0.59, -0.3],
      [-0.59, 0.26],
      [0.59, 0.26],
    ] as const) {
      box(group, 0.05, 1.34, 0.05, ex, 0.82, ez, 0x171225, false);
    }
    box(group, 1.22, 0.045, 0.6, 0, 1.48, -0.02, 0x171225, false);
    addGlowStrip(group, -0.71, 0xff5d73);
    addGlowStrip(group, 0.71, 0x3ec6ff);
    box(group, 1.28, 0.42, 0.16, 0, 1.7, 0.2, 0x1a1428, false);
    const marqueeMat = new MeshBasicMaterial({ map: marqueeTexture(), toneMapped: false });
    materials.push(marqueeMat);
    const marquee = new Mesh(geo(new PlaneGeometry(1.16, 0.32)), marqueeMat);
    marquee.position.set(0, 1.7, 0.32);
    group.add(marquee);
    group.userData.marqueeMat = marqueeMat;
    box(group, 1.08, 0.74, 0.05, 0, 1.16, 0.3, 0x100c18, false);
    const screen = new Mesh(geo(new PlaneGeometry(0.94, 0.6)), screenMaterial);
    screen.position.set(0, 1.16, 0.35);
    screen.userData.noBatch = true;
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

  function tag(parent: Object3D, text: string, y: number, id?: string, pip?: "note") {
    const { anchor, plate } = createNameplateElement(text);
    if (pip === "note") {
      anchor.dataset.kind = "radio";
      anchor.querySelector(".nameplate-pip")?.classList.add("nameplate-pip--note");
    }
    const object = new CSS2DObject(anchor);
    object.center.set(0, 0);
    object.position.set(0, y, 0);
    parent.add(object);
    if (id) trackPlate(id, plate, object, text);
  }
}

function floorLightMap(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = LinearSRGBColorSpace;
  texture.flipY = true;
  if (!context) return texture;
  context.fillStyle = "#000";
  context.fillRect(0, 0, 128, 128);
  for (const lamp of FLOOR_LAMPS) paintLampWash(context, lamp.x, lamp.z);
  return texture;
}

/** Baño amplio y pálido. No es el disco ámbar de un indicador. */
function paintLampWash(context: CanvasRenderingContext2D, x: number, z: number) {
  const uv = floorUv(x, z);
  const px = uv.u * 128;
  const py = (1 - uv.v) * 128;
  const radius = (4.8 / 20) * 128;
  const gradient = context.createRadialGradient(px, py, radius * 0.2, px, py, radius);
  gradient.addColorStop(0, "rgba(255, 214, 176, 0.42)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(px, py, radius, 0, Math.PI * 2);
  context.fill();
}

function skyGradient(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (!context) return texture;
  const gradient = context.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, "#1a2148");
  gradient.addColorStop(0.42, "#31457e");
  gradient.addColorStop(0.74, "#6e8cc4");
  gradient.addColorStop(1, "#e2c08a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = "#f4efe4";
  context.beginPath();
  context.arc(46, 14, 6, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f6f1e7";
  for (let i = 0; i < 14; i++) context.fillRect((i * 13) % 60, (i * 7) % 26, 2, 2);
  return texture;
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
      whiteboardView?: () => { phase: string; x: number; y: number; z: number; playerVisible: boolean };
      boardPoint?: (zone: "row" | "back" | "action", number?: number) => { x: number; y: number } | null;
      boardBox?: (
        zone: "row" | "back" | "action",
        number?: number,
      ) => { x: number; y: number; width: number; height: number } | null;
      openPrototype?: (slug: string) => void;
      renderFrame?: () => number;
      renderSuspended?: () => boolean;
      visibleApps?: () => string[];
      playerPose?: () => { x: number; z: number; yaw: number };
      rendererStats?: () => { calls: number; triangles: number; geometries: number; textures: number };
      frameWorkMs?: () => number;
      batchStats?: () => BatchStats | null;
      workshopView?: () => {
        place: string;
        x: number;
        y: number;
        z: number;
        yaw: number;
        sit: number;
        camX: number;
        camY: number;
        camZ: number;
      };
    };
  }
}
