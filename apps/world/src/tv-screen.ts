import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace, type Material } from "three";
import { TV_TEXTURE_HEIGHT, TV_TEXTURE_WIDTH, shouldBlitTv, shouldDecodeTv } from "./tv-preview";

/**
 * Una sola textura de la tele. El vídeo no se decodifica hasta estar cerca
 * y solo se sube a la GPU a 8 Hz. Lejos, o si falla, queda la foto fija.
 */
export function createTvScreen(materials: Material[]) {
  const canvas = document.createElement("canvas");
  canvas.width = TV_TEXTURE_WIDTH;
  canvas.height = TV_TEXTURE_HEIGHT;
  const context2d = canvas.getContext("2d");
  if (!context2d) throw new Error("La tele no tiene canvas 2D");
  const ctx: CanvasRenderingContext2D = context2d;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture, toneMapped: false });
  material.userData.live = true;
  materials.push(material);

  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "none";
  video.tabIndex = -1;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("aria-hidden", "true");
  video.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.append(video);

  let stillHref: string | null = null;
  let clipHref: string | null = null;
  let stillImage: HTMLImageElement | null = null;
  let stillPainted = false;
  let clipFailed = false;
  let suspended = false;
  let playing = false;
  let blitElapsed = 0;

  function paintStill() {
    ctx.fillStyle = "#14182b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ready = Boolean(stillImage && stillImage.complete && stillImage.naturalWidth > 0);
    if (ready && stillImage) ctx.drawImage(stillImage, 0, 0, canvas.width, canvas.height);
    texture.needsUpdate = true;
    stillPainted = ready || !stillHref;
  }

  function loadStill(href: string | null) {
    stillImage = null;
    stillPainted = false;
    if (!href) {
      paintStill();
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (stillHref !== href) return;
      stillImage = image;
      if (!playing) paintStill();
    };
    image.onerror = () => {
      if (stillHref !== href) return;
      stillImage = null;
      paintStill();
    };
    image.src = href;
  }

  function pauseClip() {
    playing = false;
    if (!video.paused) video.pause();
  }

  function playClip() {
    if (clipFailed || !clipHref) return;
    if (video.getAttribute("src") !== clipHref) video.src = clipHref;
    const pending = video.play();
    if (!pending) return;
    void pending.catch(() => {
      clipFailed = true;
      pauseClip();
      paintStill();
    });
  }

  video.addEventListener("error", () => {
    clipFailed = true;
    pauseClip();
    paintStill();
  });

  return {
    material,
    setSources(still: string | null, clip: string | null) {
      if (still === stillHref && clip === clipHref) return;
      stillHref = still;
      clipHref = clip;
      clipFailed = false;
      blitElapsed = 0;
      pauseClip();
      video.removeAttribute("src");
      video.load();
      loadStill(still);
    },
    setSuspended(next: boolean) {
      suspended = next;
      if (next) pauseClip();
      else texture.needsUpdate = true;
    },
    sync(input: { distance: number; reduced: boolean; dt: number }) {
      const decode = shouldDecodeTv({
        distance: input.distance,
        reduced: input.reduced,
        suspended,
        hidden: document.hidden,
        hasClip: Boolean(clipHref) && !clipFailed,
      });
      if (!decode) {
        if (playing || !video.paused) pauseClip();
        if (!stillPainted) paintStill();
        blitElapsed = 0;
        return;
      }
      if (!playing || video.paused) {
        playing = true;
        playClip();
      }
      blitElapsed += input.dt;
      if (!shouldBlitTv(blitElapsed)) return;
      blitElapsed = 0;
      if (video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      texture.needsUpdate = true;
      stillPainted = false;
    },
    dispose() {
      pauseClip();
      video.removeAttribute("src");
      video.remove();
      texture.dispose();
    },
  };
}
