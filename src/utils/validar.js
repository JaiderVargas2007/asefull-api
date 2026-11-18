// Validaciones de entrada (lo que llega del celular o de Postman)
const config = require('../config');
const { malaPeticion } = require('./errores');

function entero(valor, nombre, { min = 1, obligatorio = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw malaPeticion(`Falta ${nombre}`);
    return null;
  }
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min) throw malaPeticion(`${nombre} debe ser un número entero válido`);
  return n;
}

function coordenada(valor, nombre) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n)) throw malaPeticion(`${nombre} no es un número`);
  return n;
}

function enZona(lat, lng) {
  const z = config.zona;
  return lat != null && lng != null && lat >= z.latMin && lat <= z.latMax && lng >= z.lngMin && lng <= z.lngMax;
}

function puntoEnZona(lat, lng) {
  if (lat == null || lng == null) throw malaPeticion('Faltan lat y lng');
  if (!enZona(lat, lng)) throw malaPeticion('La ubicación está fuera de Bogotá');
}

// Acepta [1,2,3], "1,2,3" o un solo número
function listaIds(valor, nombre = 'id_clientes') {
  let lista = valor;
  if (typeof valor === 'string') lista = valor.split(',');
  if (typeof valor === 'number') lista = [valor];
  if (!Array.isArray(lista) || lista.length === 0) throw malaPeticion(`Falta ${nombre}`);
  const ids = [...new Set(lista.map(x => Number(String(x).trim())).filter(n => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) throw malaPeticion(`${nombre} no tiene ids válidos`);
  if (ids.length > 30) throw malaPeticion('Máximo 30 clientes por punto');
  return ids;
}

module.exports = { entero, coordenada, enZona, puntoEnZona, listaIds };
