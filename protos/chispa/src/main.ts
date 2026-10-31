import Phaser from "phaser";
import { COLORS, MAX_TIER, RADII, isRareWild, mergeOutcome, mergePoints } from "./rules";

type Hud = {
  setScore: (score: number) => void;
  setBest: (best: number) => void;
  setCombo: (combo: number) => void;
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
};

type Spark = {
  dot: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  life: number;
  max: number;
};

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = Math.round(((value >> 16) & 255) * amount);
  const green = Math.round(((value >> 8) & 255) * amount);
  const blue = Math.round((value & 255) * amount);
  return `rgb(${red},${green},${blue})`;
}

const WALL = 28;
const LINE = 168;
const DROP_Y = 108;
const MAX_BALLS = 36;
const MAX_SPARKS = 40;

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
  private preview!: Phaser.GameObjects.Image;
  private guide!: Phaser.GameObjects.Graphics;
  private bin!: Phaser.GameObjects.Graphics;
  private aimX = 270;
  private nextTier = 0;
  private nextWild = false;
  private dropIndex = 0;
  private score = 0;
  private combo = 1;
  private lastMerge = 0;
  private over = false;
  private lockUntil = 0;
  private slowUntil = 0;
  private reduced = false;
  private floaters = 0;

  constructor() {
    super("play");
  }

  create(): void {
    this.hud = this.registry.get("hud") as Hud;
    this.score = 0;
    this.combo = 1;
    this.over = false;
    this.balls = [];
    this.queue = [];
    this.dropIndex = 0;
    this.nextTier = 0;
    this.nextWild = false;
    this.floaters = 0;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.hud.hideOver();
    this.hud.setScore(0);
    this.hud.setBest(bestScore);
    this.hud.setCombo(1);
    this.time.timeScale = 1;

    const { width, height } = this.scale;
    this.aimX = width / 2;
    this.paintTextures();
    this.drawBin(width, height);
    this.buildWalls(width, height);

    this.preview = this.add.image(this.aimX, DROP_Y, "ball-0").setDepth(4);
    this.guide = this.add.graphics().setDepth(1);
    this.prepareNext(true);
    this.spawnBall(width / 2 - 58, height - 90, 0, false, false);
    this.spawnBall(width / 2 + 58, height - 96, 0, false, false);

    this.matter.world.on("collisionstart", (event: { pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }> }) => {
      for (const pair of event.pairs) this.queuePair(pair.bodyA, pair.bodyB);
    });

    this.input.on("pointerdown", () => this.synth.unlock());
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.aimX = this.clampX(pointer.x);
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.synth.unlock();
      this.aimX = this.clampX(pointer.x);
      this.release(this.aimX);
    });

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on("keydown-LEFT", () => {
        this.aimX = this.clampX(this.aimX - 22);
      });
      keyboard.on("keydown-RIGHT", () => {
        this.aimX = this.clampX(this.aimX + 22);
      });
      keyboard.on("keydown-A", () => {
        this.aimX = this.clampX(this.aimX - 22);
      });
      keyboard.on("keydown-D", () => {
        this.aimX = this.clampX(this.aimX + 22);
      });
      keyboard.on("keydown-SPACE", () => this.release(this.aimX));
      keyboard.on("keydown-DOWN", () => this.release(this.aimX));
    }

    const hello = this.add.text(width / 2, 210, "¡Suelta!", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "42px",
      fontStyle: "700",
      color: "#fff6d8",
    }).setOrigin(0.5).setDepth(6);
    this.tweens.add({ targets: hello, alpha: 0, y: 180, delay: 700, duration: 500, onComplete: () => hello.destroy() });

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
    if (!this.over && this.combo > 1 && now - this.lastMerge > 1100) {
      this.combo = 1;
      this.hud.setCombo(1);
    }
    this.flushMerges();
    this.drawGuide();
    this.preview.setPosition(this.aimX, DROP_Y);
    this.stepSparks(delta);
    if (!this.over) this.watchOverflow(now, delta);
  }

  private paintTextures(): void {
    for (let tier = 0; tier <= MAX_TIER; tier += 1) this.addTexture(`ball-${tier}`, tier, false);
    this.addTexture("ball-wild", 2, true);
  }

  private addTexture(key: string, tier: number, wild: boolean): void {
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
    if (wild) {
      gradient.addColorStop(0, "#fffde8");
      gradient.addColorStop(0.35, "#ff6ad5");
      gradient.addColorStop(0.7, "#7a7bff");
      gradient.addColorStop(1, "#3ec6ff");
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
    const floor = this.matter.add.rectangle(width / 2, height - 16, width, 36, { isStatic: true, friction: 0.4 });
    const left = this.matter.add.rectangle(16, height / 2, 36, height, { isStatic: true, friction: 0.2 });
    const right = this.matter.add.rectangle(width - 16, height / 2, 36, height, { isStatic: true, friction: 0.2 });
    floor.label = "wall";
    left.label = "wall";
    right.label = "wall";
  }

  private prepareNext(first = false): void {
    this.dropIndex += first ? 0 : 1;
    this.nextWild = isRareWild(this.dropIndex);
    this.nextTier = this.nextWild ? 2 : this.dropIndex % 5 === 4 ? 1 : 0;
    const key = this.nextWild ? "ball-wild" : `ball-${this.nextTier}`;
    this.preview.setTexture(key);
    const radius = this.nextWild ? RADII[2] : RADII[this.nextTier];
    this.preview.setDisplaySize(radius * 2, radius * 2);
    this.aimX = this.clampX(this.aimX);
  }

  private release(x: number): void {
    if (this.over) return;
    const now = this.game.loop.time;
    if (now < this.lockUntil) return;
    if (this.balls.length >= MAX_BALLS) return;
    const tier = this.nextTier;
    const wild = this.nextWild;
    const radius = wild ? RADII[2] : RADII[tier];
    const cx = this.clampX(x, radius);
    this.spawnBall(cx, DROP_Y, tier, true, wild);
    this.synth.blip(220 + tier * 30, 0.08, 0.05, "triangle");
    this.lockUntil = now + 380;
    this.prepareNext();
  }

  private spawnPair(tier: number): void {
    const safe = Phaser.Math.Clamp(tier, 0, MAX_TIER);
    const radius = RADII[safe];
    const y = 430;
    this.spawnBall(this.scale.width / 2 - radius + 1, y, safe, false, false);
    this.spawnBall(this.scale.width / 2 + radius - 6, y, safe, false, false);
  }

  private spawnBall(x: number, y: number, tier: number, falling: boolean, wild: boolean): Ball | null {
    if (this.balls.length >= MAX_BALLS) return null;
    const radius = wild ? RADII[Math.min(tier, 3)] : RADII[tier];
    const key = wild ? "ball-wild" : `ball-${tier}`;
    const image = this.matter.add.image(x, y, key);
    image.setDisplaySize(radius * 2, radius * 2);
    image.setCircle(radius);
    image.setFriction(0.05);
    image.setFrictionAir(0.018);
    image.setBounce(0.18);
    image.setDensity(0.0012 + tier * 0.00035);
    image.setDepth(2);
    if (falling) image.setVelocity(0, 1);
    const ball: Ball = { image, tier, wild, born: this.game.loop.time, danger: 0, radius, pending: false };
    this.balls.push(ball);
    return ball;
  }

  private queuePair(bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    const a = this.ballFrom(bodyA);
    const b = this.ballFrom(bodyB);
    if (!a || !b || a.pending || b.pending || a === b) return;
    const same = a.tier === b.tier && !a.wild && !b.wild;
    const wild = a.wild || b.wild;
    if (!same && !wild) return;
    a.pending = true;
    b.pending = true;
    this.queue.push([a, b]);
  }

  private flushMerges(): void {
    if (this.over || this.queue.length === 0) return;
    const pending = this.queue.splice(0);
    for (const [a, b] of pending) {
      if (!this.balls.includes(a) || !this.balls.includes(b)) continue;
      this.merge(a, b);
    }
  }

  private merge(a: Ball, b: Ball): void {
    const now = this.game.loop.time;
    this.combo = now - this.lastMerge < 1100 ? this.combo + 1 : 1;
    this.lastMerge = now;
    const x = (a.image.x + b.image.x) / 2;
    const y = (a.image.y + b.image.y) / 2;
    const baseTier = a.wild ? b.tier : b.wild ? a.tier : a.tier;
    const outcome = mergeOutcome(baseTier);
    this.removeBall(a);
    this.removeBall(b);
    const gained = mergePoints(outcome.tier, this.combo, outcome.mega);
    this.score += gained;
    if (this.score > bestScore) {
      bestScore = this.score;
      this.hud.setBest(bestScore);
    }
    this.hud.setScore(this.score);
    this.hud.setCombo(this.combo);
    if (!outcome.mega) {
      const born = this.spawnBall(x, y, outcome.tier, false, false);
      born?.image.setVelocity((a.image.body?.velocity.x ?? 0) * 0.2, -1.5);
    }
    this.juice(x, y, outcome.tier, outcome.mega, gained);
  }

  private juice(x: number, y: number, tier: number, mega: boolean, gained: number): void {
    const burst = mega ? 16 : Math.min(6 + tier * 2, 14);
    this.burst(x, y, mega ? 0xfff1a8 : parseInt((COLORS[tier] ?? "#ffffff").slice(1), 16), burst);
    this.floatText(x, y - 10, mega ? "¡MEGA!" : `+${gained}`, mega ? 46 : 28 + this.combo);
    if (this.combo > 1) this.floatText(x, y - 48, `x${this.combo}`, 34);
    const pitch = 320 * Math.pow(1.16, tier) * (1 + (this.combo - 1) * 0.08);
    this.synth.blip(pitch, mega ? 0.28 : 0.14, mega ? 0.1 : 0.07, mega ? "triangle" : "sine");
    if (mega) this.synth.blip(pitch * 1.5, 0.32, 0.06, "square");
    if (!this.reduced) {
      this.cameras.main.shake(mega ? 280 : 90 + tier * 18, mega ? 0.012 : 0.002 + tier * 0.0011);
      const scale = mega ? 0.2 : Math.max(0.28, 0.62 - tier * 0.04);
      this.time.timeScale = scale;
      this.slowUntil = this.game.loop.time + (mega ? 220 : 70 + tier * 12);
    }
  }

  private burst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const spark = this.takeSpark(color);
      if (!spark) return;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
      const speed = 80 + Math.random() * 160;
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
      existing.max = 380;
      existing.life = existing.max;
      return existing;
    }
    if (this.sparks.length >= MAX_SPARKS) return null;
    const dot = this.add.circle(0, 0, 4 + Math.random() * 3, color).setDepth(8).setVisible(false);
    const spark = { dot, vx: 0, vy: 0, life: 0, max: 380 };
    this.sparks.push(spark);
    return spark;
  }

  private stepSparks(delta: number): void {
    const step = delta / 1000;
    for (const spark of this.sparks) {
      if (spark.life <= 0) continue;
      spark.life -= delta;
      spark.vy += 420 * step;
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
    const text = this.add.text(x, y, message, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: `${size}px`,
      fontStyle: "700",
      color: "#fff8e8",
      stroke: "#1a1208",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(12);
    this.tweens.add({
      targets: text,
      y: y - 70,
      alpha: 0,
      duration: 700,
      onComplete: () => {
        text.destroy();
        this.floaters -= 1;
      },
    });
  }

  private watchOverflow(now: number, delta: number): void {
    for (const ball of this.balls) {
      if (now - ball.born < 1400) {
        ball.danger = 0;
        continue;
      }
      const speed = Math.hypot(ball.image.body?.velocity.x ?? 0, ball.image.body?.velocity.y ?? 0);
      if (ball.image.y < LINE && speed < 1.2) ball.danger += delta;
      else ball.danger = 0;
      if (ball.danger > 1200) {
        this.finish();
        return;
      }
    }
  }

  private finish(): void {
    if (this.over) return;
    this.over = true;
    this.time.timeScale = 1;
    this.preview.setVisible(false);
    this.matter.world.pause();
    this.synth.blip(140, 0.35, 0.08, "sawtooth");
    this.hud.showOver(() => {
      this.scene.restart();
    });
  }

  private drawGuide(): void {
    this.guide.clear();
    if (this.over) return;
    this.guide.lineStyle(2, 0xfff6d8, 0.35);
    this.guide.lineBetween(this.aimX, DROP_Y + 24, this.aimX, LINE - 8);
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

  private clampX(x: number, radius = RADII[this.nextWild ? 2 : this.nextTier]): number {
    return Phaser.Math.Clamp(x, WALL + radius + 8, this.scale.width - WALL - radius - 8);
  }
}

const title = document.querySelector<HTMLElement>("#game-title");
const score = document.querySelector<HTMLElement>("#score");
const best = document.querySelector<HTMLElement>("#best");
const combo = document.querySelector<HTMLElement>("#combo");
const again = document.querySelector<HTMLElement>("#again");
const retry = document.querySelector<HTMLButtonElement>("#retry");
const stage = document.querySelector<HTMLElement>("#stage");
if (!title || !score || !best || !combo || !again || !retry || !stage) throw new Error("Falta el marcador del juego.");

const hud: Hud = {
  setScore(value) {
    score.textContent = `Puntos: ${value}`;
  },
  setBest(value) {
    best.textContent = `Mejor: ${value}`;
  },
  setCombo(value) {
    combo.hidden = value < 2;
    combo.textContent = value >= 2 ? `Combo x${value}` : "";
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
      gravity: { x: 0, y: 1.35 },
      debug: false,
      enableSleeping: false,
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

stage.addEventListener("pointerdown", () => stage.focus());
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
