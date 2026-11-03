/** Contrato de una aplicación servida. Lo leen el catálogo y el validador. */

/** Capacidades que no son un permiso de dispositivo. */
export const APP_FEATURES = ["save", "wasm", "shared", "tables"];

/** Permisos de dispositivo. Lista cerrada: el atributo `allow` solo sale de aquí. */
export const APP_PERMISSIONS = [
  "camera",
  "microphone",
  "geolocation",
  "accelerometer",
  "gyroscope",
  "magnetometer",
];

/** Lista cerrada de `capabilities`. El orden es el canónico del catálogo y de `allow`. */
export const APP_CAPABILITIES = [...APP_FEATURES, ...APP_PERMISSIONS];

export const READY_MS = {
  default: 8000,
  min: 1000,
  max: 60000,
};

/**
 * Topes de la aplicación ya servida (fase 4, 2026-11-03).
 * El cargador de rutas sigue en 4 MiB / 16 MiB: esas cifras viven en
 * `scripts/asset-path.mjs` y en las plantillas, no aquí.
 * `pagesMaxBytes` es el fallo duro de Cloudflare Pages, aparte del tope por archivo.
 */
export const SERVED_APP_LIMITS = {
  maxFiles: 64,
  maxBytesPerFile: 12 * 1024 * 1024,
  maxBytesTotal: 32 * 1024 * 1024,
  pagesMaxBytes: 25 * 1024 * 1024,
  jsWarnBytes: Math.round(1.5 * 1024 * 1024),
  jsFailBytes: 4 * 1024 * 1024,
  /** Imagen o audio servidos. El wasm y el pck siguen en `maxBytesPerFile`. */
  mediaFailBytes: Math.round(1.5 * 1024 * 1024),
};
