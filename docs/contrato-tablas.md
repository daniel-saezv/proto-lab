# Tablas por aplicación

Una aplicación sencilla sigue con `shared`: una clave y un valor de texto en la tabla del laboratorio. Una aplicación con varias tablas declara `tables`, deja el SQL en el repositorio y pide las consultas por nombre.

El navegador no envía SQL. `window.__protoLabData.query(nombre, params)` hace `POST /api/apps/<slug>/query` con `{ "name", "params" }`. La Function solo ejecuta la sentencia declarada en `protos/<slug>/db/queries.json`, con los parámetros enlazados. Si D1 pasa el cupo gratuito, la petición responde `quota` y no se reintenta ni se cobra.

## De quién es cada tabla

`lab_shared_entries` es la tabla del laboratorio. La usa `POST /api/apps/<slug>/shared`. Lleva slug, clave, valor (texto; puede ser JSON serializado), tamaño y fecha. No tiene índices ni columnas de más.

Las tablas de una aplicación llevan el prefijo del slug, con los guiones cambiados por `_` y un `__` detrás: `mesa-roja` escribe `mesa_roja__notas`. El `__` evita que `ab` y `ab-c` compartan prefijo. Una aplicación no nombra `lab_*`, `proto_lab_*`, `sqlite_*`, `d1_*` ni `shared_entries`.

La evolución de `lab_*` va por migraciones numeradas en `migrations/` (`0001_lab_shared_entries.sql` y las que se añadan). No se edita una migración ya aplicada: se añade otro archivo. El workflow no borra tablas `lab_*`.

## Crear una aplicación con tablas

1. En `proto.json`, añade `tables` a `capabilities`. No hace falta una aplicación real de ejemplo en este repositorio: las plantillas no la declaran.
2. Crea `protos/<slug>/db/0001_nombre.sql`. Solo `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` o `ALTER TABLE … ADD COLUMN`. El nombre de la tabla empieza por el prefijo del slug.
3. Crea `protos/<slug>/db/queries.json`. Cada consulta tiene `sql` y `params` (nombres, en el orden de `?1`, `?2`, …). Una sola sentencia. Un `SELECT` lleva `LIMIT` literal entre 1 y 50. `UPDATE` y `DELETE` llevan `WHERE`.
4. Desde la aplicación: `await window.__protoLabData.query("top10", {})`. Los valores son string, número finito o `null`.

`db/` no se publica. El ensamblado la salta y el validador de la aplicación servida rechaza un `.sql` o una carpeta `db/` en lo que llega al navegador.

Cambiar el esquema es un archivo nuevo (`0002_….sql`). No se reescribe ni se borra una migración que ya esté en `main` y aplicada. Quitar la capacidad `tables`, o quitar la aplicación, hace que el workflow borre solo las tablas de ese slug: en la preview, si estaban en la base del PR y ya no están en la rama; en producción, al mergear a `main`. La base de preview es una sola para todas las PR: no se borran las tablas de otra PR que no estén en ese diff.

## Qué aplica el workflow

[`.github/workflows/d1-app-tables.yml`](../.github/workflows/d1-app-tables.yml) corre en cada pull request (base `proto-lab-shared-preview`) y al mergear a `main` (base `proto-lab-shared`). Aplica las migraciones de `migrations/` y las de cada app con `tables`, y anota en `proto_lab_migrations` el archivo y su checksum. La segunda vez no vuelve a ejecutarlas. Si el checksum de una migración ya aplicada no coincide, el job falla.

No crea bases ni escribe bindings. Las bases ya existen y los ids están en `wrangler.toml`:

| | Producción | Previews |
| --- | --- | --- |
| Base | `proto-lab-shared` | `proto-lab-shared-preview` |
| Id | `7f6608b2-bb75-44ba-b240-60d6cff51794` | `797b147d-e5c7-4198-a20e-fe378758217a` |
| Binding | `DB` | `DB` |

El bloque de preview repite el KV `PROPOSALS` (`80ac94ce81e8459fb3882e9fe2a68330`) porque esos bindings no se heredan. La migración `0001` la aplica este workflow cuando el secreto existe; no hace falta ejecutarla a mano.

## Secreto

Nombre: `CLOUDFLARE_D1_TOKEN`, en GitHub → Settings → Secrets and variables → Actions (no es un secreto de Pages).

Permiso único del token: **Account → D1 → Edit**, en la cuenta del laboratorio. Sin Pages, sin Workers y sin ningún otro permiso.

Si el secreto no está, el token no autentica o la base no es visible, el job lo dice y termina en verde sin cambiar nada. Si D1 responde que se pasó el cupo gratuito, el job falla y no reintenta.

`CLOUDFLARE_ACCOUNT_ID` es el mismo identificador de cuenta que ya usa la limpieza de previews. Solo hace falta si el token no puede listar cuentas. No es un permiso extra.

## Cupos

Por aplicación: 16 migraciones, 8 tablas, 16 índices, 32 consultas. Cada consulta devuelve como mucho 50 filas y 32 KiB. El cuerpo de la petición cabe en 48 KiB. Ocho parámetros como máximo; cada string, 2 KiB. El validador del catálogo (`pnpm generate`, la CI) rechaza `ATTACH`, `PRAGMA`, `DROP`, transacciones, vistas, triggers y el resto de SQL que no sea el de una consulta declarada o una migración de esquema.
