// OSRM: camino por las calles reales (datos de OpenStreetMap)
// Guarda las respuestas en cache_rutas para no repetir consultas
const crypto = require('crypto');
const config = require('../config');
const { q } = require('../config/db');

const coordsTexto = (puntos) => puntos.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
const llave = (tipo, texto) => crypto.createHash('sha1').update(`${tipo}|${texto}`).digest('hex');

async function leerCache(tipo, texto) {
  const clave = llave(tipo, texto);
  const filas = await q(`SELECT respuesta FROM cache_rutas WHERE clave = ? AND creado > (NOW() - INTERVAL ${Number(config.cacheDias)} DAY)`, [clave]);
  if (!filas.length) return null;
  await q('UPDATE cache_rutas SET usos = usos + 1 WHERE clave = ?', [clave]);
  return JSON.parse(filas[0].respuesta);
}

async function guardarCache(tipo, texto, datos) {
  await q(`INSERT INTO cache_rutas (clave, tipo, respuesta) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE respuesta = VALUES(respuesta), creado = NOW(), usos = 0`,
    [llave(tipo, texto), tipo, JSON.stringify(datos)]);
}

async function pedir(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': config.servicios.userAgent }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const j = await r.json();
    return j.code === 'Ok' ? j : null;
  } catch {
    return null;
  }
}

// Matriz de distancias (metros por calles) entre todos los puntos, o null si OSRM no responde
async function tabla(puntos) {
  const texto = coordsTexto(puntos);
  const c = await leerCache('tabla', texto);
  if (c) return c;
  const j = await pedir(`${config.servicios.osrm}/table/v1/driving/${texto}?annotations=distance`);
  if (!j || !j.distances) return null;
  await guardarCache('tabla', texto, j.distances);
  return j.distances;
}

// Ruta completa con geometría y pasos. Devuelve { datos, desdeCache }
async function ruta(puntos) {
  const texto = coordsTexto(puntos);
  const c = await leerCache('ruta', texto);
  if (c) return { datos: c, desdeCache: true };
  const j = await pedir(`${config.servicios.osrm}/route/v1/driving/${texto}?overview=full&geometries=geojson&steps=true`);
  if (!j) return { datos: null, desdeCache: false };
  await guardarCache('ruta', texto, j);
  return { datos: j, desdeCache: false };
}

// Instrucción en español a partir de la maniobra de OSRM
function instruccion(paso) {
  const m = paso.maneuver || {};
  const calle = paso.name ? ` por ${paso.name}` : '';
  const giros = {
    left: 'Gira a la izquierda', right: 'Gira a la derecha',
    'slight left': 'Gira levemente a la izquierda', 'slight right': 'Gira levemente a la derecha',
    'sharp left': 'Gira fuerte a la izquierda', 'sharp right': 'Gira fuerte a la derecha',
    uturn: 'Da la vuelta', straight: 'Sigue derecho',
  };
  if (m.type === 'depart') return `Sal${calle}`;
  if (m.type === 'arrive') return 'Llegaste al destino';
  if (m.type === 'roundabout' || m.type === 'rotary') return `En la glorieta toma la salida ${m.exit || ''}`.trim() + calle;
  return (giros[m.modifier] || 'Continúa') + calle;
}

module.exports = { tabla, ruta, instruccion };
