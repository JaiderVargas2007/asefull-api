// Página demo: usa la API igual que lo haría la app Android (login -> token -> peticiones con Bearer)
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('token') || '';
let datosMapa = null;      // respuesta de /mapa
let vistaPrevia = null;    // respuesta de /optimizar
let modoClic = false;

// ---------- Mapa ----------
const mapa = L.map('mapa').setView([4.6125, -74.192], 14);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap · © CARTO',
}).addTo(mapa);
const capa = L.layerGroup().addTo(mapa);
const capaLinea = L.layerGroup().addTo(mapa);

// ---------- Llamar a la API y mostrar la petición ----------
async function api(metodo, ruta, cuerpo, { sinToken = false, tokenUsar } = {}) {
  const headers = {};
  const t = tokenUsar ?? token;
  if (!sinToken && t) headers.Authorization = `Bearer ${t}`;
  if (cuerpo) headers['Content-Type'] = 'application/json';
  const inicio = performance.now();
  let status = 0, json;
  try {
    const r = await fetch(ruta, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    status = r.status;
    json = await r.json();
  } catch (e) {
    json = { success: false, message: 'No hubo respuesta: ' + e.message };
  }
  const ms = Math.round(performance.now() - inicio);
  const auth = headers.Authorization ? '  [Authorization: Bearer …]' : '  [sin token]';
  $('linea').innerHTML = `${metodo} ${ruta}${auth} → <span class="${status < 400 ? 'ok' : 'mal'}">${status}</span> · ${ms} ms`;
  const mostrar = JSON.parse(JSON.stringify(json));
  if (mostrar.token) mostrar.token = mostrar.token.slice(0, 25) + '…';
  if (Array.isArray(mostrar.clientes) && mostrar.clientes.length > 3) mostrar.clientes = [...mostrar.clientes.slice(0, 3), `… y ${mostrar.clientes.length - 3} más`];
  if (Array.isArray(mostrar.puntos) && mostrar.puntos.length > 4) mostrar.puntos = [...mostrar.puntos.slice(0, 4), `… y ${mostrar.puntos.length - 4} más`];
  $('json').textContent = JSON.stringify(mostrar, null, 2);
  if (status === 401 && !sinToken && tokenUsar === undefined && token) { /* token vencido */ }
  return { status, json };
}

function ocupado(boton, fn) {
  return async () => { boton.disabled = true; try { await fn(); } finally { boton.disabled = false; } };
}

// ---------- 1. Login / JWT ----------
function b64(parte) {
  const s = parte.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(s + '='.repeat((4 - s.length % 4) % 4))));
}
function pintarSesion() {
  if (!token) {
    $('sesion').textContent = 'Sin sesión';
    $('token').classList.add('oculto');
    return;
  }
  const [h, p, f] = token.split('.');
  const datos = JSON.parse(b64(p));
  $('sesion').textContent = `${datos.nombre} · ${datos.rol}`;
  const fecha = (s) => new Date(s * 1000).toLocaleString('es-CO');
  $('token').innerHTML = `<span class="h">${h}</span>.<span class="p">${p}</span>.<span class="f">${f}</span>`
    + `<div class="datos">Encabezado: ${b64(h)}\nDatos: usuario ${datos.sub} · ${datos.nombre} · rol ${datos.rol}\n`
    + `Emitido: ${fecha(datos.iat)}\nVence:   ${fecha(datos.exp)}\nFirma: HMAC-SHA256 con la clave secreta del servidor</div>`;
  $('token').classList.remove('oculto');
}

$('fLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { json } = await api('POST', '/api/auth/login', { email: $('email').value, password: $('clave').value }, { sinToken: true });
  if (json.token) {
    token = json.token;
    try { sessionStorage.setItem('token', token); } catch { /* sin almacenamiento */ }
    pintarSesion();
  }
});
$('bSinToken').addEventListener('click', () => api('GET', `/api/rutas/${idRuta()}/mapa`, null, { sinToken: true }));
$('bTokenFalso').addEventListener('click', () => {
  const falso = token ? token.slice(0, -4) + 'XXXX' : 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.firma-inventada';
  api('GET', `/api/rutas/${idRuta()}/mapa`, null, { tokenUsar: falso });
});
$('bSalir').addEventListener('click', () => {
  token = '';
  try { sessionStorage.removeItem('token'); } catch { /* nada */ }
  pintarSesion();
  $('json').textContent = 'Sesión cerrada: el token se borró del navegador.';
});

// ---------- 2. Mapa ----------
const idRuta = () => Number($('idRuta').value) || 6;

function pintarMapa(orden) {
  capa.clearLayers();
  capaLinea.clearLayers();
  if (!datosMapa) return;
  const puntos = [];
  const b = datosMapa.bodega;
  if (b) {
    L.marker([b.latitud, b.longitud], { icon: L.divIcon({ className: 'bodega', html: 'BODEGA' }) }).addTo(capa);
    puntos.push([b.latitud, b.longitud]);
  }
  const porId = Object.fromEntries(datosMapa.clientes.map(c => [c.id_cliente, c]));
  const lista = orden ? orden.map(o => ({ ...porId[o.id_cliente], n: o.orden_visita })) : datosMapa.clientes.map((c, i) => ({ ...c, n: i + 1 }));
  const sel = Number($('cliente').value);
  lista.forEach(c => {
    if (c.latitud === null) return;
    const clase = 'pin' + (c.id_cliente === sel ? ' sel' : c.geo_estado === 'aproximada' ? ' aprox' : '');
    L.marker([c.latitud, c.longitud], { icon: L.divIcon({ className: clase, html: String(c.n) }) })
      .bindPopup(`<b>${c.n}. ${c.nombre}</b><br>${c.direccion || ''}<br><small>${c.latitud}, ${c.longitud} · ${c.geo_estado} (${c.geo_fuente || '-'})</small>`)
      .addTo(capa);
    puntos.push([c.latitud, c.longitud]);
  });
  if (b) puntos.push([b.latitud, b.longitud]);
  L.polyline(puntos, { color: orden ? '#2563eb' : '#c0392b', weight: 3, dashArray: orden ? null : '6 6' }).addTo(capaLinea);
  if (puntos.length) mapa.fitBounds(puntos, { padding: [30, 30] });
}

async function cargarMapa() {
  const { json } = await api('GET', `/api/rutas/${idRuta()}/mapa`);
  if (!json.success) return;
  datosMapa = json;
  vistaPrevia = null;
  $('km').classList.add('oculto');
  $('info').textContent = `${json.ruta.nombre_ruta} · vendedor ${json.ruta.nombre_vendedor} · ${json.total} clientes · `
    + `${json.total - json.sin_ubicacion} con coordenadas · ${json.pendientes} pendientes · línea roja = orden actual`;
  const actual = $('cliente').value;
  $('cliente').innerHTML = '<option value="">Elige un cliente…</option>' + json.clientes
    .map((c, i) => `<option value="${c.id_cliente}">${i + 1}. ${c.nombre} ${c.latitud === null ? '(sin ubicación)' : ''}</option>`).join('');
  $('cliente').value = actual;
  pintarMapa();
}
$('bMapa').addEventListener('click', ocupado($('bMapa'), cargarMapa));
$('bGeo').addEventListener('click', ocupado($('bGeo'), async () => {
  await api('POST', `/api/rutas/${idRuta()}/geocodificar`, { max: 6, reintentar: true });
  const resp = $('json').textContent;
  await cargarMapa();
  $('json').textContent = resp;
}));
$('cliente').addEventListener('change', () => pintarMapa(vistaPrevia?.orden));

// ---------- 3. Optimizar ----------
function pintarKm(r) {
  $('km').innerHTML = `<div>Actual<strong>${r.km_actual} km</strong></div><div>Optimizado<strong>${r.km_optimizado} km</strong></div><div>Ahorro<strong>${r.ahorro_km} km</strong></div>`;
  $('km').classList.remove('oculto');
}
$('bOpt').addEventListener('click', ocupado($('bOpt'), async () => {
  if (!datosMapa) await cargarMapa();
  const { json } = await api('POST', `/api/rutas/${idRuta()}/optimizar`, { guardar: false });
  if (!json.success) return;
  vistaPrevia = json;
  pintarKm(json);
  pintarMapa(json.orden);
  $('info').textContent = `Línea azul = orden propuesto (${json.paradas} paradas, distancias por ${json.distancias}). Aún no se ha guardado.`;
}));
$('bGuardar').addEventListener('click', ocupado($('bGuardar'), async () => {
  const { json } = await api('POST', `/api/rutas/${idRuta()}/optimizar`, { guardar: true });
  if (!json.success) return;
  const resp = $('json').textContent, linea = $('linea').innerHTML;
  await cargarMapa();
  pintarKm(json);
  $('json').textContent = resp; $('linea').innerHTML = linea;
  $('info').textContent = 'Orden guardado en la base de datos. El orden anterior quedó respaldado (botón Deshacer).';
}));
$('bDeshacer').addEventListener('click', ocupado($('bDeshacer'), async () => {
  const { json } = await api('POST', `/api/rutas/${idRuta()}/restaurar-orden`);
  if (!json.success) return;
  const resp = $('json').textContent, linea = $('linea').innerHTML;
  await cargarMapa();
  $('json').textContent = resp; $('linea').innerHTML = linea;
}));
$('bCalles').addEventListener('click', ocupado($('bCalles'), async () => {
  if (!datosMapa) await cargarMapa();
  const porId = Object.fromEntries(datosMapa.clientes.map(c => [c.id_cliente, c]));
  const lista = vistaPrevia ? vistaPrevia.orden.map(o => porId[o.id_cliente]) : datosMapa.clientes;
  const puntos = [];
  const b = datosMapa.bodega;
  if (b) puntos.push([b.latitud, b.longitud]);
  lista.forEach(c => { if (c.latitud !== null) puntos.push([c.latitud, c.longitud]); });
  if (b) puntos.push([b.latitud, b.longitud]);
  const { json } = await api('POST', '/api/rutas/calles', { puntos: puntos.slice(0, 60) });
  if (!json.success) return;
  capaLinea.clearLayers();
  L.polyline(json.puntos, { color: '#147a4b', weight: 5, opacity: .85 }).addTo(capaLinea);
  $('info').textContent = `Camino ${json.por_calles ? 'por calles (OSRM)' : 'en línea recta (OSRM no respondió)'}: `
    + `${(json.distancia_m / 1000).toFixed(2)} km · unos ${Math.round(json.duracion_s / 60)} min`
    + (json.pasos.length ? ` · primera instrucción: "${json.pasos[0].instruccion}"` : '');
}));

// ---------- 4. Corregir ubicación ----------
function clienteElegido() {
  const id = Number($('cliente').value);
  if (!id) { $('json').textContent = 'Elige primero un cliente en la lista.'; return null; }
  return id;
}
async function recargarConservando() {
  const resp = $('json').textContent, linea = $('linea').innerHTML;
  await cargarMapa();
  $('json').textContent = resp; $('linea').innerHTML = linea;
}
$('bEnlace').addEventListener('click', ocupado($('bEnlace'), async () => {
  const id = clienteElegido(); if (!id) return;
  const { json } = await api('POST', '/api/clientes/ubicacion/enlace', { enlace: $('enlace').value, id_clientes: [id] });
  if (json.success) { await recargarConservando(); mapa.setView([json.latitud, json.longitud], 17); }
}));
$('bClicMapa').addEventListener('click', () => {
  modoClic = !modoClic;
  $('bClicMapa').classList.toggle('activo', modoClic);
  $('bClicMapa').textContent = modoClic ? 'Haz clic en el mapa…' : 'Mover con clic en el mapa';
});
mapa.on('click', async (e) => {
  if (!modoClic) return;
  const id = clienteElegido(); if (!id) return;
  modoClic = false;
  $('bClicMapa').classList.remove('activo');
  $('bClicMapa').textContent = 'Mover con clic en el mapa';
  const { json } = await api('PUT', '/api/clientes/ubicacion',
    { id_clientes: [id], lat: Number(e.latlng.lat.toFixed(7)), lng: Number(e.latlng.lng.toFixed(7)), fuente: 'mapa' });
  if (json.success) await recargarConservando();
});
$('bDir').addEventListener('click', ocupado($('bDir'), async () => {
  const id = clienteElegido(); if (!id) return;
  const { json } = await api('PUT', `/api/clientes/${id}/direccion`, { direccion: $('direccion').value });
  if (json.success) await recargarConservando();
}));

// ---------- 5. Salida ----------
$('bVisita').addEventListener('click', ocupado($('bVisita'), async () => {
  const id = clienteElegido(); if (!id) return;
  const c = datosMapa.clientes.find(x => x.id_cliente === id);
  // Simula que el vendedor está a unos metros de la casa del cliente
  const lat = c.latitud !== null ? Number((c.latitud + 0.0001).toFixed(7)) : undefined;
  const lng = c.longitud !== null ? Number((c.longitud + 0.0001).toFixed(7)) : undefined;
  await api('POST', `/api/rutas/${idRuta()}/visitas`, { id_cliente: id, estado: 'venta', lat, lng });
}));
$('bResumen').addEventListener('click', ocupado($('bResumen'), () => api('GET', `/api/rutas/${idRuta()}/resumen`)));
$('bStats').addEventListener('click', ocupado($('bStats'), () => api('GET', '/api/estadisticas?dias=7')));

pintarSesion();
