interface Window {
  __protoLab?: {
    focus: (id: string) => void;
    visitSlacker?: () => void;
    visitCorner?: (which: "workshop" | "pinball") => void;
    probeWalkable?: () => { target: { x: number; z: number }; moved: number; remaining: number }[];
    whiteboardView?: () => { phase: string; x: number; y: number; z: number; playerVisible: boolean };
    boardPoint?: (zone: "row" | "back" | "action", number?: number) => { x: number; y: number } | null;
    boardBox?: (
      zone: "row" | "back" | "action",
      number?: number,
    ) => { x: number; y: number; width: number; height: number } | null;
    viewpoints?: () => { id: string; label: string }[];
    setViewpoint?: (id: string) => boolean;
    setDebug?: (on: boolean) => void;
    openPrototype?: (slug: string) => void;
    renderFrame?: () => number;
    renderSuspended?: () => boolean;
    visibleApps?: () => string[];
    playerPose?: () => { x: number; z: number; yaw: number };
    setFollowDistance?: (distance: number) => void;
    cameraRig?: () => {
      distance: number;
      yaw: number;
      pitch: number;
      arm: number;
      span: number;
      mode: string;
    };
    rendererStats?: () => { calls: number; triangles: number; geometries: number; textures: number };
    frameWorkMs?: () => number;
    frameAt?: (x: number, z: number, lookYaw: number, lookPitch: number, distance?: number) => void;
    posePantry?: () => void;
    batchStats?: () => {
      meshesBefore: number;
      meshesAfter: number;
      instancedSets: number;
      mergedSets: number;
      shadowCasters: number;
    } | null;
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
      beat?: string;
      headX?: number;
    };
    workshopClouds?: () => { count: number; past: number; now: number; triangles: number };
    workshopCloudBoxes?: () => Array<{ id: string; x: number; y: number; width: number; height: number }>;
    workshopTextInside?: () => string;
  };
  __chispa?: {
    drop: (x?: number) => void;
    spawnPair: (tier: number) => void;
    ballCount: () => number;
    score: () => number;
  };
  __protoLabAssets?: {
    getBlobUrl(path: string): Promise<string>;
    getArrayBuffer(path: string): Promise<ArrayBuffer>;
    getMime(path: string): Promise<string>;
    revokeAll(): void;
  };
  __assetLab?: {
    runMediaChecks(): Promise<Record<string, boolean>>;
    probeExternalFetch(): Promise<string>;
    probeBadAsset(path: string): Promise<string>;
    cspPresent(): boolean;
    loadNote(): Promise<unknown>;
    jsonMime(): Promise<string>;
    roundtripSave(key: string, value: string): Promise<string | null>;
    readSave(key: string): Promise<string | null>;
    probeRelative(path: string): Promise<string>;
  };
}
