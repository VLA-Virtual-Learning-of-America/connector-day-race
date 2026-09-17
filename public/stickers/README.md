# Fuentes de los stickers

Los SVG se guardan localmente y Vite los copia sin transformación a dist/stickers.
Se usan para identificar cursos/certificaciones; no representan patrocinio ni aval del juego.
Los archivos de terceros se conservaron tal como fueron recuperados, sin recolorear ni deformar.

| Código | Archivo / respaldo | Fuente |
| --- | --- | --- |
| CCNA | CCNA.svg, Cisco | https://github.com/simple-icons/simple-icons/blob/develop/icons/cisco.svg |
| AWS | AWS.svg, Amazon AWS (versión clásica) | https://github.com/simple-icons/simple-icons/blob/11.15.0/icons/amazonaws.svg |
| PMP | Texto PMP, sin archivo | No se encontró pmi.svg ni pmp.svg en Simple Icons. Se consultó https://www.pmi.org/about/press-media/kit y https://www.pmi.org/ pero no se pudo recuperar un archivo por los canales disponibles. |
| MKT | MKT.svg, megáfono genérico | https://github.com/lucide-icons/lucide/blob/main/icons/megaphone.svg |
| AIB | AIB.svg, inteligencia artificial genérica | https://github.com/lucide-icons/lucide/blob/main/icons/brain-circuit.svg |
| ACM | ACM.svg, creación de contenido genérica | https://github.com/lucide-icons/lucide/blob/main/icons/clapperboard.svg |
| CYB | CYB.svg, CompTIA | https://github.com/simple-icons/simple-icons/blob/develop/icons/comptia.svg |
| SIX | SIX.svg, sigma genérica | https://github.com/lucide-icons/lucide/blob/main/icons/sigma.svg |

La instalación solicitada de simple-icons falló con EACCES al acceder al registro npm.
Los SVG se recuperaron mediante el conector GitHub, sin agregar una dependencia.
amazonaws.svg no se pudo recuperar de develop; se usó la versión etiquetada 11.15.0.
Simple Icons declara CC0, no MIT; se conserva su licencia. Lucide usa ISC (licencia adjunta).
Las marcas pertenecen a sus respectivos titulares.

Para los cursos propios se eligieron los íconos genéricos permitidos por el pedido:
no son logos oficiales de VLA ni AI Builders. La búsqueda de AI Builders devolvió
academias homónimas sin relación verificable con VLA. No se usaron sus logos.
Se consultó también https://site.serviciosvla.com/ para identificar VLA.
Six Sigma usa un símbolo genérico, sin atribuir un ente certificador.

Las tarjetas y el resultado muestran imagen y nombre completo; las banderas conservan
el código corto por legibilidad. Si falla una imagen, se muestra el código de respaldo.
