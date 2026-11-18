// Mejor orden de visita: vecino más cercano + mejora 2-opt
// Los clientes que viven en el mismo punto (a menos de 15 m, ej. un conjunto) quedan en una sola parada.
const { haversine } = require('./geo');

function agrupar(clientes, metros = 15) {
  const paradas = [];
  for (const c of clientes) {
    const p = paradas.find(x => haversine(x.lat, x.lng, c.latitud, c.longitud) <= metros);
    if (p) p.clientes.push(c);
    else paradas.push({ lat: c.latitud, lng: c.longitud, clientes: [c] });
  }
  return paradas;
}

// Largo de un recorrido (lista de índices) con la matriz D; cerrado = vuelve al inicio
function largo(orden, D, cerrado) {
  let total = 0;
  for (let i = 1; i < orden.length; i++) total += D[orden[i - 1]][orden[i]];
  if (cerrado && orden.length > 1) total += D[orden[orden.length - 1]][orden[0]];
  return total;
}

function vecinoMasCercano(n, D, inicio) {
  const orden = [inicio];
  const usados = new Set([inicio]);
  while (orden.length < n) {
    const ultimo = orden[orden.length - 1];
    let mejor = -1, dMejor = Infinity;
    for (let j = 0; j < n; j++) {
      if (!usados.has(j) && D[ultimo][j] < dMejor) { dMejor = D[ultimo][j]; mejor = j; }
    }
    orden.push(mejor);
    usados.add(mejor);
  }
  return orden;
}

// 2-opt: invierte tramos mientras eso acorte el recorrido (el primer punto queda fijo)
function dosOpt(orden, D, cerrado) {
  let mejor = orden.slice();
  let dMejor = largo(mejor, D, cerrado);
  let mejoro = true, vueltas = 0;
  while (mejoro && vueltas < 200) {
    mejoro = false;
    vueltas++;
    for (let i = 1; i < mejor.length - 1; i++) {
      for (let k = i + 1; k < mejor.length; k++) {
        const nuevo = mejor.slice(0, i).concat(mejor.slice(i, k + 1).reverse(), mejor.slice(k + 1));
        const d = largo(nuevo, D, cerrado);
        if (d < dMejor - 0.5) { mejor = nuevo; dMejor = d; mejoro = true; }
      }
    }
  }
  return mejor;
}

// Matriz por línea recta x 1,3 (cuando OSRM no responde)
function matrizRecta(puntos) {
  return puntos.map(a => puntos.map(b => haversine(a[0], a[1], b[0], b[1]) * 1.3));
}

/**
 * paradas: [{lat, lng, clientes}] en el orden actual
 * bodega: {lat, lng} o null
 * D: matriz de distancias de [bodega?, ...paradas] (metros)
 * Devuelve { ordenParadas, metrosActual, metrosOptimizado }
 */
function optimizarOrden(paradas, bodega, D) {
  const offset = bodega ? 1 : 0;
  const n = paradas.length + offset;
  const actual = [...Array(n).keys()];
  const cerrado = Boolean(bodega);                // las rutas salen y vuelven a la bodega
  const inicial = vecinoMasCercano(n, D, 0);
  const optimo = dosOpt(inicial, D, cerrado);
  const ordenParadas = optimo.filter(i => i >= offset).map(i => paradas[i - offset]);
  return {
    ordenParadas,
    metrosActual: largo(actual, D, cerrado),
    metrosOptimizado: Math.min(largo(optimo, D, cerrado), largo(actual, D, cerrado)),
    mejoro: largo(optimo, D, cerrado) < largo(actual, D, cerrado),
  };
}

module.exports = { agrupar, optimizarOrden, matrizRecta, largo };
