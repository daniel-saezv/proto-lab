/** Contrato de una aplicación servida. Lo leen el catálogo y el validador. */

export const APP_PERMISSIONS = [
  "camera",
  "microphone",
  "geolocation",
  "accelerometer",
  "gyroscope",
  "magnetometer",
];

export const READY_MS = {
  default: 8000,
  min: 1000,
  max: 60000,
};

/** Topes de la aplicación ya servida (decisión 4), no del puente de assets. */
export const SERVED_APP_LIMITS = {
  maxFiles: 64,
  maxBytesPerFile: 4 * 1024 * 1024,
  maxBytesTotal: 16 * 1024 * 1024,
  jsWarnBytes: Math.round(1.5 * 1024 * 1024),
  jsFailBytes: 4 * 1024 * 1024,
};
