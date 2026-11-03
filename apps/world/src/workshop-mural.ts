/** Huevos de pascua del telón. Van pintados una sola vez; no son un modelo. */
export const WORKSHOP_MURAL_LINES = [
  "while (true) invent();",
  "O(n) con cariño",
  "café",
  "SAVE",
  "nunca goto",
  "404: idea",
  'commit -m "eureka"',
] as const;

export function paintWorkshopMural(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = "#241c38";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#3d2a24";
  ctx.fillRect(18, 18, 168, height - 36);
  for (let i = 0; i < 5; i += 1) {
    const x = 36 + i * 30;
    const coffee = i === 2;
    ctx.fillStyle = coffee ? "#c46b3a" : "#8fd8ff";
    ctx.beginPath();
    ctx.ellipse(x + 8, 78, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x, 78, 16, 150);
    ctx.fillStyle = coffee ? "#ffb703" : "#d7f4ff";
    ctx.fillRect(x + 3, 150, 10, 62);
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(x - 2, 64, 20, 12);
  }
  ctx.fillStyle = "#f6f1e7";
  ctx.font = "700 22px sans-serif";
  ctx.fillText(WORKSHOP_MURAL_LINES[2], 48, height - 36);

  ctx.fillStyle = "#121624";
  ctx.fillRect(210, 24, 360, height - 48);
  ctx.strokeStyle = "#7dff6b";
  ctx.lineWidth = 4;
  ctx.strokeRect(218, 34, 344, height - 70);
  ctx.fillStyle = "#7dff6b";
  ctx.font = "700 28px sans-serif";
  const code = [
    WORKSHOP_MURAL_LINES[0],
    WORKSHOP_MURAL_LINES[1],
    WORKSHOP_MURAL_LINES[4],
    WORKSHOP_MURAL_LINES[5],
    WORKSHOP_MURAL_LINES[6],
  ];
  for (let i = 0; i < code.length; i += 1) {
    ctx.fillText(code[i]!, 232, 78 + i * 52);
  }

  ctx.save();
  ctx.translate(640, 120);
  ctx.strokeStyle = "#ffb703";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.stroke();
  for (let tooth = 0; tooth < 8; tooth += 1) {
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#8d97a8";
    ctx.fillRect(40, -8, 22, 16);
  }
  ctx.restore();

  ctx.fillStyle = "#1f8a80";
  ctx.fillRect(600, 230, 130, 110);
  ctx.fillStyle = "#14182b";
  ctx.fillRect(618, 248, 94, 28);
  ctx.fillStyle = "#ffb703";
  ctx.font = "700 28px sans-serif";
  ctx.fillText(WORKSHOP_MURAL_LINES[3], 628, 318);

  ctx.strokeStyle = "#e07a3d";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(620, 70);
  ctx.lineTo(700, 150);
  ctx.stroke();
  ctx.fillStyle = "#e07a3d";
  ctx.fillRect(688, 138, 28, 16);
}
