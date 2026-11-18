// Conexión a MySQL/MariaDB con un pool (varias conexiones reutilizables)
const mysql = require('mysql2/promise');
const config = require('./index');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 5,
  timezone: '-05:00',
  dateStrings: true,
  charset: 'utf8mb4',
});

// Zona horaria de Colombia en cada conexión nueva (igual que conexion.php)
pool.on('connection', (con) => {
  con.query("SET time_zone = '-05:00'");
});

// Consulta preparada: devuelve las filas (SELECT) o el resultado (INSERT/UPDATE)
async function q(sql, params = []) {
  const [resultado] = await pool.execute(sql, params);
  return resultado;
}

// Ejecuta varias consultas en una transacción: o se guarda todo o nada
async function transaccion(fn) {
  const con = await pool.getConnection();
  try {
    await con.beginTransaction();
    const r = await fn(async (sql, params = []) => (await con.execute(sql, params))[0]);
    await con.commit();
    return r;
  } catch (e) {
    await con.rollback();
    throw e;
  } finally {
    con.release();
  }
}

module.exports = { pool, q, transaccion };
