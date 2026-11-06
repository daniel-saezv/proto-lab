# Proto Lab

Laboratorio privado de prototipos para un grupo de amigos. La propia app es un mundo 3D pequeño: las máquinas son prototipos y con el Inventor se proponen ideas nuevas o mejoras. Cada prototipo es una web estática que se abre a pantalla completa dentro de la app.

Producción: [https://proto-lab-3k6.pages.dev](https://proto-lab-3k6.pages.dev). Las previews de cada pull request salen en `https://*.proto-lab-3k6.pages.dev`. Los dos hostnames están detrás de Cloudflare Access con PIN de un solo uso.

## Qué hay dentro

Entras al laboratorio, caminas y te acercas a una máquina. Al usarla, la aplicación ocupa la pantalla en un iframe del mismo origen (`/protos/<slug>/`). El laboratorio suelta su WebGL mientras la aplicación está abierta. Volver avisa a la aplicación, cierra el iframe y reconstruye el mundo donde estabas.

El Inventor pregunta, resume y pide confirmación. Al confirmar, una Pages Function crea una issue en este repositorio. El texto del amigo va citado como petición de producto. Eso avisa al Grok Bot para que el dueño pueda revisarla en el chat. Solo el dueño (@daniel-saezv) añade la etiqueta `aprobado`; entonces el bot comprueba en GitHub que la puso el dueño, marca la issue como `en-curso` y lanza un agente de Cursor. El agente abre un pull request con preview. El merge lo hace el dueño a mano.

## Desarrollo

Hace falta el Node de `.nvmrc` (ahora 26) y pnpm 12.17.0 (`packageManager` en `package.json`). `engines.node` es `>=` ese major: pnpm no lee `.nvmrc`. Los workflows usan `node-version-file` y no repiten el número. Node 26 no trae Corepack.

```sh
npm install -g corepack
corepack enable
corepack prepare pnpm@12.17.0 --activate
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm build
pnpm preview
```

`pnpm preview` sirve el sitio en `http://127.0.0.1:4173`. `pnpm dev` regenera el catálogo, construye los prototipos y arranca el laboratorio con recarga.

`pnpm test:unit` ejecuta Vitest sobre el laboratorio (tablón, catálogo, navegación, validación alineada con la Function, etc.) y tests de `functions/_lib`. `pnpm test:e2e` abre el mundo, completa una propuesta con la Function simulada y lanza el prototipo de ejemplo (flujo habitual en CI; cuándo conviene en local: [`AGENTS.md`](AGENTS.md)). `pnpm typecheck` comprueba los tipos.

### Commits en pull requests

Convención canónica para agentes y colaboradores: **[`AGENTS.md` — Convenciones para agentes (pull requests)](AGENTS.md#convenciones-para-agentes-pull-requests)** (`[skip ci]` en commits intermedios; el último commit del PR sin marca para CI y preview de Pages).

## Añadir una aplicación

Crea `protos/<slug>/` a partir de una de las dos plantillas (cópias, no las importes):

- Código: [`templates/aplicacion/`](templates/aplicacion/LEEME.md). Vite + TypeScript, `package.json` y `base` en `/protos/<slug>/`.
- Export estático: [`templates/export-estatico/`](templates/export-estatico/LEEME.md). Shell HTML para un build ya hecho. Sin Vite y sin `package.json`.

El `proto.json` lleva:

- `slug` igual al nombre de la carpeta
- `title`, `description`, `author` (email o alias), `date` (`AAAA-MM-DD`)
- `tags`, `cover` (archivo en la misma carpeta, o `null`)
- `version` y `history` (la versión actual tiene que aparecer en el historial)
- opcional: `"readyMs"` (plazo de arranque, por defecto 8000 ms) y `"capabilities"` (`save`, `wasm`, `shared`, `tables` y permisos de dispositivo; ver [`AGENTS.md`](AGENTS.md)). `"permissions"` sigue valiendo como lista de dispositivos.
- opcional: `"assets": ["media/foo.png", …]` — puente heredado de recursos declarados (64 rutas, 4 MiB, 16 MiB; ver [`AGENTS.md`](AGENTS.md))

No hace falta registrar la carpeta en la raíz. `pnpm build` lee los manifiestos que hay en `protos/`, publica el laboratorio en `/` y cada aplicación en `/protos/<slug>/`. El mundo coloca una máquina por manifiesto. Crea también la etiqueta de GitHub con el slug para que las iteraciones puedan llevarla.

Al abrirla, el laboratorio carga `/protos/<slug>/` en un iframe del mismo origen, sin `sandbox` y sin documento `blob:`. La aplicación avisa `alive` al cargar y `ready` cuando el primer fotograma ya se ve; hasta entonces una capa tapa el iframe. `window.__protoLabApp.stop()` es obligatorio: al cerrar, el laboratorio lo llama, pasa el iframe a `about:blank` y lo quita. El contrato (señales, permisos, topes de la aplicación servida y las dos plantillas) está en [`AGENTS.md`](AGENTS.md).

Si Access devuelve la página del PIN en vez de la aplicación, no se monta el iframe y queda el aviso con Volver. En producción y en las previews, la aplicación de Access tiene que permitir iframes (`allow_iframe`); lo activa el dueño en el dashboard. En local no hay Access. La aplicación pide imágenes, audio y JSON bajo `/protos/<slug>/` con `window.__protoLabData`. Si declara `save`, guarda los datos de una persona en el `localStorage` del laboratorio (`proto-lab:app:<slug>`). Si declara `wasm`, la CSP de esa ruta permite instanciar WebAssembly. El atributo `allow` del iframe solo lleva permisos de dispositivo de la lista cerrada. Si declara `shared`, `sharedGet` / `sharedSet` / `sharedRemove` leen y escriben un dato común a todas las sesiones, en D1, por `POST /api/apps/<slug>/shared`. Si declara `tables`, `query(nombre, params)` ejecuta solo las consultas de `protos/<slug>/db/queries.json`. El contrato está en [`docs/contrato-tablas.md`](docs/contrato-tablas.md). No hay hilos ni `SharedArrayBuffer`, y los formularios no se envían. Abrir `/protos/<slug>/` en una pestaña sigue funcionando.

`pnpm previews` captura la vista de cada aplicación, con canvas o sin él, y no depende de un gancho concreto. Si existe `window.__protoLabPreview`, lo llama antes de la foto.

## Cloudflare Pages

El proyecto ya está conectado al repositorio. No hace falta cambiar el build:

| Ajuste | Valor |
| --- | --- |
| Rama de producción | `main` |
| Preset | None |
| Comando de build | `pnpm build` |
| Directorio de salida | `dist` |
| Node.js | el contenido de `.nvmrc` (ahora `26`) |

Pages v3 instala esa versión (cualquier versión, también posterior al default 22.23.4 de la imagen). No usa `engines`. Si el panel todavía tiene `NODE_VERSION`, hay que dejarla en el mismo valor que `.nvmrc` o quitarla: esa variable también fija el Node del build.

`pnpm build` genera el catálogo, construye el laboratorio y los prototipos, y deja el sitio estático en `dist`. Pages instala las dependencias antes, a partir de `pnpm-lock.yaml`. Las Functions no van dentro de `dist`: Pages las toma de `functions/` en la raíz del repositorio (`/api/proposals` y `/api/proposals/status`).

Hostnames:

- Producción: `proto-lab-3k6.pages.dev`
- Previews: `*.proto-lab-3k6.pages.dev`

Access con PIN de un solo uso cubre los dos. La Function valida el JWT `Cf-Access-Jwt-Assertion` con las claves de `ancient-waterfall-b3eb.cloudflareaccess.com` y la variable `CF_ACCESS_AUD` (etiqueta AUD de la aplicación). No basta la cabecera de email. No definas `ALLOW_DEV_AUTH` en Pages: es solo para probar la Function en local, y solo en loopback.

Los datos compartidos y las tablas por aplicación usan el binding D1 `DB`. Las bases ya existen: `proto-lab-shared` en producción (`7f6608b2-bb75-44ba-b240-60d6cff51794`) y `proto-lab-shared-preview` en las previews (`797b147d-e5c7-4198-a20e-fe378758217a`). Los ids están en `wrangler.toml`, y el bloque de preview repite el KV `PROPOSALS`. La migración [`migrations/0001_lab_shared_entries.sql`](migrations/0001_lab_shared_entries.sql) la aplica [`.github/workflows/d1-app-tables.yml`](.github/workflows/d1-app-tables.yml) cuando existe el secreto de Actions `CLOUDFLARE_D1_TOKEN` (solo el permiso Account → D1 → Edit). En el plan Free, pasar el cupo de D1 hace fallar la petición y no genera cargo. El detalle está en [`AGENTS.md`](AGENTS.md).

La app solo se sirve en esos hostnames. `Access-Control-Allow-Origin: *` en `/protos/*` no basta para saltarse Access: sin la cookie, el PIN sigue delante. El iframe es del mismo origen, así que viaja con la cookie de quien ya entró. Además, la aplicación de Access tiene que permitir enmarcar (`allow_iframe`); si no, producción y las previews pueden mostrar el PIN dentro del arcade.

En Pages, el secreto `GITHUB_TOKEN` (fine-grained, solo Issues de lectura y escritura en este repositorio) y el binding KV `PROPOSALS` (límite de 5 propuestas por email y día UTC, y caché del tablón 120 s) ya están configurados en producción y en preview.

Para el tablón (`GET /api/proposals/status`) hace falta además el secreto **`GITHUB_STATUS_TOKEN`** (fine-grained aparte, solo lectura: Issues, Pull requests, Actions y Contents en este repo), opcionalmente **`CF_PAGES_READ_TOKEN`** (API token con permiso Cloudflare Pages Read) y las variables **`CF_ACCOUNT_ID`** y **`CF_PAGES_PROJECT`** (`proto-lab`). Contents permite leer `files` en GraphQL. Sin el token de Cloudflare el endpoint sigue respondiendo, pero no puede marcar preview por despliegue.

En el laboratorio 3D, la **pizarra** muestra en vivo el estado de las propuestas (mismo origen que `GET /api/proposals/status`). Sin WebGL, el fallback HTML incluye una versión plana del tablón. Los pull requests de propuestas deben citar su issue en el cuerpo (`Closes #N`).

Las etiquetas del flujo de propuestas (`propuesta`, `iteracion`, `aprobado`, `en-curso` y una por slug de prototipo) están creadas en GitHub; su significado y quién las pone está en [`.github/LABELS.md`](.github/LABELS.md). Solo el dueño (@daniel-saezv) añade `aprobado`.

Quien entre a producción o a una preview tiene que superar la política de Access (PIN de un solo uso). El email con el que pasen Access es el que la Function escribe en la issue.

El aviso al Grok Bot usa dos secretos del repositorio (Settings → Secrets and variables → Actions), nunca en el código: `GROKBOT_WEBHOOK_URL` (URL del webhook) y `GROKBOT_WEBHOOK_AUTH` (valor completo de la cabecera `Authorization`, sin prefijo `Bearer` añadido por el workflow). Si faltan, [`.github/workflows/aprobado-webhook.yml`](.github/workflows/aprobado-webhook.yml) no falla: emite un aviso y no envía nada. El workflow corre al abrir una issue y cuando el dueño pone `aprobado`; otras etiquetas o un `aprobado` de otra cuenta no disparan el aviso de aprobación.

**Limpieza de previews:** [`.github/workflows/cleanup-pages-previews.yml`](.github/workflows/cleanup-pages-previews.yml) elimina despliegues preview acumulados en Pages (proyecto `proto-lab`). Necesita secretos `CLOUDFLARE_API_TOKEN` (Pages **Edit**) y `CLOUDFLARE_ACCOUNT_ID`. Limpieza inicial: Actions → *Limpiar previews de Pages* → `mode: purge-all-previews`, `dry_run: true`, revisar el log; luego el mismo run con `dry_run: false`.

## Instalar la PWA

Hay que abrir [https://proto-lab-3k6.pages.dev](https://proto-lab-3k6.pages.dev), superar el PIN y, desde esa misma origen, añadirla a la pantalla de inicio. Si se instala otro hostname, Access puede volver a pedir el PIN o no coincidir la sesión.

- **iPhone o iPad:** Safari, compartir, «Añadir a pantalla de inicio».
- **Android:** Chrome, menú, «Instalar aplicación» o «Añadir a pantalla de inicio».

La app cachea la carcasa del laboratorio y los assets del mundo. Los prototipos se piden siempre a la red.
