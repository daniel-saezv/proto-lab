import { pintar, type Foto } from "./pintar";
import {
  accionTeclado,
  carriles,
  empezar,
  impulsoJugador,
  indiceCarril,
  partidaMenu,
  paso,
  ponerFoto,
  quiereSubir,
  recorteCubrir,
  tunel,
  volverAlMenu,
  zonaEn,
  zonas,
  type Fase,
  type Indice,
  type Partida,
} from "./vuelo";

declare global {
  interface Window {
    __protoLabApp?: { stop(): void };
    __protoLabPreview?: () => void | Promise<void>;
  }
}

const FOTO_MAX = 12 * 1024 * 1024;
const FOTO_LADO = 96;

type Sonido = {
  resume(): void;
  volar(impulso: boolean): void;
    choque(): void;
    silencio(): void;
    close(): void;
  };

function crearSonido(): Sonido {
  let ctx: AudioContext | null = null;
  let rotor: OscillatorNode | null = null;
  let ganancia: GainNode | null = null;

  function asegurar(): AudioContext | null {
    if (ctx) return ctx;
    try {
      const audio = new AudioContext();
      const osc = audio.createOscillator();
      const filtro = audio.createBiquadFilter();
      const gain = audio.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 58;
      filtro.type = "lowpass";
      filtro.frequency.value = 240;
      gain.gain.value = 0;
      osc.connect(filtro);
      filtro.connect(gain);
      gain.connect(audio.destination);
      osc.start();
      ctx = audio;
      rotor = osc;
      ganancia = gain;
      return audio;
    } catch {
      return null;
    }
  }

  return {
    resume() {
      const audio = asegurar();
      if (audio) void audio.resume();
    },
    volar(impulso) {
      if (!ctx || !ganancia || !rotor) return;
      const ahora = ctx.currentTime;
      ganancia.gain.cancelScheduledValues(ahora);
      ganancia.gain.linearRampToValueAtTime(0.028, ahora + 0.05);
      rotor.frequency.linearRampToValueAtTime(impulso ? 84 : 58, ahora + 0.08);
    },
    choque() {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 120;
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
    },
    silencio() {
      if (!ctx || !ganancia) return;
      const ahora = ctx.currentTime;
      ganancia.gain.cancelScheduledValues(ahora);
      ganancia.gain.linearRampToValueAtTime(0, ahora + 0.08);
    },
    close() {
      const audio = ctx;
      ctx = null;
      rotor = null;
      ganancia = null;
      if (audio) void audio.close();
    },
  };
}

function senal(tipo: "alive" | "ready"): void {
  window.parent.postMessage({ source: "proto-lab", type: tipo }, "*");
}

function arrancar(): { stop(): void } {
  const raiz = document.querySelector("#app");
  const nodo = document.querySelector("#juego");
  const estado = document.querySelector("#estado");
  const entrada0 = document.querySelector("#foto0");
  const entrada1 = document.querySelector("#foto1");
  if (!(raiz instanceof HTMLElement) || !(nodo instanceof HTMLCanvasElement)) throw new Error("falta el lienzo");
  const canvas = nodo;
  const contexto = canvas.getContext("2d", { alpha: false });
  if (!contexto) throw new Error("falta el contexto");
  const pincel: CanvasRenderingContext2D = contexto;

  const partida: Partida = partidaMenu();
  const fotos: [Foto, Foto] = [null, null];
  const mejores: [number, number] = [0, 0];
  const teclas = new Set<string>();
  const punteros = new Map<number, Indice>();
  const zonaPulsada = new Map<number, string>();
  const sonido = crearSonido();
  let aviso = "";
  let avisoHasta = 0;
  let ayudaHasta = 0;
  let pose = false;
  let parado = false;
  let listo = false;
  let marco = 0;
  let anterior = performance.now();
  let faseAnterior: Fase = partida.fase;
  const vivosAntes: [boolean, boolean] = [true, true];

  function medida(): { ancho: number; alto: number; dpr: number } {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ancho = Math.max(1, canvas.clientWidth);
    const alto = Math.max(1, canvas.clientHeight);
    return { ancho, alto, dpr };
  }

  function ajustar(): void {
    const { ancho, alto, dpr } = medida();
    const pixelW = Math.round(ancho * dpr);
    const pixelH = Math.round(alto * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }
    pincel.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function anotar(): void {
    if (partida.fase === "menu" || pose) return;
    const cantidad = partida.jugadores;
    for (let i = 0; i < cantidad; i += 1) {
      const indice = i as Indice;
      if (partida.pilotos[indice].marca > mejores[indice]) mejores[indice] = partida.pilotos[indice].marca;
    }
  }

  function contarEstado(): void {
    if (!(estado instanceof HTMLElement)) return;
    if (partida.fase === "menu") {
      estado.textContent = "Coptero. El jugador 1 sale con un avatar dibujado; puedes poner tu foto. Elige un jugador o dos. Mantén pulsado para subir.";
      return;
    }
    if (partida.fase === "fin") {
      estado.textContent = partida.jugadores === 2 ? "Fin del vuelo de los dos." : "Choque. Puedes volver a volar.";
      return;
    }
    const marcas = [0, 1]
      .slice(0, partida.jugadores)
      .map((indice) => `jugador ${indice + 1} ${partida.pilotos[indice as Indice].vivo ? "en el aire" : "fuera"}`)
      .join(", ");
    estado.textContent = marcas;
  }

  function dibujar(): void {
    const { ancho, alto } = medida();
    const ahora = performance.now();
    pintar(pincel, ancho, alto, {
      partida,
      tiempo: ahora / 1000,
      fotos,
      mejores,
      ayuda: ahora < ayudaHasta,
      aviso: ahora < avisoHasta ? aviso : "",
    });
  }

  function actuar(id: string): void {
    if (id === "uno") {
      empezar(partida, 1);
      partida.gracia = 0.9;
      ayudaHasta = performance.now() + 3400;
      pose = false;
    } else if (id === "dos") {
      empezar(partida, 2);
      partida.gracia = 0.9;
      ayudaHasta = performance.now() + 3400;
      pose = false;
    } else if (id === "otra") {
      empezar(partida, partida.jugadores);
      partida.gracia = 0.9;
      ayudaHasta = performance.now() + 2800;
    } else if (id === "menu") {
      volverAlMenu(partida);
      pose = false;
    } else if (id === "foto0" && entrada0 instanceof HTMLInputElement) {
      entrada0.click();
    } else if (id === "foto1" && entrada1 instanceof HTMLInputElement) {
      entrada1.click();
    }
    contarEstado();
  }

  function encajar(imagen: CanvasImageSource, ancho: number, alto: number): HTMLCanvasElement | null {
    const mini = document.createElement("canvas");
    mini.width = FOTO_LADO;
    mini.height = FOTO_LADO;
    const miniCtx = mini.getContext("2d");
    if (!miniCtx) return null;
    const recorte = recorteCubrir(ancho, alto);
    miniCtx.drawImage(imagen, recorte.sx, recorte.sy, recorte.sw, recorte.sh, 0, 0, FOTO_LADO, FOTO_LADO);
    return mini;
  }

  function avatarDibujado(): HTMLCanvasElement {
    const lienzo = document.createElement("canvas");
    lienzo.width = FOTO_LADO;
    lienzo.height = FOTO_LADO;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return lienzo;
    const centro = FOTO_LADO / 2;
    ctx.beginPath();
    ctx.arc(centro, centro, centro - 1, 0, Math.PI * 2);
    ctx.fillStyle = "#1b3f73";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centro, centro + 4, 28, 0, Math.PI * 2);
    ctx.fillStyle = "#f3c9a0";
    ctx.fill();
    ctx.strokeStyle = "#e2c278";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(centro, centro + 2, 34, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.fillStyle = "#1b2433";
    ctx.beginPath();
    ctx.arc(centro - 11, centro + 1, 3.2, 0, Math.PI * 2);
    ctx.arc(centro + 11, centro + 1, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1b2433";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(centro, centro + 8, 12, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.stroke();
    return lienzo;
  }

  function ponerDefecto(): void {
    if (parado || fotos[0] != null) return;
    fotos[0] = avatarDibujado();
    ponerFoto(partida, 0, true);
  }

  function cargarFoto(indice: Indice, archivo: File): void {
    if (archivo.size > FOTO_MAX) {
      aviso = "Esa foto pesa demasiado";
      avisoHasta = performance.now() + 2400;
      return;
    }
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      if (parado) return;
      const mini = encajar(imagen, imagen.naturalWidth, imagen.naturalHeight);
      if (!mini) return;
      fotos[indice] = mini;
      ponerFoto(partida, indice, true);
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      if (parado) return;
      aviso = "No se pudo leer la foto";
      avisoHasta = performance.now() + 2400;
    };
    imagen.src = url;
  }

  function impulso(indice: Indice): boolean {
    if (partida.fase !== "vuelo" || !partida.pilotos[indice].vivo) return false;
    if (pose) return false;
    return impulsoJugador(indice, partida.jugadores, teclas, punteros);
  }

  function cuadro(ahora: number): void {
    if (parado) return;
    const dt = Math.min(0.05, Math.max(0, (ahora - anterior) / 1000));
    anterior = ahora;
    if (pose && partida.fase === "vuelo") paso(partida, dt, [quiere(0), quiere(1)]);
    else paso(partida, dt, [impulso(0), impulso(1)]);
    anotar();
    for (let i = 0; i < 2; i += 1) {
      const indice = i as Indice;
      if (vivosAntes[indice] && !partida.pilotos[indice].vivo) sonido.choque();
      vivosAntes[indice] = partida.pilotos[indice].vivo;
    }
    if (partida.fase === "fin") sonido.silencio();
    else if (partida.fase === "menu" || pose) sonido.volar(true);
    else sonido.volar(impulso(0) || impulso(1));
    if (partida.fase !== faseAnterior) {
      faseAnterior = partida.fase;
      contarEstado();
    }
    ajustar();
    dibujar();
    if (!listo) {
      listo = true;
      senal("ready");
    }
    marco = requestAnimationFrame(cuadro);
  }

  function quiere(indice: Indice): boolean {
    const piloto = partida.pilotos[indice];
    if (!piloto.vivo || indice >= partida.jugadores) return false;
    return quiereSubir(piloto.y, piloto.vy, partida.distancia);
  }

  const onResize = () => ajustar();
  const onKeyDown = (event: KeyboardEvent) => {
    const accion = accionTeclado(partida.fase, event.code);
    if (accion) {
      event.preventDefault();
      sonido.resume();
      actuar(accion);
      return;
    }
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW" || event.code === "KeyI") {
      event.preventDefault();
      sonido.resume();
    }
    teclas.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    teclas.delete(event.code);
  };
  const onBlur = () => {
    teclas.clear();
    punteros.clear();
    zonaPulsada.clear();
  };
  const onContext = (event: Event) => event.preventDefault();
  const onPointerDown = (event: PointerEvent) => {
    sonido.resume();
    const zona = zonaEn(zonas(canvas.clientWidth, canvas.clientHeight, partida.fase, partida.jugadores), event.offsetX, event.offsetY);
    if (zona) {
      zonaPulsada.set(event.pointerId, zona.id);
      event.preventDefault();
      return;
    }
    if (partida.fase !== "vuelo") return;
    const lista = carriles(canvas.clientWidth, canvas.clientHeight, partida.fase, partida.jugadores);
    const indice = indiceCarril(lista, event.offsetX, event.offsetY);
    if (indice == null || !partida.pilotos[indice].vivo) return;
    punteros.set(event.pointerId, indice);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* El puntero ya no está. */
    }
    event.preventDefault();
  };
  const onPointerUp = (event: PointerEvent) => {
    const id = zonaPulsada.get(event.pointerId);
    zonaPulsada.delete(event.pointerId);
    punteros.delete(event.pointerId);
    if (!id || event.type === "pointercancel") return;
    const zona = zonaEn(zonas(canvas.clientWidth, canvas.clientHeight, partida.fase, partida.jugadores), event.offsetX, event.offsetY);
    if (zona?.id === id) actuar(id);
  };
  const onFoto0 = () => {
    if (!(entrada0 instanceof HTMLInputElement)) return;
    const archivo = entrada0.files?.[0];
    entrada0.value = "";
    if (archivo) cargarFoto(0, archivo);
  };
  const onFoto1 = () => {
    if (!(entrada1 instanceof HTMLInputElement)) return;
    const archivo = entrada1.files?.[0];
    entrada1.value = "";
    if (archivo) cargarFoto(1, archivo);
  };

  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("contextmenu", onContext);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  entrada0?.addEventListener("change", onFoto0);
  entrada1?.addEventListener("change", onFoto1);

  function parar(): void {
    if (parado) return;
    parado = true;
    cancelAnimationFrame(marco);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    canvas.removeEventListener("contextmenu", onContext);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    entrada0?.removeEventListener("change", onFoto0);
    entrada1?.removeEventListener("change", onFoto1);
    window.removeEventListener("pagehide", parar);
    sonido.close();
    fotos[0] = null;
    fotos[1] = null;
    canvas.remove();
  }

  window.__protoLabPreview = () => {
    ponerDefecto();
    empezar(partida, 2);
    partida.distancia = 900;
    const hueco = tunel(900);
    const medio = (hueco.techo + hueco.suelo) / 2;
    partida.pilotos[0].y = medio - 20;
    partida.pilotos[1].y = medio + 24;
    partida.pilotos[0].vy = 0;
    partida.pilotos[1].vy = 0;
    partida.pilotos[0].vivo = true;
    partida.pilotos[1].vivo = true;
    partida.pilotos[0].marca = 900;
    partida.pilotos[1].marca = 900;
    pose = true;
    ayudaHasta = 0;
    ajustar();
    dibujar();
  };

  senal("alive");
  ponerDefecto();
  contarEstado();
  ajustar();
  marco = requestAnimationFrame(cuadro);

  const api = { stop: parar };
  window.addEventListener("pagehide", parar);
  return api;
}

const juego = arrancar();
window.__protoLabApp = juego;
