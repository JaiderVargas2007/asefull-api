// Error con código HTTP para responder siempre con el mismo formato JSON
class HttpError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

const malaPeticion = (m) => new HttpError(400, m);
const noAutorizado = (m = 'Token inválido o ausente') => new HttpError(401, m);
const prohibido = (m = 'No tienes permiso para esta acción') => new HttpError(403, m);
const noEncontrado = (m = 'No encontrado') => new HttpError(404, m);

// Para no repetir try/catch en cada ruta async
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, malaPeticion, noAutorizado, prohibido, noEncontrado, asyncH };
