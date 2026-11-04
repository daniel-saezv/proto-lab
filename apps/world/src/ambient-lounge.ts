import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  type Material,
} from "three";
import { createTvScreen } from "./tv-screen";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { createNameplateElement } from "./nameplates";
import type { AmbientCollider, AmbientFactories } from "./ambient";
import { blinkOpen, breathScale, idlePhase } from "./graphics-idle";
import { fuseMeshes } from "./mesh-fuse";
import type { ErrandPose } from "./pantry-routine";
import type { DialogueCue } from "./dialogue-cues";
import {
  LOUNGE_FURNITURE,
  LOUNGE_NPCS,
  LOUNGE_TABLE,
  NORTH_COUCH,
  SLACKER_BUBBLE_RADIUS,
  SLACKER_COUCH,
  SOUTH_COUCH,
  TV_SET,
  type LoungeNpc,
} from "./lounge-layout";
import { createSofaGlanceRuntime, tickSofaGlances, type SofaGlanceContext } from "./sofa-glances";

const PALETTE = {
  couch: 0x5c4038,
  couchDark: 0x3d2a24,
  skin: 0xf0c7a2,
  tv: 0x1a1528,
  tvGlow: 0x8fd8ff,
  ember: 0xff6b2c,
  smoke: 0xc8ccd4,
  rug: 0x3a3048,
  card: 0xf4efe4,
  cardGold: 0xffb703,
  cardPink: 0xff6b9d,
  cardTeal: 0x1f8a80,
  pipe: 0x6d4b32,
  cushion: 0x6a4a62,
};

export type LoungeNpcSpot = {
  id: string;
  x: number;
  z: number;
  radius: number;
  label: string;
  color: number;
  approach: { x: number; z: number };
};

type LoungeAct = {
  cue: DialogueCue | null;
  pulse: number;
};

function kickOf(act: LoungeAct): number {
  return act.pulse > 0 ? act.pulse / 0.45 : 0;
}

type LoungePlate = { id: string; element: HTMLElement; anchor: CSS2DObject };

export type LoungeGroup = {
  colliders: AmbientCollider[];
  slacker: { x: number; z: number; radius: number; approach: { x: number; z: number } };
  npcs: LoungeNpcSpot[];
  nameplates: LoungePlate[];
  bubble: HTMLElement;
  tick: (time: number, dt: number, beatMid: number, glanceCtx?: SofaGlanceContext, errand?: ErrandPose) => void;
  applyErrand: (pose: ErrandPose, time: number) => void;
  syncTv: (playerX: number, playerZ: number, dt: number, reduced: boolean) => void;
  setTvSources: (still: string | null, clip: string) => void;
  setTvSuspended: (suspended: boolean) => void;
  disposeTv: () => void;
  setDialogueCue: (cue: DialogueCue | null) => void;
  pulseDialogue: () => void;
};

export function addLoungeGroup(parent: Group, f: AmbientFactories): LoungeGroup {
  const rug = new Mesh(f.geo(new PlaneGeometry(3.6, 3.3)), f.mat(PALETTE.rug));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(LOUNGE_TABLE.x - 0.35, 0.015, LOUNGE_TABLE.z + 0.15);
  rug.receiveShadow = f.shadows;
  parent.add(rug);

  const remolon = npcById("remolon");
  const brasa = npcById("brasa");
  const naipe = npcById("naipe");
  const croquis = npcById("croquis");

  addCouch(parent, SLACKER_COUCH.x, SLACKER_COUCH.z, SLACKER_COUCH.yaw, remolon.id, f);
  addCouch(parent, NORTH_COUCH.x, NORTH_COUCH.z, NORTH_COUCH.yaw, brasa.id, f);
  addCouch(parent, SOUTH_COUCH.x, SOUTH_COUCH.z, SOUTH_COUCH.yaw, naipe.id, f);
  addTable(parent, f);
  const tv = addTelevision(parent, f);
  const act: LoungeAct = { cue: null, pulse: 0 };
  const slacker = addSlacker(parent, remolon, f, act);
  const pipe = addPiper(parent, brasa, f, act);
  const cards = addDealer(parent, naipe, f, act);
  const walkers = [slacker.walker, cards.walker];
  const sketch = addSketcher(parent, croquis, f, act);

  const nameplates = [slacker.plate, pipe.plate, cards.plate, sketch.plate];
  const faceIdles = collectFaceIdles(parent);
  const glanceNpcs = LOUNGE_NPCS.map((npc) => {
    let body: Group | undefined;
    let head: Mesh | undefined;
    parent.traverse((obj) => {
      if (obj.userData.interactId === npc.id && obj instanceof Group && obj.userData.sofaHead) {
        body = obj;
        head = obj.userData.sofaHead as Mesh;
      }
    });
    if (!body || !head) throw new Error(`Cabeza del sofá ausente: ${npc.id}`);
    return {
      id: npc.id,
      head,
      restPitch: head.rotation.x,
      bodyYaw: npc.yaw,
      x: npc.x,
      z: npc.z,
      phase: idlePhase(npc.id),
    };
  });
  const glances = createSofaGlanceRuntime(glanceNpcs, f.reduced);

  return {
    colliders: LOUNGE_FURNITURE.map((item) => ({
      id: item.id,
      x: item.x,
      z: item.z,
      collider: item.collider,
    })),
    slacker: {
      x: remolon.x,
      z: remolon.z,
      radius: SLACKER_BUBBLE_RADIUS,
      approach: remolon.approach,
    },
    npcs: LOUNGE_NPCS.map((npc) => ({
      id: npc.id,
      x: npc.x,
      z: npc.z,
      radius: npc.radius,
      label: npc.label,
      color: npc.color,
      approach: npc.approach,
    })),
    nameplates,
    bubble: slacker.bubble,
    tick(time, dt, beatMid, glanceCtx, errand) {
      if (act.pulse > 0) act.pulse = Math.max(0, act.pulse - dt);
      slacker.tick(time);
      pipe.tick(time);
      cards.tick(time);
      sketch.tick(time);
      tv.tick(time, beatMid);
      // Idle de cara. El humo, las cartas y el lápiz siguen en los tick de arriba.
      for (const idle of faceIdles) idle(time);
      if (glanceCtx) tickSofaGlances(glances, time, dt, glanceCtx);
      if (errand) applyWalker(walkers, errand, time);
    },
    applyErrand(pose, time) {
      applyWalker(walkers, pose, time);
    },
    syncTv(playerX, playerZ, dt, reduced) {
      const distance = Math.hypot(playerX - TV_SET.x, playerZ - TV_SET.z);
      tv.screen.sync({ distance, reduced, dt });
    },
    setTvSources(still, clip) {
      tv.screen.setSources(still, clip);
    },
    setTvSuspended(suspended) {
      tv.screen.setSuspended(suspended);
    },
    disposeTv() {
      tv.screen.dispose();
    },
    setDialogueCue(cue) {
      act.cue = cue;
    },
    pulseDialogue() {
      act.pulse = 0.45;
    },
  };
}

function npcById(id: string): LoungeNpc {
  const found = LOUNGE_NPCS.find((npc) => npc.id === id);
  if (!found) throw new Error(`Persona del rincón desconocida: ${id}`);
  return found;
}

function addCouch(parent: Group, x: number, z: number, yaw: number, interactId: string, f: AmbientFactories) {
  const couch = new Group();
  couch.position.set(x, 0, z);
  couch.rotation.y = yaw;
  couch.userData.interactId = interactId;
  parent.add(couch);
  f.box(couch, 1.55, 0.28, 0.72, 0, 0.32, 0.04, PALETTE.couch);
  f.box(couch, 1.55, 0.52, 0.16, 0, 0.66, -0.3, PALETTE.couchDark);
  f.box(couch, 0.16, 0.42, 0.7, -0.78, 0.48, 0.02, PALETTE.couchDark);
  f.box(couch, 0.16, 0.42, 0.7, 0.78, 0.48, 0.02, PALETTE.couchDark);
}

function addTable(parent: Group, f: AmbientFactories) {
  const x = LOUNGE_TABLE.x;
  const z = LOUNGE_TABLE.z;
  f.box(parent, 0.98, 0.08, 0.64, x, 0.28, z, PALETTE.couchDark);
  for (const lx of [-0.4, 0.4]) {
    for (const lz of [-0.24, 0.24]) {
      f.box(parent, 0.06, 0.24, 0.06, x + lx, 0.12, z + lz, PALETTE.couch, false);
    }
  }
  const cards: Array<[number, number, number, number]> = [
    [-0.16, -0.06, 0.25, PALETTE.card],
    [-0.04, 0.02, -0.15, PALETTE.cardGold],
    [0.1, -0.04, 0.45, PALETTE.cardPink],
    [0.2, 0.08, -0.4, PALETTE.cardTeal],
    [-0.22, 0.1, 1.1, PALETTE.card],
  ];
  for (const [dx, dz, rot, color] of cards) {
    const card = f.box(parent, 0.12, 0.012, 0.16, x + dx, 0.335, z + dz, color, false);
    card.rotation.y = rot;
  }
  f.box(parent, 0.08, 0.04, 0.08, x - 0.28, 0.35, z + 0.12, PALETTE.pipe, false);
  f.box(parent, 0.05, 0.07, 0.05, x - 0.32, 0.365, z + 0.08, PALETTE.couchDark, false);
  f.box(parent, 0.04, 0.035, 0.04, x - 0.26, 0.375, z + 0.08, PALETTE.card, false);
  f.box(parent, 0.11, 0.04, 0.08, x + 0.06, 0.355, z + 0.14, PALETTE.cardTeal, false);
  f.box(parent, 0.1, 0.035, 0.07, x + 0.06, 0.39, z + 0.14, PALETTE.cardGold, false);
  f.box(parent, 0.09, 0.03, 0.06, x + 0.07, 0.42, z + 0.14, PALETTE.cardPink, false);
  const poster = f.box(parent, 0.22, 0.14, 0.012, x, 0.52, z + 0.33, PALETTE.cardPink, false);
  poster.rotation.x = -0.12;
}

function addTelevision(parent: Group, f: AmbientFactories): {
  tick: (time: number, beatMid: number) => void;
  screen: ReturnType<typeof createTvScreen>;
} {
  const tv = new Group();
  tv.position.set(TV_SET.x, 0, TV_SET.z);
  tv.rotation.y = TV_SET.yaw;
  parent.add(tv);
  f.box(tv, 0.16, 0.28, 0.16, 0, 0.16, 0, PALETTE.tv, false);
  f.box(tv, 0.7, 0.46, 0.12, 0, 0.56, 0, PALETTE.tv);
  f.box(tv, 0.78, 0.08, 0.16, 0, 0.84, 0, PALETTE.tv);
  const screenCtrl = createTvScreen(f.materials);
  const screen = new Mesh(f.geo(new PlaneGeometry(0.58, 0.36)), screenCtrl.material);
  screen.position.set(0, 0.56, 0.08);
  tv.add(screen);
  const tvLight = new PointLight(PALETTE.tvGlow, 4.2, 3.4, 2);
  tvLight.position.set(0, 0.58, 0.42);
  tv.add(tvLight);

  return {
    screen: screenCtrl,
    tick(time, beatMid) {
      const flick = 0.85 + Math.sin(time * 9) * 0.08;
      tvLight.intensity = 3.4 * flick * (1 + beatMid * 0.12);
    },
  };
}

function addSlacker(parent: Group, npc: LoungeNpc, f: AmbientFactories, act: LoungeAct): {
  bubble: HTMLElement;
  plate: LoungePlate;
  tick: (time: number) => void;
  walker: WalkerRig;
} {
  const body = addSeated(parent, npc, { shirt: 0x4a5568, pants: 0x3d4a5c, hair: 0x2a2933 }, f, 0.52, 0.34, true);
  const arm = new Group();
  arm.userData.noBatch = true;
  arm.position.set(0.22, 0.32, 0.08);
  body.add(arm);
  const upper = f.box(arm, 0.1, 0.28, 0.1, 0, -0.08, 0, PALETTE.skin, false);
  upper.rotation.x = -0.35;
  const fore = f.box(arm, 0.09, 0.24, 0.09, 0, -0.32, 0.08, PALETTE.skin, false);
  fore.rotation.x = 0.7;
  const joint = f.box(arm, 0.045, 0.16, 0.045, 0, -0.46, 0.16, 0x6b8f4e, false);
  joint.rotation.x = 0.35;
  const emberMat = new MeshBasicMaterial({ color: PALETTE.ember, transparent: true, opacity: 0.9 });
  f.materials.push(emberMat);
  const ember = new Mesh(f.geo(new SphereGeometry(0.032, 8, 6)), emberMat);
  ember.position.set(0, -0.54, 0.2);
  arm.add(ember);

  const smokeGeo = f.geo(new SphereGeometry(0.07, 8, 6));
  const smokes: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const smokeMat = new MeshBasicMaterial({ color: PALETTE.smoke, transparent: true, opacity: 0.28 - i * 0.06 });
    f.materials.push(smokeMat);
    const puff = new Mesh(smokeGeo, smokeMat);
    puff.position.set(0, -0.4 + i * 0.12, 0.22);
    arm.add(puff);
    smokes.push(puff);
  }

  const bubbleAnchor = document.createElement("div");
  bubbleAnchor.className = "speech-bubble";
  bubbleAnchor.hidden = true;
  const bubble = new CSS2DObject(bubbleAnchor);
  bubble.position.set(0, 1.02, 0.12);
  body.add(bubble);
  fuseSameMaterial(body, f);
  const can = f.box(arm, 0.05, 0.08, 0.05, 0.02, -0.48, 0.16, PALETTE.cardGold, false);
  can.visible = false;
  can.userData.noBatch = true;

  return {
    bubble: bubbleAnchor,
    plate: addNameplate(body, npc),
    walker: walkerRig(body, "arm", arm, 0, can),
    tick(time) {
      const speed = act.cue === "slouch" ? 1.8 : 1;
      const chew = Math.sin(time * 1.4 * speed);
      const kick = kickOf(act) * Math.sin(time * 16) * 0.18;
      arm.rotation.x = -0.2 + (chew > 0.6 ? 0.35 : 0.05) + kick;
      const emberPulse = 0.75 + Math.sin(time * 5.2) * 0.25;
      emberMat.color.setScalar(emberPulse);
      emberMat.opacity = 0.85 + Math.sin(time * 6) * 0.15;
      for (let i = 0; i < smokes.length; i++) {
        const puff = smokes[i]!;
        const phase = (time * 0.45 + i * 0.9) % 2.4;
        puff.position.y = -0.42 + phase * 0.42;
        puff.position.x = Math.sin(time + i) * 0.04;
        puff.scale.setScalar(0.35 + phase * 0.22);
        (puff.material as MeshBasicMaterial).opacity = Math.max(0, 0.45 - phase * 0.18);
      }
    },
  };
}

function addPiper(parent: Group, npc: LoungeNpc, f: AmbientFactories, act: LoungeAct): {
  plate: LoungePlate;
  tick: (time: number) => void;
} {
  const body = addSeated(parent, npc, { shirt: 0x8d4a3a, pants: 0x4a3428, hair: 0x3a2418 }, f, 0.52, 0.18);
  const arm = new Group();
  arm.userData.noBatch = true;
  arm.position.set(-0.2, 0.34, 0.1);
  body.add(arm);
  const upper = f.box(arm, 0.09, 0.26, 0.09, 0, -0.06, 0, PALETTE.skin, false);
  upper.rotation.z = 0.4;
  upper.rotation.x = -0.5;
  const fore = f.box(arm, 0.08, 0.2, 0.08, 0.04, -0.24, 0.1, PALETTE.skin, false);
  fore.rotation.x = 0.8;

  const pipe = new Group();
  pipe.position.set(0.06, -0.36, 0.18);
  arm.add(pipe);
  const stem = new Mesh(f.geo(new CylinderGeometry(0.014, 0.014, 0.2, 6)), f.mat(PALETTE.pipe));
  stem.rotation.x = 1.15;
  stem.position.set(0, 0.02, 0.05);
  pipe.add(stem);
  const bowl = new Mesh(f.geo(new SphereGeometry(0.04, 8, 6)), f.mat(0x4a3428));
  bowl.position.set(0, 0.06, 0.14);
  pipe.add(bowl);
  const emberMat = new MeshBasicMaterial({ color: PALETTE.ember, transparent: true, opacity: 0.8 });
  f.materials.push(emberMat);
  const ember = new Mesh(f.geo(new SphereGeometry(0.022, 8, 6)), emberMat);
  ember.position.set(0, 0.09, 0.14);
  pipe.add(ember);
  const smokes: Mesh[] = [];
  const smokeGeo = f.geo(new SphereGeometry(0.055, 8, 6));
  for (let i = 0; i < 2; i++) {
    const smokeMat = new MeshBasicMaterial({ color: PALETTE.smoke, transparent: true, opacity: 0.22 });
    f.materials.push(smokeMat);
    const puff = new Mesh(smokeGeo, smokeMat);
    puff.position.set(0, 0.14 + i * 0.1, 0.14);
    pipe.add(puff);
    smokes.push(puff);
  }

  return {
    plate: addNameplate(body, npc),
    tick(time) {
      const smoking = act.cue === "smoke";
      const pace = smoking ? 2.4 : 1;
      arm.rotation.x = kickOf(act) * Math.sin(time * 16) * 0.22;
      emberMat.opacity = 0.55 + Math.sin(time * 3.1 * pace) * 0.2;
      for (let i = 0; i < smokes.length; i++) {
        const puff = smokes[i]!;
        const phase = (time * 0.28 * pace + i * 1.15) % 2.3;
        puff.position.y = 0.12 + phase * 0.26;
        puff.position.x = Math.sin(time * 0.55 + i) * 0.025;
        puff.scale.setScalar(0.45 + phase * (smoking ? 0.28 : 0.16));
        const peak = smoking ? 0.55 : 0.28;
        (puff.material as MeshBasicMaterial).opacity = Math.max(0, peak - phase * 0.12);
      }
    },
  };
}

function addDealer(parent: Group, npc: LoungeNpc, f: AmbientFactories, act: LoungeAct): {
  plate: LoungePlate;
  tick: (time: number) => void;
  walker: WalkerRig;
} {
  const body = addSeated(parent, npc, { shirt: 0x1f4d4a, pants: 0x173430, hair: 0x1a1a22 }, f, 0.52, 0.4, true);
  const cap = new Mesh(f.geo(new CylinderGeometry(0.16, 0.17, 0.08, 10)), f.mat(0x173430));
  cap.position.set(0, 0.72, -0.16);
  body.add(cap);

  const armL = f.box(body, 0.08, 0.22, 0.08, -0.2, 0.24, 0.06, PALETTE.skin, false);
  armL.rotation.x = -0.85;
  const armR = f.box(body, 0.08, 0.22, 0.08, 0.2, 0.24, 0.06, PALETTE.skin, false);
  armR.rotation.x = -0.75;
  const hands = new Group();
  hands.userData.noBatch = true;
  hands.position.set(0, 0.18, 0.24);
  body.add(hands);
  const fan = [PALETTE.card, PALETTE.cardGold, PALETTE.cardPink];
  for (let i = 0; i < fan.length; i++) {
    const card = f.box(hands, 0.09, 0.008, 0.13, -0.06 + i * 0.05, 0.02, 0, fan[i]!, false);
    card.rotation.y = -0.35 + i * 0.32;
    card.rotation.x = -0.7;
  }
  const shuffle = f.box(hands, 0.09, 0.008, 0.13, 0.02, 0.06, 0.06, PALETTE.cardTeal, false);
  shuffle.rotation.x = -0.55;
  fuseSameMaterial(body, f);
  const can = f.box(hands, 0.05, 0.08, 0.05, 0.06, 0.04, 0.08, PALETTE.cardPink, false);
  can.visible = false;
  can.userData.noBatch = true;

  return {
    plate: addNameplate(body, npc),
    walker: walkerRig(body, "hands", hands, hands.position.z, can),
    tick(time) {
      const dealing = act.cue === "shuffle";
      const speed = dealing ? 2.7 : 1;
      const wave = Math.sin(time * 2.4 * speed);
      shuffle.position.y = 0.05 + Math.max(0, wave) * (dealing ? 0.11 : 0.06);
      shuffle.rotation.z = wave * (dealing ? 0.55 : 0.35);
      hands.rotation.x = Math.sin(time * 1.3 * speed) * 0.06;
      hands.rotation.z = kickOf(act) * Math.sin(time * 18) * 0.4;
    },
  };
}

function addSketcher(parent: Group, npc: LoungeNpc, f: AmbientFactories, act: LoungeAct): {
  plate: LoungePlate;
  tick: (time: number) => void;
} {
  const cushion = f.box(parent, 0.52, 0.08, 0.48, npc.x, 0.06, npc.z, PALETTE.cushion, false);
  cushion.userData.interactId = npc.id;
  const body = addSeated(parent, npc, { shirt: 0x8d6e4a, pants: 0x5c4038, hair: 0x4a3728 }, f, 0.3, 0.55);
  const pad = f.box(body, 0.22, 0.02, 0.16, 0, 0.2, 0.22, PALETTE.card, false);
  pad.rotation.x = -0.85;
  const arm = f.box(body, 0.08, 0.2, 0.08, 0.16, 0.28, 0.08, PALETTE.skin, false);
  arm.rotation.x = -0.9;
  const hand = new Group();
  hand.userData.noBatch = true;
  hand.position.set(0.12, 0.2, 0.22);
  body.add(hand);
  const pencil = f.box(hand, 0.02, 0.16, 0.02, 0, 0, 0.04, PALETTE.cardGold, false);
  pencil.rotation.x = 0.8;
  const tip = f.box(hand, 0.018, 0.04, 0.018, 0, -0.09, 0.1, 0x2a2933, false);
  tip.rotation.x = 0.8;

  return {
    plate: addNameplate(body, npc),
    tick(time) {
      const speed = act.cue === "sketch" ? 2.3 : 1;
      const kick = kickOf(act);
      hand.rotation.z = Math.sin(time * 2.6 * speed) * (0.22 + kick * 0.2);
      hand.position.x = 0.08 + Math.sin(time * 1.4 * speed) * (0.02 + kick * 0.03);
    },
  };
}

type WalkerRig = {
  id: "remolon" | "naipe";
  body: Group;
  seatY: number;
  legL: Mesh;
  legR: Mesh;
  sitLX: number;
  sitRX: number;
  legLY: number;
  legLZ: number;
  legRY: number;
  legRZ: number;
  arm: Group;
  armKind: "arm" | "hands";
  armRestZ: number;
  can: Mesh;
};

function walkerRig(body: Group, armKind: "arm" | "hands", arm: Group, armRestZ: number, can: Mesh): WalkerRig {
  const legs: Mesh[] = [];
  for (const child of body.children) {
    if (child instanceof Mesh && child.userData.walkerLeg) legs.push(child);
  }
  const legL = legs[0];
  const legR = legs[1];
  if (!legL || !legR) throw new Error("Faltan las piernas del paseo");
  const id = body.userData.interactId;
  if (id !== "remolon" && id !== "naipe") throw new Error("Caminante desconocido");
  return {
    id,
    body,
    seatY: body.position.y,
    legL,
    legR,
    sitLX: legL.rotation.x,
    sitRX: legR.rotation.x,
    legLY: legL.position.y,
    legLZ: legL.position.z,
    legRY: legR.position.y,
    legRZ: legR.position.z,
    arm,
    armKind,
    armRestZ,
    can,
  };
}

function fuseSameMaterial(body: Group, f: AmbientFactories) {
  const buckets: Mesh[][] = [];
  for (const child of body.children) {
    if (!(child instanceof Mesh) || child.userData.noBatch || child.userData.walkerLeg) continue;
    let placed = false;
    for (const bucket of buckets) {
      if (bucket[0]!.material === child.material) {
        bucket.push(child);
        placed = true;
        break;
      }
    }
    if (!placed) buckets.push([child]);
  }
  for (const bucket of buckets) {
    if (bucket.length < 2) continue;
    const fused = fuseMeshes(bucket);
    f.geo(fused.geometry);
    fused.castShadow = false;
    fused.userData.noBatch = true;
  }
}

function applyWalker(rigs: readonly WalkerRig[], pose: ErrandPose, time: number) {
  if (!pose.engaged) return;
  let rig: WalkerRig | undefined;
  for (const item of rigs) if (item.id === pose.id) rig = item;
  if (!rig) return;
  const stand = pose.stand;
  rig.body.position.x = pose.x;
  rig.body.position.z = pose.z;
  const bob = pose.walking ? Math.abs(Math.sin(time * 8.5)) * 0.035 * stand : 0;
  const floorY = 0.44;
  rig.body.position.y = rig.seatY + (floorY - rig.seatY) * stand + bob;
  rig.body.rotation.y = pose.yaw;
  const swing = pose.walking ? Math.sin(time * 8.5) * 0.35 * stand : 0;
  const standX = 1.45;
  rig.legL.rotation.x = rig.sitLX + (standX - rig.sitLX) * stand + swing;
  rig.legR.rotation.x = rig.sitRX + (standX - rig.sitRX) * stand - swing;
  rig.legL.position.y = rig.legLY + (-0.2 - rig.legLY) * stand;
  rig.legL.position.z = rig.legLZ + (0.02 - rig.legLZ) * stand;
  rig.legR.position.y = rig.legRY + (-0.2 - rig.legRY) * stand;
  rig.legR.position.z = rig.legRZ + (0.02 - rig.legRZ) * stand;
  if (pose.reach > 0) {
    if (rig.armKind === "arm") rig.arm.rotation.x = -1.1 * pose.reach;
    else {
      rig.arm.position.z = rig.armRestZ + 0.14 * pose.reach;
      rig.arm.rotation.x = -0.45 * pose.reach;
      rig.arm.rotation.z = 0;
    }
  } else if (pose.walking && rig.armKind === "arm") {
    rig.arm.rotation.x = -0.35;
  } else if (rig.armKind === "hands") {
    rig.arm.position.z = rig.armRestZ;
    if (pose.walking) {
      rig.arm.rotation.x = -0.15;
      rig.arm.rotation.z = 0;
    }
  }
  rig.can.visible = pose.carrying;
  for (const other of rigs) if (other !== rig) other.can.visible = false;
}

function addSeated(
  parent: Group,
  npc: LoungeNpc,
  colors: { shirt: number; pants: number; hair: number },
  f: AmbientFactories,
  seatY: number,
  lookPitch: number,
  walker = false,
): Group {
  const body = new Group();
  body.position.set(npc.x, seatY, npc.z);
  body.rotation.y = npc.yaw;
  body.userData.interactId = npc.id;
  if (walker) body.userData.noBatch = true;
  parent.add(body);
  f.box(body, 0.42, 0.2, 0.48, 0, 0, 0.06, colors.shirt, false);
  f.box(body, 0.36, 0.34, 0.26, 0, 0.26, -0.08, colors.shirt);
  const head = new Mesh(f.geo(new SphereGeometry(0.17, 12, 10)), f.mat(PALETTE.skin));
  head.position.set(0, 0.54, -0.06);
  head.rotation.x = lookPitch;
  head.userData.noBatch = true;
  head.castShadow = false;
  body.add(head);
  body.userData.sofaHead = head;
  const nose = f.box(head, 0.06, 0.05, 0.07, 0, -0.02, 0.15, PALETTE.skin, false);
  nose.castShadow = false;
  const hair = new Mesh(f.geo(new SphereGeometry(0.15, 10, 8)), f.mat(colors.hair));
  hair.scale.set(1.05, 0.58, 0.92);
  hair.position.set(0, 0.1, -0.04);
  head.add(hair);
  const legL = f.box(body, 0.12, 0.12, 0.42, -0.11, -0.02, 0.32, colors.pants, false);
  legL.rotation.x = -0.62;
  const legR = f.box(body, 0.12, 0.12, 0.4, 0.11, -0.02, 0.3, colors.pants, false);
  legR.rotation.x = -0.5;
  if (walker) {
    legL.userData.walkerLeg = true;
    legR.userData.walkerLeg = true;
  }
  attachFaceIdle(body, head, f, colors.shirt, idlePhase(npc.id));
  return body;
}

type FaceIdle = { tick: (time: number) => void };

/** Ojos y pecho, fuera del batch. No modifica el tick de cada persona. */
function attachFaceIdle(body: Group, head: Mesh, f: AmbientFactories, shirt: number, phase: number) {
  const eyeGeo = f.geo(new BoxGeometry(0.04, 0.028, 0.018));
  const eyeMat = f.mat(0x1a1a22);
  const eyeL = new Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.055, 0.02, 0.15);
  const eyeR = new Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.055, 0.02, 0.15);
  head.add(eyeL, eyeR);
  const eyes = fuseMeshes([eyeL, eyeR]);
  f.geo(eyes.geometry);
  eyes.userData.noBatch = true;
  eyes.castShadow = false;

  const chest = f.box(body, 0.24, 0.12, 0.05, 0, 0.34, 0.08, shirt, false);
  chest.userData.noBatch = true;
  chest.castShadow = false;

  const idle: FaceIdle = {
    tick(time) {
      eyes.scale.y = blinkOpen(time, phase);
      chest.scale.y = breathScale(time, phase);
    },
  };
  body.userData.faceIdle = idle;
}

function collectFaceIdles(root: Group): Array<(time: number) => void> {
  const ticks: Array<(time: number) => void> = [];
  root.traverse((object) => {
    const idle = object.userData.faceIdle as FaceIdle | undefined;
    if (idle) ticks.push((time) => idle.tick(time));
  });
  return ticks;
}

function addNameplate(body: Group, npc: LoungeNpc): { id: string; element: HTMLElement; anchor: CSS2DObject } {
  const { anchor, plate } = createNameplateElement(npc.name);
  const label = new CSS2DObject(anchor);
  label.center.set(0, 0);
  label.position.set(0, 0.96, 0);
  body.add(label);
  return { id: npc.id, element: plate, anchor: label };
}

