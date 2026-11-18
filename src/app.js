// Armado de la aplicación Express: seguridad, JSON, registro, rutas y manejo de errores
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const { pool } = require('./config/db');
const apiLog = require('./middleware/apiLog');
const { requiereToken, soloRoles } = require('./middleware/auth');
const { HttpError } = require('./utils/errores');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);                       // Render pone un proxy delante (IP real para el límite de login)

app.use(helmet({
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },          // los servidores de mapas piden saber de qué sitio viene
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'data:', 'https://server.arcgisonline.com', 'https://*.tile.openstreetmap.org'],   // fondo del mapa en la página demo
      'upgrade-insecure-requests': null,   // permite probar en http://localhost con Docker
    },
  },
}));
app.use(cors({ origin: config.cors === '*' ? '*' : config.cors.split(',').map(s => s.trim()) }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(apiLog);

// Pública: sirve para saber si la API y la base de datos están vivas
app.get('/api/salud', async (req, res) => {
  let db = false;
  try { await pool.query('SELECT 1'); db = true; } catch { /* sin conexión */ }
  res.status(db ? 200 : 503).json({
    success: db, servicio: 'asefull-api', version: require('../package.json').version,
    base_de_datos: db ? 'conectada' : 'sin conexión', hora: new Date().toISOString(),
  });
});

// Página web de demostración (login + mapa) para probar la API desde el navegador
const path = require('path');
app.use('/vendor/leaflet', express.static(path.join(path.dirname(require.resolve('leaflet')))));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Pública: login. Todo lo demás pide el JWT.
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/rutas', requiereToken, require('./routes/rutas.routes'));
app.use('/api/clientes', requiereToken, require('./routes/ubicaciones.routes'));
app.use('/api/estadisticas', requiereToken, soloRoles(config.rolesAdmin), require('./routes/estadisticas.routes'));

// Ruta que no existe
app.use((req, res, next) => next(new HttpError(404, `No existe ${req.method} ${req.path}`)));

// Todos los errores salen con el mismo formato: { success:false, message }
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let mensaje = err.message;
  if (err.type === 'entity.parse.failed') { status = 400; mensaje = 'El cuerpo no es un JSON válido'; }
  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
    mensaje = config.entorno === 'production' ? 'Error interno del servidor' : (err.message || 'Error interno');
  }
  res.locals.mensajeError = err.message;
  res.status(status).json({ success: false, message: mensaje });
});

module.exports = app;
