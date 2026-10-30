import Phaser from "phaser";

type Hud = {
  setScore: (score: number) => void;
  setLives: (lives: number) => void;
  showOver: (restart: () => void) => void;
  hideOver: () => void;
};

class PlayScene extends Phaser.Scene {
  private bowl!: Phaser.GameObjects.Ellipse;
  private sparks!: Phaser.Physics.Arcade.Group;
  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };
  private score = 0;
  private lives = 3;
  private over = false;
  private hud!: Hud;

  constructor() {
    super("play");
  }

  create() {
    this.hud = this.registry.get("hud") as Hud;
    this.score = 0;
    this.lives = 3;
    this.over = false;
    this.hud.hideOver();
    this.hud.setScore(0);
    this.hud.setLives(3);

    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x14182b);
    for (let i = 0; i < 28; i += 1) {
      const x = Phaser.Math.Between(8, width - 8);
      const y = Phaser.Math.Between(8, height - 8);
      this.add.circle(x, y, Phaser.Math.Between(1, 2), 0xf6f1e7, 0.35);
    }

    this.bowl = this.add.ellipse(width / 2, height - 108, 168, 48, 0xffb703);
    this.physics.add.existing(this.bowl);
    const bowlBody = this.bowl.body as Phaser.Physics.Arcade.Body;
    bowlBody.setImmovable(true);
    bowlBody.setAllowGravity(false);
    bowlBody.setSize(168, 48);

    this.sparks = this.physics.add.group();
    this.physics.add.overlap(this.bowl, this.sparks, (_bowl, spark) => {
      spark.destroy();
      this.score += 1;
      this.hud.setScore(this.score);
    });

    this.time.addEvent({ delay: 780, loop: true, callback: () => this.spawn() });

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("Este navegador no deja leer el teclado.");
    this.keys = {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.moveTo(pointer.x));
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) this.moveTo(pointer.x);
    });
  }

  private moveTo(x: number) {
    if (this.over) return;
    this.bowl.x = Phaser.Math.Clamp(x, 90, this.scale.width - 90);
  }

  private spawn() {
    if (this.over) return;
    const margin = 36;
    const x = Phaser.Math.Between(margin, this.scale.width - margin);
    const spark = this.add.circle(x, -24, 16, 0x9bffd8);
    this.sparks.add(spark);
    const body = spark.body as Phaser.Physics.Arcade.Body;
    body.setCircle(16);
    body.setAllowGravity(false);
    const speed = 220 + Math.min(this.score, 24) * 10;
    body.setVelocity(Phaser.Math.Between(-30, 30), speed);
  }

  update() {
    if (this.over) return;
    const body = this.bowl.body as Phaser.Physics.Arcade.Body;
    const pointer = this.input.activePointer;
    if (pointer.isDown) {
      body.setVelocityX(0);
      this.moveTo(pointer.x);
    } else if (this.keys.left.isDown || this.keys.a.isDown) {
      body.setVelocityX(-520);
    } else if (this.keys.right.isDown || this.keys.d.isDown) {
      body.setVelocityX(520);
    } else {
      body.setVelocityX(0);
    }
    this.bowl.x = Phaser.Math.Clamp(this.bowl.x, 90, this.scale.width - 90);

    for (const child of this.sparks.getChildren()) {
      const spark = child as Phaser.GameObjects.Arc;
      if (spark.y > this.scale.height + 30) {
        spark.destroy();
        this.lives -= 1;
        this.hud.setLives(Math.max(this.lives, 0));
        if (this.lives <= 0) this.finish();
      }
    }
  }

  private finish() {
    this.over = true;
    this.physics.pause();
    this.hud.showOver(() => this.scene.restart());
  }
}

const score = document.querySelector<HTMLElement>("#score");
const lives = document.querySelector<HTMLElement>("#lives");
const again = document.querySelector<HTMLElement>("#again");
const retry = document.querySelector<HTMLButtonElement>("#retry");
const stage = document.querySelector<HTMLElement>("#stage");
if (!score || !lives || !again || !retry || !stage) throw new Error("Falta el marcador del juego.");

const hud: Hud = {
  setScore(value) {
    score.textContent = `Puntos: ${value}`;
  },
  setLives(value) {
    lives.textContent = `Chispas: ${value}`;
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
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 540,
    height: 960,
  },
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
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
