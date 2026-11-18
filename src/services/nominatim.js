// Nominatim (OpenStreetMap): dirección escrita -> latitud / longitud
// Usa la tabla geocache para no consultar dos veces la misma dirección
// y respeta la regla de Nominatim de máximo 1 consulta por segundo.
const config = require('../config');
const { q } = require('../config/db');
const { partirDireccion, claveDireccion } = require('./geo');
const { enZona } = require('../utils/validar');

// Fila de espera: cada consulta sale mínimo 1,1 s después de la anterior
let ultimaConsulta = Promise.resolve();
function turno() {
  const espera = ultimaConsulta.then(() => new Promise(r => setTimeout(r, 1100)));
  const actual = ultimaConsulta;
  ultimaConsulta = espera;
  return actual;
}

async function buscar(parametros) {
  await turno();
  const z = config.zona;
  const params = new URLSearchParams({
    format: 'jsonv2', limit: '3', countrycodes: 'co', bounded: '1',
    viewbox: `${z.lngMin},${z.latMax},${z.lngMax},${z.latMin}`,
    ...parametros,
  });
  let resp;
  try {
    resp = await fetch(`${config.servicios.nominatim}/search?${params}`, {
      headers: { 'User-Agent': config.servicios.userAgent, 'Accept-Language': 'es' },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return null;                       // sin red: no se guarda nada en caché
  }
  if (!resp.ok) return null;
  const lista = await resp.json();
  for (const r of lista) {
    const lat = Number(r.lat), lng = Number(r.lon);
    if (enZona(lat, lng)) return { lat, lng, tipo: r.addresstype || r.type || '', nombre: r.display_name || '' };
  }
  return {};                           // respondió, pero sin resultado en Bogotá
}

/**
 * Devuelve { lat, lng, precision: 'ok'|'aproximada', desdeCache }
 *      o   { precision: 'fallido', desdeCache }
 *      o   null si Nominatim no respondió.
 */
async function geocodificar(direccion) {
  const p = partirDireccion(direccion);
  const clave = claveDireccion(direccion);

  const cache = await q('SELECT latitud, longitud, precision_g FROM geocache WHERE consulta = ?', [clave]);
  if (cache.length) {
    await q('UPDATE geocache SET usos = usos + 1 WHERE consulta = ?', [clave]);
    const c = cache[0];
    if (c.precision_g === 'fallido') return { precision: 'fallido', desdeCache: true, consulta: clave };
    return { lat: Number(c.latitud), lng: Number(c.longitud), precision: c.precision_g, desdeCache: true, consulta: clave };
  }

  const intentos = [];
  if (p && p.placa === '') {
    intentos.push([{ q: `${p.via} con ${p.cruce}, Bogotá` }, 'aproximada']);
    intentos.push([{ q: `${p.via}, Bogotá` }, 'aproximada']);
  } else if (p) {
    intentos.push([{ street: `${p.placa} ${p.via}`, city: 'Bogotá' }, 'ok']);
    intentos.push([{ q: `${p.via} # ${p.placa}, Bogotá` }, 'ok']);
    intentos.push([{ q: `${p.via}, Bogotá` }, 'aproximada']);
  } else {
    intentos.push([{ q: `${direccion}, Bogotá` }, 'aproximada']);
  }

  let sinRed = false;
  for (const [params, precisionBase] of intentos) {
    const r = await buscar(params);
    if (r === null) { sinRed = true; continue; }
    if (r.lat !== undefined) {
      let precision = precisionBase;
      const exacto = ['house', 'building', 'place', 'amenity', 'shop', 'residential'].includes(r.tipo);
      if (precision === 'ok' && !exacto && !(p && r.nombre.includes(p.placa))) precision = 'aproximada';
      await q(`INSERT INTO geocache (consulta, latitud, longitud, precision_g, respuesta) VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE latitud = VALUES(latitud), longitud = VALUES(longitud),
               precision_g = VALUES(precision_g), respuesta = VALUES(respuesta)`,
        [clave, r.lat, r.lng, precision, r.nombre.slice(0, 250)]);
      return { lat: r.lat, lng: r.lng, precision, desdeCache: false, consulta: clave };
    }
  }
  if (sinRed) return null;
  await q('INSERT IGNORE INTO geocache (consulta, precision_g) VALUES (?, ?)', [clave, 'fallido']);
  return { precision: 'fallido', desdeCache: false, consulta: clave };
}

module.exports = { geocodificar };
