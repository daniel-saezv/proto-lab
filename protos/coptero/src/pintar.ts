import {
  HELI_R,
  VIEW_W,
  WORLD_H,
  type Carril,
  type Indice,
  type Partida,
  type Zona,
  carriles,
  marcoFin,
  marcoMenu,
  metros,
  textoResultado,
  tunel,
  zonas,
} from "./vuelo";

export type Foto = CanvasImageSource | null;

export type Vista = {
  partida: Partida;
  tiempo: number;
  fotos: [Foto, Foto];
  mejores: [number, number];
  ayuda: boolean;
  aviso: string;
};

const ACENTO: Record<Indice, string> = { 0: "#d7b56a", 1: "#3d7ec4" };

export function pintar(ctx: CanvasRenderingContext2D, ancho: number, alto: number, vista: Vista): void {
  const { partida } = vista;
  const jugadores = partida.fase === "menu" ? 1 : partida.jugadores;
  const lista = carriles(ancho, alto, partida.fase, jugadores);
  ctx.clearRect(0, 0, ancho, alto);
  ctx.fillStyle = "#071426";
  ctx.fillRect(0, 0, ancho, alto);
  for (const carril of lista) pintarCarril(ctx, carril, vista);
  if (lista.length === 2) pintarCorte(ctx, lista[0], lista[1], ancho, alto);
  if (partida.fase === "menu") pintarMenu(ctx, ancho, alto, vista);
  if (partida.fase === "fin") pintarFin(ctx, ancho, alto, partida);
  if (partida.fase === "vuelo") pintarBotonMenu(ctx, ancho, alto);
  if (vista.aviso) pintarAviso(ctx, ancho, vista.aviso);
}

function pintarCarril(ctx: CanvasRenderingContext2D, carril: Carril, vista: Vista): void {
  const piloto = vista.partida.pilotos[carril.indice];
  const escalaX = carril.w / VIEW_W;
  const escalaY = carril.h / WORLD_H;
  const origen = vista.partida.distancia - 220;

  ctx.save();
  ctx.beginPath();
  ctx.rect(carril.x, carril.y, carril.w, carril.h);
  ctx.clip();

  const cielo = ctx.createLinearGradient(0, carril.y, 0, carril.y + carril.h);
  cielo.addColorStop(0, "#14386a");
  cielo.addColorStop(0.42, "#7eb6e6");
  cielo.addColorStop(1, "#d7eefb");
  ctx.fillStyle = cielo;
  ctx.fillRect(carril.x, carril.y, carril.w, carril.h);
  pintarNubes(ctx, carril, origen, escalaX);

  pintarMuro(ctx, carril, origen, escalaX, escalaY, "techo");
  pintarMuro(ctx, carril, origen, escalaX, escalaY, "suelo");
  pintarEscudos(ctx, carril, origen, escalaX, escalaY, "techo");
  pintarEscudos(ctx, carril, origen, escalaX, escalaY, "suelo");

  const hueco = tunel(vista.partida.distancia);
  const radio = HELI_R * escalaY;
  const x = carril.x + 220 * escalaX;
  const yMundo = piloto.vivo ? piloto.y : Math.min(hueco.suelo - HELI_R, Math.max(hueco.techo + HELI_R, piloto.y));
  const y = carril.y + yMundo * escalaY;
  const sube = piloto.vivo && piloto.vy < -40;
  pintarHelicoptero(ctx, x, y, Math.max(12, radio), vista.tiempo, vista.fotos[carril.indice], sube, piloto.vivo, ACENTO[carril.indice]);
  pintarMarca(ctx, carril, piloto.marca, vista.partida.jugadores, piloto.vivo, vista.ayuda && vista.partida.fase === "vuelo");

  if (!piloto.vivo && vista.partida.fase === "vuelo") pintarChoque(ctx, carril, piloto.marca);
  if (piloto.vivo && vista.partida.fase === "vuelo" && vista.partida.gracia > 0) {
    ctx.fillStyle = "#10284a";
    ctx.font = "800 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("¡Vuela!", carril.x + carril.w / 2, carril.y + carril.h * 0.62);
  }
  ctx.restore();
}

function pintarNubes(ctx: CanvasRenderingContext2D, carril: Carril, origen: number, escalaX: number): void {
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  for (let i = 0; i < 4; i += 1) {
    const ciclo = VIEW_W + 280;
    const mundo = (((i * 310 - (origen + 220) * 0.35) % ciclo) + ciclo) % ciclo - 80;
    const x = carril.x + mundo * escalaX;
    const y = carril.y + carril.h * (0.34 + (i % 3) * 0.09);
    const anchoNube = 46 * Math.max(0.65, escalaX);
    ctx.beginPath();
    ctx.ellipse(x, y, anchoNube, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(x + anchoNube * 0.55, y + 3, anchoNube * 0.62, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function muestras(origen: number, escalaX: number, pasos: number): number[] {
  const valores: number[] = [];
  for (let i = 0; i <= pasos; i += 1) valores.push(origen + (i / pasos) * (VIEW_W + 120));
  return valores;
}

function pintarMuro(
  ctx: CanvasRenderingContext2D,
  carril: Carril,
  origen: number,
  escalaX: number,
  escalaY: number,
  lado: "techo" | "suelo",
): void {
  const pasos = Math.max(10, Math.ceil(carril.w / 24));
  const xs = muestras(origen, escalaX, pasos);
  ctx.beginPath();
  xs.forEach((mundo, indice) => {
    const hueco = tunel(mundo);
    const y = carril.y + (lado === "techo" ? hueco.techo : hueco.suelo) * escalaY;
    const x = carril.x + (mundo - origen) * escalaX;
    if (indice === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (lado === "techo") {
    ctx.lineTo(carril.x + carril.w, carril.y);
    ctx.lineTo(carril.x, carril.y);
  } else {
    ctx.lineTo(carril.x + carril.w, carril.y + carril.h);
    ctx.lineTo(carril.x, carril.y + carril.h);
  }
  ctx.closePath();
  ctx.fillStyle = lado === "techo" ? "#10284a" : "#0e2344";
  ctx.fill();

  ctx.beginPath();
  xs.forEach((mundo, indice) => {
    const hueco = tunel(mundo);
    const y = carril.y + (lado === "techo" ? hueco.techo : hueco.suelo) * escalaY;
    const x = carril.x + (mundo - origen) * escalaX;
    if (indice === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#f0d48a";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function pintarEscudos(
  ctx: CanvasRenderingContext2D,
  carril: Carril,
  origen: number,
  escalaX: number,
  escalaY: number,
  lado: "techo" | "suelo",
): void {
  const tam = Math.max(20, Math.min(44, Math.min(carril.w, carril.h) * 0.08));
  const paso = Math.max(tam * 0.92, 8) / Math.max(escalaX, 0.01);
  const inicio = origen - paso;
  const fin = origen + VIEW_W + paso;
  for (let mundo = Math.floor(inicio / paso) * paso; mundo < fin; mundo += paso) {
    const hueco = tunel(mundo);
    const borde = lado === "techo" ? hueco.techo : hueco.suelo;
    const siguiente = tunel(mundo + 36);
    const bordeSiguiente = lado === "techo" ? siguiente.techo : siguiente.suelo;
    const pendiente = Math.atan2((bordeSiguiente - borde) * escalaY, 36 * escalaX);
    const angulo = (lado === "techo" ? 0 : Math.PI) + pendiente * 0.65;
    const x = carril.x + (mundo - origen) * escalaX;
    const desplaza = (lado === "techo" ? -1 : 1) * tam * 0.34;
    const y = carril.y + borde * escalaY + desplaza;
    escudo(ctx, x, y, tam, angulo);
    const grosor = (lado === "techo" ? hueco.techo : WORLD_H - hueco.suelo) * escalaY;
    if (grosor > tam * 1.5) {
      const extra = (lado === "techo" ? -1 : 1) * tam * 0.86;
      escudo(ctx, x + paso * escalaX * 0.5, y + extra, tam * 0.84, angulo);
    }
  }
}

/** Escudo blanco y oro de geometría propia: no es el emblema oficial. */
function escudo(ctx: CanvasRenderingContext2D, x: number, y: number, tam: number, angulo: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angulo);
  const w = tam * 0.46;
  const h = tam * 0.56;
  ctx.beginPath();
  ctx.moveTo(-w, -h * 0.2);
  ctx.bezierCurveTo(-w * 1.02, -h * 0.82, -w * 0.25, -h * 0.92, 0, -h);
  ctx.bezierCurveTo(w * 0.25, -h * 0.92, w * 1.02, -h * 0.82, w, -h * 0.2);
  ctx.lineTo(w * 0.84, h * 0.28);
  ctx.quadraticCurveTo(0, h * 1.05, -w * 0.84, h * 0.28);
  ctx.closePath();
  ctx.fillStyle = "#fbf7ee";
  ctx.fill();
  ctx.lineWidth = Math.max(1.25, tam * 0.055);
  ctx.strokeStyle = "#c6a15b";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-w * 0.5, -h * 0.72);
  ctx.lineTo(-w * 0.34, -h * 1.12);
  ctx.lineTo(-w * 0.14, -h * 0.78);
  ctx.lineTo(0, -h * 1.22);
  ctx.lineTo(w * 0.14, -h * 0.78);
  ctx.lineTo(w * 0.34, -h * 1.12);
  ctx.lineTo(w * 0.5, -h * 0.72);
  ctx.closePath();
  ctx.fillStyle = "#e2c278";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, h * 0.02, tam * 0.12, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.1, tam * 0.04);
  ctx.strokeStyle = "#1e4e86";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, h * 0.02, tam * 0.045, 0, Math.PI * 2);
  ctx.fillStyle = "#d7b56a";
  ctx.fill();
  ctx.restore();
}

function pintarHelicoptero(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  tiempo: number,
  foto: Foto,
  sube: boolean,
  vivo: boolean,
  acento: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  if (!vivo) ctx.rotate(0.65);
  ctx.fillStyle = "rgba(7, 20, 38, 0.16)";
  ctx.beginPath();
  ctx.ellipse(r * 0.05, r * 0.95, r * 0.9, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f7f4ec";
  ctx.strokeStyle = "#b8924e";
  ctx.lineWidth = Math.max(1, r * 0.055);
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, 0);
  ctx.lineTo(-r * 1.2, r * 0.22);
  ctx.lineTo(-r * 1.2, -r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(-r * 1.16, r * 0.08);
  ctx.rotate(tiempo * 28);
  ctx.strokeStyle = "#6e5428";
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.26);
  ctx.lineTo(0, r * 0.26);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = "#6e5428";
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, r * 0.52);
  ctx.lineTo(r * 0.58, r * 0.52);
  ctx.moveTo(-r * 0.2, r * 0.28);
  ctx.lineTo(-r * 0.32, r * 0.52);
  ctx.moveTo(r * 0.32, r * 0.28);
  ctx.lineTo(r * 0.4, r * 0.52);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(r * 0.12, 0, r * 0.72, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#fffdf8";
  ctx.fill();
  ctx.strokeStyle = "#c6a15b";
  ctx.lineWidth = Math.max(1.2, r * 0.05);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(r * 0.12, r * 0.08, r * 0.5, r * 0.11, 0, 0, Math.PI * 2);
  ctx.fillStyle = acento;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(r * 0.28, -r * 0.02, r * 0.28, 0, Math.PI * 2);
  ctx.clip();
  const ladoFoto = r * 0.56;
  const fotoX = r * 0.28 - ladoFoto / 2;
  const fotoY = -r * 0.02 - ladoFoto / 2;
  if (foto) ctx.drawImage(foto, fotoX, fotoY, ladoFoto, ladoFoto);
  else {
    ctx.fillStyle = "#16386a";
    ctx.fillRect(fotoX, fotoY, ladoFoto, ladoFoto);
    ctx.fillStyle = "#f4f1e6";
    ctx.beginPath();
    ctx.arc(r * 0.28, -r * 0.02, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(r * 0.28, -r * 0.02, r * 0.28, 0, Math.PI * 2);
  ctx.strokeStyle = "#e2c278";
  ctx.lineWidth = Math.max(1.2, r * 0.06);
  ctx.stroke();

  ctx.strokeStyle = "#5c4a2a";
  ctx.lineWidth = Math.max(1, r * 0.055);
  ctx.beginPath();
  ctx.moveTo(r * 0.02, -r * 0.36);
  ctx.lineTo(r * 0.02, -r * 0.58);
  ctx.stroke();
  ctx.save();
  ctx.translate(r * 0.02, -r * 0.58);
  ctx.rotate(tiempo * 18);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(20, 24, 32, 0.9)";
  ctx.lineWidth = Math.max(1.4, r * 0.075);
  ctx.beginPath();
  ctx.moveTo(-r * 1.2, 0);
  ctx.lineTo(r * 1.2, 0);
  ctx.stroke();
  ctx.globalAlpha = 0.4;
  ctx.rotate(Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(-r * 1.05, 0);
  ctx.lineTo(r * 1.05, 0);
  ctx.stroke();
  ctx.restore();

  if (sube && vivo) {
    ctx.fillStyle = "rgba(226, 194, 120, 0.45)";
    ctx.beginPath();
    ctx.ellipse(r * 0.05, r * 0.62, r * 0.16, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function pintarMarca(ctx: CanvasRenderingContext2D, carril: Carril, marca: number, jugadores: 1 | 2, vivo: boolean, ayuda: boolean): void {
  const texto = `${metros(marca)} m`;
  ctx.font = "700 16px system-ui, sans-serif";
  const anchoTexto = ctx.measureText(texto).width;
  const w = anchoTexto + 20;
  const h = 28;
  const x = carril.x + carril.w - w - 12;
  const y = carril.y + 12;
  redondo(ctx, x, y, w, h, 14);
  ctx.fillStyle = "rgba(7, 20, 38, 0.72)";
  ctx.fill();
  ctx.fillStyle = vivo ? "#f7f4ec" : "#e2c278";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, x + w / 2, y + h / 2);
  ctx.save();
  ctx.shadowColor = "rgba(7, 20, 38, 0.7)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#f7f4ec";
  ctx.font = "600 13px system-ui, sans-serif";
  if (jugadores === 2) {
    ctx.textAlign = "left";
    const izquierda = carril.indice === 0 ? carril.x + 108 : carril.x + 14;
    ctx.fillText(carril.indice === 0 ? "Jugador 1" : "Jugador 2", izquierda, carril.y + 26);
  }
  if (ayuda && carril.w > 260) {
    ctx.textAlign = "center";
    const pista = carril.w > 520
      ? carril.indice === 1
        ? "Tu mitad o la flecha arriba"
        : "Tu mitad, Espacio o W"
      : "Mantén tu mitad";
    ctx.fillText(pista, carril.x + carril.w / 2, carril.y + 72);
  }
  ctx.restore();
}

function pintarChoque(ctx: CanvasRenderingContext2D, carril: Carril, marca: number): void {
  ctx.fillStyle = "rgba(7, 20, 38, 0.45)";
  ctx.fillRect(carril.x, carril.y, carril.w, carril.h);
  ctx.fillStyle = "#f7f4ec";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillText("Choque", carril.x + carril.w / 2, carril.y + carril.h / 2 - 12);
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillText(`${metros(marca)} m`, carril.x + carril.w / 2, carril.y + carril.h / 2 + 18);
}

function pintarCorte(ctx: CanvasRenderingContext2D, arriba: Carril | undefined, abajo: Carril | undefined, ancho: number, alto: number): void {
  if (!arriba || !abajo) return;
  ctx.fillStyle = "#e2c278";
  if (abajo.y > arriba.y) ctx.fillRect(0, arriba.y + arriba.h, ancho, Math.max(1, abajo.y - (arriba.y + arriba.h)));
  else ctx.fillRect(arriba.x + arriba.w, 0, Math.max(1, abajo.x - (arriba.x + arriba.w)), alto);
}

function pintarMenu(ctx: CanvasRenderingContext2D, ancho: number, alto: number, vista: Vista): void {
  const marco = marcoMenu(ancho, alto);
  sombra(ctx);
  redondo(ctx, marco.panel.x, marco.panel.y, marco.panel.w, marco.panel.h, 22);
  ctx.fillStyle = "#10284a";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#e2c278";
  ctx.stroke();

  ctx.fillStyle = "#f7f4ec";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 22px system-ui, sans-serif";
  ctx.fillText("Coptero", marco.titulo.x + marco.titulo.w / 2, marco.titulo.y + marco.titulo.h / 2);
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillStyle = "#e2c278";
  const mejor = Math.max(vista.mejores[0], vista.mejores[1]);
  const subtitulo = mejor > 0 ? `Mejor ${metros(mejor)} m` : "Escudos blancos y oro en los bordes";
  ctx.fillText(subtitulo, marco.subtitulo.x + marco.subtitulo.w / 2, marco.subtitulo.y + marco.subtitulo.h / 2);

  for (const boton of marco.zonas) pintarZona(ctx, boton, vista);
  pintarInstruccion(ctx, ancho, marco.panel.y);
}

function pintarInstruccion(ctx: CanvasRenderingContext2D, ancho: number, techoPanel: number): void {
  const texto = "Mantén pulsado para subir";
  ctx.font = "700 14px system-ui, sans-serif";
  const w = Math.min(ancho - 24, ctx.measureText(texto).width + 28);
  const x = (ancho - w) / 2;
  const y = Math.max(8, techoPanel - 36);
  redondo(ctx, x, y, w, 28, 14);
  ctx.fillStyle = "rgba(7, 20, 38, 0.82)";
  ctx.fill();
  ctx.fillStyle = "#f7f4ec";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, ancho / 2, y + 14);
}

function pintarFin(ctx: CanvasRenderingContext2D, ancho: number, alto: number, partida: Partida): void {
  const marco = marcoFin(ancho, alto, partida.jugadores);
  ctx.fillStyle = "rgba(7, 20, 38, 0.35)";
  ctx.fillRect(0, 0, ancho, alto);
  sombra(ctx);
  redondo(ctx, marco.panel.x, marco.panel.y, marco.panel.w, marco.panel.h, 22);
  ctx.fillStyle = "#10284a";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#e2c278";
  ctx.stroke();

  ctx.fillStyle = "#f7f4ec";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 26px system-ui, sans-serif";
  ctx.fillText(partida.jugadores === 2 ? "Fin del vuelo" : "Choque", marco.panel.x + marco.panel.w / 2, marco.panel.y + 36);
  ctx.font = "600 16px system-ui, sans-serif";
  const lineas = textoResultado(partida);
  lineas.forEach((linea, indice) => {
    ctx.fillStyle = indice === lineas.length - 1 && partida.jugadores === 2 ? "#e2c278" : "#f7f4ec";
    ctx.fillText(linea, marco.panel.x + marco.panel.w / 2, marco.panel.y + 72 + indice * 26);
  });
  for (const boton of marco.zonas) pintarZona(ctx, boton, { fotos: [null, null] });
}

function pintarBotonMenu(ctx: CanvasRenderingContext2D, ancho: number, alto: number): void {
  const boton = zonas(ancho, alto, "vuelo", 1)[0];
  if (boton) pintarZona(ctx, boton, { fotos: [null, null] });
}

function pintarZona(ctx: CanvasRenderingContext2D, boton: Zona, vista: { fotos: [Foto, Foto] }): void {
  const primario = boton.id === "uno" || boton.id === "otra";
  redondo(ctx, boton.x, boton.y, boton.w, boton.h, 14);
  ctx.fillStyle = primario ? "#e2c278" : "#16386a";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = primario ? "#8d6b32" : "#e2c278";
  ctx.stroke();

  const etiqueta = etiquetaDe(boton.id);
  ctx.fillStyle = primario ? "#1b2433" : "#f7f4ec";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tam = Math.min(18, Math.max(13, boton.h * 0.34));
  ctx.font = `700 ${tam}px system-ui, sans-serif`;

  if (boton.id === "foto0" || boton.id === "foto1") {
    const indice: Indice = boton.id === "foto0" ? 0 : 1;
    const radio = Math.min(16, boton.h * 0.32);
    const cx = boton.x + 12 + radio;
    const cy = boton.y + boton.h / 2;
    const foto = vista.fotos[indice];
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radio, 0, Math.PI * 2);
    ctx.clip();
    if (foto) ctx.drawImage(foto, cx - radio, cy - radio, radio * 2, radio * 2);
    else {
      ctx.fillStyle = "#0e2344";
      ctx.fillRect(cx - radio, cy - radio, radio * 2, radio * 2);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, radio, 0, Math.PI * 2);
    ctx.strokeStyle = "#e2c278";
    ctx.stroke();
    ctx.fillStyle = "#f7f4ec";
    ctx.textAlign = "left";
    ctx.fillText(etiqueta, cx + radio + 8, cy);
    return;
  }
  ctx.fillText(etiqueta, boton.x + boton.w / 2, boton.y + boton.h / 2 + 1);
}

function etiquetaDe(id: Zona["id"]): string {
  if (id === "uno") return "1 jugador";
  if (id === "dos") return "2 jugadores";
  if (id === "foto0") return "Tu foto";
  if (id === "foto1") return "Foto 2";
  if (id === "otra") return "Otra vez";
  return "Menú";
}

function pintarAviso(ctx: CanvasRenderingContext2D, ancho: number, aviso: string): void {
  ctx.font = "700 14px system-ui, sans-serif";
  const w = Math.min(ancho - 32, ctx.measureText(aviso).width + 28);
  const x = (ancho - w) / 2;
  redondo(ctx, x, 16, w, 36, 18);
  ctx.fillStyle = "#10284a";
  ctx.fill();
  ctx.strokeStyle = "#e2c278";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#f7f4ec";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(aviso, ancho / 2, 34);
}

function redondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radio: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radio);
}

function sombra(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
}
