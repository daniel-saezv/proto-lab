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

/** Topes de la aplicación ya servida (decisión 4). El cargador de rutas usa las mismas cifras y 128 peticiones. */
export const SERVED_APP_LIMITS = {
  maxFiles: 64,
  maxBytesPerFile: 4 * 1024 * 1024,
  maxBytesTotal: 16 * 1024 * 1024,
  jsWarnBytes: Math.round(1.5 * 1024 * 1024),
  jsFailBytes: 4 * 1024 * 1024,
};
