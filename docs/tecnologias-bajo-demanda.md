# Tecnologías que no están activas

Decisión del 3 de noviembre de 2026, actualizada cuando el taller del Inventor pasó a usar Workers AI. R2, Durable Objects e Images siguen apagados. La cuenta sigue en Workers Free. Una aplicación no declara ni llama a ninguno de estos productos.

Un agente que implementa una aplicación no edita `functions/` ni `wrangler.toml`. El taller es parte del laboratorio, no de un `protos/<slug>/`.

## Workers AI

Activo solo para el taller del Inventor (`POST /api/workshop`). El binding se llama `AI` y está en `wrangler.toml` (producción y preview: `ai` no se hereda). No hay capability `ai` en `scripts/app-contract.mjs`: una aplicación no puede pedir el modelo.

- Modelo: `@cf/meta/llama-3.1-8b-instruct-fp8-fast` (4119 neuronas por millón de tokens de entrada y 34868 de salida, tabla de precios del 20 de octubre de 2026). La ficha del modelo responde que no está disponible; el id que se factura sigue siendo ese. El modo JSON de Workers AI devuelve `response` ya como objeto. Ese id no está en la lista de modelos con modo JSON: si el texto no se puede leer, hay un solo reintento, sin `response_format` y con la orden de contestar solo el objeto. El reintento reserva otras neuronas. El log es el tipo de error o la forma del payload (claves y tipo de `response`), nunca la nota ni el correo.
- La Function identifica a la persona con el JWT de Cloudflare Access. El navegador no elige el modelo ni reenvía la conversación. La nota del amigo entra como dato, no como orden.
- No hay cupo por persona. El único tope, aparte del de propuestas, es 8000 neuronas globales al día. Si se llena, la respuesta lleva `restore` y el laboratorio vuelve a enseñar la nota tal como la escribió el amigo. La sesión de una charla vive en KV como mucho 15 minutos y se borra al terminar o al abandonar. No hay historial durable.
- Workers Free incluye 10 000 neuronas al día. Al pasarlas, la llamada falla y no cobra ([precios de Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/), página con fecha 20 de octubre de 2026). Workers Paid factura 0,011 USD por cada 1 000 neuronas por encima de 10 000. No se añade un método de pago ni crédito prepago de AI Gateway. El tope del taller (8000) queda por debajo del diario gratuito.
- Modelos que exigen plan de pago, y que no se usan: `@cf/moonshotai/kimi-k2.6`, `kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `glm-5.3`, `glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4-flash-0731`, `deepseek-v4.1-flash-1017`, `deepseek-v4-pro-0813`. El aviso de que algunos modelos pasan a exigir plan de pago está en el [changelog del 28 de julio de 2026](https://developers.cloudflare.com/changelog/post/2026-07-28-workers-ai-models/).
- Cada llamada también gasta una petición de Worker. El plan Free son 100 000 peticiones al día y 10 ms de CPU. La espera de una subpetición (fetch, KV o el binding de Workers AI) no cuenta como CPU: el CPU es el tiempo en que el worker ejecuta código ([límites de Workers](https://developers.cloudflare.com/workers/platform/limits/)). Una inferencia de segundos se factura por el CPU de preparar la llamada, no por la espera ([Workers pricing: scale to zero](https://blog.cloudflare.com/workers-pricing-scale-to-zero/)).

Si el panel de Pages no muestra el binding tras el merge: Workers & Pages → proto-lab → Settings → Bindings → Add → Workers AI, variable `AI`, en Production y en Preview, y volver a desplegar.

## R2

No hay bucket. Entraría solo si un archivo no cabe en los 25 MiB de Pages ni después de Brotli. El plan Standard gratuito da 10 GB-mes, 1 millón de operaciones de clase A y 10 millones de clase B, con salida gratis. Infrequent Access no tiene capa gratuita ([precios de R2](https://developers.cloudflare.com/r2/pricing/), 30 de octubre de 2026).

Si se activa: dos buckets (producción y preview), un token que el agente no ve, y un job que solo corre en push a `main`. No desde el pull request.

## Durable Objects

No hay Durable Objects. El plan Free da 100 000 peticiones al día y 13 000 GB-s al día, solo con backend SQLite. La hibernación no factura la duración, pero `setTimeout` y `setInterval` impiden hibernar ([precios](https://developers.cloudflare.com/durable-objects/platform/pricing/), 18 de octubre de 2026; [hibernación de WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)). Entrarían para un estado en vivo entre sesiones que D1 no cubre. Hasta entonces, el dato compartido sigue en D1.

## Images

No hay Cloudflare Images. El plan Free transforma 5 000 imágenes únicas al mes y después responde el error 9422, sin cobrar. El almacenamiento es de pago ([precios de Images](https://developers.cloudflare.com/images/pricing/), 19 de octubre de 2026). Las imágenes de una aplicación se quedan en el prototipo y pasan por el puente, con el tope de 1,5 MiB del build.

## Lo que sí está

D1, binding `DB`, en el plan Free: 5 millones de filas leídas al día, 100 000 escritas, 5 GB en la cuenta y 500 MB por base. Al pasarse, falla y no cobra ([precios de D1](https://developers.cloudflare.com/d1/platform/pricing/)). El contrato de tablas está en [`docs/contrato-tablas.md`](contrato-tablas.md). `wrangler d1 execute … --local` no necesita token; el remoto sí, y el agente no lo tiene. El validador `scripts/table-sql.mjs` basta para escribir migraciones.
