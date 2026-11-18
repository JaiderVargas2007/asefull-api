-- Ejecutar UNA vez en phpMyAdmin de Hostinger (base de datos de ASEFULL).
-- Es la única tabla nueva que necesita la API Express; las demás ya existen (SQL v2).
CREATE TABLE IF NOT EXISTS respaldo_orden (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_ruta INT NOT NULL,
  id_usuario INT NULL,
  orden_json MEDIUMTEXT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (id_ruta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
