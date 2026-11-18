// Rutas de venta: mapa, coordenadas, camino por calles, orden óptimo, visitas y resumen
const express = require('express');
const config = require('../config');
const { q, transaccion } = require('../config/db');
const { soloRoles } = require('../middleware/auth');
const { asyncH, malaPeticion, noEncontrado } = require('../utils/errores');
const { entero, coordenada, puntoEnZona, enZona } = require('../utils/validar');
const { datosRuta, sesionAbierta, clientesDeRuta, bodegaDeRuta } = require('../services/datos');
const { geocodificar } = require('../services/nominatim');
const osrm = require('../services/osrm');
const { haversine } = require('../services/geo');
const { agrupar, optimizarOrden, matrizRecta } = require('../services/optimizar');

const router = express.Router();

async function rutaExistente(req) {
  const idRuta = entero(req.params.idRuta, 'id_ruta');
  const ruta = await datosRuta(idRuta);
  if (!ruta) throw noEncontrado('Ruta no encontrada');
  return { idRuta, ruta };
}

// ---------------------------------------------------------------
// GET /api/rutas/:idRuta/mapa  -> clientes con coordenadas + bodega + lo marcado en la sesión
// ---------------------------------------------------------------
router.get('/:idRuta/mapa', asyncH(async (req, res) => {
  const { idRuta, ruta } = await rutaExistente(req);
  const idSesion = await sesionAbierta(idRuta);
  const clientes = await clientesDeRuta(idRuta);

  const estados = {}, vendidos = {};
  if (idSesion) {
    const vis = await q(`SELECT v.id_cliente, v.estado FROM visitas_ruta v
                         INNER JOIN (SELECT id_cliente, MAX(id) AS ultimo FROM visitas_ruta WHERE id_sesion = ? GROUP BY id_cliente) u
                         ON u.ultimo = v.id`, [idSesion]);
    vis.forEach(v => { estados[v.id_cliente] = v.estado; });
    (await q('SELECT DISTINCT id_cliente FROM ventas WHERE id_sesion = ?', [idSesion])).forEach(v => { vendidos[v.id_cliente] = true; });
  } else {
    (await q('SELECT DISTINCT id_cliente FROM ventas WHERE id_ruta = ? AND DATE(fecha) = CURDATE()', [idRuta])).forEach(v => { vendidos[v.id_cliente] = true; });
  }

  const lista = clientes.map(c => ({ ...c, estado_visita: estados[c.id_cliente] || null, venta_sesion: Boolean(vendidos[c.id_cliente]) }));
  res.json({
    success: true,
    ruta: { id_ruta: ruta.id_ruta, nombre_ruta: ruta.nombre_ruta, estado_ruta: ruta.estado_ruta || 'pendiente', nombre_vendedor: ruta.nombre_vendedor },
    id_sesion: idSesion,
    bodega: await bodegaDeRuta(idRuta),
    total: lista.length,
    pendientes: lista.filter(c => c.geo_estado === 'pendiente').length,
    sin_ubicacion: lista.filter(c => c.latitud === null).length,
    clientes: lista,
  });
}));

// ---------------------------------------------------------------
// POST /api/rutas/:idRuta/geocodificar  { max?: 1-10, reintentar?: bool }
// Convierte las direcciones de la ruta en coordenadas (por lotes, con caché)
// ---------------------------------------------------------------
router.post('/:idRuta/geocodificar', asyncH(async (req, res) => {
  const { idRuta } = await rutaExistente(req);
  const max = Math.max(1, Math.min(10, Number(req.body.max) || 6));
  const estados = req.body.reintentar === true || req.body.reintentar === '1' ? ['pendiente', 'fallido'] : ['pendiente'];

  const lote = await q(`SELECT c.id_cliente, c.direccion FROM clientes_ruta cr
                        INNER JOIN clientes c ON c.id_cliente = cr.id_cliente
                        WHERE cr.id_ruta = ? AND c.geo_estado IN (${estados.map(() => '?').join(',')})
                        ORDER BY cr.orden_visita LIMIT ${max}`, [idRuta, ...estados]);

  const procesados = [];
  let desdeCache = 0, consultas = 0;
  for (const cli of lote) {
    const dir = String(cli.direccion || '').trim();
    if (!dir) {
      await q("UPDATE clientes SET geo_estado = 'fallido', geo_actualizado = NOW() WHERE id_cliente = ?", [cli.id_cliente]);
      procesados.push({ id_cliente: cli.id_cliente, estado: 'fallido', motivo: 'sin dirección' });
      continue;
    }
    const g = await geocodificar(dir);
    if (g === null) { procesados.push({ id_cliente: cli.id_cliente, estado: 'sin_red' }); break; }
    g.desdeCache ? desdeCache++ : consultas++;
    if (g.precision === 'fallido') {
      await q("UPDATE clientes SET geo_estado = 'fallido', geo_actualizado = NOW() WHERE id_cliente = ? AND geo_estado <> 'manual'", [cli.id_cliente]);
    } else {
      await q(`UPDATE clientes SET latitud = ?, longitud = ?, geo_estado = ?, geo_fuente = 'nominatim', geo_actualizado = NOW()
               WHERE id_cliente = ? AND geo_estado <> 'manual'`, [g.lat, g.lng, g.precision, cli.id_cliente]);
    }
    procesados.push({ id_cliente: cli.id_cliente, estado: g.precision, desde_cache: g.desdeCache });
  }

  const quedan = await q(`SELECT COUNT(*) AS n FROM clientes_ruta cr INNER JOIN clientes c ON c.id_cliente = cr.id_cliente
                          WHERE cr.id_ruta = ? AND c.geo_estado = 'pendiente'`, [idRuta]);
  res.json({ success: true, procesados, desde_cache: desdeCache, consultas_nominatim: consultas, pendientes: Number(quedan[0].n) });
}));

// ---------------------------------------------------------------
// POST /api/rutas/calles  { puntos: [[lat,lng], ...] }  -> camino por calles (OSRM)
// ---------------------------------------------------------------
router.post('/calles', asyncH(async (req, res) => {
  let puntos = req.body.puntos;
  if (typeof puntos === 'string') puntos = puntos.split(';').map(p => p.split(','));
  if (!Array.isArray(puntos) || puntos.length < 2 || puntos.length > 60) throw malaPeticion('Se necesitan entre 2 y 60 puntos [[lat,lng], ...]');
  puntos = puntos.map(p => {
    const lat = Number(p[0]), lng = Number(p[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw malaPeticion('Formato de puntos inválido');
    if (!enZona(lat, lng)) throw malaPeticion(`Hay un punto fuera de Bogotá: ${lat},${lng}`);
    return [lat, lng];
  });

  const { datos, desdeCache } = await osrm.ruta(puntos);
  if (!datos) {
    // Sin OSRM: líneas rectas para que la app nunca se quede sin ruta
    let total = 0;
    const tramos = [];
    for (let i = 1; i < puntos.length; i++) {
      const d = haversine(puntos[i - 1][0], puntos[i - 1][1], puntos[i][0], puntos[i][1]);
      tramos.push({ distancia_m: Math.round(d) });
      total += d;
    }
    return res.json({ success: true, por_calles: false, desde_cache: false, distancia_m: Math.round(total), duracion_s: Math.round(total / 4), puntos, tramos, pasos: [] });
  }

  const r = datos.routes[0];
  const pasos = [];
  r.legs.forEach(leg => leg.steps.forEach(s => {
    pasos.push({ lat: s.maneuver.location[1], lng: s.maneuver.location[0], distancia_m: Math.round(s.distance), instruccion: osrm.instruccion(s) });
  }));
  res.json({
    success: true, por_calles: true, desde_cache: desdeCache,
    distancia_m: Math.round(r.distance), duracion_s: Math.round(r.duration),
    puntos: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    tramos: r.legs.map(l => ({ distancia_m: Math.round(l.distance) })),
    pasos,
  });
}));

// ---------------------------------------------------------------
// POST /api/rutas/:idRuta/optimizar  { guardar?: bool }
// ---------------------------------------------------------------
router.post('/:idRuta/optimizar', asyncH(async (req, res) => {
  const { idRuta } = await rutaExistente(req);
  const guardar = req.body.guardar === true || req.body.guardar === '1';
  const clientes = await clientesDeRuta(idRuta);
  const conUbicacion = clientes.filter(c => c.latitud !== null);
  const sinUbicacion = clientes.filter(c => c.latitud === null);
  const paradas = agrupar(conUbicacion);
  if (paradas.length < 2) throw malaPeticion('Se necesitan al menos 2 paradas con ubicación. Primero geocodifica la ruta.');

  const bodega = await bodegaDeRuta(idRuta);
  const puntos = (bodega ? [[bodega.latitud, bodega.longitud]] : []).concat(paradas.map(p => [p.lat, p.lng]));
  let D = puntos.length <= 90 ? await osrm.tabla(puntos) : null;
  const fuente = D ? 'calles (OSRM)' : 'línea recta x 1,3';
  if (!D) D = matrizRecta(puntos);

  const r = optimizarOrden(paradas, bodega, D);
  const nuevoOrden = (r.mejoro ? r.ordenParadas : paradas).flatMap(p => p.clientes).concat(sinUbicacion);
  const salida = nuevoOrden.map((c, i) => ({ id_cr: c.id_cr, id_cliente: c.id_cliente, nombre: c.nombre, orden_visita: i + 1, sin_ubicacion: c.latitud === null }));

  if (guardar) {
    await transaccion(async (tq) => {
      // Respaldo del orden anterior por si se quiere volver a él
      await tq(`INSERT INTO respaldo_orden (id_ruta, id_usuario, orden_json) VALUES (?, ?, ?)`,
        [idRuta, req.usuario.id, JSON.stringify(clientes.map(c => ({ id_cr: c.id_cr, orden_visita: c.orden_visita })))]);
      for (const s of salida) await tq('UPDATE clientes_ruta SET orden_visita = ? WHERE id = ? AND id_ruta = ?', [s.orden_visita, s.id_cr, idRuta]);
    });
  }

  res.json({
    success: true,
    guardado: guardar,
    distancias: fuente,
    paradas: paradas.length,
    con_bodega: Boolean(bodega),
    km_actual: Math.round(r.metrosActual / 10) / 100,
    km_optimizado: Math.round(r.metrosOptimizado / 10) / 100,
    ahorro_km: Math.round((r.metrosActual - r.metrosOptimizado) / 10) / 100,
    orden: salida,
  });
}));

// POST /api/rutas/:idRuta/restaurar-orden  -> vuelve al orden guardado antes de la última optimización
router.post('/:idRuta/restaurar-orden', asyncH(async (req, res) => {
  const { idRuta } = await rutaExistente(req);
  const f = await q('SELECT id, orden_json, fecha FROM respaldo_orden WHERE id_ruta = ? ORDER BY id DESC LIMIT 1', [idRuta]);
  if (!f.length) throw noEncontrado('No hay un orden anterior guardado para esta ruta');
  const orden = typeof f[0].orden_json === 'string' ? JSON.parse(f[0].orden_json) : f[0].orden_json;
  await transaccion(async (tq) => {
    for (const o of orden) await tq('UPDATE clientes_ruta SET orden_visita = ? WHERE id = ? AND id_ruta = ?', [o.orden_visita, o.id_cr, idRuta]);
    await tq('DELETE FROM respaldo_orden WHERE id = ?', [f[0].id]);
  });
  res.json({ success: true, restaurado: orden.length, respaldo_de: f[0].fecha });
}));

// ---------------------------------------------------------------
// PUT /api/rutas/:idRuta/bodega  { lat, lng }   (solo jefe)
// ---------------------------------------------------------------
router.put('/:idRuta/bodega', soloRoles(config.rolesAdmin), asyncH(async (req, res) => {
  const idRuta = entero(req.params.idRuta, 'id_ruta', { min: 0 });
  const lat = coordenada(req.body.lat, 'lat'), lng = coordenada(req.body.lng, 'lng');
  puntoEnZona(lat, lng);
  await q(`INSERT INTO rutas_puntos (id_ruta, clave, latitud, longitud) VALUES (?, 'bodega', ?, ?)
           ON DUPLICATE KEY UPDATE latitud = VALUES(latitud), longitud = VALUES(longitud)`, [idRuta, lat, lng]);
  res.json({ success: true, bodega: { id_ruta: idRuta, latitud: lat, longitud: lng } });
}));

// ---------------------------------------------------------------
// POST /api/rutas/:idRuta/visitas  { id_cliente, estado, lat?, lng? }
// atendido / venta marcan clientes_ruta.visitado = 1; no_estaba no
// ---------------------------------------------------------------
router.post('/:idRuta/visitas', asyncH(async (req, res) => {
  const idRuta = entero(req.params.idRuta, 'id_ruta');
  const idCliente = entero(req.body.id_cliente, 'id_cliente');
  const estado = String(req.body.estado || '');
  if (!['atendido', 'no_estaba', 'venta'].includes(estado)) throw malaPeticion('Estado no válido (atendido, no_estaba o venta)');
  let lat = coordenada(req.body.lat, 'lat'), lng = coordenada(req.body.lng, 'lng');
  if ((lat === null) !== (lng === null)) throw malaPeticion('Manda lat y lng juntos');
  if (lat !== null && !enZona(lat, lng)) { lat = null; lng = null; }

  const cli = await q(`SELECT c.latitud, c.longitud FROM clientes_ruta cr INNER JOIN clientes c ON c.id_cliente = cr.id_cliente
                       WHERE cr.id_ruta = ? AND cr.id_cliente = ? LIMIT 1`, [idRuta, idCliente]);
  if (!cli.length) throw noEncontrado('Ese cliente no pertenece a la ruta');

  const distancia = lat !== null && cli[0].latitud !== null
    ? Math.round(haversine(lat, lng, Number(cli[0].latitud), Number(cli[0].longitud))) : null;
  const idSesion = await sesionAbierta(idRuta);

  const idVisita = await transaccion(async (tq) => {
    const r = await tq(`INSERT INTO visitas_ruta (id_ruta, id_sesion, id_cliente, id_usuario, estado, latitud, longitud, distancia_m, fecha)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`, [idRuta, idSesion, idCliente, req.usuario.id, estado, lat, lng, distancia]);
    if (estado !== 'no_estaba') await tq('UPDATE clientes_ruta SET visitado = 1 WHERE id_ruta = ? AND id_cliente = ?', [idRuta, idCliente]);
    return r.insertId;
  });

  res.status(201).json({
    success: true, id_visita: idVisita, id_sesion: idSesion, estado, distancia_m: distancia,
    aviso: idSesion ? null : 'La ruta no está iniciada: la visita se guardó sin sesión',
  });
}));

// ---------------------------------------------------------------
// GET /api/rutas/:idRuta/resumen?id_sesion=  -> resumen de una salida
// ---------------------------------------------------------------
router.get('/:idRuta/resumen', asyncH(async (req, res) => {
  const { idRuta, ruta } = await rutaExistente(req);
  const idSesionPedida = entero(req.query.id_sesion, 'id_sesion', { obligatorio: false });
  const ses = idSesionPedida
    ? await q('SELECT id, fecha_inicio, fecha_fin FROM rutas_sesiones WHERE id = ? AND id_ruta = ?', [idSesionPedida, idRuta])
    : await q('SELECT id, fecha_inicio, fecha_fin FROM rutas_sesiones WHERE id_ruta = ? ORDER BY id DESC LIMIT 1', [idRuta]);
  if (!ses.length) throw noEncontrado('Esta ruta todavía no tiene sesiones (nunca se ha iniciado)');
  const s = ses[0];

  const dur = await q('SELECT TIMESTAMPDIFF(MINUTE, fecha_inicio, COALESCE(fecha_fin, NOW())) AS min FROM rutas_sesiones WHERE id = ?', [s.id]);
  const porEstado = { atendido: 0, no_estaba: 0, venta: 0 };
  (await q(`SELECT v.estado, COUNT(*) AS n FROM visitas_ruta v
            INNER JOIN (SELECT id_cliente, MAX(id) AS ultimo FROM visitas_ruta WHERE id_sesion = ? GROUP BY id_cliente) u ON u.ultimo = v.id
            GROUP BY v.estado`, [s.id])).forEach(f => { porEstado[f.estado] = Number(f.n); });
  const total = Number((await q('SELECT COUNT(*) AS n FROM clientes_ruta WHERE id_ruta = ?', [idRuta]))[0].n);

  const puntos = await q('SELECT latitud, longitud, fecha, distancia_m FROM visitas_ruta WHERE id_sesion = ? AND latitud IS NOT NULL ORDER BY fecha, id', [s.id]);
  let metros = 0;
  for (let i = 1; i < puntos.length; i++) {
    metros += haversine(Number(puntos[i - 1].latitud), Number(puntos[i - 1].longitud), Number(puntos[i].latitud), Number(puntos[i].longitud));
  }
  const dists = puntos.filter(p => p.distancia_m !== null).map(p => Number(p.distancia_m));
  const v = (await q(`SELECT COUNT(*) AS ventas, COUNT(DISTINCT id_cliente) AS clientes,
                             COALESCE(SUM(total), 0) AS vendido, COALESCE(SUM(monto_pagado), 0) AS cobrado
                      FROM ventas WHERE id_sesion = ?`, [s.id]))[0];
  const ubic = {};
  (await q(`SELECT c.geo_estado, COUNT(*) AS n FROM clientes_ruta cr INNER JOIN clientes c ON c.id_cliente = cr.id_cliente
            WHERE cr.id_ruta = ? GROUP BY c.geo_estado`, [idRuta])).forEach(f => { ubic[f.geo_estado] = Number(f.n); });

  res.json({
    success: true,
    ruta: { id_ruta: ruta.id_ruta, nombre_ruta: ruta.nombre_ruta, nombre_vendedor: ruta.nombre_vendedor },
    sesion: { id_sesion: s.id, inicio: s.fecha_inicio, fin: s.fecha_fin, abierta: s.fecha_fin === null, duracion_min: Number(dur[0].min) },
    paradas: {
      clientes_ruta: total, atendidos: porEstado.atendido, ventas_marcadas: porEstado.venta, no_estaban: porEstado.no_estaba,
      sin_visitar: Math.max(0, total - porEstado.atendido - porEstado.venta - porEstado.no_estaba),
    },
    ventas: { ventas: Number(v.ventas), clientes: Number(v.clientes), total_vendido: Number(v.vendido), total_cobrado: Number(v.cobrado) },
    recorrido: {
      paradas_con_gps: puntos.length,
      km_entre_paradas: Math.round(metros / 10) / 100,
      metros_promedio_a_la_casa: dists.length ? Math.round(dists.reduce((a, b) => a + b, 0) / dists.length) : null,
    },
    ubicaciones: ubic,
  });
}));

module.exports = router;
