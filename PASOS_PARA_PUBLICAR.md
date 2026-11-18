# Pasos para publicar la API (sin tocar la base de datos real de ASEFULL)

La API usa una base de datos NUEVA, solo con datos de prueba. La app y el PHP siguen igual.

## 0. Abrir en Visual Studio Code y probar en tu computador

1. Descomprime `asefull-api.zip` y en VS Code ve a *File → Open Folder* y elige la carpeta `asefull-api`.
2. Abre la terminal (*Terminal → New Terminal*) y ejecuta:
   ```
   npm install
   npm test
   ```
   Deben salir **13 pruebas en verde** (pass 13, fail 0). No necesita base de datos.
3. (Opcional) Si tienes Docker Desktop instalado: `docker compose up --build` y abre http://localhost:3000/api/salud

## 1. Base de datos nueva en Hostinger

1. hPanel → **Bases de datos → Bases de datos MySQL** → crear una nueva, por ejemplo `asefull_api`,
   con un usuario nuevo y una contraseña larga. Anota: nombre de la base, usuario y contraseña.
2. Entra a **phpMyAdmin** de ESA base nueva (no la de ASEFULL) → pestaña **Importar**:
   - primero `db/init/01_esquema.sql`
   - después `db/init/02_datos_demo.sql`
3. hPanel → **MySQL remoto** → elegir la base nueva `asefull_api` → en host poner `%` (cualquier host) → crear.
   En esa misma pantalla aparece el **host/IP del servidor MySQL**: anótalo.

> No actives MySQL remoto para la base real de ASEFULL. Solo para la nueva.

## 2. Subir el proyecto a GitHub

1. Crea un repositorio nuevo en github.com (por ejemplo `asefull-api`), puede ser público o privado.
2. En la terminal de VS Code, dentro de la carpeta:
   ```
   git init
   git add .
   git commit -m "API ASEFULL con Express, JWT y Docker"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/asefull-api.git
   git push -u origin main
   ```
   El `.gitignore` deja fuera `node_modules` y `.env` (nunca se suben contraseñas).

## 3. Publicar en Render (gratis)

1. Entra a render.com con tu cuenta de GitHub.
2. **New → Blueprint** → elige el repositorio `asefull-api` (Render lee `render.yaml` y usa el `Dockerfile`).
3. Te pide las variables; llénalas con lo que anotaste en el paso 1:
   - `DB_HOST` = host del MySQL remoto de Hostinger
   - `DB_USER` = usuario de la base nueva
   - `DB_PASSWORD` = contraseña de la base nueva
   - `DB_NAME` = nombre de la base nueva
   (`JWT_SECRET` lo genera Render solo)
4. Espera a que el build termine (unos 3-5 minutos). Render te da una URL como
   `https://asefull-api.onrender.com`
5. Abre `https://TU-URL.onrender.com/api/salud` → debe decir `"base_de_datos": "conectada"`.

Si dice `sin conexión`: revisa que el MySQL remoto tenga `%` y que los 4 datos estén bien escritos.

## 4. Página demo (para el video)

Abre `https://TU-URL.onrender.com/` (la URL sola). Sale la página **ASEFULL Rutas** con el mapa.
Usuario: `jefe@asefull.demo` · contraseña: la del comentario de `db/init/02_datos_demo.sql`.

Abajo a la derecha siempre se ve la **petición que se hizo a la API** y la respuesta JSON:
eso es lo que demuestra que todo lo hace el backend.

Orden para el video:
1. **Probar sin token** → 401 (la API está protegida).
2. **Entrar** → aparece el token en 3 colores (encabezado, datos, firma) y cuándo vence.
3. **Probar token falso** → 401 (si alguien cambia el token, la firma ya no sirve).
4. **Ver mapa** → los clientes numerados en su orden actual (línea roja punteada).
5. **Optimizar (vista previa)** → línea azul con el nuevo orden y los km ahorrados.
6. **Guardar orden** y luego **Deshacer**.
7. **Camino por calles** → la ruta real por las calles (línea verde).
8. Elegir un cliente → pegar un enlace de Google Maps → **Ubicar con enlace** (el pin se mueve).
9. **Registrar visita**, **Resumen** y **Estadísticas**.
10. (Opcional) Salir, entrar con `vendedor@asefull.demo` y pedir **Estadísticas** → 403 (no es jefe).

Enlace de prueba para el paso 8: `https://www.google.com/maps/@4.6050,-74.1950,17z`

## 5. Postman (opcional)

1. Postman → **Import** → `postman/ASEFULL_API.postman_collection.json`.
2. En la colección → **Variables**: `base_url` = tu URL de Render, `email` y `password` del usuario demo.
3. Ejecuta **1. Login** y después las demás.

## 6. Antes de grabar

- Abre la URL 1 minuto antes (Render gratis se duerme y la primera vez tarda ~50 s).
- Para dejar los datos como al inicio: en phpMyAdmin de la base nueva borra todas las tablas y vuelve a importar los dos SQL.
