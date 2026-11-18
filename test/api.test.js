// Pruebas automáticas (node --test). No necesitan base de datos ni internet.
process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';            // puerto cerrado: cualquier consulta falla rápido
const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');
const { crearToken } = require('../src/middleware/auth');
const { haversine, partirDireccion } = require('../src/services/geo');
const { coordsEnTexto, hostPermitido } = require('../src/services/enlaces');
const { agrupar, optimizarOrden, matrizRecta } = require('../src/services/optimizar');
const { listaIds, enZona } = require('../src/utils/validar');

let base, servidor;
test.before(() => new Promise(r => { servidor = app.listen(0, () => { base = `http://127.0.0.1:${servidor.address().port}`; r(); }); }));
test.after(() => { servidor.close(); require('../src/config/db').pool.end().catch(() => {}); });

const pedir = (ruta, opciones = {}) => fetch(base + ruta, opciones).then(async r => ({ status: r.status, body: await r.json() }));

// ---------- JWT ----------
test('sin token -> 401', async () => {
  const r = await pedir('/api/rutas/6/mapa');
  assert.strictEqual(r.status, 401);
  assert.match(r.body.message, /Falta el token/);
});

test('token falso -> 401', async () => {
  const r = await pedir('/api/rutas/6/mapa', { headers: { Authorization: 'Bearer abc.def.ghi' } });
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.body.message, 'Token inválido');
});

test('vendedor no puede ver estadísticas -> 403', async () => {
  const token = crearToken({ id: 2, nombre: 'Vendedor', rol: 'vendedor' });
  const r = await pedir('/api/estadisticas', { headers: { Authorization: `Bearer ${token}` } });
  assert.strictEqual(r.status, 403);
});

test('token válido pasa y valida datos -> 400 por id inválido', async () => {
  const token = crearToken({ id: 1, nombre: 'Jefe', rol: 'jefe' });
  const r = await pedir('/api/rutas/abc/mapa', { headers: { Authorization: `Bearer ${token}` } });
  assert.strictEqual(r.status, 400);
});

test('/api/auth/yo devuelve el usuario del token', async () => {
  const token = crearToken({ id: 7, nombre: 'Ana', rol: 'vendedor' });
  const r = await pedir('/api/auth/yo', { headers: { Authorization: `Bearer ${token}` } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.usuario, { id: 7, nombre: 'Ana', rol: 'vendedor' });
});

test('login sin datos -> 400', async () => {
  const r = await pedir('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual(r.status, 400);
});

test('JSON mal formado -> 400', async () => {
  const r = await pedir('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{malo' });
  assert.strictEqual(r.status, 400);
});

test('ruta inexistente -> 404', async () => {
  const r = await pedir('/api/nada');
  assert.strictEqual(r.status, 404);
});

// ---------- Lógica de coordenadas ----------
test('haversine: 1 grado de latitud ≈ 111 km', () => {
  const d = haversine(4, -74, 5, -74);
  assert.ok(d > 110000 && d < 112500);
});

test('partir dirección colombiana', () => {
  const p = partirDireccion('Calle 59 Sur # 80J-10');
  assert.ok(p);
  assert.match(JSON.stringify(p), /59/);
});

test('coordenadas desde enlaces de Google y Waze', () => {
  const g = coordsEnTexto('https://www.google.com/maps/place/x/@4.6182,-74.1898,17z');
  assert.deepStrictEqual([g.lat, g.lng], [4.6182, -74.1898]);
  const w = coordsEnTexto('https://waze.com/ul?ll=4.6105,-74.1907&navigate=yes');
  assert.deepStrictEqual([w.lat, w.lng], [4.6105, -74.1907]);
  assert.strictEqual(coordsEnTexto('https://www.google.com/maps/@6.2442,-75.5812,15z'), null);   // fuera de Bogotá
  assert.strictEqual(hostPermitido('https://maps.app.goo.gl/abc123'), true);
  assert.strictEqual(hostPermitido('https://sitio-malicioso.com/x'), false);
});

test('zona y lista de ids', () => {
  assert.strictEqual(enZona(4.61, -74.19), true);
  assert.strictEqual(enZona(6.25, -75.56), false);          // Medellín
  assert.deepStrictEqual(listaIds('3, 3, 5'), [3, 5]);
});

test('optimizar nunca empeora el recorrido', () => {
  const clientes = [
    { id_cliente: 1, latitud: 4.600, longitud: -74.200 }, { id_cliente: 2, latitud: 4.620, longitud: -74.180 },
    { id_cliente: 3, latitud: 4.601, longitud: -74.199 }, { id_cliente: 4, latitud: 4.619, longitud: -74.181 },
    { id_cliente: 5, latitud: 4.610, longitud: -74.190 },
  ];
  const paradas = agrupar(clientes);
  const D = matrizRecta(paradas.map(p => [p.lat, p.lng]));
  const r = optimizarOrden(paradas, null, D);
  assert.ok(r.metrosOptimizado <= r.metrosActual);
  assert.ok(r.mejoro);
});
