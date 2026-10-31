import Phaser from "phaser";
import {
  COLORS,
  MAX_TIER,
  RADII,
  dropCooldown,
  dropKind,
  goldMergeMultiplier,
  mergeOutcome,
  mergePoints,
  type DropKind,
} from "./rules";

type Hud = {
  setScore: (score: number) => void;
  setBest: (best: number) => void;
  setCombo: (combo: number, left?: number) => void;
  setFever: (on: boolean) => void;
  setNext: (label: string) => void;
  showOver: (restart: () => void) => void;
  hideOver: () => void;
};

type Ball = {
  image: Phaser.Physics.Matter.Image;
  tier: number;
  wild: boolean;
  born: number;
  danger: number;
  radius: number;
  pending: boolean;
  bomb: boolean;
  gold: boolean;
  ice: boolean;
};

type Spark = {
  dot: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  life: number;
  max: number;
};

type TextureKind = "normal" | "wild" | "bomb" | "gold" | "ice";

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = Math.round(((value >> 16) & 255) * amount);
  const green = Math.round(((value >> 8) & 255) * amount);
  const blue = Math.round((value & 255) * amount);
  return `rgb(${red},${green},${blue})`;
}

function buzz(pattern: number | number[]): void {
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return;
  try {
    vibrate(pattern);
  } catch {
    // Safari en iOS no implementa vibrate.
  }
}

const WALL = 16;
const LINE = 150;
const DROP_Y = 92;
const MAX_BALLS = 36;
const MAX_SPARKS = 40;
const COMBO_MS = 1500;
const FEVER_MS = 4800;
const QUIET_MS = 4200;

let bestScore = 0;

class Synth {
  private ctx: AudioContext | null = null;

  unlock(): void {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) this.ctx = new Ctx();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  blip(freq: number, duration = 0.12, gain = 0.07, type: OscillatorType = "sine"): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 1.4), now + duration);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(amp);
    amp.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}

class PlayScene extends Phaser.Scene {
  private hud!: Hud;
  private synth = new Synth();
  private balls: Ball[] = [];
  private sparks: Spark[] = [];
  private freeSparks: Spark[] = [];
  private queue: Array<[Ball, Ball]> = [];
  private bombQueue: Ball[] = [];
  private iceQueue: Ball[] = [];
  private preview!: Phaser.GameObjects.Image;
  private guide!: Phaser.GameObjects.Graphics;
  private bin!: Phaser.GameObjects.Graphics;
  private feverVeil!: Phaser.GameObjects.Rectangle;
  private flash!: Phaser.GameObjects.Rectangle;
  private aimX = 270;
  private nextTier = 0;
  private nextWild = false;
  private nextBomb = false;
  private nextGold = false;
  private nextIce = false;
  private dropIndex = 0;
  private score = 0;
  private combo = 1;
  private lastMerge = 0;
  private lastSpark = 0;
  private over = false;
  private lockUntil = 0;
  private slowUntil = 0;
  private feverUntil = 0;
  private feverOn = false;
  private reduced = false;
  private floaters = 0;
  private queuedDrop = false;
  private aiming = false;
  private pointerId: number | null = null;
  private pointerTarget: HTMLElement | null = null;
  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.over) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    event.preventDefault();
    this.synth.unlock();
    this.pointerTarget?.focus();
    this.pointerId = event.pointerId;
    this.aiming = true;
    try {
      this.pointerTarget?.setPointerCapture(event.pointerId);
    } catch {
      // El puntero puede cancelarse antes de capturarlo.
    }
    this.aimX = this.clientToAim(event.clientX);
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.aiming || event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.aimX = this.clientToAim(event.clientX);
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    if (!this.aiming || event.pointerId !== this.pointerId) return;
    this.aiming = false;
    this.pointerId = null;
    this.aimX = this.clientToAim(event.clientX);
    this.release(this.aimX);
  };
  private readonly onPointerCancel = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    this.aiming = false;
    this.pointerId = null;
  };
  private readonly blockGesture = (event: Event) => {
    event.preventDefault();
  };
  private readonly onCollide = (event: { pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }> }) => {
    for (const pair of event.pairs) this.consider(pair.bodyA, pair.bodyB);
  };
  private readonly nudgeLeft = () => {
    this.aimX = this.clampX(this.aimX - 28);
  };
  private readonly nudgeRight = () => {
    this.aimX = this.clampX(this.aimX + 28);
  };
  private readonly dropKey = () => {
    this.release(this.aimX);
  };

  constructor() {
    super("play");
  }

  create(): void {
    this.hud = this.registry.get("hud") as Hud;
    this.score = 0;
    this.combo = 1;
    this.over = false;
    this.balls = [];
    this.sparks = [];
    this.freeSparks = [];
    this.queue = [];
    this.bombQueue = [];
    this.iceQueue = [];
    this.dropIndex = 0;
    this.nextTier = 0;
    this.nextWild = false;
    this.nextBomb = false;
    this.nextGold = false;
    this.nextIce = false;
    this.floaters = 0;
    this.queuedDrop = false;
    this.aiming = false;
    this.pointerId = null;
    this.feverOn = false;
    this.feverUntil = 0;
    this.lockUntil = 0;
    this.slowUntil = 0;
    this.lastMerge = 0;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.hud.hideOver();
    this.hud.setScore(0);
    this.hud.setBest(bestScore);
    this.hud.setCombo(1);
    this.hud.setFever(false);
    this.time.timeScale = 1;

    const { width, height } = this.scale;
    this.aimX = width / 2;
    this.lastSpark = this.game.loop.time;
    this.paintTextures();
    this.drawBin(width, height);
    this.buildWalls(width, height);
    this.feverVeil = this.add.rectangle(width / 2, height / 2, width, height, 0xff4d8d, 0).setDepth(1);
    this.flash = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0).setDepth(11);

    this.preview = this.add.image(this.aimX, DROP_Y, "ball-0").setDepth(4);
    this.guide = this.add.graphics().setDepth(3);
    this.prepareNext(true);
    this.spawnBall(width / 2 - 150, height - 90, 0, false, false, false, false, false);
    this.spawnBall(width / 2 + 150, height - 96, 0, false, false, false, false, false);

    this.matter.world.off("collisionstart", this.onCollide);
    this.matter.world.on("collisionstart", this.onCollide);
    this.bindPointer();
    this.bindKeys();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.matter.world.off("collisionstart", this.onCollide);
      this.unbindPointer();
      this.unbindKeys();
    });

    const hello = this.add
      .text(width / 2, 210, "¡Arrastra!", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "42px",
        fontStyle: "700",
        color: "#fff6d8",
      })
      .setOrigin(0.5)
      .setDepth(6);
    this.tweens.add({ targets: hello, alpha: 0, y: 170, delay: 700, duration: 420, onComplete: () => hello.destroy() });

    window.__chispa = {
      drop: (x?: number) => this.release(x ?? this.aimX),
      spawnPair: (tier: number) => this.spawnPair(tier),
      ballCount: () => this.balls.length,
      score: () => this.score,
    };
  }

  update(_time: number, delta: number): void {
    const now = this.game.loop.time;
    if (this.slowUntil && now >= this.slowUntil) {
      this.time.timeScale = 1;
      this.slowUntil = 0;
    }
    if (this.queuedDrop && now >= this.lockUntil) this.release(this.aimX);
    if (!this.over && this.combo > 1 && now - this.lastMerge > COMBO_MS) {
      this.combo = 1;
      this.hud.setCombo(1, 0);
    } else if (!this.over && this.combo > 1) {
      this.hud.setCombo(this.combo, 1 - (now - this.lastMerge) / COMBO_MS);
    }
    const fever = now < this.feverUntil;
    if (this.feverOn && !fever) {
      this.feverOn = false;
      this.hud.setFever(false);
    }
    if (!this.reduced) this.feverVeil.setAlpha(fever ? 0.1 + Math.sin(now / 90) * 0.04 : 0);
    else this.feverVeil.setAlpha(fever ? 0.08 : 0);
    this.flushBombs();
    this.flushIce();
    this.flushMerges();
    this.drawGuide();
    this.preview.setPosition(this.aimX, DROP_Y);
    const spin = this.nextWild || this.nextGold;
    if (spin && !this.reduced) this.preview.setAngle((now / 16) % 360);
    else this.preview.setAngle(0);
    if (fever && !this.reduced) {
      const pulse = 1 + Math.sin(now / 70) * 0.06;
      const radius = this.nextRadius();
      this.preview.setDisplaySize(radius * 2 * pulse, radius * 2 * pulse);
    }
    this.stepSparks(delta);
    if (!this.over) this.watchOverflow(now, delta);
  }

  private paintTextures(): void {
    for (let tier = 0; tier <= MAX_TIER; tier += 1) this.addTexture(`ball-${tier}`, tier, "normal");
    this.addTexture("ball-wild", 2, "wild");
    this.addTexture("ball-bomb", 2, "bomb");
    this.addTexture("ball-gold", 2, "gold");
    this.addTexture("ball-ice", 2, "ice");
  }

  private addTexture(key: string, tier: number, kind: TextureKind): void {
    if (this.textures.exists(key)) return;
    const radius = RADII[tier] ?? RADII[2];
    const scale = 2;
    const size = Math.ceil((radius + 6) * 2 * scale);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const center = size / 2;
    const rad = radius * scale;
    const gradient = ctx.createRadialGradient(center - rad * 0.32, center - rad * 0.38, rad * 0.08, center, center, rad);
    if (kind === "wild") {
      gradient.addColorStop(0, "#fffde8");
      gradient.addColorStop(0.35, "#ff6ad5");
      gradient.addColorStop(0.7, "#7a7bff");
      gradient.addColorStop(1, "#3ec6ff");
    } else if (kind === "bomb") {
      gradient.addColorStop(0, "#ffe1a8");
      gradient.addColorStop(0.35, "#ff7a18");
      gradient.addColorStop(0.72, "#3a2418");
      gradient.addColorStop(1, "#1a120c");
    } else if (kind === "gold") {
      gradient.addColorStop(0, "#fffef0");
      gradient.addColorStop(0.28, "#ffe566");
      gradient.addColorStop(0.62, "#ffb703");
      gradient.addColorStop(1, "#c97800");
    } else if (kind === "ice") {
      gradient.addColorStop(0, "#f0ffff");
      gradient.addColorStop(0.35, "#9ef0ff");
      gradient.addColorStop(0.72, "#4db8ff");
      gradient.addColorStop(1, "#1a4a7a");
    } else {
      const color = COLORS[tier] ?? "#ffffff";
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.22, color);
      gradient.addColorStop(1, shade(color, 0.62));
    }
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, center, rad, 0, Math.PI * 2);
    ctx.fill();
    if (kind === "bomb") {
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = Math.max(3, rad * 0.12);
      ctx.beginPath();
      ctx.arc(center, center, rad * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#fff6d8";
      ctx.font = `700 ${Math.round(rad * 0.7)}px Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", center, center + rad * 0.04);
    } else if (kind === "gold") {
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.beginPath();
      ctx.moveTo(center, center - rad * 0.55);
      for (let i = 1; i < 5; i += 1) {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const inner = i % 2 === 0 ? rad * 0.22 : rad * 0.5;
        ctx.lineTo(center + Math.cos(angle) * inner, center + Math.sin(angle) * inner);
      }
      ctx.closePath();
      ctx.fill();
    } else if (kind === "ice") {
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = Math.max(2, rad * 0.08);
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * i) / 3;
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.lineTo(center + Math.cos(angle) * rad * 0.55, center + Math.sin(angle) * rad * 0.55);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.ellipse(center - rad * 0.28, center - rad * 0.34, rad * 0.22, rad * 0.12, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#24160f";
      const eye = Math.max(2, rad * 0.09);
      ctx.beginPath();
      ctx.arc(center - rad * 0.26, center - rad * 0.05, eye, 0, Math.PI * 2);
      ctx.arc(center + rad * 0.26, center - rad * 0.05, eye, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#24160f";
      ctx.lineWidth = Math.max(2, rad * 0.07);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(center, center + rad * 0.08, rad * 0.28, 0.18 * Math.PI, 0.82 * Math.PI);
      ctx.stroke();
    }
    this.textures.addCanvas(key, canvas);
  }

  private drawBin(width: number, height: number): void {
    this.bin = this.add.graphics().setDepth(0);
    this.bin.fillStyle(0x1c2438, 1);
    this.bin.fillRoundedRect(WALL - 8, LINE - 20, width - (WALL - 8) * 2, height - LINE + 8, 28);
    this.bin.lineStyle(6, 0xffb703, 0.9);
    const dash = 14;
    for (let x = WALL + 8; x < width - WALL - 8; x += dash * 2) {
      this.bin.lineBetween(x, LINE, Math.min(x + dash, width - WALL - 8), LINE);
    }
  }

  private buildWalls(width: number, height: number): void {
    const floor = this.matter.add.rectangle(width / 2, height - 16, width, 36, { isStatic: true, friction: 0.4, restitution: 0.2 });
    const left = this.matter.add.rectangle(16, height / 2, 36, height, { isStatic: true, friction: 0.04, restitution: 0.35 });
    const right = this.matter.add.rectangle(width - 16, height / 2, 36, height, { isStatic: true, friction: 0.04, restitution: 0.35 });
    floor.label = "wall";
    left.label = "wall";
    right.label = "wall";
  }

  private nextRadius(): number {
    if (this.nextBomb || this.nextWild || this.nextGold || this.nextIce) return RADII[2];
    return RADII[this.nextTier] ?? RADII[0];
  }

  private nextLabel(): string {
    if (this.nextBomb) return "Siguiente: bomba";
    if (this.nextGold) return "Siguiente: oro x3";
    if (this.nextIce) return "Siguiente: hielo";
    if (this.nextWild) return "Siguiente: arcoíris";
    return this.nextTier === 0 ? "Siguiente: pequeña" : "Siguiente: mediana";
  }

  private prepareNext(first = false): void {
    if (!first) this.dropIndex += 1;
    let kind: DropKind = dropKind(this.dropIndex);
    const quiet = !first && this.game.loop.time - this.lastSpark > QUIET_MS;
    if (quiet && kind === "normal") {
      const pick = this.dropIndex % 4;
      kind = pick === 0 ? "wild" : pick === 1 ? "bomb" : pick === 2 ? "gold" : "ice";
    }
    this.nextWild = kind === "wild";
    this.nextBomb = kind === "bomb";
    this.nextGold = kind === "gold";
    this.nextIce = kind === "ice";
    this.nextTier = this.nextWild || this.nextBomb || this.nextGold || this.nextIce ? 2 : this.dropIndex % 5 === 4 ? 1 : 0;
    const key = this.nextBomb
      ? "ball-bomb"
      : this.nextGold
        ? "ball-gold"
        : this.nextIce
          ? "ball-ice"
          : this.nextWild
            ? "ball-wild"
            : `ball-${this.nextTier}`;
    this.preview.setTexture(key);
    const radius = this.nextRadius();
    this.preview.setDisplaySize(radius * 2, radius * 2);
    this.aimX = this.clampX(this.aimX);
    this.hud.setNext(this.nextLabel());
    if (kind !== "normal") this.lastSpark = this.game.loop.time;
  }

  private release(x: number): void {
    if (this.over) return;
    const now = this.game.loop.time;
    this.aimX = this.clampX(x, this.nextRadius());
    if (now < this.lockUntil) {
      this.queuedDrop = true;
      return;
    }
    if (this.balls.length >= MAX_BALLS) return;
    this.queuedDrop = false;
    const tier = this.nextTier;
    const wild = this.nextWild;
    const bomb = this.nextBomb;
    const gold = this.nextGold;
    const ice = this.nextIce;
    const radius = this.nextRadius();
    const cx = this.clampX(x, radius);
    this.spawnBall(cx, DROP_Y, tier, true, wild, bomb, gold, ice);
    this.synth.blip(bomb ? 140 : ice ? 680 : gold ? 420 : wild ? 520 : 240 + tier * 36, 0.08, 0.06, bomb ? "square" : "triangle");
    buzz(bomb ? 18 : 8);
    const fever = now < this.feverUntil;
    this.lockUntil = now + dropCooldown(fever);
    this.prepareNext();
  }

  private spawnPair(tier: number): void {
    const safe = Phaser.Math.Clamp(tier, 0, MAX_TIER);
    const radius = RADII[safe] ?? RADII[0];
    const y = 430;
    this.spawnBall(this.scale.width / 2 - radius + 1, y, safe, false, false, false, false, false);
    this.spawnBall(this.scale.width / 2 + radius - 6, y, safe, false, false, false, false, false);
  }

  private spawnBall(
    x: number,
    y: number,
    tier: number,
    falling: boolean,
    wild: boolean,
    bomb: boolean,
    gold: boolean,
    ice: boolean,
  ): Ball | null {
    if (this.balls.length >= MAX_BALLS) return null;
    const radius = bomb || wild || gold || ice ? RADII[2] : (RADII[tier] ?? RADII[0]);
    const key = bomb ? "ball-bomb" : gold ? "ball-gold" : ice ? "ball-ice" : wild ? "ball-wild" : `ball-${tier}`;
    const image = this.matter.add.image(x, y, key);
    image.setDisplaySize(radius * 2, radius * 2);
    image.setCircle(radius);
    image.setFriction(0.03);
    image.setFrictionAir(0.008);
    image.setBounce(bomb ? 0.55 : 0.42);
    image.setDensity(0.0011 + tier * 0.0003);
    image.setDepth(2);
    if (falling) {
      image.setVelocity((Math.random() - 0.5) * 1.4, 6.2);
      image.setAngularVelocity((Math.random() - 0.5) * 0.12);
      if (!this.reduced) {
        image.setScale(0.82);
        this.tweens.add({ targets: image, scaleX: 1, scaleY: 1, duration: 180, ease: "Back.easeOut" });
      }
    }
    const ball: Ball = { image, tier, wild, born: this.game.loop.time, danger: 0, radius, pending: false, bomb, gold, ice };
    this.balls.push(ball);
    return ball;
  }

  private consider(bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    const a = this.ballFrom(bodyA);
    const b = this.ballFrom(bodyB);
    const now = this.game.loop.time;
    for (const ball of [a, b]) {
      if (!ball?.bomb || ball.pending) continue;
      if (now - ball.born < 120) continue;
      ball.pending = true;
      this.bombQueue.push(ball);
    }
    for (const ball of [a, b]) {
      if (!ball?.ice || ball.pending) continue;
      if (now - ball.born < 120) continue;
      ball.pending = true;
      this.iceQueue.push(ball);
    }
    if (!a || !b || a.bomb || b.bomb || a.ice || b.ice || a.pending || b.pending || a === b) return;
    const same = a.tier === b.tier && !a.wild && !b.wild;
    const wild = a.wild || b.wild;
    if (!same && !wild) return;
    a.pending = true;
    b.pending = true;
    this.queue.push([a, b]);
  }

  private flushBombs(): void {
    if (this.over || this.bombQueue.length === 0) return;
    const pending = this.bombQueue.splice(0);
    for (const bomb of pending) {
      if (!this.balls.includes(bomb)) continue;
      this.detonate(bomb);
    }
  }

  private flushIce(): void {
    if (this.over || this.iceQueue.length === 0) return;
    const pending = this.iceQueue.splice(0);
    for (const ice of pending) {
      if (!this.balls.includes(ice)) continue;
      this.shatterIce(ice);
    }
  }

  private flushMerges(): void {
    if (this.over || this.queue.length === 0) return;
    const pending = this.queue.splice(0);
    for (const [a, b] of pending) {
      if (!this.balls.includes(a) || !this.balls.includes(b)) continue;
      this.merge(a, b);
    }
  }

  private detonate(ball: Ball): void {
    const now = this.game.loop.time;
    const x = ball.image.x;
    const y = ball.image.y;
    this.removeBall(ball);
    this.lastSpark = now;
    const fever = now < this.feverUntil;
    const gained = 200 * (fever ? 2 : 1);
    this.score += gained;
    if (this.score > bestScore) {
      bestScore = this.score;
      this.hud.setBest(bestScore);
    }
    this.hud.setScore(this.score);
    this.shove(x, y, 9 + (fever ? 2 : 0));
    this.burst(x, y, 0xffb703, 18);
    this.floatText(x, y - 12, "¡BOMBA!", 44);
    this.floatText(x, y - 56, `+${gained}`, 30);
    this.synth.blip(90, 0.22, 0.1, "square");
    this.synth.blip(180, 0.16, 0.06, "sawtooth");
    buzz(40);
    if (!this.reduced) this.cameras.main.shake(200, 0.016);
  }

  private shatterIce(ball: Ball): void {
    const now = this.game.loop.time;
    const x = ball.image.x;
    const y = ball.image.y;
    this.removeBall(ball);
    this.lastSpark = now;
    const fever = now < this.feverUntil;
    const gained = 120 * (fever ? 2 : 1);
    this.score += gained;
    if (this.score > bestScore) {
      bestScore = this.score;
      this.hud.setBest(bestScore);
    }
    this.hud.setScore(this.score);
    const reach = 130;
    for (const other of this.balls) {
      const dx = other.image.x - x;
      const dy = other.image.y - y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > reach) continue;
      const falloff = 1 - dist / reach;
      const vx = other.image.body?.velocity.x ?? 0;
      const vy = other.image.body?.velocity.y ?? 0;
      other.image.setVelocity(vx * (1 - 0.55 * falloff), vy * (1 - 0.55 * falloff));
    }
    if (!this.reduced) {
      this.time.timeScale = 0.55;
      this.slowUntil = now + 520;
    }
    this.burst(x, y, 0x9ef0ff, 14);
    this.mergeRing(x, y, 0x9ef0ff);
    this.floatText(x, y - 12, "¡HIELO!", 40);
    this.floatText(x, y - 52, `+${gained}`, 28);
    this.synth.blip(520, 0.14, 0.06, "sine");
    buzz(14);
  }

  private merge(a: Ball, b: Ball): void {
    const now = this.game.loop.time;
    this.combo = now - this.lastMerge < COMBO_MS ? this.combo + 1 : 1;
    this.lastMerge = now;
    this.lastSpark = now;
    const x = (a.image.x + b.image.x) / 2;
    const y = (a.image.y + b.image.y) / 2;
    const baseTier = a.wild ? b.tier : b.wild ? a.tier : a.tier;
    const outcome = mergeOutcome(baseTier);
    this.removeBall(a);
    this.removeBall(b);
    const fever = this.combo >= 3 || now < this.feverUntil;
    if (this.combo >= 3) {
      this.feverUntil = now + FEVER_MS;
      if (!this.feverOn) {
        this.feverOn = true;
        this.hud.setFever(true);
        buzz([12, 24, 16]);
      }
    }
    const gainedBase = mergePoints(outcome.tier, this.combo, outcome.mega) * (fever ? 2 : 1);
    const golden = a.gold || b.gold;
    const gained = golden ? Math.round(gainedBase * goldMergeMultiplier()) : gainedBase;
    this.score += gained;
    if (this.score > bestScore) {
      bestScore = this.score;
      this.hud.setBest(bestScore);
    }
    this.hud.setScore(this.score);
    this.hud.setCombo(this.combo, 1);
    if (!outcome.mega) {
      const born = this.spawnBall(x, y, outcome.tier, false, false, false, false, false);
      const pop = -2.6 - Math.min(this.combo, 5) * 0.45;
      born?.image.setVelocity((Math.random() - 0.5) * 2.4, pop);
    }
    this.shove(x, y, (outcome.mega ? 7.5 : 3.4) + Math.min(this.combo, 8) * 0.65);
    this.juice(x, y, outcome.tier, outcome.mega, gained, golden);
  }

  private shove(x: number, y: number, power: number): void {
    const reach = 150 + power * 10;
    for (const ball of this.balls) {
      const dx = ball.image.x - x;
      const dy = ball.image.y - y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > reach) continue;
      const falloff = 1 - dist / reach;
      const kick = power * falloff;
      const vx = ball.image.body?.velocity.x ?? 0;
      const vy = ball.image.body?.velocity.y ?? 0;
      ball.image.setVelocity(vx + (dx / dist) * kick, vy + (dy / dist) * kick * 0.72);
    }
  }

  private juice(x: number, y: number, tier: number, mega: boolean, gained: number, golden = false): void {
    const punch = Math.min(this.combo, 8);
    const burst = Math.min(22, (mega ? 14 : 7) + punch * 2);
    const tint = mega ? 0xfff1a8 : golden ? 0xffe566 : Number.parseInt((COLORS[tier] ?? "#ffffff").slice(1), 16);
    this.burst(x, y, tint, burst);
    this.mergeRing(x, y, tint);
    if (!this.reduced && (mega || punch >= 3)) this.screenFlash(mega ? 0.22 : 0.08);
    this.floatText(x, y - 10, mega ? "¡MEGA!" : golden ? `+${gained} oro` : `+${gained}`, mega ? 48 : 26 + punch * 2);
    if (this.combo > 1) this.floatText(x, y - 52, `x${this.combo}`, 32 + punch);
    const pitch = 340 * Math.pow(1.16, tier) * (1 + (this.combo - 1) * 0.07);
    this.synth.blip(pitch, mega ? 0.22 : 0.1, mega ? 0.1 : 0.07, mega ? "triangle" : "sine");
    if (mega || punch >= 4) this.synth.blip(pitch * 1.5, 0.16, 0.05, "square");
    buzz(mega ? [16, 20, 24] : Math.min(36, 8 + punch * 4));
    if (!this.reduced) {
      this.cameras.main.shake(mega ? 180 : 60 + punch * 10, mega ? 0.012 : 0.0025 + punch * 0.0009);
      this.time.timeScale = mega ? 0.62 : Math.max(0.82, 0.96 - punch * 0.015);
      this.slowUntil = this.game.loop.time + (mega ? 70 : 28);
    }
  }

  private mergeRing(x: number, y: number, color: number): void {
    if (this.reduced) return;
    const ring = this.add.circle(x, y, 10, color, 0).setStrokeStyle(4, color, 0.9).setDepth(9);
    this.tweens.add({
      targets: ring,
      scaleX: 6,
      scaleY: 6,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  private screenFlash(strength: number): void {
    this.flash.setAlpha(strength);
    this.tweens.add({
      targets: this.flash,
      alpha: 0,
      duration: 220,
      ease: "Cubic.easeOut",
    });
  }

  private burst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const spark = this.takeSpark(color);
      if (!spark) return;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.25;
      const speed = 140 + Math.random() * 220;
      spark.dot.setPosition(x, y).setVisible(true).setAlpha(1).setDepth(8);
      spark.vx = Math.cos(angle) * speed;
      spark.vy = Math.sin(angle) * speed;
      spark.life = spark.max;
    }
  }

  private takeSpark(color: number): Spark | null {
    const existing = this.freeSparks.pop();
    if (existing) {
      existing.dot.setFillStyle(color, 1);
      existing.max = 320;
      existing.life = existing.max;
      return existing;
    }
    if (this.sparks.length >= MAX_SPARKS) return null;
    const dot = this.add.circle(0, 0, 4 + Math.random() * 3, color).setDepth(8).setVisible(false);
    const spark = { dot, vx: 0, vy: 0, life: 0, max: 320 };
    this.sparks.push(spark);
    return spark;
  }

  private stepSparks(delta: number): void {
    const step = delta / 1000;
    for (const spark of this.sparks) {
      if (spark.life <= 0) continue;
      spark.life -= delta;
      spark.vy += 520 * step;
      spark.dot.x += spark.vx * step;
      spark.dot.y += spark.vy * step;
      spark.dot.setAlpha(Math.max(0, spark.life / spark.max));
      if (spark.life <= 0) {
        spark.dot.setVisible(false);
        this.freeSparks.push(spark);
      }
    }
  }

  private floatText(x: number, y: number, message: string, size: number): void {
    if (this.floaters > 10) return;
    this.floaters += 1;
    const text = this.add
      .text(x, y, message, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: `${size}px`,
        fontStyle: "700",
        color: "#fff8e8",
        stroke: "#1a1208",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(12);
    this.tweens.add({
      targets: text,
      y: y - 78,
      alpha: 0,
      duration: 560,
      onComplete: () => {
        text.destroy();
        this.floaters -= 1;
      },
    });
  }

  private watchOverflow(now: number, delta: number): void {
    for (const ball of this.balls) {
      if (now - ball.born < 900) {
        ball.danger = 0;
        continue;
      }
      const speed = Math.hypot(ball.image.body?.velocity.x ?? 0, ball.image.body?.velocity.y ?? 0);
      if (ball.image.y < LINE && speed < 1.4) ball.danger += delta;
      else ball.danger = 0;
      if (ball.danger > 900) {
        this.finish();
        return;
      }
    }
  }

  private finish(): void {
    if (this.over) return;
    this.over = true;
    this.queuedDrop = false;
    this.time.timeScale = 1;
    this.preview.setVisible(false);
    this.matter.world.pause();
    this.synth.blip(140, 0.28, 0.08, "sawtooth");
    this.hud.showOver(() => {
      this.scene.restart();
    });
  }

  private drawGuide(): void {
    this.guide.clear();
    if (this.over) return;
    const radius = this.nextRadius();
    const fever = this.game.loop.time < this.feverUntil;
    const color = fever ? 0xff6ad5 : 0xfff6d8;
    this.guide.lineStyle(4, color, 0.95);
    this.guide.strokeCircle(this.aimX, DROP_Y, radius + 6);
    this.guide.lineStyle(3, color, 0.55);
    const top = DROP_Y + radius + 12;
    const bottom = this.scale.height - 36;
    for (let y = top; y < bottom; y += 22) {
      this.guide.lineBetween(this.aimX, y, this.aimX, Math.min(y + 12, bottom));
    }
  }

  private removeBall(ball: Ball): void {
    const index = this.balls.indexOf(ball);
    if (index >= 0) this.balls.splice(index, 1);
    ball.image.destroy();
  }

  private ballFrom(body: MatterJS.BodyType): Ball | undefined {
    const obj = (body as MatterJS.BodyType & { gameObject?: Phaser.GameObjects.GameObject }).gameObject;
    if (!obj) return undefined;
    return this.balls.find((ball) => ball.image === obj);
  }

  private clampX(x: number, radius = this.nextRadius()): number {
    return Phaser.Math.Clamp(x, WALL + radius + 8, this.scale.width - WALL - radius - 8);
  }

  private clientToAim(clientX: number): number {
    const rect = this.game.canvas.getBoundingClientRect();
    if (rect.width <= 0) return this.aimX;
    const local = ((clientX - rect.left) / rect.width) * this.scale.width;
    return this.clampX(local);
  }

  private bindPointer(): void {
    const stage = document.querySelector<HTMLElement>("#stage");
    if (!stage) return;
    this.unbindPointer();
    this.pointerTarget = stage;
    this.game.canvas.style.touchAction = "none";
    stage.addEventListener("pointerdown", this.onPointerDown);
    stage.addEventListener("pointermove", this.onPointerMove);
    stage.addEventListener("pointerup", this.onPointerUp);
    stage.addEventListener("pointercancel", this.onPointerCancel);
    stage.addEventListener("touchmove", this.blockGesture, { passive: false });
    stage.addEventListener("contextmenu", this.blockGesture);
    document.addEventListener("gesturestart", this.blockGesture);
  }

  private unbindPointer(): void {
    const stage = this.pointerTarget;
    if (!stage) return;
    stage.removeEventListener("pointerdown", this.onPointerDown);
    stage.removeEventListener("pointermove", this.onPointerMove);
    stage.removeEventListener("pointerup", this.onPointerUp);
    stage.removeEventListener("pointercancel", this.onPointerCancel);
    stage.removeEventListener("touchmove", this.blockGesture);
    stage.removeEventListener("contextmenu", this.blockGesture);
    document.removeEventListener("gesturestart", this.blockGesture);
    this.pointerTarget = null;
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.unbindKeys();
    keyboard.addCapture(["LEFT", "RIGHT", "DOWN", "SPACE", "A", "D"]);
    keyboard.on("keydown-LEFT", this.nudgeLeft);
    keyboard.on("keydown-A", this.nudgeLeft);
    keyboard.on("keydown-RIGHT", this.nudgeRight);
    keyboard.on("keydown-D", this.nudgeRight);
    keyboard.on("keydown-SPACE", this.dropKey);
    keyboard.on("keydown-DOWN", this.dropKey);
  }

  private unbindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    keyboard.off("keydown-LEFT", this.nudgeLeft);
    keyboard.off("keydown-A", this.nudgeLeft);
    keyboard.off("keydown-RIGHT", this.nudgeRight);
    keyboard.off("keydown-D", this.nudgeRight);
    keyboard.off("keydown-SPACE", this.dropKey);
    keyboard.off("keydown-DOWN", this.dropKey);
  }
}

const title = document.querySelector<HTMLElement>("#game-title");
const score = document.querySelector<HTMLElement>("#score");
const best = document.querySelector<HTMLElement>("#best");
const combo = document.querySelector<HTMLElement>("#combo");
const meter = document.querySelector<HTMLElement>("#combo-meter");
const meterFill = meter?.querySelector("span");
const fever = document.querySelector<HTMLElement>("#fever");
const next = document.querySelector<HTMLElement>("#next");
const again = document.querySelector<HTMLElement>("#again");
const retry = document.querySelector<HTMLButtonElement>("#retry");
const stage = document.querySelector<HTMLElement>("#stage");
if (!title || !score || !best || !combo || !meter || !meterFill || !fever || !next || !again || !retry || !stage) {
  throw new Error("Falta el marcador del juego.");
}

const hud: Hud = {
  setScore(value) {
    score.textContent = `Puntos: ${value}`;
  },
  setBest(value) {
    best.textContent = `Mejor: ${value}`;
  },
  setCombo(value, left = 0) {
    const on = value >= 2;
    combo.classList.toggle("is-live", on);
    combo.setAttribute("aria-hidden", on ? "false" : "true");
    meter.classList.toggle("is-live", on);
    meter.setAttribute("aria-hidden", on ? "false" : "true");
    combo.textContent = on ? `Combo x${value}` : "";
    meterFill.style.transform = `scaleX(${Math.max(0, Math.min(1, left))})`;
  },
  setFever(on) {
    fever.classList.toggle("is-live", on);
    fever.setAttribute("aria-hidden", on ? "false" : "true");
    document.body.classList.toggle("fever", on);
  },
  setNext(label) {
    next.textContent = label;
  },
  showOver(restart) {
    again.hidden = false;
    retry.onclick = () => restart();
  },
  hideOver() {
    again.hidden = true;
  },
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: stage,
  backgroundColor: "#14182b",
  banner: false,
  audio: { noAudio: true },
  fps: { target: 60, min: 30 },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 540,
    height: 960,
  },
  physics: {
    default: "matter",
    matter: {
      gravity: { x: 0, y: 2.7 },
      debug: false,
      enableSleeping: false,
      positionIterations: 10,
      velocityIterations: 8,
    },
  },
  scene: [PlayScene],
  input: { activePointers: 2 },
  callbacks: {
    preBoot: (instance) => {
      instance.registry.set("hud", hud);
    },
  },
});

void game;

declare global {
  interface Window {
    __chispa?: {
      drop: (x?: number) => void;
      spawnPair: (tier: number) => void;
      ballCount: () => number;
      score: () => number;
    };
  }
}
