interface Window {
  __protoLab?: {
    focus: (id: string) => void;
    visitSlacker?: () => void;
    visitCorner?: (which: "workshop" | "pinball") => void;
    probeWalkable?: () => { target: { x: number; z: number }; moved: number; remaining: number }[];
    viewpoints?: () => { id: string; label: string }[];
    setViewpoint?: (id: string) => boolean;
    setDebug?: (on: boolean) => void;
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
  };
}
