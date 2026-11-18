// Inicio de sesión: valida usuario y contraseña contra la tabla usuarios de ASEFULL y entrega un JWT
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { q } = require('../config/db');
const { crearToken, requiereToken } = require('../middleware/auth');
const { asyncH, malaPeticion, noAutorizado, prohibido } = require('../utils/errores');

const router = express.Router();

// Máximo 10 intentos de login cada 15 minutos por IP (evita adivinar contraseñas)
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos, espera 15 minutos' },
});

const igual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Compara la contraseña según cómo esté guardada en la base de datos
async function claveCorrecta(escrita, guardada) {
  if (!guardada) return false;
  guardada = String(guardada);
  if (/^\$2[aby]\$/.test(guardada)) return bcrypt.compare(escrita, guardada.replace(/^\$2y\$/, '$2a$'));   // password_hash de PHP
  if (/^[a-f0-9]{32}$/i.test(guardada)) return igual(crypto.createHash('md5').update(escrita).digest('hex'), guardada.toLowerCase());
  if (/^[a-f0-9]{40}$/i.test(guardada)) return igual(crypto.createHash('sha1').update(escrita).digest('hex'), guardada.toLowerCase());
  if (/^[a-f0-9]{64}$/i.test(guardada)) return igual(crypto.createHash('sha256').update(escrita).digest('hex'), guardada.toLowerCase());
  return igual(escrita, guardada);
}

async function rolDe(usuario) {
  const directo = usuario.rol ?? usuario.role ?? usuario.tipo ?? usuario.tipo_usuario;
  if (directo) return String(directo).toLowerCase();
  try {
    const f = await q(`SELECT r.nombre FROM usuarios_roles ur INNER JOIN roles r ON r.id = ur.id_rol
                       WHERE ur.id_usuario = ? LIMIT 1`, [usuario.id]);
    if (f.length) return String(f[0].nombre).toLowerCase();
  } catch { /* la tabla puede tener otras columnas */ }
  return 'vendedor';
}

router.post('/login', limiteLogin, asyncH(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) throw malaPeticion('Faltan email y password');
  if (email.length > 150 || password.length > 200) throw malaPeticion('Datos demasiado largos');

  const filas = await q('SELECT * FROM usuarios WHERE LOWER(email) = ? LIMIT 1', [email]);
  const usuario = filas[0];
  const columna = usuario && ['password', 'contrasena', 'contraseña', 'clave', 'pass', 'password_hash'].find(c => c in usuario);
  // Mismo mensaje si el correo no existe o la clave está mal (no se revela cuál de los dos falló)
  if (!usuario || !(await claveCorrecta(password, usuario[columna]))) throw noAutorizado('Correo o contraseña incorrectos');
  if (usuario.activo === 0 || String(usuario.estado || '').toLowerCase() === 'inactivo') throw prohibido('La cuenta está inactiva');

  const datos = { id: usuario.id, nombre: usuario.nombre, rol: await rolDe(usuario) };
  res.json({
    success: true,
    token: crearToken(datos),
    tipo: 'Bearer',
    expira_en: config.jwt.expira,
    usuario: { ...datos, email: usuario.email },
  });
}));

// Quién soy según el token
router.get('/yo', requiereToken, (req, res) => {
  res.json({ success: true, usuario: req.usuario });
});

module.exports = router;
