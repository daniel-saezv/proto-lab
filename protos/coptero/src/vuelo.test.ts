import { describe, expect, it } from "vitest";
import {
  HELI_R,
  WORLD_H,
  accionTeclado,
  carriles,
  empezar,
  ganador,
  impulsoJugador,
  indiceCarril,
  marcoFin,
  marcoMenu,
  metros,
  partidaMenu,
  paso,
  ponerFoto,
  recorteCubrir,
  teclaImpulsa,
  textoResultado,
  tunel,
  volverAlMenu,
  zonaEn,
  zonas,
} from "./vuelo";

function sePisan(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function simular(partida: Parameters<typeof paso>[0], segundos: number, subir: [boolean, boolean]): void {
  const pasos = Math.round(segundos / 0.016);
  for (let i = 0; i < pasos; i += 1) paso(partida, 0.016, subir);
}

describe("túnel y vuelo", () => {
  it("deja siempre un hueco mayor que el helicóptero", () => {
    for (let distancia = 0; distancia < 12000; distancia += 37) {
      const hueco = tunel(distancia);
      expect(hueco.suelo - hueco.techo).toBeGreaterThan(HELI_R * 2 + 80);
      expect(hueco.techo).toBeGreaterThanOrEqual(0);
      expect(hueco.suelo).toBeLessThanOrEqual(WORLD_H);
    }
  });

  it("cae si se suelta y sube si se mantiene", () => {
    const suelto = partidaMenu();
    empezar(suelto, 1);
    const y0 = suelto.pilotos[0].y;
    simular(suelto, 0.35, [false, false]);
    expect(suelto.pilotos[0].y).toBeGreaterThan(y0 + 25);
    expect(suelto.pilotos[0].vivo).toBe(true);

    const sujeto = partidaMenu();
    empezar(sujeto, 1);
    const arriba = sujeto.pilotos[0].y;
    simular(sujeto, 0.2, [true, false]);
    expect(sujeto.pilotos[0].y).toBeLessThan(arriba - 25);
    expect(sujeto.pilotos[0].vivo).toBe(true);
  });

  it("choca con el techo o con el suelo y congela la marca", () => {
    const techo = partidaMenu();
    empezar(techo, 1);
    const hueco = tunel(0);
    techo.pilotos[0].y = hueco.techo + HELI_R + 2;
    techo.pilotos[0].vy = -4000;
    paso(techo, 0.05, [true, false]);
    expect(techo.pilotos[0].vivo).toBe(false);
    expect(techo.fase).toBe("fin");
    const marca = techo.pilotos[0].marca;
    paso(techo, 0.2, [true, false]);
    expect(techo.pilotos[0].marca).toBe(marca);
    expect(techo.distancia).toBeGreaterThan(0);

    const suelo = partidaMenu();
    empezar(suelo, 1);
    const abajo = tunel(0);
    suelo.pilotos[0].y = abajo.suelo - HELI_R - 2;
    suelo.pilotos[0].vy = 4000;
    paso(suelo, 0.05, [false, false]);
    expect(suelo.pilotos[0].vivo).toBe(false);
    expect(suelo.fase).toBe("fin");
  });

  it("en dos jugadores, el choque de uno no para al otro", () => {
    const partida = partidaMenu();
    empezar(partida, 2);
    const yInicial = partida.pilotos[0].y;
    simular(partida, 0.16, [false, true]);
    expect(partida.pilotos[0].y).toBeGreaterThan(yInicial);
    expect(partida.pilotos[1].y).toBeLessThan(yInicial);
    expect(partida.pilotos[1].vivo).toBe(true);

    partida.pilotos[0].y = 0;
    partida.pilotos[0].vy = -4000;
    paso(partida, 0.05, [false, false]);
    expect(partida.pilotos[0].vivo).toBe(false);
    expect(partida.fase).toBe("vuelo");
    const marca = partida.pilotos[0].marca;
    const distancia = partida.distancia;
    paso(partida, 0.16, [false, false]);
    expect(partida.pilotos[0].marca).toBe(marca);
    expect(partida.distancia).toBeGreaterThan(distancia);
    expect(partida.pilotos[1].vivo).toBe(true);
    expect(partida.pilotos[1].marca).toBeGreaterThan(marca);
  });

  it("la demostración del menú aguanta el arranque sin chocar", () => {
    const partida = partidaMenu();
    for (let i = 0; i < 30 / 0.016; i += 1) paso(partida, 0.016, [false, false]);
    expect(partida.fase).toBe("menu");
    expect(partida.pilotos[0].vivo).toBe(true);
    expect(partida.distancia).toBeGreaterThan(SPEED_MINIMO);
  });

  it("al empezar hay un instante quieto en el centro", () => {
    const partida = partidaMenu();
    empezar(partida, 2);
    partida.gracia = 0.4;
    const centro = partida.pilotos[0].y;
    simular(partida, 0.2, [false, false]);
    expect(partida.distancia).toBe(0);
    expect(partida.pilotos[0].y).toBeCloseTo(centro, 5);
    expect(partida.pilotos[1].y).toBeCloseTo(centro, 5);
    expect(partida.pilotos[0].vivo).toBe(true);
    simular(partida, 0.3, [false, false]);
    expect(partida.gracia).toBe(0);
    expect(partida.distancia).toBeGreaterThan(0);
  });

  it("un paso negativo no rebobina la partida", () => {
    const partida = partidaMenu();
    empezar(partida, 1);
    paso(partida, 0.1, [false, false]);
    const distancia = partida.distancia;
    paso(partida, -1, [true, true]);
    expect(partida.distancia).toBe(distancia);
  });

  it("conserva la foto al empezar y al volver al menú", () => {
    const partida = partidaMenu();
    ponerFoto(partida, 0, true);
    ponerFoto(partida, 1, true);
    empezar(partida, 2);
    expect(partida.fotos).toEqual([true, true]);
    expect(partida.jugadores).toBe(2);
    volverAlMenu(partida);
    expect(partida.fase).toBe("menu");
    expect(partida.fotos).toEqual([true, true]);
  });
});

const SPEED_MINIMO = 300 * 20;

describe("pantalla y controles", () => {
  it("apila en vertical y parte a los lados según la forma", () => {
    const vertical = carriles(390, 844, "vuelo", 2);
    expect(vertical[0]?.y).toBeLessThan(vertical[1]?.y ?? 0);
    expect(vertical[0]?.x).toBe(vertical[1]?.x);
    expect(vertical[0]?.indice).toBe(0);
    expect(vertical[1]?.indice).toBe(1);

    const horizontal = carriles(900, 400, "vuelo", 2);
    expect(horizontal[0]?.x).toBeLessThan(horizontal[1]?.x ?? 0);
    expect(horizontal[0]?.y).toBe(horizontal[1]?.y);

    const uno = carriles(390, 844, "vuelo", 1);
    expect(uno).toHaveLength(1);
    expect(uno[0]?.w).toBe(390);
  });

  it("el menú deja el vuelo visible y botones grandes que no se pisan", () => {
    for (const [ancho, alto] of [
      [390, 844],
      [844, 390],
      [1280, 800],
      [360, 640],
    ] as const) {
      const marco = marcoMenu(ancho, alto);
      const carril = carriles(ancho, alto, "menu", 1)[0];
      expect(carril).toBeTruthy();
      expect((carril?.h ?? 0) / alto).toBeGreaterThan(0.28);
      expect((carril?.y ?? 0) + (carril?.h ?? 0)).toBeLessThanOrEqual(marco.panel.y);
      const botones = marco.zonas;
      expect(botones.map((boton) => boton.id)).toEqual(["foto0", "foto1", "uno", "dos"]);
      for (const boton of botones) {
        expect(boton.w).toBeGreaterThanOrEqual(44);
        expect(boton.h).toBeGreaterThanOrEqual(44);
        expect(boton.x).toBeGreaterThanOrEqual(marco.panel.x);
        expect(boton.y).toBeGreaterThanOrEqual(marco.panel.y);
        expect(boton.x + boton.w).toBeLessThanOrEqual(marco.panel.x + marco.panel.w + 1);
        expect(boton.y + boton.h).toBeLessThanOrEqual(marco.panel.y + marco.panel.h + 1);
      }
      for (let i = 0; i < botones.length; i += 1) {
        for (let j = i + 1; j < botones.length; j += 1) {
          const a = botones[i];
          const b = botones[j];
          if (a && b) expect(sePisan(a, b)).toBe(false);
        }
      }
    }
  });

  it("el resultado cabe en la pantalla y nombra al que aguantó más", () => {
    const marco = marcoFin(390, 844, 2);
    for (const boton of marco.zonas) {
      expect(boton.x).toBeGreaterThanOrEqual(0);
      expect(boton.y).toBeGreaterThanOrEqual(0);
      expect(boton.x + boton.w).toBeLessThanOrEqual(390);
      expect(boton.y + boton.h).toBeLessThanOrEqual(844);
    }
    const partida = partidaMenu();
    empezar(partida, 2);
    partida.pilotos[0].marca = 400;
    partida.pilotos[1].marca = 900;
    expect(ganador(partida)).toBe(1);
    expect(textoResultado(partida)[2]).toBe("Gana el jugador 2");
    partida.pilotos[0].marca = 900;
    expect(ganador(partida)).toBeNull();
    expect(textoResultado(partida)[2]).toBe("Empate");
    expect(metros(20)).toBe(1);
    expect(metros(0)).toBe(0);
  });

  it("un dedo en un carril solo impulsa a ese jugador", () => {
    const lista = carriles(390, 844, "vuelo", 2);
    const arriba = indiceCarril(lista, 40, 30);
    const abajo = indiceCarril(lista, 40, 700);
    expect(arriba).toBe(0);
    expect(abajo).toBe(1);
    const punteros = new Map<number, 0 | 1>([
      [1, 0],
      [2, 1],
    ]);
    expect(impulsoJugador(0, 2, new Set(), punteros)).toBe(true);
    punteros.delete(1);
    expect(impulsoJugador(0, 2, new Set(), punteros)).toBe(false);
    expect(impulsoJugador(1, 2, new Set(), punteros)).toBe(true);

    const menu = zonas(390, 844, "menu", 1);
    const foto = zonaEn(menu, menu[0]?.x ?? 0 + 4, (menu[0]?.y ?? 0) + 4);
    expect(foto?.id).toBe("foto0");
    expect(zonaEn(menu, 4, 4)).toBeNull();
  });

  it("reparte el teclado: espacio para el primero y la flecha para el segundo", () => {
    expect(teclaImpulsa(new Set(["Space"]), 0, 2)).toBe(true);
    expect(teclaImpulsa(new Set(["Space"]), 1, 2)).toBe(false);
    expect(teclaImpulsa(new Set(["ArrowUp"]), 1, 2)).toBe(true);
    expect(teclaImpulsa(new Set(["ArrowUp"]), 0, 2)).toBe(false);
    expect(teclaImpulsa(new Set(["ArrowUp"]), 0, 1)).toBe(true);
    expect(teclaImpulsa(new Set(["KeyW"]), 0, 1)).toBe(true);
    expect(accionTeclado("menu", "Enter")).toBe("uno");
    expect(accionTeclado("menu", "Digit2")).toBe("dos");
    expect(accionTeclado("vuelo", "Escape")).toBe("menu");
    expect(accionTeclado("fin", "Enter")).toBe("otra");
  });

  it("recorta la foto al centro", () => {
    expect(recorteCubrir(200, 100)).toEqual({ sx: 50, sy: 0, sw: 100, sh: 100 });
    expect(recorteCubrir(80, 120)).toEqual({ sx: 0, sy: 20, sw: 80, sh: 80 });
    expect(recorteCubrir(0, 10)).toEqual({ sx: 0, sy: 0, sw: 1, sh: 1 });
  });
});
