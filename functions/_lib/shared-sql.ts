/**
 * Sentencias fijas. Los datos de la aplicación solo entran por `bind`.
 * El INSERT es una sola sentencia: el cupo de claves y de bytes se decide ahí.
 */
export const SHARED_SQL = {
  get: "SELECT value FROM shared_entries WHERE slug = ?1 AND key = ?2",
  delete: "DELETE FROM shared_entries WHERE slug = ?1 AND key = ?2",
  upsert: `INSERT INTO shared_entries (slug, key, value, bytes, updated_at)
SELECT ?1, ?2, ?3, ?4, ?5
WHERE (
  EXISTS (SELECT 1 FROM shared_entries WHERE slug = ?1 AND key = ?2)
  OR (SELECT COUNT(*) FROM shared_entries WHERE slug = ?1) < ?6
)
AND (
  COALESCE((SELECT SUM(bytes) FROM shared_entries WHERE slug = ?1), 0)
  - COALESCE((SELECT bytes FROM shared_entries WHERE slug = ?1 AND key = ?2), 0)
  + ?4
) <= ?7
ON CONFLICT (slug, key) DO UPDATE SET
  value = excluded.value,
  bytes = excluded.bytes,
  updated_at = excluded.updated_at
RETURNING key`,
} as const;
