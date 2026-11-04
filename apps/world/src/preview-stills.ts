/**
 * Una descarga por foto y por página.
 * La máquina y la tele comparten el mismo `Image`: la rotación no vuelve a pedir la URL.
 * Sirve igual en Chrome, Samsung Internet, WebKit y escritorio: no depende de
 * Cache-Control ni de un prefijo de ningún motor. La imagen es del mismo origen,
 * así que la cookie de Access viaja con la petición normal.
 */
export type StillLoader = (href: string) => Promise<HTMLImageElement | null>;

export function createStillCache(load: StillLoader) {
  const pending = new Map<string, Promise<HTMLImageElement | null>>();
  return {
    load(href: string) {
      const existing = pending.get(href);
      if (existing) return existing;
      const job = load(href);
      pending.set(href, job);
      return job;
    },
    preload(hrefs: readonly string[]) {
      for (const href of hrefs) void this.load(href);
    },
  };
}

function loadWithImage(href: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image.naturalWidth > 0 ? image : null);
    image.onerror = () => resolve(null);
    image.src = href;
  });
}

const browserStills = createStillCache(loadWithImage);

export function loadPreviewStill(href: string): Promise<HTMLImageElement | null> {
  return browserStills.load(href);
}

export function preloadPreviewStills(hrefs: readonly string[]) {
  browserStills.preload(hrefs);
}
