// Cálculos con coordenadas y lectura de direcciones de Bogotá

// Distancia en metros entre dos puntos (fórmula de Haversine)
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nombreTipo(t) {
  t = t.toLowerCase();
  if (t[0] === 'd') return 'Diagonal';
  if (t[0] === 't') return 'Transversal';
  if (['calle', 'cll', 'cl'].includes(t)) return 'Calle';
  return 'Carrera';
}

const TIPO = '(calle|cll|cl|carrera|cra|kra|kr|cr|diagonal|dg|transversal|tv)';

/**
 * Separa una dirección de Bogotá en vía y placa.
 * "Cll 64 S # 91-83"  -> { via: 'Calle 64 Sur', placa: '91-83' }
 * "Cra 98B con Calle 69 Sur" -> { via: 'Carrera 98B', placa: '', cruce: 'Calle 69 Sur' }
 */
function partirDireccion(dir) {
  let d = String(dir || '').replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();

  const reCruce = new RegExp('^(?:av(?:enida)?\\.?\\s+)?' + TIPO + '\\.?\\s*(\\d+(?:\\s?[a-z](?![a-z]))?)\\s*(sur)?\\s+con\\s+' + TIPO + '\\.?\\s*(\\d+(?:\\s?[a-z](?![a-z]))?)\\s*(sur)?', 'i');
  let x = d.match(reCruce);
  if (x) {
    const sur = Boolean(x[3] || x[6]);
    const n1 = nombreTipo(x[1]);
    const n2 = nombreTipo(x[4]);
    const v1 = n1 + ' ' + x[2].replace(/\s/g, '').toUpperCase() + (sur && n1 === 'Calle' ? ' Sur' : '');
    const v2 = n2 + ' ' + x[5].replace(/\s/g, '').toUpperCase() + (sur && n2 === 'Calle' ? ' Sur' : '');
    return { via: v1, placa: '', cruce: v2 };
  }

  const re = new RegExp('^(av(?:enida)?\\.?\\s+)?' + TIPO + '\\.?\\s*(\\d+\\s?(?:bis)?\\s?[a-z]?)\\s*(bis)?\\s*(sur|s\\b)?\\s*-?\\s*(?:#|no\\.?|n°|nº|n)?\\s*(\\d+\\s?[a-z]?)\\s*(?:sur)?\\s*[- ]\\s*(\\d+)\\s*(sur|s\\b)?', 'i');
  const m = d.match(re);
  if (!m) return null;
  const tipo = nombreTipo(m[2]);
  const num = m[3].replace(/\s/g, '').toUpperCase().replace('BIS', ' Bis') + (m[4] ? ' Bis' : '');
  const sur = Boolean(m[5] || m[8] || /\bsur\b/i.test(d));
  const esCalle = tipo === 'Calle' || tipo === 'Diagonal';
  const via = tipo + ' ' + num + (sur && esCalle ? ' Sur' : '');
  const placa = m[6].replace(/\s/g, '').toUpperCase() + '-' + m[7] + (sur && !esCalle ? ' Sur' : '');
  return { via, placa };
}

// Texto normalizado para usar como llave de la caché de direcciones
function claveDireccion(direccion) {
  const p = partirDireccion(direccion);
  const clave = p ? p.via + (p.placa !== '' ? ' # ' + p.placa : ' con ' + p.cruce) : String(direccion).replace(/\s+/g, ' ').trim();
  return clave.toLowerCase().slice(0, 250);
}

module.exports = { haversine, partirDireccion, claveDireccion };
