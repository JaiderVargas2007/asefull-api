// Guarda cada petición en la tabla api_log (endpoint, código HTTP, tiempo, usuario)
const { q } = require('../config/db');

function apiLog(req, res, next) {
  const inicio = Date.now();
  res.on('finish', () => {
    const ruta = req.originalUrl.split('?')[0];
    if (ruta === '/api/salud') return;
    const endpoint = ruta.replace(/\/\d+(?=\/|$)/g, '/:id');          // /api/rutas/6/mapa -> /api/rutas/:id/mapa
    const m = ruta.match(/\/rutas\/(\d+)/);
    const idRuta = m ? Number(m[1]) : (Number(req.body?.id_ruta) || null);
    const error = res.statusCode >= 400 ? (res.locals.mensajeError || null) : null;
    q('INSERT INTO api_log (endpoint, metodo, http_status, ms, id_ruta, id_usuario, error) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [endpoint.slice(0, 60), req.method, res.statusCode, Date.now() - inicio, idRuta, req.usuario?.id || null,
        error ? String(error).slice(0, 250) : null])
      .catch(() => { /* el registro nunca debe tumbar la API */ });
  });
  next();
}

module.exports = apiLog;
