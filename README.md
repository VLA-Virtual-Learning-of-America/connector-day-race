# Carrera local para eventos

Requiere Node.js 22 o posterior. Preparar las dependencias una vez con internet:

```sh
npm install
npm install --prefix server
npm run build
node server/index.js
```

Durante el evento no necesita internet. Abrí `http://localhost:3000/?host=1` en
la laptop del proyector. El servidor imprime las IP locales y los enlaces completos
`http://<ip>:3000/?join=1` para los celulares. Todos deben estar en la misma WiFi
o hotspot; permití Node/puerto TCP 3000 en el firewall de la red privada. Una WiFi
con aislamiento entre clientes no sirve: usá un hotspot propio en ese caso.

El anfitrión muestra el enlace grande y “SALA 1” (identificador visual, no un código
que se ingresa). Si hay varias interfaces, elegí la IP de la WiFi/hotspot en el
selector. Los celulares dibujan, eligen colores y nombre y envían una sola vez;
después miran la pantalla grande. No requieren cámara ni cuenta.

Arranque automático a **4**, máximo **6** corredores. Configurá `AUTO_START=0`
para empezar únicamente con el botón, o un valor de 1 a 6; `PORT` cambia el puerto.
Ejemplo PowerShell:

```powershell
$env:AUTO_START = '6'
$env:PORT = '3000'
npm run event
```

Una sola sala en memoria, sin autenticación ni persistencia. “Empezar ya” acepta
desde un corredor. “Nueva ronda” limpia la sala. Reiniciar Node también la limpia;
recargar el anfitrión durante la carrera pierde esa ronda y permite crear otra.
Solo el anfitrión simula la física; no se envían taps, posiciones ni resultados.
No hay mensajes periódicos durante la carrera.

Cada criatura tiene cuerpo, corrector de giro, patas con pivotes y colores propios
y ritmo automático variable. Los carriles no colisionan entre sí. La cámara conserva
la perspectiva fija de toda la pista y ajusta el tamaño visual al ancho del carril.
La carrera termina al llegar todos o a los 60 segundos. Los que no llegan quedan
después de los finalistas, ordenados por distancia. Tiempos iguales se desempatan
por distancia y luego por inscripción.

Sin parámetros se conserva el juego individual, incluido GitHub Pages. El build
mantiene su base `/connector-day-race/`; Node sirve también ese prefijo.

Verificación: `npx tsc --noEmit`, `npm run build` y `npm run test:event`
(simulación física sin navegador, con dos y seis corredores).
Las dependencias del servidor viven en `server/package.json`, separadas del build
estático de GitHub Pages. Si esa instalación falla, el modo evento no puede arrancar.
Antes del evento, ensayar con seis celulares, el proyector y la red real; comprobar
legibilidad, envío, arranque manual/automático y una segunda ronda. Mantener visible
la pestaña del anfitrión y desactivar suspensión de la laptop.
