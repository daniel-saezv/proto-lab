/** Física del túnel, el reparto de pantalla y los controles. Sin DOM. */

export const WORLD_H = 1000;
export const VIEW_W = 900;
export const HELI_R = 58;
export const SPEED = 300;

const GRAVITY = 450;
const THRUST = 1600;
const MAX_VY = 480;
const BORDE = 56;
const PASO_MAX = 0.05;

export type Fase = "menu" | "vuelo" | "fin";
export type Indice = 0 | 1;

export type Piloto = {
  y: number;
  vy: number;
  vivo: boolean;
  marca: number;
};

export type Partida = {
  fase: Fase;
  jugadores: 1 | 2;
  distancia: number;
  pilotos: [Piloto, Piloto];
  fotos: [boolean, boolean];
  /** Segundos en el centro, sin caer, al empezar una partida. */
  gracia: number;
};

export type Rect = { x: number; y: number; w: number; h: number };

export type ZonaId = "uno" | "dos" | "foto0" | "foto1" | "otra" | "menu";

export type Zona = Rect & { id: ZonaId };

export type Carril = Rect & { indice: Indice };

export type MarcoMenu = {
  panel: Rect;
  titulo: Rect;
  subtitulo: Rect;
  zonas: Zona[];
};

export type MarcoFin = {
  panel: Rect;
  zonas: Zona[];
};

export function tunel(distancia: number): { techo: number; suelo: number } {
  const recorrido = Math.max(0, distancia);
  const onda = Math.sin(recorrido * 0.0042) * 150 + Math.sin(recorrido * 0.009 + 1.3) * 48;
  const apertura = Math.max(HELI_R * 2 + 200, 760 - Math.min(240, recorrido * 0.006));
  const mitad = apertura / 2;
  const margen = BORDE + mitad;
  const medio = Math.min(WORLD_H - margen, Math.max(margen, WORLD_H / 2 + onda));
  return { techo: medio - mitad, suelo: medio + mitad };
}

export function quiereSubir(y: number, vy: number, distancia: number): boolean {
  const ahora = tunel(distancia);
  const luego = tunel(distancia + SPEED * 0.45);
  const meta = ((ahora.techo + ahora.suelo) / 2 + (luego.techo + luego.suelo) / 2) / 2;
  const previsto = y + vy * 0.28;
  return previsto > meta;
}

export function pilotoNuevo(distancia = 0): Piloto {
  const hueco = tunel(distancia);
  return { y: (hueco.techo + hueco.suelo) / 2, vy: 0, vivo: true, marca: 0 };
}

export function partidaMenu(): Partida {
  return {
    fase: "menu",
    jugadores: 1,
    distancia: 0,
    pilotos: [pilotoNuevo(0), pilotoNuevo(0)],
    fotos: [false, false],
    gracia: 0,
  };
}

export function empezar(partida: Partida, jugadores: 1 | 2): void {
  partida.fase = "vuelo";
  partida.jugadores = jugadores;
  partida.distancia = 0;
  partida.gracia = 0;
  partida.pilotos = [pilotoNuevo(0), pilotoNuevo(0)];
}

export function volverAlMenu(partida: Partida): void {
  const fotos = partida.fotos;
  const nueva = partidaMenu();
  partida.fase = nueva.fase;
  partida.jugadores = nueva.jugadores;
  partida.distancia = nueva.distancia;
  partida.gracia = 0;
  partida.pilotos = nueva.pilotos;
  partida.fotos = fotos;
}

export function ponerFoto(partida: Partida, indice: Indice, activa: boolean): void {
  partida.fotos[indice] = activa;
}

export function paso(partida: Partida, dt: number, subir: readonly [boolean, boolean]): void {
  if (!Number.isFinite(dt) || dt <= 0 || partida.fase === "fin") return;
  const pasoDt = Math.min(dt, PASO_MAX);
  if (partida.gracia > 0 && partida.fase === "vuelo") {
    partida.gracia = Math.max(0, partida.gracia - pasoDt);
    const hueco = tunel(partida.distancia);
    const medio = (hueco.techo + hueco.suelo) / 2;
    for (let i = 0; i < partida.jugadores; i += 1) {
      const piloto = partida.pilotos[i];
      if (!piloto?.vivo) continue;
      piloto.y = medio;
      piloto.vy = 0;
    }
    return;
  }
  const cantidad = partida.fase === "menu" ? 1 : partida.jugadores;
  let algunoVivo = false;
  for (let i = 0; i < cantidad; i += 1) {
    if (partida.pilotos[i].vivo) algunoVivo = true;
  }
  if (!algunoVivo) {
    if (partida.fase === "vuelo") partida.fase = "fin";
    return;
  }

  const decisiones: boolean[] = [];
  for (let i = 0; i < cantidad; i += 1) {
    const piloto = partida.pilotos[i];
    if (!piloto.vivo) {
      decisiones.push(false);
      continue;
    }
    const automatico = partida.fase === "menu" && i === 0;
    decisiones.push(automatico ? quiereSubir(piloto.y, piloto.vy, partida.distancia) : subir[i] === true);
  }

  partida.distancia += SPEED * pasoDt;

  for (let i = 0; i < cantidad; i += 1) {
    const piloto = partida.pilotos[i];
    if (!piloto.vivo) continue;
    const impulso = decisiones[i] === true;
    piloto.vy += (GRAVITY - (impulso ? THRUST : 0)) * pasoDt;
    piloto.vy = Math.max(-MAX_VY, Math.min(MAX_VY, piloto.vy));
    piloto.y += piloto.vy * pasoDt;
    const hueco = tunel(partida.distancia);
    piloto.marca = partida.distancia;
    if (piloto.y - HELI_R <= hueco.techo || piloto.y + HELI_R >= hueco.suelo) {
      piloto.vivo = false;
      piloto.y = Math.min(hueco.suelo - HELI_R, Math.max(hueco.techo + HELI_R, piloto.y));
    }
  }

  if (partida.fase === "menu" && !partida.pilotos[0].vivo) {
    partida.distancia = 0;
    partida.pilotos[0] = pilotoNuevo(0);
    return;
  }

  if (partida.fase === "vuelo") {
    let sigue = false;
    for (let i = 0; i < cantidad; i += 1) {
      if (partida.pilotos[i].vivo) sigue = true;
    }
    if (!sigue) partida.fase = "fin";
  }
}

export function metros(distancia: number): number {
  if (!Number.isFinite(distancia) || distancia <= 0) return 0;
  return Math.floor(distancia / 20);
}

export function ganador(partida: Partida): Indice | null {
  if (partida.jugadores === 1) return null;
  const diferencia = partida.pilotos[0].marca - partida.pilotos[1].marca;
  if (Math.abs(diferencia) < 1) return null;
  return diferencia > 0 ? 0 : 1;
}

export function textoResultado(partida: Partida): string[] {
  if (partida.jugadores === 1) return [`${metros(partida.pilotos[0].marca)} m`];
  const quien = ganador(partida);
  return [
    `Jugador 1 · ${metros(partida.pilotos[0].marca)} m`,
    `Jugador 2 · ${metros(partida.pilotos[1].marca)} m`,
    quien == null ? "Empate" : `Gana el jugador ${quien + 1}`,
  ];
}

export function recorteCubrir(ancho: number, alto: number): { sx: number; sy: number; sw: number; sh: number } {
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho < 1 || alto < 1) {
    return { sx: 0, sy: 0, sw: 1, sh: 1 };
  }
  const lado = Math.min(ancho, alto);
  return { sx: (ancho - lado) / 2, sy: (alto - lado) / 2, sw: lado, sh: lado };
}

function entero(rect: Rect): Rect {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  return {
    x,
    y,
    w: Math.max(1, Math.round(rect.x + rect.w) - x),
    h: Math.max(1, Math.round(rect.y + rect.h) - y),
  };
}

function zona(id: ZonaId, rect: Rect): Zona {
  return { id, ...entero(rect) };
}

export function marcoMenu(ancho: number, alto: number): MarcoMenu {
  const w = Math.max(1, ancho);
  const h = Math.max(1, alto);
  const apaisado = w > h + 40;
  const pad = 12;
  const gap = 8;
  if (apaisado) {
    const btnH = Math.min(56, Math.max(44, h * 0.16));
    const altoPanel = Math.min(h * 0.42, btnH + 70);
    const anchoPanel = Math.min(760, w - 16);
    const panel = entero({ x: (w - anchoPanel) / 2, y: Math.max(0, h - altoPanel - 8), w: anchoPanel, h: altoPanel });
    const yBtn = panel.y + panel.h - pad - btnH;
    const inner = panel.w - pad * 2;
    const pesos = [1, 1, 1.35, 1.35];
    const suma = pesos.reduce((total, peso) => total + peso, 0);
    const libre = Math.max(0, inner - gap * (pesos.length - 1));
    let x = panel.x + pad;
    const ids: ZonaId[] = ["foto0", "foto1", "uno", "dos"];
    const zonasMenu: Zona[] = pesos.map((peso, indice) => {
      const anchoZona = libre * (peso / suma);
      const creada = zona(ids[indice] ?? "uno", { x, y: yBtn, w: anchoZona, h: btnH });
      x += anchoZona + gap;
      return creada;
    });
    return {
      panel,
      titulo: { x: panel.x + pad, y: panel.y + 8, w: panel.w - pad * 2, h: 22 },
      subtitulo: { x: panel.x + pad, y: panel.y + 30, w: panel.w - pad * 2, h: 16 },
      zonas: zonasMenu,
    };
  }

  const anchoPanel = Math.min(460, w - 16);
  const altoPanel = Math.min(292, Math.max(228, Math.min(h * 0.42, h - 16)));
  const panel = entero({
    x: (w - anchoPanel) / 2,
    y: Math.max(0, h - altoPanel - 8),
    w: anchoPanel,
    h: Math.min(altoPanel, h),
  });
  const tituloH = 50;
  const huecoBotones = panel.h - pad * 2 - tituloH - gap * 2;
  const btnH = Math.min(54, Math.max(44, huecoBotones / 3.2));
  const fotoH = Math.max(44, huecoBotones - btnH * 2);
  const yFoto = panel.y + pad + tituloH;
  const yUno = yFoto + fotoH + gap;
  const yDos = yUno + btnH + gap;
  const fotoW = (panel.w - pad * 2 - gap) / 2;
  return {
    panel,
    titulo: { x: panel.x + pad, y: panel.y + 10, w: panel.w - pad * 2, h: 24 },
    subtitulo: { x: panel.x + pad, y: panel.y + 34, w: panel.w - pad * 2, h: 16 },
    zonas: [
      zona("foto0", { x: panel.x + pad, y: yFoto, w: fotoW, h: fotoH }),
      zona("foto1", { x: panel.x + pad + fotoW + gap, y: yFoto, w: fotoW, h: fotoH }),
      zona("uno", { x: panel.x + pad, y: yUno, w: panel.w - pad * 2, h: btnH }),
      zona("dos", { x: panel.x + pad, y: yDos, w: panel.w - pad * 2, h: btnH }),
    ],
  };
}

export function marcoFin(ancho: number, alto: number, jugadores: 1 | 2): MarcoFin {
  const lineas = jugadores === 2 ? 3 : 1;
  const w = Math.min(360, Math.max(1, ancho) - 24);
  const h = 86 + lineas * 28 + 108;
  const panel = entero({ x: (ancho - w) / 2, y: Math.max(8, (alto - h) / 2), w, h });
  return {
    panel,
    zonas: [
      zona("otra", { x: panel.x + 16, y: panel.y + panel.h - 108, w: panel.w - 32, h: 48 }),
      zona("menu", { x: panel.x + 16, y: panel.y + panel.h - 52, w: panel.w - 32, h: 40 }),
    ],
  };
}

export function carriles(ancho: number, alto: number, fase: Fase, jugadores: 1 | 2): Carril[] {
  const corte = fase === "menu" ? Math.max(1, marcoMenu(ancho, alto).panel.y - 8) : Math.max(1, alto);
  const altoUtil = Math.max(1, Math.min(corte, alto));
  if (jugadores === 1) {
    return [{ ...entero({ x: 0, y: 0, w: Math.max(1, ancho), h: altoUtil }), indice: 0 }];
  }
  const gutter = 8;
  if (alto >= ancho) {
    const mitad = (altoUtil - gutter) / 2;
    return [
      { ...entero({ x: 0, y: 0, w: Math.max(1, ancho), h: mitad }), indice: 0 },
      { ...entero({ x: 0, y: mitad + gutter, w: Math.max(1, ancho), h: mitad }), indice: 1 },
    ];
  }
  const mitad = (Math.max(1, ancho) - gutter) / 2;
  return [
    { ...entero({ x: 0, y: 0, w: mitad, h: altoUtil }), indice: 0 },
    { ...entero({ x: mitad + gutter, y: 0, w: mitad, h: altoUtil }), indice: 1 },
  ];
}

export function zonas(ancho: number, alto: number, fase: Fase, jugadores: 1 | 2): Zona[] {
  if (fase === "menu") return marcoMenu(ancho, alto).zonas;
  if (fase === "fin") return marcoFin(ancho, alto, jugadores).zonas;
  return [zona("menu", { x: 12, y: 12, w: 88, h: 40 })];
}

export function zonaEn(lista: readonly Zona[], x: number, y: number): Zona | null {
  for (let i = lista.length - 1; i >= 0; i -= 1) {
    const candidato = lista[i];
    if (!candidato) continue;
    if (x >= candidato.x && y >= candidato.y && x < candidato.x + candidato.w && y < candidato.y + candidato.h) return candidato;
  }
  return null;
}

export function indiceCarril(lista: readonly Carril[], x: number, y: number): Indice | null {
  for (const carril of lista) {
    if (x >= carril.x && y >= carril.y && x < carril.x + carril.w && y < carril.y + carril.h) return carril.indice;
  }
  return null;
}

const TECLAS_UNO = new Set(["Space", "KeyW"]);
const TECLAS_DOS = new Set(["ArrowUp", "KeyI"]);

export function teclaImpulsa(teclas: ReadonlySet<string>, indice: Indice, jugadores: 1 | 2): boolean {
  const propias = indice === 0 ? TECLAS_UNO : TECLAS_DOS;
  for (const tecla of propias) {
    if (teclas.has(tecla)) return true;
  }
  if (indice === 0 && jugadores === 1) {
    for (const tecla of TECLAS_DOS) {
      if (teclas.has(tecla)) return true;
    }
  }
  return false;
}

export function impulsoJugador(
  indice: Indice,
  jugadores: 1 | 2,
  teclas: ReadonlySet<string>,
  punteros: ReadonlyMap<number, Indice>,
): boolean {
  if (teclaImpulsa(teclas, indice, jugadores)) return true;
  for (const quien of punteros.values()) {
    if (quien === indice) return true;
  }
  return false;
}

export function accionTeclado(fase: Fase, code: string): "uno" | "dos" | "otra" | "menu" | null {
  if (fase === "menu" && code === "Enter") return "uno";
  if (fase === "menu" && (code === "Digit2" || code === "Numpad2")) return "dos";
  if (fase === "fin" && code === "Enter") return "otra";
  if (fase !== "menu" && code === "Escape") return "menu";
  return null;
}
