# Carátula

Generador de carátulas con React + TypeScript + Tailwind CSS y una API Python con FastAPI. El PDF se genera con ReportLab; la vista previa SVG usa exactamente el mismo dibujo, posiciones y métricas de fuente. La vista previa convierte los caracteres en trazados para mostrar Calibri correctamente incluso en dispositivos que no la tienen instalada; el PDF conserva texto seleccionable.

## Iniciar en Windows

Requisitos: Node.js 20.19+ o 22.12+, Python 3.12+ y Calibri instalada (Windows la incluye).

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm.cmd install
npm.cmd run build
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Abre http://127.0.0.1:8000. Después de instalar las dependencias, también puedes ejecutar `iniciar.ps1` para compilar y arrancar.

## Desarrollo

En una terminal, inicia FastAPI con recarga:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

En otra:

```powershell
npm.cmd run dev
```

Abre http://127.0.0.1:5173. Vite reenvía `/api` a FastAPI; no se necesitan permisos CORS ni claves. La documentación interactiva está en http://127.0.0.1:8000/docs.

## Funciones

- Campos completamente opcionales; los vacíos no dejan rótulos ni separadores.
- Integrantes dinámicos, con códigos opcionales y cambio automático entre estudiante/estudiantes. Máximo 30 filas; el límite real de la página depende del texto.
- Reordenamiento de integrantes arrastrando el asa de cada tarjeta, con alternativa de teclado mediante las flechas arriba/abajo, y orden automático por el apellido escrito antes de la coma.
- Asignatura de escritura libre y ciudades con selección rápida.
- Plantilla exclusiva UTP, con institución fija y logo SVG siempre incluido.
- Calibri 11 embebida en el PDF, márgenes de 2,54 cm y doble interlineado dentro de cada bloque. En UTP se ajusta el espacio entre bloques; nunca se reduce la fuente ni se recorta el contenido.
- Vista previa con actualización automática y zoom persistente por navegador. Las respuestas antiguas se cancelan al seguir escribiendo. Un error de desbordamiento bloquea la descarga.
- PDF vectorial con texto seleccionable y logo vectorial.
- Historial local sin cuentas: cada carátula tiene un ID estable y sus cambios se guardan automáticamente en SQLite después de una pausa breve al escribir.
- Búsqueda por todos los campos, incluso códigos ocultos, sin distinguir mayúsculas ni tildes. Las palabras se combinan para filtrar resultados.
- Abrir carátulas anteriores para continuar editándolas o volver a descargar sus archivos.
- «Compartir enlace» copia una URL de la carátula ya autoguardada. En localhost, el enlace funciona en este equipo y mientras se conserve la misma base de datos local.


## API

- `GET /api/health`: comprueba el generador, logo y fuente.
- `POST /api/preview`: JSON → SVG.
- `POST /api/docx`: genera una carátula Word editable.
- `POST /api/pdf`: el mismo JSON → PDF descargable.
- `POST /api/covers`: crea una carátula con ID estable.
- `PUT /api/covers/{id}`: actualiza el formulario y PDF de una carátula existente.
- `GET /api/covers?q=texto&limit=20&offset=0`: historial con búsqueda y paginación.
- `GET /api/covers/{id}`: recupera el formulario.
- `GET /api/covers/{id}/pdf`: descarga el PDF exacto guardado.
- `GET /api/covers/{id}/docx`: genera Word editable desde el formulario guardado con la plantilla actual.

Todos los campos tienen límites de longitud. Una petición inválida o un contenido que no cabe devuelve 422. La ausencia de Calibri devuelve 503 con instrucciones de configuración. Los datos de texto no se interpretan como HTML/SVG.

```json
{
  "template": "utp",
  "course": "Problemas y Desafíos en el Perú Actual",
  "week": "4",
  "title": "Ensayo del oncenio de Leguía",
  "subtitle": "¿Fue autoritario el Oncenio de Leguía?",
  "teacher": "",
  "members": [{"name": "Apellidos, nombres", "code": ""}],
  "city": "Lima",
  "year": "2026",
  "show_codes": true,
  "show_logo": true
}
```

## Pruebas

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest tests -q
npm.cmd run build
```

Las pruebas verifican A4, fuente embebida, página única, acentos, campos vacíos, códigos ocultos, autores, SVG seguro, correspondencia SVG/PDF, identidad UTP fija, ajuste de palabras largas y rechazo de desbordamientos.

## Despliegue

La aplicación necesita un servidor Python; el alojamiento de Sites basado en Cloudflare Workers no ejecuta este backend FastAPI. Se entrega lista para ejecutar localmente o alojar en un servicio que soporte Python. No se ha publicado una versión remota.

Para otro sistema operativo, configura `CALIBRI_FONT_DIR` con una carpeta que contenga copias autorizadas de `calibri.ttf` y `calibrib.ttf`. No se redistribuyen los archivos de fuente. La API falla explícitamente si falta Calibri; no sustituye la tipografía silenciosamente. Compila el frontend antes de iniciar FastAPI. Para un servicio público, configura HTTPS y límites de solicitudes en el proxy del proveedor.

## Datos locales

La base se crea automáticamente en `data/caratulas.sqlite3` (excluida de Git). Contiene los formularios y PDFs y persiste al reiniciar la API. El navegador guarda en `localStorage` un identificador temporal, la carátula activa y el nivel de zoom; no se utiliza una cuenta ni un servicio externo. Para una copia de seguridad, detén la app y copia la base. Mantén el servidor en `127.0.0.1` para uso local.

El DOCX usa Calibri 11, papel A4 y texto editable. El logo se incluye como PNG de alta resolución para compatibilidad con Word. El PDF original guardado se conserva; los DOCX se generan con el diseño vigente.
