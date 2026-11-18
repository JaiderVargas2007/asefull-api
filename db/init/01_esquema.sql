-- Base de datos de PRUEBA (solo para Docker local). Copia reducida de las tablas de ASEFULL
-- que usa la API. En producción NO se ejecuta: allá las tablas ya existen.
SET NAMES utf8mb4;
SET time_zone = '-05:00';

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(30) NOT NULL DEFAULT 'vendedor',
  activo TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE clientes (
  id_cliente INT AUTO_INCREMENT PRIMARY KEY,
  nombre_cliente VARCHAR(120) NOT NULL,
  direccion VARCHAR(200),
  referencia VARCHAR(200),
  telefono VARCHAR(20),
  deuda DECIMAL(12,2) NOT NULL DEFAULT 0,
  usa_whatsapp_deuda TINYINT(1) NOT NULL DEFAULT 0,
  latitud DECIMAL(10,7) NULL,
  longitud DECIMAL(10,7) NULL,
  geo_estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  geo_fuente VARCHAR(20) NULL,
  geo_actualizado DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE rutas (
  id_ruta INT AUTO_INCREMENT PRIMARY KEY,
  nombre_ruta VARCHAR(100) NOT NULL,
  estado_ruta VARCHAR(20) DEFAULT 'pendiente',
  fecha DATE NULL,
  id_vendedor INT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE clientes_ruta (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_ruta INT NOT NULL,
  id_cliente INT NOT NULL,
  orden_visita INT NULL,
  visitado TINYINT(1) NOT NULL DEFAULT 0,
  KEY (id_ruta), KEY (id_cliente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE rutas_sesiones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_ruta INT NOT NULL,
  id_vendedor INT NULL,
  fecha_inicio DATETIME NOT NULL,
  fecha_fin DATETIME NULL,
  KEY (id_ruta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ventas (
  id_venta INT AUTO_INCREMENT PRIMARY KEY,
  id_cliente INT NOT NULL,
  id_ruta INT NULL,
  id_sesion INT NULL,
  fecha DATETIME NOT NULL,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  monto_pagado DECIMAL(12,2) NOT NULL DEFAULT 0,
  KEY (id_sesion), KEY (id_ruta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===== Tablas del módulo de mapa (las mismas del SQL v2 de producción) =====
CREATE TABLE geocache (
  consulta VARCHAR(255) PRIMARY KEY,
  latitud DECIMAL(10,7) NULL,
  longitud DECIMAL(10,7) NULL,
  precision_g VARCHAR(20) NOT NULL,
  respuesta TEXT NULL,
  usos INT NOT NULL DEFAULT 0,
  creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cache_rutas (
  clave CHAR(40) PRIMARY KEY,
  tipo VARCHAR(10) NOT NULL,
  respuesta MEDIUMTEXT NOT NULL,
  usos INT NOT NULL DEFAULT 0,
  creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE rutas_puntos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_ruta INT NOT NULL DEFAULT 0,
  clave VARCHAR(20) NOT NULL,
  latitud DECIMAL(10,7) NOT NULL,
  longitud DECIMAL(10,7) NOT NULL,
  UNIQUE KEY uq_ruta_clave (id_ruta, clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE visitas_ruta (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_ruta INT NOT NULL,
  id_sesion INT NULL,
  id_cliente INT NOT NULL,
  id_usuario INT NULL,
  estado VARCHAR(15) NOT NULL,
  latitud DECIMAL(10,7) NULL,
  longitud DECIMAL(10,7) NULL,
  distancia_m INT NULL,
  fecha DATETIME NOT NULL,
  KEY (id_sesion), KEY (id_ruta, id_cliente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE api_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  endpoint VARCHAR(60) NOT NULL,
  metodo VARCHAR(7) NOT NULL,
  http_status SMALLINT NOT NULL,
  ms INT NOT NULL,
  id_ruta INT NULL,
  id_usuario INT NULL,
  error VARCHAR(255) NULL,
  KEY (fecha), KEY (endpoint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Nueva con la API Express: guarda el orden anterior antes de optimizar (para poder deshacer)
CREATE TABLE respaldo_orden (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_ruta INT NOT NULL,
  id_usuario INT NULL,
  orden_json MEDIUMTEXT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (id_ruta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
