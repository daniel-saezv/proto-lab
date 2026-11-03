# Muestra mínima para medir Godot

No es una aplicación del laboratorio y no entra en el catálogo. El workflow
`.github/workflows/medir-godot.yml` solo se lanza a mano, con `workflow_dispatch`.

Export web de Godot 4.7.2 en un solo hilo (`variant/thread_support=false`),
con viewport 390×844 y respuesta al toque. La salida generada no se versiona.
