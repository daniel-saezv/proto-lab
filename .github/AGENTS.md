# AGENTS.md — CI/CD, despliegue e infraestructura

Detalle de workflows, Pages, Access, D1, secretos y tablón. Convenciones de PR y la marca `[skip ci]` están en el [`AGENTS.md`](../AGENTS.md) raíz.

## CI/CD

Workflow [`.github/workflows/ci.yml`](workflows/ci.yml), en `pull_request`, `push` a `main` y `workflow_dispatch`. Concurrencia con `cancel-in-progress` y 20 minutos de tope.

En pull request, `scripts/ci-paths.mjs` clasifica el diff. Si **todos** los archivos caen en `protos/<slug>/**` (la documentación en `docs/`, `README.md`, `AGENTS.md` o `templates/` no cuenta), el modo es `aplicaciones`: `verificar` hace `pnpm generate` y el typecheck, los tests y el build de esas aplicaciones (`.github/scripts/ci-protos.sh`). Si el diff toca `apps/world`, `functions`, `e2e`, `scripts`, `.github` o la configuración de la raíz (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `wrangler.toml`, `.npmrc`, `.nvmrc`, `.node-version`, `.gitignore`), el modo es `completo`. Un `workflow_dispatch` o un push a `main` también es completo. Un diff sin aplicaciones y sin esas rutas (solo documentación) corre typecheck, tests y build del repo, sin e2e.

En pull request, `verificar` corre primero. Si `lab` es true, los jobs de e2e corren en paralelo después (escritorio en shards, móvil de la suite y móvil táctil reducido). Esperar a `verificar` evita un job aparte solo para clasificar el diff (un minuto facturable menos) y alarga el reloj de pared en esa misma duración.

- **`verificar`** (`Typecheck, tests y build`): modo `completo` (typecheck, tests unitarios y build, sin e2e) o modo `aplicaciones` (solo las carpetas tocadas). Publica `lab`, `protos` y `mode`. Ahí también corre la barrera de rutas: si el cuerpo cierra una issue con etiqueta `propuesta` (`Closes #N` y las demás palabras de cierre de GitHub; una mención suelta no cuenta), el diff solo puede tocar un `protos/<slug>/` y, como extra, `pnpm-lock.yaml`. Si la issue no se puede leer, falla en cerrado. Hace falta `issues: read` en el token del workflow.
- **`E2E (chromium 1/3)` … `E2E (chromium 3/3)`**: solo si `lab` es true. Contenedor `mcr.microsoft.com/playwright:v1.64.1-noble` (tag fijado en el workflow; navegadores y deps del sistema en la imagen; `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` en `pnpm install`), luego `pnpm build` y `playwright test --project=chromium --shard=n/3`. Un worker por runner: en los runners de 2 vCPU, SwiftShader se satura si el lobby sigue pintando mientras hay otro WebGL. El grupo en serie de recursos privados no se parte entre shards. Al subir `@playwright/test`, hay que actualizar el tag: la acción de e2e exige que el CLI del contenedor coincida con el lockfile. No hay un job que publique la versión del lockfile: la imagen ya está escrita en el workflow.
- **`E2E (chromium)`**: compuerta que **siempre** informa. Si no toca correr e2e, termina en verde; si un shard falla, falla. El nombre del check obligatorio no cambia. Su duración en la UI es solo el arranque de la compuerta; el tiempo real, cuando corre, es el del shard más lento.
- **`E2E (webkit-iphone trabajo)`**: el móvil táctil de la suite, solo si `lab` es true. Mismo contenedor, sin shard. Construye el sitio en el job.
- **`E2E (webkit-iphone)`**: compuerta con el nombre del check obligatorio. Informa también cuando el trabajo se omite, para que la protección de rama no se quede en pendiente.
- **`E2E (chromium-android)`**: solo si `lab` es true. Un job, sin shard y sin compuerta. Reutiliza el sitio que ya construyó `verificar` y ejecuta solo los tests marcados `@movil` del proyecto homónimo (teléfono alto, entrada táctil). No repite la suite. No es check obligatorio.

En **`verificar`** en modo completo (y en **`Typecheck y unitarios (main)`** en push a `main`), `assert-playwright-docker-image.sh` comprueba con `docker manifest inspect` que exista la imagen `-noble` de esa versión antes de mergear un bump de Playwright sin tag publicado.

En push a `main` solo corre **`Typecheck y unitarios (main)`** (ya no hay job de calentar caché de navegadores Playwright).

Checks obligatorios en el PR: **`verificar`** (en la UI: `Typecheck, tests y build`), **`E2E (chromium)`** y **`E2E (webkit-iphone)`**. En push a `main`, además, **`Typecheck y unitarios (main)`**. **`E2E (chromium-android)`** no es obligatorio: la protección de rama no lo incluye. Un job de e2e omitido por el filtro no sustituye a esas compuertas: el check que mira la protección es la compuerta, y siempre termina.

El lector del catálogo recorre `protos/` sin una lista de slugs. Corre dentro de `pnpm test:unit`, de `pnpm build` y, en el atajo, de `pnpm generate`. El mismo build y el atajo de aplicaciones ejecutan el validador de la aplicación servida (`scripts/app-budget.mjs`: número de archivos, tamaños y la señal `ready`). Convendría añadir un aviso si `dist/` se cuela en el commit.

Sigue la sección **Convenciones para agentes (pull requests)** del [`AGENTS.md`](../AGENTS.md) raíz al hacer push en un PR.

Dependabot vigila `github-actions` y `npm` (semanal, agrupado).

No se despliega desde Actions ni con tokens de Cloudflare. El despliegue es la integración Git de Cloudflare Pages, ya conectada:

- Rama de producción: `main` → `https://proto-lab-3k6.pages.dev`
- Preview por pull request → `https://*.proto-lab-3k6.pages.dev`
- Preset None, comando `pnpm build`, directorio `dist`. El pin de Node es `.nvmrc`: lo leen Pages v3 y `actions/setup-node` (`node-version-file`). El default de la imagen es 22.23.4. `engines` no elige la versión; `engines.node` es el mínimo (`>=` el major de `.nvmrc`) para `engine-strict`. Si el panel todavía tiene `NODE_VERSION`, hay que dejarla en el mismo valor que `.nvmrc` o quitarla.
- Access con PIN de un solo uso en producción y en las previews
- Secreto de Pages: `GITHUB_TOKEN` (fine-grained, solo Issues de lectura y escritura en `daniel-saezv/proto-lab`). Sin valor en el repo.
- Secreto de Pages: `GITHUB_STATUS_TOKEN` (fine-grained **aparte**, solo lectura: Issues, Pull requests, Actions y Contents en este repo). Alimenta `GET /api/proposals/status`. Contents hace falta para el campo GraphQL `files`. No reutilices `GITHUB_TOKEN`.
- Secreto de Pages: `CF_PAGES_READ_TOKEN` (API token con permiso **Cloudflare Pages Read**). Opcional: sin él el tablón sigue funcionando pero no puede marcar `preview_lista` por despliegue.
- Variables de Pages (no secretas): `CF_ACCOUNT_ID`, `CF_PAGES_PROJECT` (p. ej. `proto-lab`), `CF_ACCESS_AUD` (etiqueta AUD de la aplicación Access; no es un secreto, pero sin ella `/api/proposals` responde 401).
- Binding opcional: KV `PROPOSALS`. Sin él no hay límite diario al crear propuestas ni caché del tablón; la Function de estado sigue respondiendo.
- No definir `ALLOW_DEV_AUTH` en Pages.

**Datos en D1.** El binding se llama `DB` (`env.DB`). Si un despliegue no lo trae, la API responde 503 `config`. Los datos de una persona siguen en `localStorage`. D1 guarda lo que ven todas las sesiones de un slug: la tabla del laboratorio `lab_shared_entries` (capacidad `shared`) y, si la app declara `tables`, las tablas con el prefijo de su slug. La lista de slugs con `shared` la genera `pnpm generate` en `functions/_lib/shared-slugs.json`. Las consultas declaradas van a `functions/_lib/table-queries.json`. Ninguno de los dos se versiona.

Las bases ya existen, vacías hasta que corra el workflow, y los ids están en `wrangler.toml`. Producción: `[[d1_databases]]`, base `proto-lab-shared`, id `7f6608b2-bb75-44ba-b240-60d6cff51794`. Previews: `[[env.preview.d1_databases]]`, base `proto-lab-shared-preview`, id `797b147d-e5c7-4198-a20e-fe378758217a`. El bloque de preview repite el KV `PROPOSALS` (`80ac94ce81e8459fb3882e9fe2a68330`): al declarar un binding que no se hereda hay que repetir los demás. El nombre del binding es `DB` en los dos entornos.

[`.github/workflows/d1-app-tables.yml`](workflows/d1-app-tables.yml) aplica `migrations/` (la `0001` crea `lab_shared_entries`) y las migraciones de cada app con `tables`. En cada pull request escribe en la base de preview; al mergear a `main`, en la de producción. No crea bases ni cambia `wrangler.toml`. Si una app con `tables` desaparece respecto a la base del PR, o respecto al `main` anterior al merge, borra solo las tablas de ese slug. El seguimiento es por archivo y checksum, así que repetir el job no vuelve a aplicar lo mismo. El contrato de altas, cambios y bajas está en [`docs/contrato-tablas.md`](../docs/contrato-tablas.md).

Secreto de Actions (no de Pages): `CLOUDFLARE_D1_TOKEN`. Permiso único: Account → D1 → Edit, en la cuenta del laboratorio. Sin Pages, sin Workers y sin ningún otro permiso. Si falta el secreto, el token no autentica o la base no es visible, el job lo dice y termina en verde sin cambiar nada. `CLOUDFLARE_ACCOUNT_ID` es el identificador de cuenta que ya usa la limpieza de previews; solo hace falta si ese token no puede listar la cuenta. No es un permiso del token.

Workers Free: al pasar el cupo diario de filas leídas o escritas, o el de almacenamiento, D1 falla y no cobra. La Function traduce ese error a `quota` y no reintenta. El workflow de migraciones también falla y no reintenta. No actives un plan de pago para saltarte el cupo.

**Limpieza de previews (GitHub Actions):** el workflow [`.github/workflows/cleanup-pages-previews.yml`](workflows/cleanup-pages-previews.yml) borra despliegues *preview* en Cloudflare Pages (API `DELETE …/deployments/{id}?force=true`). Al cerrar un PR elimina todos los previews de esa rama. Un cron semanal y un barrido manual (`sweep`) quitan previews cuya rama ya no existe en el remoto o con más de 14 días (configurable). El modo manual `purge-all-previews` (vía `workflow_dispatch`) sirve para una limpieza inicial: borra todos los previews salvo los de ramas con PR abierta; no toca producción ni la rama `main`. Secretos del repositorio (Actions): `CLOUDFLARE_API_TOKEN` (permiso Account → Cloudflare Pages → **Edit**) y `CLOUDFLARE_ACCOUNT_ID`. Si faltan, el job avisa y termina en verde sin borrar nada. En `workflow_dispatch`, usa primero `dry_run: true` (sobre todo con `purge-all-previews`) y luego repite con `dry_run: false`.

El único workflow que mira issues es el aviso al Grok Bot: al crear una issue y al etiquetar `aprobado` por el dueño ([`.github/workflows/aprobado-webhook.yml`](workflows/aprobado-webhook.yml)). No implementa la propuesta ni lee el título o el cuerpo. Hacen falta dos secretos del repositorio, sin valores en el código: `GROKBOT_WEBHOOK_URL` y `GROKBOT_WEBHOOK_AUTH` (el valor entero de `Authorization`, sin que el workflow le anteponga `Bearer`). Si faltan, el job termina en aviso y no falla.

### Tablón de propuestas (`GET /api/proposals/status`)

Detrás de Cloudflare Access igual que `POST /api/proposals`: valida el JWT `Cf-Access-Jwt-Assertion` (firma RS256 contra `https://ancient-waterfall-b3eb.cloudflareaccess.com/cdn-cgi/access/certs`, emisor de ese equipo y audiencia). No usa `Cf-Access-Authenticated-User-Email`. Hace falta la variable de Pages **`CF_ACCESS_AUD`** (etiqueta AUD; varias separadas por comas si producción y las previews son aplicaciones distintas). Sin ella la Function responde 401. En local, `ALLOW_DEV_AUTH=true` y `X-Dev-User-Email` solo valen en loopback (nunca en Pages). Solo **GET** (405 en otros métodos).

**Datos:** una consulta GraphQL agrupa issues (abiertas y cerradas con `propuesta`), timelines (etiquetado y cross-reference) y pulls con el check suite de `ci.yml` sobre el HEAD. El contrato no cambia. `aprobada` solo si el dueño (@daniel-saezv) puso `aprobado`. La PR de la propuesta es la que cierra la issue o toca `protos/<slug>/` (la más reciente entre esas); una PR posterior que solo cita `#N` no la sustituye. Si no hay ninguna así, vale la mención más reciente de la timeline o, en respaldo, del cuerpo. CI es el workflow `ci.yml`, no un check suelto de un job. La preview es el alias de rama de **esa** PR, y solo si el último despliegue correcto de esa rama es su head. `publicada` = PR mergeado y despliegue de producción del merge commit con éxito (o PR mergeado si no hay despliegue). Si GitHub o Cloudflare fallan, responde lo que pueda con `partial: true` y la fase más fiable posible, sin filtrar detalles del error al cliente. Un fallo de GitHub no se escribe en la caché.

**Fases** (prioridad creciente; gana la más avanzada salvo `cerrada_sin_hacer`, que gana si la issue se cerró como `not_planned` o el PR se cerró sin merge): `recibida` → `aprobada` → `en_curso` → `pr_abierto` → `ci_en_curso` → `ci_con_fallos` → `ci_correcta` → `preview_lista` → `publicada` → `cerrada_sin_hacer`.

**Respuesta JSON:** `{ ok: true, partial?: boolean, items: [{ number, title, kind, slug?, phase, updatedAt, previewUrl? }] }`. Título escapado y truncado (80 caracteres). `previewUrl` solo en `preview_lista` (subdominio `*.proto-lab-3k6.pages.dev`) o en `publicada` (producción). **No** se exponen emails, cuerpos, ramas, logs, mensajes de commit ni enlaces a GitHub.

**Caché:** KV `PROPOSALS` es el mismo namespace en producción y en las previews. La clave lleva el entorno: `proposal-status:v7:production` en `main`, `proposal-status:v7:preview:<rama>` en cada preview y `proposal-status:v7:local` sin rama de Pages. Una preview no reescribe el tablón de producción. Una lectura buena se sirve **120 s** y se guarda 24 h para poder repetirla si GitHub falla; un fallo o un `partial` no se escriben. Crear una propuesta borra solo la clave de ese entorno. Sin binding, sin caché. Las claves públicas de Access se cachean una hora (memoria del isolate y Cache API).

**Pull requests de propuestas:** el cuerpo del PR debe citar siempre el número de su issue (p. ej. `Closes #N` en propuestas aprobadas implementadas) para que el tablón enlace issue y PR.
