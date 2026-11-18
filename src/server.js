// Punto de entrada: levanta el servidor HTTP y lo cierra limpio cuando Docker/Render lo detiene
const app = require('./app');
const config = require('./config');
const { pool } = require('./config/db');

const servidor = app.listen(config.puerto, () => {
  console.log(`ASEFULL API escuchando en el puerto ${config.puerto} (${config.entorno})`);
});

function apagar(senal) {
  console.log(`${senal} recibido, cerrando...`);
  servidor.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
