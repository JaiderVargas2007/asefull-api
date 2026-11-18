// Configuración de la API. Todo sale de variables de entorno (.env en local, panel de Render en producción).
require('dotenv').config();

const config = {
  puerto: Number(process.env.PORT || 3000),
  entorno: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'u234395481_asefull',
    ssl: process.env.DB_SSL === 'true',
  },

  jwt: {
    secreto: process.env.JWT_SECRET || '',
    expira: process.env.JWT_EXPIRES_IN || '8h',
  },

  // Roles que pueden ver estadísticas y cambiar la bodega
  rolesAdmin: (process.env.ROLES_ADMIN || 'jefe,admin,administrador').split(',').map(r => r.trim().toLowerCase()),

  servicios: {
    nominatim: process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
    osrm: process.env.OSRM_URL || 'https://router.project-osrm.org',
    userAgent: process.env.USER_AGENT || 'ASEFULL-API/1.0 (asefull-rutas)',
  },

  cors: process.env.CORS_ORIGIN || '*',
  cacheDias: Number(process.env.CACHE_DIAS || 30),

  // Zona válida: Bogotá, Soacha y alrededores
  zona: { latMin: 4.40, latMax: 4.90, lngMin: -74.40, lngMax: -73.95 },
};

if (!config.jwt.secreto || config.jwt.secreto.length < 32) {
  if (config.entorno === 'test') {
    config.jwt.secreto = 'secreto-solo-para-pruebas-automaticas-1234567890';
  } else {
    console.error('Falta JWT_SECRET (mínimo 32 caracteres) en las variables de entorno');
    process.exit(1);
  }
}

module.exports = config;
