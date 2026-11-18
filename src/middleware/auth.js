// Verificación del JWT que manda la app en el encabezado: Authorization: Bearer <token>
const jwt = require('jsonwebtoken');
const config = require('../config');
const { noAutorizado, prohibido } = require('../utils/errores');

function crearToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    config.jwt.secreto,
    { expiresIn: config.jwt.expira, issuer: 'asefull-api' }
  );
}

function requiereToken(req, res, next) {
  const encabezado = req.headers.authorization || '';
  const [tipo, token] = encabezado.split(' ');
  if (tipo !== 'Bearer' || !token) return next(noAutorizado('Falta el token (Authorization: Bearer ...)'));
  try {
    const datos = jwt.verify(token, config.jwt.secreto, { issuer: 'asefull-api' });
    req.usuario = { id: Number(datos.sub), nombre: datos.nombre, rol: datos.rol };
    next();
  } catch (e) {
    next(noAutorizado(e.name === 'TokenExpiredError' ? 'El token venció, inicia sesión de nuevo' : 'Token inválido'));
  }
}

// Solo deja pasar a ciertos roles (ej. el jefe)
function soloRoles(roles) {
  return (req, res, next) => {
    const rol = String(req.usuario?.rol || '').toLowerCase();
    if (!roles.includes(rol)) return next(prohibido());
    next();
  };
}

module.exports = { crearToken, requiereToken, soloRoles };
