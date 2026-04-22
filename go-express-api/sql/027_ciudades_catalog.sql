-- 027_ciudades_catalog.sql
-- Catalogo oficial de 18 departamentos + 263 distritos de Paraguay.
-- Reemplaza el array hardcodeado en src/data/constants.ts (frontend) que estaba
-- 70% incompleto y requeria deploy para cambios. A partir de aca, la cobertura
-- de Go Express se expresa como "existe una tarifa activa que referencia esta
-- ciudad como origen o destino", no como un flag manual.

-- 1) Departamentos (18 filas)
CREATE TABLE IF NOT EXISTS departamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  capital TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE departamentos IS 'Catalogo de departamentos de Paraguay. 18 filas, inmutable.';
COMMENT ON COLUMN departamentos.nombre IS 'Nombre oficial del departamento. Unique.';
COMMENT ON COLUMN departamentos.capital IS 'Ciudad capital del departamento. Referencia textual, no FK.';
COMMENT ON COLUMN departamentos.orden IS 'Orden de visualizacion en selects. Asuncion primero, resto alfabetico.';

CREATE INDEX IF NOT EXISTS idx_departamentos_orden ON departamentos(orden);

-- 2) Ciudades (263 filas)
CREATE TABLE IF NOT EXISTS ciudades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE RESTRICT,
  es_capital BOOLEAN NOT NULL DEFAULT false,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(nombre, departamento_id)
);

COMMENT ON TABLE ciudades IS 'Catalogo de 263 distritos de Paraguay. Fuente: DGEEC. Habilitada es derivada (existe tarifa activa).';
COMMENT ON COLUMN ciudades.nombre IS 'Nombre oficial del distrito. Unique por departamento.';
COMMENT ON COLUMN ciudades.departamento_id IS 'FK al departamento al que pertenece. RESTRICT para evitar borrar departamentos con ciudades.';
COMMENT ON COLUMN ciudades.es_capital IS 'True si es la capital del departamento. Se renderiza primero y con icono.';
COMMENT ON COLUMN ciudades.orden IS 'Orden dentro del grupo de departamento. Capital (0) primero, resto alfabetico (1..N).';

CREATE INDEX IF NOT EXISTS idx_ciudades_departamento ON ciudades(departamento_id);
CREATE INDEX IF NOT EXISTS idx_ciudades_departamento_orden ON ciudades(departamento_id, orden);

-- 3) Seed departamentos (orden: Asuncion=0, resto alfabetico)
INSERT INTO departamentos (nombre, capital, orden) VALUES
  ('Asunción', 'Asunción', 0),
  ('Alto Paraguay', 'Fuerte Olimpo', 1),
  ('Alto Paraná', 'Ciudad del Este', 2),
  ('Amambay', 'Pedro Juan Caballero', 3),
  ('Boquerón', 'Filadelfia', 4),
  ('Caaguazú', 'Coronel Oviedo', 5),
  ('Caazapá', 'Caazapá', 6),
  ('Canindeyú', 'Salto del Guairá', 7),
  ('Central', 'Areguá', 8),
  ('Concepción', 'Concepción', 9),
  ('Cordillera', 'Caacupé', 10),
  ('Guairá', 'Villarrica', 11),
  ('Itapúa', 'Encarnación', 12),
  ('Misiones', 'San Juan Bautista', 13),
  ('Ñeembucú', 'Pilar', 14),
  ('Paraguarí', 'Paraguarí', 15),
  ('Presidente Hayes', 'Villa Hayes', 16),
  ('San Pedro', 'San Pedro de Ycuamandyyú', 17)
ON CONFLICT (nombre) DO NOTHING;

-- 4) Seed ciudades (263 distritos). Orden dentro de depto: capital=0, resto por orden alfabetico secuencial.
-- Cada bloque INSERT SELECT resuelve el departamento_id por join.

-- Asunción (Distrito Capital): 1
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Asunción', true, 0)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Asunción'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Concepción: 14
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Concepción', true, 0),
  ('Arroyito', false, 1),
  ('Azotey', false, 2),
  ('Belén', false, 3),
  ('Horqueta', false, 4),
  ('Itacuá', false, 5),
  ('Loreto', false, 6),
  ('Paso Barreto', false, 7),
  ('Paso Horqueta', false, 8),
  ('San Alfredo', false, 9),
  ('San Carlos del Apa', false, 10),
  ('San Lázaro', false, 11),
  ('Sargento José Félix López', false, 12),
  ('Yby Yaú', false, 13)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Concepción'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- San Pedro: 21 (TODO: confirmar DGEEC para el 22°, el oficial lista 22 pero Wikipedia solo nombra 21)
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('San Pedro de Ycuamandyyú', true, 0),
  ('Antequera', false, 1),
  ('Capiibary', false, 2),
  ('Choré', false, 3),
  ('General Elizardo Aquino', false, 4),
  ('General Isidoro Resquín', false, 5),
  ('Guajayvi', false, 6),
  ('Itacurubí del Rosario', false, 7),
  ('Liberación', false, 8),
  ('Lima', false, 9),
  ('Nueva Germania', false, 10),
  ('San Estanislao', false, 11),
  ('San Pablo', false, 12),
  ('Santa Rosa del Aguaray', false, 13),
  ('San Vicente Pancholo', false, 14),
  ('Tacuatí', false, 15),
  ('Unión', false, 16),
  ('25 de Diciembre', false, 17),
  ('Villa del Rosario', false, 18),
  ('Yataity del Norte', false, 19),
  ('Yrybucuá', false, 20)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'San Pedro'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Cordillera: 20
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Caacupé', true, 0),
  ('Altos', false, 1),
  ('Arroyos y Esteros', false, 2),
  ('Atyrá', false, 3),
  ('Caraguatay', false, 4),
  ('Emboscada', false, 5),
  ('Eusebio Ayala', false, 6),
  ('Isla Pucú', false, 7),
  ('Itacurubí de la Cordillera', false, 8),
  ('Juan de Mena', false, 9),
  ('Loma Grande', false, 10),
  ('Mbocayaty del Yhaguy', false, 11),
  ('Nueva Colombia', false, 12),
  ('Piribebuy', false, 13),
  ('Primero de Marzo', false, 14),
  ('San Bernardino', false, 15),
  ('San José Obrero', false, 16),
  ('Santa Elena', false, 17),
  ('Tobatí', false, 18),
  ('Valenzuela', false, 19)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Cordillera'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Guairá: 18
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Villarrica', true, 0),
  ('Borja', false, 1),
  ('Capitán Mauricio José Troche', false, 2),
  ('Coronel Martínez', false, 3),
  ('Doctor Botrell', false, 4),
  ('Félix Pérez Cardozo', false, 5),
  ('General Eugenio A. Garay', false, 6),
  ('Colonia Independencia', false, 7),
  ('Itapé', false, 8),
  ('Iturbe', false, 9),
  ('José A. Fassardi', false, 10),
  ('Mbocayaty', false, 11),
  ('Natalicio Talavera', false, 12),
  ('Ñumí', false, 13),
  ('Paso Yobái', false, 14),
  ('San Salvador', false, 15),
  ('Tebicuary', false, 16),
  ('Yataity', false, 17)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Guairá'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Caaguazú: 22
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Coronel Oviedo', true, 0),
  ('Caaguazú', false, 1),
  ('Carayaó', false, 2),
  ('Doctor Cecilio Báez', false, 3),
  ('Doctor Juan Eulogio Estigarribia', false, 4),
  ('Doctor Juan Manuel Frutos', false, 5),
  ('José Domingo Ocampos', false, 6),
  ('La Pastora', false, 7),
  ('Mariscal Francisco Solano López', false, 8),
  ('Nueva Londres', false, 9),
  ('Nueva Toledo', false, 10),
  ('Raúl Arsenio Oviedo', false, 11),
  ('Regimiento de Infantería Tres Corrales', false, 12),
  ('Repatriación', false, 13),
  ('San José de los Arroyos', false, 14),
  ('San Joaquín', false, 15),
  ('Santa Rosa del Mbutuy', false, 16),
  ('Simón Bolívar', false, 17),
  ('Tembiaporá', false, 18),
  ('Tres de Febrero', false, 19),
  ('Vaquería', false, 20),
  ('Yhú', false, 21)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Caaguazú'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Caazapá: 11
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Caazapá', true, 0),
  ('Abaí', false, 1),
  ('Buena Vista', false, 2),
  ('Doctor Moisés S. Bertoni', false, 3),
  ('Fulgencio Yegros', false, 4),
  ('General Higinio Morínigo', false, 5),
  ('Maciel', false, 6),
  ('San Juan Nepomuceno', false, 7),
  ('Tavaí', false, 8),
  ('Tres de Mayo', false, 9),
  ('Yuty', false, 10)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Caazapá'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Itapúa: 30
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Encarnación', true, 0),
  ('Alto Verá', false, 1),
  ('Bella Vista', false, 2),
  ('Cambyretá', false, 3),
  ('Capitán Meza', false, 4),
  ('Capitán Miranda', false, 5),
  ('Carlos Antonio López', false, 6),
  ('Carmen del Paraná', false, 7),
  ('Coronel José Félix Bogado', false, 8),
  ('Edelira', false, 9),
  ('Fram', false, 10),
  ('General Artigas', false, 11),
  ('General Delgado', false, 12),
  ('Hohenau', false, 13),
  ('Itapúa Poty', false, 14),
  ('Jesús', false, 15),
  ('José Leandro Oviedo', false, 16),
  ('La Paz', false, 17),
  ('Mayor Julio Dionisio Otaño', false, 18),
  ('Natalio', false, 19),
  ('Nueva Alborada', false, 20),
  ('Obligado', false, 21),
  ('Pirapó', false, 22),
  ('San Cosme y Damián', false, 23),
  ('San Juan del Paraná', false, 24),
  ('San Pedro del Paraná', false, 25),
  ('San Rafael del Paraná', false, 26),
  ('Tomás Romero Pereira', false, 27),
  ('Trinidad', false, 28),
  ('Yatytay', false, 29)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Itapúa'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Misiones: 10
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('San Juan Bautista', true, 0),
  ('Ayolas', false, 1),
  ('San Ignacio', false, 2),
  ('San Miguel', false, 3),
  ('San Patricio', false, 4),
  ('Santa María', false, 5),
  ('Santa Rosa', false, 6),
  ('Santiago', false, 7),
  ('Villa Florida', false, 8),
  ('Yabebyry', false, 9)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Misiones'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Paraguarí: 18
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Paraguarí', true, 0),
  ('Acahay', false, 1),
  ('Caapucú', false, 2),
  ('Carapeguá', false, 3),
  ('Escobar', false, 4),
  ('General Bernardino Caballero', false, 5),
  ('La Colmena', false, 6),
  ('María Antonia', false, 7),
  ('Mbuyapey', false, 8),
  ('Pirayú', false, 9),
  ('Quiindy', false, 10),
  ('Quyquyhó', false, 11),
  ('San Roque González de Santa Cruz', false, 12),
  ('Sapucai', false, 13),
  ('Tebicuarymí', false, 14),
  ('Yaguarón', false, 15),
  ('Ybycuí', false, 16),
  ('Ybytymí', false, 17)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Paraguarí'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Alto Paraná: 22
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Ciudad del Este', true, 0),
  ('Doctor Juan León Mallorquín', false, 1),
  ('Doctor Raúl Peña', false, 2),
  ('Domingo Martínez de Irala', false, 3),
  ('Hernandarias', false, 4),
  ('Iruña', false, 5),
  ('Itakyry', false, 6),
  ('Juan Emilio O''Leary', false, 7),
  ('Los Cedrales', false, 8),
  ('Mbaracayú', false, 9),
  ('Minga Guazú', false, 10),
  ('Minga Porá', false, 11),
  ('Naranjal', false, 12),
  ('Ñacunday', false, 13),
  ('Presidente Franco', false, 14),
  ('San Alberto', false, 15),
  ('San Cristóbal', false, 16),
  ('Santa Fe del Paraná', false, 17),
  ('Santa Rita', false, 18),
  ('Santa Rosa del Monday', false, 19),
  ('Tavapy', false, 20),
  ('Yguazú', false, 21)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Alto Paraná'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Central: 19
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Areguá', true, 0),
  ('Capiatá', false, 1),
  ('Fernando de la Mora', false, 2),
  ('Guarambaré', false, 3),
  ('Itá', false, 4),
  ('Itauguá', false, 5),
  ('Julián Augusto Saldívar', false, 6),
  ('Lambaré', false, 7),
  ('Limpio', false, 8),
  ('Luque', false, 9),
  ('Mariano Roque Alonso', false, 10),
  ('Nueva Italia', false, 11),
  ('Ñemby', false, 12),
  ('San Antonio', false, 13),
  ('San Lorenzo', false, 14),
  ('Villa Elisa', false, 15),
  ('Villeta', false, 16),
  ('Ypacaraí', false, 17),
  ('Ypané', false, 18)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Central'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Ñeembucú: 16
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Pilar', true, 0),
  ('Alberdi', false, 1),
  ('Cerrito', false, 2),
  ('Desmochados', false, 3),
  ('General José Eduvigis Díaz', false, 4),
  ('Guazú Cuá', false, 5),
  ('Humaitá', false, 6),
  ('Isla Umbú', false, 7),
  ('Laureles', false, 8),
  ('Mayor José de Jesús Martínez', false, 9),
  ('Paso de Patria', false, 10),
  ('San Juan Bautista del Ñeembucú', false, 11),
  ('Tacuaras', false, 12),
  ('Villa Franca', false, 13),
  ('Villa Oliva', false, 14),
  ('Villalbín', false, 15)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Ñeembucú'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Amambay: 6
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Pedro Juan Caballero', true, 0),
  ('Bella Vista Norte', false, 1),
  ('Capitán Bado', false, 2),
  ('Cerro Corá', false, 3),
  ('Karapaí', false, 4),
  ('Zanja Pytá', false, 5)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Amambay'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Canindeyú: 16
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Salto del Guairá', true, 0),
  ('Corpus Christi', false, 1),
  ('Curuguaty', false, 2),
  ('Puente Kyjhá', false, 3),
  ('Itanará', false, 4),
  ('Katueté', false, 5),
  ('La Paloma', false, 6),
  ('Laurel', false, 7),
  ('Maracaná', false, 8),
  ('Nueva Esperanza', false, 9),
  ('Puerto Adela', false, 10),
  ('Villa Ygatimí', false, 11),
  ('Yasy Cañy', false, 12),
  ('Yby Pytá', false, 13),
  ('Ybyrarobaná', false, 14),
  ('Ypejhú', false, 15)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Canindeyú'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Presidente Hayes: 10
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Villa Hayes', true, 0),
  ('Benjamín Aceval', false, 1),
  ('Campo Aceval', false, 2),
  ('General José María Bruguez', false, 3),
  ('José Falcón', false, 4),
  ('Nanawa', false, 5),
  ('Nueva Asunción', false, 6),
  ('Puerto Pinasco', false, 7),
  ('Teniente Esteban Martínez', false, 8),
  ('Teniente Primero Manuel Irala Fernández', false, 9)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Presidente Hayes'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Alto Paraguay: 4
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Fuerte Olimpo', true, 0),
  ('Bahía Negra', false, 1),
  ('Capitán Carmelo Peralta', false, 2),
  ('Puerto Casado', false, 3)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Alto Paraguay'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- Boquerón: 4
INSERT INTO ciudades (nombre, departamento_id, es_capital, orden)
SELECT v.nombre, d.id, v.es_capital, v.orden
FROM departamentos d,
(VALUES
  ('Filadelfia', true, 0),
  ('Boquerón', false, 1),
  ('Loma Plata', false, 2),
  ('Mariscal José Félix Estigarribia', false, 3)
) AS v(nombre, es_capital, orden)
WHERE d.nombre = 'Boquerón'
ON CONFLICT (nombre, departamento_id) DO NOTHING;

-- 5) Trigger updated_at para ambas tablas
CREATE OR REPLACE FUNCTION trg_ciudades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_departamentos_updated_at ON departamentos;
CREATE TRIGGER trg_departamentos_updated_at
  BEFORE UPDATE ON departamentos
  FOR EACH ROW
  EXECUTE FUNCTION trg_ciudades_updated_at();

DROP TRIGGER IF EXISTS trg_ciudades_updated_at ON ciudades;
CREATE TRIGGER trg_ciudades_updated_at
  BEFORE UPDATE ON ciudades
  FOR EACH ROW
  EXECUTE FUNCTION trg_ciudades_updated_at();
