# Tecnologías que no están activas

Decisión del 3 de noviembre de 2026. Workers AI, R2, Durable Objects e Images no se activan. No hay bindings en `wrangler.toml`, ni capability nueva, ni código que los llame. La cuenta sigue en Workers Free. Esta nota dice cuándo entrarían y cómo, para no improvisarlo en un prototipo.

Un agente que implementa una aplicación no edita `functions/` ni `wrangler.toml`. Activar cualquiera de estas piezas es una decisión del dueño, en un cambio aparte.

## Workers AI

No está activo. Si el dueño lo aprueba más adelante, el diseño es este:

- Capability nueva `ai`, del mismo estilo que `tables`: lista cerrada, el navegador no elige el modelo y el SQL no sale del repo. Hoy `ai` no está en `scripts/app-contract.mjs`.
- La Function identifica a la persona con el JWT de Cloudflare Access. El identificador del modelo vive en el repositorio. Hay un tope de caracteres por llamada. Si se pasa el cupo, la respuesta es `quota` y no se reintenta.
- Solo modelos pequeños del plan Free. El recomendado, si llega a activarse, es `@cf/ibm-granite/granite-4.0-h-micro` (1542 neuronas por millón de tokens de entrada y 10158 de salida: unas 2,8 neuronas para 500 de entrada y 200 de salida). Un 70B (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, 26668 / 204805 por millón) gasta el día en unas 40 llamadas.
- Workers Free incluye 10 000 neuronas al día. Al pasarlas, la llamada falla y no cobra ([precios de Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/), página con fecha 20 de octubre de 2026). Workers Paid factura 0,011 USD por cada 1 000 neuronas por encima de 10 000. No se añade un método de pago ni crédito prepago de AI Gateway.
- Modelos que exigen plan de pago, y que no se usarían: `@cf/moonshotai/kimi-k2.6`, `kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `glm-5.3`, `glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4-flash-0731`, `deepseek-v4.1-flash-1017`, `deepseek-v4-pro-0813`. El aviso de que algunos modelos pasan a exigir plan de pago está en el [changelog del 28 de julio de 2026](https://developers.cloudflare.com/changelog/post/2026-07-28-workers-ai-models/).
- Cada llamada también gasta una petición de Worker. El plan Free son 100 000 peticiones al día y 10 ms de CPU; la espera de red, KV o D1 no cuenta como CPU ([límites de Workers](https://developers.cloudflare.com/workers/platform/limits/)).

## R2

No hay bucket. Entraría solo si un archivo no cabe en los 25 MiB de Pages ni después de Brotli. El plan Standard gratuito da 10 GB-mes, 1 millón de operaciones de clase A y 10 millones de clase B, con salida gratis. Infrequent Access no tiene capa gratuita ([precios de R2](https://developers.cloudflare.com/r2/pricing/), 30 de octubre de 2026).

Si se activa: dos buckets (producción y preview), un token que el agente no ve, y un job que solo corre en push a `main`. No desde el pull request.

## Durable Objects

No hay Durable Objects. El plan Free da 100 000 peticiones al día y 13 000 GB-s al día, solo con backend SQLite. La hibernación no factura la duración, pero `setTimeout` y `setInterval` impiden hibernar ([precios](https://developers.cloudflare.com/durable-objects/platform/pricing/), 18 de octubre de 2026; [hibernación de WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)). Entrarían para un estado en vivo entre sesiones que D1 no cubre. Hasta entonces, el dato compartido sigue en D1.

## Images

No hay Cloudflare Images. El plan Free transforma 5 000 imágenes únicas al mes y después responde el error 9422, sin cobrar. El almacenamiento es de pago ([precios de Images](https://developers.cloudflare.com/images/pricing/), 19 de octubre de 2026). Las imágenes de una aplicación se quedan en el prototipo y pasan por el puente, con el tope de 1,5 MiB del build.

## Lo que sí está

D1, binding `DB`, en el plan Free: 5 millones de filas leídas al día, 100 000 escritas, 5 GB en la cuenta y 500 MB por base. Al pasarse, falla y no cobra ([precios de D1](https://developers.cloudflare.com/d1/platform/pricing/)). El contrato de tablas está en [`docs/contrato-tablas.md`](contrato-tablas.md). `wrangler d1 execute … --local` no necesita token; el remoto sí, y el agente no lo tiene. El validador `scripts/table-sql.mjs` basta para escribir migraciones.
