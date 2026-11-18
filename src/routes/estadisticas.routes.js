// Monitoreo de la API a partir de api_log (solo jefe)
const express = require('express');
const { q } = require('../config/db');
const { asyncH } = require('../utils/errores');

const router = express.Router();

// GET /api/estadisticas?dias=7
router.get('/', asyncH(async (req, res) => {
  const dias = Math.max(1, Math.min(90, Number(req.query.dias) || 7));
  const porEndpoint = (await q(`SELECT endpoint, COUNT(*) AS peticiones, ROUND(AVG(ms)) AS ms_promedio, MAX(ms) AS ms_maximo,
                                       SUM(http_status BETWEEN 400 AND 499) AS errores_4xx, SUM(http_status >= 500) AS errores_5xx
                                FROM api_log WHERE fecha >= NOW() - INTERVAL ${dias} DAY
                                GROUP BY endpoint ORDER BY peticiones DESC`))
    .map(f => ({ endpoint: f.endpoint, peticiones: Number(f.peticiones), ms_promedio: Number(f.ms_promedio), ms_maximo: Number(f.ms_maximo), errores_4xx: Number(f.errores_4xx), errores_5xx: Number(f.errores_5xx) }));
  const errores = await q(`SELECT fecha, endpoint, metodo, http_status, ms, error FROM api_log
                           WHERE fecha >= NOW() - INTERVAL ${dias} DAY AND http_status >= 400 ORDER BY id DESC LIMIT 20`);
  const total = porEndpoint.reduce((a, f) => a + f.peticiones, 0);
  const e5xx = porEndpoint.reduce((a, f) => a + f.errores_5xx, 0);
  res.json({
    success: true, dias, peticiones: total,
    disponibilidad_pct: total ? Math.round(10000 * (total - e5xx) / total) / 100 : null,
    por_endpoint: porEndpoint, ultimos_errores: errores,
  });
}));

module.exports = router;
