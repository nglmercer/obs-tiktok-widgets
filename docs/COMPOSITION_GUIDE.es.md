# Editar en una ventana de 480×480

La interfaz deja espacio para editar: una barra contiene Añadir, Simular,
Deshacer/Rehacer y Guardar. Publicar permanece en la cabecera; Compilar, Vista previa
y Añadir a escena están en **Más acciones**. Se eliminaron los controles repetidos
que ocupaban espacio en Diseño de composición.

[Grabación de 480×480](validation/compositions/compact480/editing-480.webm) ·
[English](COMPOSITION_GUIDE.md)

1. Abre **Plantillas → Composición → Usar plantilla**.
2. Para un lienzo cuadrado, selecciona el fondo y abre **Inspector**. Pon **Ancho del
   lienzo** y **Alto del lienzo** en 480. El tamaño de la ventana no cambia la
   resolución de tu composición.
3. Elige una plantilla y pulsa **+ Añadir widget**. En Inspector puedes cambiar su
   nombre, posición, tamaño, rotación y opacidad; los campos usan dos columnas.
4. Cambia a **Lienzo**, pulsa **Simular composición** y arrastra el widget. En
   **Capas** puedes seleccionar otro widget o el lienzo. El área de trabajo ajusta
   su escala tanto al ancho como al alto disponibles.
5. Pulsa **Guardar diseño**. Después pulsa **Publicar** cuando quieras actualizar
   producción. Los iconos muestran su título al pasar el cursor o recibir el foco.

![Inspector en una ventana de 480×480](validation/compositions/compact480/inspector-480.png)

El menú de navegación permite cambiar idioma/tema. En pantallas grandes, las capas
y el Inspector siguen junto al lienzo. Para colocar la composición en OBS, utiliza
**Más acciones → Añadir a escena** después de publicar, con OBS y el acceso IPC
local autenticado habilitados explícitamente.

Se ejecutó una sola prueba Playwright enfocada en editar, arrastrar, simular y guardar
con una ventana real de 480×480. El servicio nativo confirmó los ajustes guardados.
No hubo desbordamiento de página ni errores de JavaScript. Esto no valida OBS/CEF
ni equivale a un estudio con usuarios nuevos.

[Comando y detalles de la validación](COMPOSITION_GUIDE.md)

En **Añadir a escena**, elige una escena existente de OBS en el selector y confirma la colocación. Los nombres se cargan mediante la conexión autenticada con OBS; no es necesario escribirlos.
