// Ubicación de los clientes: marcarla a mano, por enlace compartido o cambiando la dirección
const express = require('express');
const { q } = require('../config/db');
const { asyncH, malaPeticion, noEncontrado } = require('../utils/errores');
const { entero, coordenada, puntoEnZona, listaIds } = require('../utils/validar');
const { guardarUbicacion, existenClientes } = require('../services/datos');
const { coordsDeEnlace } = require('../services/enlaces');
const { geocodificar } = require('../services/nominatim');
const { partirDireccion } = require('../services/geo');

const router = express.Router();

// PUT /api/clientes/ubicacion  { id_clientes: [..] | "1,2", lat, lng, fuente: gps|mapa }
// Marca la ubicación con el GPS (en la puerta) o moviendo el pin. Varios ids = un conjunto.
router.put('/ubicacion', asyncH(async (req, res) => {
  const ids = listaIds(req.body.id_clientes ?? req.body.id_cliente);
  const lat = coordenada(req.body.lat, 'lat'), lng = coordenada(req.body.lng, 'lng');
  puntoEnZona(lat, lng);
  const fuente = ['gps', 'mapa'].includes(req.body.fuente) ? req.body.fuente : 'mapa';
  if (!(await existenClientes(ids))) throw noEncontrado('Algún cliente no existe');
  await guardarUbicacion(ids, lat, lng, fuente);
  res.json({ success: true, clientes: ids, latitud: lat, longitud: lng, fuente });
}));

// POST /api/clientes/ubicacion/enlace  { enlace, id_clientes?, solo_leer? }
// El cliente comparte su ubicación por WhatsApp, Google Maps o Waze y se pega el enlace.
router.post('/ubicacion/enlace', asyncH(async (req, res) => {
  const enlace = String(req.body.enlace || '');
  if (!enlace.trim()) throw malaPeticion('Falta el enlace');
  const r = await coordsDeEnlace(enlace);
  if (r.error) throw malaPeticion(r.error);
  const datos = { latitud: Number(r.lat.toFixed(7)), longitud: Number(r.lng.toFixed(7)), formato: r.formato, saltos: r.saltos };

  const soloLeer = req.body.solo_leer === true || req.body.solo_leer === '1';
  if (soloLeer) return res.json({ success: true, guardado: false, ...datos });

  const ids = listaIds(req.body.id_clientes ?? req.body.id_cliente);
  if (!(await existenClientes(ids))) throw noEncontrado('Algún cliente no existe');
  await guardarUbicacion(ids, r.lat, r.lng, 'enlace');
  res.json({ success: true, guardado: true, clientes: ids, ...datos });
}));

// PUT /api/clientes/:idCliente/direccion  { direccion }
// Cambia la dirección escrita y la vuelve a ubicar con Nominatim
router.put('/:idCliente/direccion', asyncH(async (req, res) => {
  const idCliente = entero(req.params.idCliente, 'id_cliente');
  const direccion = String(req.body.direccion || '').trim();
  if (direccion.length < 5 || direccion.length > 200) throw malaPeticion('Escribe una dirección válida (5 a 200 caracteres)');
  if (!(await existenClientes([idCliente]))) throw noEncontrado('El cliente no existe');

  const g = await geocodificar(direccion);
  if (g === null) {
    await q("UPDATE clientes SET direccion = ?, latitud = NULL, longitud = NULL, geo_estado = 'pendiente', geo_actualizado = NOW() WHERE id_cliente = ?", [direccion, idCliente]);
    return res.status(202).json({ success: true, direccion, geo_estado: 'pendiente', aviso: 'Dirección guardada; se ubicará cuando Nominatim responda' });
  }
  if (g.precision === 'fallido') {
    await q("UPDATE clientes SET direccion = ?, latitud = NULL, longitud = NULL, geo_estado = 'fallido', geo_actualizado = NOW() WHERE id_cliente = ?", [direccion, idCliente]);
  } else {
    await q(`UPDATE clientes SET direccion = ?, latitud = ?, longitud = ?, geo_estado = ?, geo_fuente = 'nominatim', geo_actualizado = NOW()
             WHERE id_cliente = ?`, [direccion, g.lat, g.lng, g.precision, idCliente]);
  }
  res.json({ success: true, direccion, interpretada: partirDireccion(direccion), geo_estado: g.precision, latitud: g.lat ?? null, longitud: g.lng ?? null, desde_cache: g.desdeCache });
}));

// GET /api/clientes/geocodificar?direccion=...  (prueba: no cambia ningún cliente)
router.get('/geocodificar', asyncH(async (req, res) => {
  const direccion = String(req.query.direccion || '').trim();
  if (!direccion || direccion.length > 200) throw malaPeticion('Falta la dirección (máximo 200 caracteres)');
  const g = await geocodificar(direccion);
  if (g === null) return res.status(503).json({ success: false, message: 'Nominatim no respondió, intenta de nuevo' });
  res.json({ success: true, direccion, interpretada: partirDireccion(direccion), consulta_cache: g.consulta, precision: g.precision, latitud: g.lat ?? null, longitud: g.lng ?? null, desde_cache: g.desdeCache });
}));

module.exports = router;
