-- Datos compartidos de las aplicaciones. Una fila por slug y clave.
-- El binding de Pages se llama DB. La Function no acepta SQL de la aplicación.
-- Cupos que aplica la Function: 32 claves, 32768 bytes por valor, 262144 bytes por slug.
-- Workers Free: si D1 pasa el cupo, la consulta falla y no hay cargo.

CREATE TABLE IF NOT EXISTS shared_entries (
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 40),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 64),
  value TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes >= 0 AND bytes <= 32768 AND bytes = length(CAST(value AS BLOB))),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 40),
  PRIMARY KEY (slug, key)
);
