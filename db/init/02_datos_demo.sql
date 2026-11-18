-- Datos de PRUEBA para Docker local (personas y teléfonos inventados).
-- Usuarios demo (solo existen en el contenedor local):
--   jefe@asefull.demo      / Asefull2026   (rol jefe)
--   vendedor@asefull.demo  / Asefull2026   (rol vendedor)
SET NAMES utf8mb4;

INSERT INTO usuarios (id, nombre, email, password, rol) VALUES
 (1, 'Jefe Demo',     'jefe@asefull.demo',     '$2y$10$6GtUPm3a971Tax4UGOf8ted5LMFYEsYncAKsCiiwXTRnai3laTiIe', 'jefe'),
 (2, 'Vendedor Demo', 'vendedor@asefull.demo', '$2y$10$6GtUPm3a971Tax4UGOf8ted5LMFYEsYncAKsCiiwXTRnai3laTiIe', 'vendedor');

INSERT INTO rutas (id_ruta, nombre_ruta, estado_ruta, fecha, id_vendedor) VALUES
 (6, 'Bosa', 'pendiente', CURDATE(), 2);

-- 10 clientes ya ubicados + 2 pendientes por geocodificar
INSERT INTO clientes (id_cliente, nombre_cliente, direccion, referencia, telefono, deuda, latitud, longitud, geo_estado, geo_fuente, geo_actualizado) VALUES
 (101, 'Tienda La Esperanza',   'Calle 59 Sur # 80J-10',  'Frente al parque',  '3000000001', 25000, 4.6182100, -74.1898600, 'manual', 'gps',  NOW()),
 (102, 'Miscelánea Don Pedro',  'Carrera 80 # 63-15 Sur', 'Esquina',           '3000000002', 0,     4.6131300, -74.1880200, 'manual', 'gps',  NOW()),
 (103, 'Fruver El Recreo',      'Calle 65 Sur # 87-20',   '',                  '3000000003', 12000, 4.6098800, -74.1952700, 'ok',     'nominatim', NOW()),
 (104, 'Tienda Mi Barrio',      'Carrera 87 # 71-05 Sur', 'Al lado de la iglesia', '3000000004', 0, 4.6061900, -74.1921400, 'manual', 'enlace', NOW()),
 (105, 'Panadería San Bernardino','Calle 73 Sur # 92-11', '',                  '3000000005', 8000,  4.6023400, -74.1987300, 'ok',     'nominatim', NOW()),
 (106, 'Autoservicio Bosa Centro','Carrera 78 # 59-40 Sur','Local 2',          '3000000006', 0,     4.6199500, -74.1857700, 'manual', 'mapa', NOW()),
 (107, 'Tienda Doña Rosa',      'Calle 61 Sur # 84-30',   '',                  '3000000007', 40000, 4.6155000, -74.1925000, 'aproximada', 'nominatim', NOW()),
 (108, 'Cigarrería El Paso',    'Carrera 88 # 66-12 Sur', '',                  '3000000008', 0,     4.6087000, -74.1978000, 'manual', 'gps',  NOW()),
 (109, 'Granero La 80',         'Carrera 80 # 57-02 Sur', 'Bodega verde',      '3000000009', 15000, 4.6211000, -74.1872000, 'manual', 'gps',  NOW()),
 (110, 'Tienda Los Almendros',  'Calle 69 Sur # 90-08',   '',                  '3000000010', 0,     4.6045000, -74.1960000, 'ok',     'nominatim', NOW()),
 (111, 'Minimercado El Porvenir','Calle 52 Sur # 100-20', '',                  '3000000011', 0,     NULL, NULL, 'pendiente', NULL, NULL),
 (112, 'Tienda La Paz',         'Carrera 86 # 60-25 Sur', '',                  '3000000012', 5000,  NULL, NULL, 'pendiente', NULL, NULL);

-- Orden "desordenado" a propósito para que se vea el ahorro al optimizar
INSERT INTO clientes_ruta (id_ruta, id_cliente, orden_visita) VALUES
 (6, 105, 1), (6, 101, 2), (6, 108, 3), (6, 106, 4), (6, 103, 5), (6, 109, 6),
 (6, 110, 7), (6, 102, 8), (6, 104, 9), (6, 107, 10), (6, 111, 11), (6, 112, 12);

-- Bodega general (id_ruta 0 = sirve para todas las rutas)
INSERT INTO rutas_puntos (id_ruta, clave, latitud, longitud) VALUES (0, 'bodega', 4.6230000, -74.1830000);

-- Una salida abierta con una venta, para que el resumen tenga datos
INSERT INTO rutas_sesiones (id, id_ruta, id_vendedor, fecha_inicio) VALUES (1, 6, 2, NOW() - INTERVAL 90 MINUTE);
INSERT INTO ventas (id_cliente, id_ruta, id_sesion, fecha, total, monto_pagado) VALUES (101, 6, 1, NOW() - INTERVAL 60 MINUTE, 48000, 30000);
