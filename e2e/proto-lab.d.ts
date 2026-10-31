interface Window {
  __protoLab?: {
    focus: (id: string) => void;
    visitSlacker?: () => void;
    probeWalkable?: () => { target: { x: number; z: number }; moved: number; remaining: number }[];
  };
  __chispa?: {
    drop: (x?: number) => void;
    spawnPair: (tier: number) => void;
    ballCount: () => number;
    score: () => number;
  };
}
