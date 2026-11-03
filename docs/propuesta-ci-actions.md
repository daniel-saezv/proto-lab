# CI: tres shards de Chromium e imagen de Playwright fijada

Decisión del 1 de noviembre de 2026. Se aplica solo el recorte de máquinas por run. Las fases que omitían la CI en commits intermedios, dejaban de remezclar `main` o metían una rama de integración por plan quedan descartadas: añaden complejidad y dificultan saber de dónde vienen los bugs.

## Qué cambió

En [`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

- Chromium pasa de 6 a 3 shards (`E2E (chromium 1/3)` … `3/3`). La misma suite; Playwright reparte los tests. El grupo en serie de recursos privados no se parte entre shards.
- La imagen de Chromium y WebKit queda escrita en el workflow: `mcr.microsoft.com/playwright:v1.64.1-noble`. Los e2e ya no esperan al job que leía la versión del lockfile.
- La compuerta sigue llamándose `E2E (chromium)`. Los checks obligatorios no cambian de nombre: `Typecheck, tests y build`, `E2E (chromium)` y `E2E (webkit-iphone)`.
- El job **Versión Playwright (lockfile)** se queda en esta nota como estaba el 1 de noviembre. El 3 de noviembre de 2026 se quitó: `lab` sale de `verificar` y los e2e esperan a ese job. No lo vuelvas a añadir. La API de protección de `main` no se pudo leer (403); si el check sigue exigido, queda pendiente hasta que el dueño lo quite de la protección.

Al subir `@playwright/test` hay que actualizar el tag. La acción de e2e exige que el CLI del contenedor coincida con el lockfile, y `verificar` sigue comprobando que exista la imagen `-noble` de la versión del lockfile.

El shard más lento del run medido duró 3 min 11 s. Se mantiene en 3 shards.

## Minutos por run

El repo es privado: cada job de `ubuntu-latest` se factura redondeado al minuto superior. Los jobs en paralelo suman. La cifra de abajo es esa duración de la API de Actions (`completed_at - started_at`), sin contar el job omitido de `main`.

Misma suite. Los dos primeros runs son el workflow de 6 shards; el tercero es el de 3 shards y tag fijado.

| Run | Cuándo | Shards | Facturable | Real | Shard más lento | Chromium, facturable |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| [41309033485](https://github.com/daniel-saezv/proto-lab/actions/runs/41309033485) | 12:59 UTC, PR #56 | 6 | 19 min | 14,3 min | 2/6, 168 s | 13 min |
| [41310632700](https://github.com/daniel-saezv/proto-lab/actions/runs/41310632700) | 13:18 UTC, PR #57 | 6 | 21 min | 14,3 min | 2/6, 152 s | 15 min |
| [41311619145](https://github.com/daniel-saezv/proto-lab/actions/runs/41311619145) | 13:30 UTC, PR #58 | 3 | 16 min | 10,8 min | 1/3 y 2/3, 191 s | 10 min |

El run de tres shards baja **5 minutos** frente al de las 13:18 (21 → 16) y **3 minutos** frente al de las 12:59 (19 → 16). El reloj de pared del de las 13:18 fue 2 min 48 s; el de tres shards, 3 min 19 s: cada máquina ejecuta más tests y el shard más lento pasa de unos 2,5 min a 3 min 11 s. La factura baja porque hay tres máquinas menos y el redondeo se cobra menos veces.

En el run de 16 minutos, WebKit fueron 142 s (3 min), typecheck y build 25 s (1), el job de versión 5 s (1) y la compuerta 4 s (1). Esos tres últimos no cambian con el número de shards.
