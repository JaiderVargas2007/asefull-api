// Saca latitud/longitud de un enlace compartido (Google Maps, ubicación de WhatsApp, Waze, OSM)
const config = require('../config');
const { enZona } = require('../utils/validar');

// Los enlaces cortos de Waze traen un geohash: waze.com/ul/h + geohash
function geohash(hash) {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let lat = [-90, 90], lng = [-180, 180], par = true;
  for (const ch of hash.toLowerCase()) {
    const v = base32.indexOf(ch);
    if (v === -1) return null;
    for (let b = 4; b >= 0; b--) {
      const bit = (v >> b) & 1;
      const rango = par ? lng : lat;
      const medio = (rango[0] + rango[1]) / 2;
      if (bit) rango[0] = medio; else rango[1] = medio;
      par = !par;
    }
  }
  return [(lat[0] + lat[1]) / 2, (lng[0] + lng[1]) / 2];
}

// Busca coordenadas dentro de un texto o URL. Devuelve { lat, lng, formato } o null
function coordsEnTexto(texto) {
  let t = String(texto);
  try { t = decodeURIComponent(decodeURIComponent(t)); } catch { /* texto con % sueltos */ }
  const n = '(-?\\d{1,3}\\.\\d{3,})';
  const patrones = [
    ['google_lugar', new RegExp(`!3d${n}!4d${n}`)],
    ['waze_ll', new RegExp(`ll\\.${n},${n}`)],
    ['parametro', new RegExp(`[?&](?:q|query|ll|sll|destination|daddr|center|to)=(?:loc:)?${n}\\s*,\\s*${n}`, 'i')],
    ['google_arroba', new RegExp(`@${n},${n}`)],
    ['geo_uri', new RegExp(`geo:${n},${n}`, 'i')],
    ['osm_marcador', new RegExp(`mlat=${n}&mlon=${n}`, 'i')],
    ['osm_mapa', new RegExp(`#map=\\d+\\/${n}\\/${n}`)],
    ['google_pagina', new RegExp(`\\[\\[\\[[\\d.]+,${n},${n}\\]`)],   // viene lng,lat
    ['texto', new RegExp(`(?<![\\d.])${n}\\s*,\\s*${n}(?![\\d.])`)],
  ];
  for (const [formato, re] of patrones) {
    const m = t.match(re);
    if (m) {
      let a = Number(m[1]), b = Number(m[2]);
      if (formato === 'google_pagina') [a, b] = [b, a];
      if (enZona(a, b)) return { lat: a, lng: b, formato };
    }
  }
  const w = t.match(/waze\.com\/ul\/h([0-9b-hjkmnp-z]{5,12})/i);
  if (w) {
    const g = geohash(w[1]);
    if (g && enZona(g[0], g[1])) return { lat: g[0], lng: g[1], formato: 'waze_geohash' };
  }
  return null;
}

// Solo se abren enlaces de estos sitios (el servidor no visita páginas cualquiera)
const PERMITIDOS = ['google.com', 'google.com.co', 'goo.gl', 'maps.app.goo.gl', 'g.co', 'waze.com', 'maps.apple.com', 'openstreetmap.org', 'osm.org'];
function hostPermitido(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!['http:', 'https:'].includes(u.protocol)) return false;
  const host = u.hostname.toLowerCase();
  return PERMITIDOS.some(p => host === p || host.endsWith('.' + p));
}

/**
 * Lee la ubicación de un enlace (o de un mensaje que trae el enlace).
 * Sigue los enlaces cortos (maps.app.goo.gl, goo.gl) hasta 5 redirecciones, revisando cada una.
 * Devuelve { lat, lng, formato, saltos } o { error }
 */
async function coordsDeEnlace(texto) {
  texto = String(texto || '').trim();
  if (!texto || texto.length > 2000) return { error: 'El enlace está vacío o es demasiado largo' };

  const directo = coordsEnTexto(texto);
  if (directo) return { ...directo, saltos: 0 };

  const encontrado = texto.match(/https?:\/\/[^\s<>"']+/i);
  if (!encontrado) return { error: 'No se encontró un enlace ni coordenadas en el texto' };
  let url = encontrado[0].replace(/[.,);]+$/, '');

  for (let salto = 0; salto <= 5; salto++) {
    if (!hostPermitido(url)) return { error: 'Solo se aceptan enlaces de Google Maps, WhatsApp (ubicación), Waze u OpenStreetMap' };
    let resp;
    try {
      resp = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) ' + config.servicios.userAgent, 'Accept-Language': 'es-CO,es' },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return { error: 'No se pudo abrir el enlace (sin conexión)' };
    }
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
      const siguiente = new URL(resp.headers.get('location'), url).toString();
      const c = coordsEnTexto(siguiente);
      if (c) return { ...c, saltos: salto + 1 };
      url = siguiente;
      continue;
    }
    const cuerpo = (await resp.text()).slice(0, 400000);
    const c = coordsEnTexto(cuerpo);
    if (c) return { ...c, saltos: salto };
    return { error: 'El enlace abrió, pero no trae una ubicación dentro de Bogotá' };
  }
  return { error: 'El enlace redirige demasiadas veces' };
}

module.exports = { coordsEnTexto, coordsDeEnlace, hostPermitido, geohash };
