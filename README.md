# ASEFULL API (Express.js + JWT + Docker)

Backend del módulo de rutas de ASEFULL. Convierte las direcciones de los clientes en coordenadas,
calcula el camino por calles, ordena las paradas para recorrer menos kilómetros y registra las visitas
del vendedor. Usa la **misma base de datos MySQL** que ya tiene la app (Hostinger), así que no se pierde nada
de lo que existe.

| Pieza | Qué se usó |
|---|---|
| Servidor | Node.js 22 + Express 4 |
| Seguridad | JWT (jsonwebtoken), bcrypt, helmet, límite de intentos en el login |
| Base de datos | MySQL / MariaDB con `mysql2` (consultas preparadas y transacciones) |
| Mapas | Nominatim (dirección → coordenadas) y OSRM (camino por calles) con caché en la BD |
| Contenedor | Docker (Dockerfile + docker-compose) |
| Despliegue | Render (desde el Dockerfile) |
| Pruebas | `node --test` (13 pruebas) + colección de Postman |

## Estructura

```
src/
  server.js              arranque y apagado limpio
  app.js                 middlewares, rutas y manejo de errores
  public/                página demo (login + mapa con Leaflet)
  config/                variables de entorno y conexión a MySQL
  middleware/auth.js     crea y verifica el JWT, control por rol
  middleware/apiLog.js   guarda cada petición en api_log (monitoreo)
  routes/                auth, rutas, ubicaciones, estadísticas
  services/              nominatim, osrm, enlaces, optimizar, geo, datos
db/init/                 base de prueba para Docker local (esquema + datos demo)
db/produccion_respaldo_orden.sql   única tabla nueva para producción
postman/                 colección lista para importar
test/                    pruebas automáticas
```

## Cómo funciona el JWT

1. `POST /api/auth/login` con `email` y `password`. La API busca el usuario en la tabla `usuarios`,
   compara la contraseña (acepta `password_hash` de PHP) y responde un **token firmado** que vence en 8 horas.
2. La app manda ese token en cada petición: `Authorization: Bearer <token>`.
3. El middleware `requiereToken` verifica la firma y la fecha. Sin token o con token alterado → **401**.
4. `soloRoles` revisa el rol dentro del token: un vendedor no puede ver estadísticas ni mover la bodega → **403**.

## Endpoints

En la raíz (`/`) hay una **página demo** con login y mapa que usa estos mismos endpoints.

Todos menos `salud` y `login` piden el token.

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/api/salud` | Saber si la API y la base de datos están vivas |
| POST | `/api/auth/login` | Iniciar sesión y recibir el JWT |
| GET | `/api/auth/yo` | Datos del usuario según el token |
| GET | `/api/rutas/:id/mapa` | Clientes de la ruta con coordenadas, bodega y estado de visita |
| POST | `/api/rutas/:id/geocodificar` | Ubica por lotes las direcciones pendientes |
| POST | `/api/rutas/calles` | Camino por calles entre puntos (con instrucciones en español) |
| POST | `/api/rutas/:id/optimizar` | Orden que recorre menos km (`guardar: true` lo guarda) |
| POST | `/api/rutas/:id/restaurar-orden` | Deshace la última optimización |
| PUT | `/api/rutas/:id/bodega` | Fija el punto de salida (solo jefe) |
| PUT | `/api/clientes/ubicacion` | Fija la ubicación con el GPS o moviendo el pin |
| POST | `/api/clientes/ubicacion/enlace` | Fija la ubicación desde un enlace de Google Maps / Waze / WhatsApp |
| PUT | `/api/clientes/:id/direccion` | Cambia la dirección y la vuelve a ubicar |
| GET | `/api/clientes/geocodificar?direccion=` | Prueba una dirección sin guardar nada |
| POST | `/api/rutas/:id/visitas` | Registra atendido / no estaba / venta con distancia a la casa |
| GET | `/api/rutas/:id/resumen` | Resumen de la salida (paradas, ventas, km) |
| GET | `/api/estadisticas?dias=7` | Peticiones, tiempos y errores por endpoint (solo jefe) |

Todas las respuestas tienen la forma `{ "success": true, ... }` o `{ "success": false, "message": "..." }`.

## Correr en local con Docker

```bash
docker compose up --build
# API:   http://localhost:3000/api/salud
# phpMyAdmin (opcional):  docker compose --profile admin up   ->  http://localhost:8080
```

La base de prueba trae la ruta 6 (Bosa) con 12 clientes inventados y dos usuarios de prueba
(`jefe@asefull.demo` y `vendedor@asefull.demo`, contraseña en `db/init/02_datos_demo.sql`).
Esos usuarios solo existen en el contenedor local.

Sin Docker: `npm install`, copiar `.env.example` como `.env`, llenarlo y `npm run dev`.

Pruebas: `npm test`

## Desplegar en Render (gratis) con la base de datos de Hostinger

**1. Hostinger (una sola vez)**
- hPanel → Bases de datos → **MySQL remoto**: agregar acceso desde *cualquier host* (`%`) para la base de ASEFULL.
  Render no tiene una IP fija en el plan gratis, por eso se usa `%`.
- Recomendado: crear un **usuario MySQL aparte** para la API con contraseña larga, en vez de usar el de `conexion.php`.
- phpMyAdmin → ejecutar `db/produccion_respaldo_orden.sql` (crea la tabla `respaldo_orden`).
- Anotar el **host remoto** que muestra hPanel en esa misma pantalla.

**2. GitHub**
- Subir esta carpeta a un repositorio (el `.gitignore` ya deja fuera `node_modules` y `.env`).

**3. Render**
- New → **Blueprint** → elegir el repositorio (lee `render.yaml`), o New → Web Service → Runtime *Docker*.
- Llenar en *Environment*: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. `JWT_SECRET` lo genera Render solo.
- Al terminar el build, abrir `https://<nombre>.onrender.com/api/salud` → debe decir `"base_de_datos": "conectada"`.

> El plan gratis de Render se duerme tras 15 minutos sin uso; la primera petición tarda unos 50 segundos en despertar.
> Antes de grabar el video, abrir `/api/salud` una vez.

**4. Postman**
- Importar `postman/ASEFULL_API.postman_collection.json`.
- Cambiar la variable `base_url` por la URL de Render y poner `email` / `password` de un usuario real.
- Ejecutar **1. Login**: el token queda guardado y las demás peticiones lo usan solas.

## Seguridad

- Contraseñas y llaves solo en variables de entorno (nunca en el código ni en GitHub).
- Consultas preparadas en todas las rutas (evita inyección SQL).
- Límite de 10 intentos de login cada 15 minutos por IP.
- El login responde igual si el correo no existe o si la clave está mal.
- Los enlaces de ubicación solo se siguen si son de Google Maps, Waze u OpenStreetMap.
- El contenedor corre con un usuario sin privilegios (`node`).
