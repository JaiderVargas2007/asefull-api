// Consultas a la base de datos de ASEFULL que usan varias rutas de la API
const { q } = require('../config/db');

// Ruta + nombre del vendedor (JOIN con usuarios.id, regla de ASEFULL)
async function datosRuta(idRuta) {
  const f = await q(`SELECT r.id_ruta, r.nombre_ruta, r.estado_ruta, r.fecha, r.id_vendedor,
                            COALESCE(u.nombre, 'Sin asignar') AS nombre_vendedor
                     FROM rutas r LEFT JOIN usuarios u ON u.id = r.id_vendedor
                     WHERE r.id_ruta = ?`, [idRuta]);
  return f[0] || null;
}

// Sesión abierta de la ruta (la que crea "Iniciar ruta")
async function sesionAbierta(idRuta) {
  const f = await q('SELECT id FROM rutas_sesiones WHERE id_ruta = ? AND fecha_fin IS NULL ORDER BY id DESC LIMIT 1', [idRuta]);
  return f.length ? f[0].id : null;
}

// Clientes de la ruta en su orden de visita, con coordenadas
async function clientesDeRuta(idRuta) {
  const filas = await q(`SELECT cr.id AS id_cr, cr.id_cliente, cr.orden_visita, cr.visitado,
                                c.nombre_cliente AS nombre, c.direccion, COALESCE(c.referencia, '') AS referencia,
                                COALESCE(c.telefono, '') AS telefono, COALESCE(c.deuda, 0) AS deuda,
                                COALESCE(c.usa_whatsapp_deuda, 0) AS usa_whatsapp,
                                c.latitud, c.longitud, c.geo_estado, c.geo_fuente
                         FROM clientes_ruta cr
                         INNER JOIN clientes c ON c.id_cliente = cr.id_cliente
                         WHERE cr.id_ruta = ?
                         ORDER BY cr.orden_visita IS NULL, cr.orden_visita, cr.id`, [idRuta]);
  return filas.map(f => ({
    ...f,
    visitado: Boolean(f.visitado),
    deuda: Number(f.deuda),
    usa_whatsapp: Boolean(f.usa_whatsapp),
    latitud: f.latitud !== null ? Number(f.latitud) : null,
    longitud: f.longitud !== null ? Number(f.longitud) : null,
  }));
}

async function bodegaDeRuta(idRuta) {
  const f = await q(`SELECT latitud, longitud FROM rutas_puntos
                     WHERE clave = 'bodega' AND id_ruta IN (?, 0) ORDER BY id_ruta DESC LIMIT 1`, [idRuta]);
  return f.length ? { latitud: Number(f[0].latitud), longitud: Number(f[0].longitud) } : null;
}

async function guardarUbicacion(ids, lat, lng, fuente) {
  const marcas = ids.map(() => '?').join(',');
  const r = await q(`UPDATE clientes SET latitud = ?, longitud = ?, geo_estado = 'manual', geo_fuente = ?, geo_actualizado = NOW()
                     WHERE id_cliente IN (${marcas})`, [lat, lng, fuente, ...ids]);
  return r.affectedRows;
}

async function existenClientes(ids) {
  const marcas = ids.map(() => '?').join(',');
  const f = await q(`SELECT COUNT(*) AS n FROM clientes WHERE id_cliente IN (${marcas})`, ids);
  return Number(f[0].n) === ids.length;
}

module.exports = { datosRuta, sesionAbierta, clientesDeRuta, bodegaDeRuta, guardarUbicacion, existenClientes };
