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
}
