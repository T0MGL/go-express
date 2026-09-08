-- 057: la identidad de una ruta de tarifa pasa a ser el par de ids de ciudad. El texto queda
-- para mostrar.
--
-- Hasta hoy la misma ruta se identificaba de tres formas y las tres podian discrepar:
--   1. tarifas_ruta_servicio_unica normalizaba los nombres con tarifa_norm_ciudad (040).
--   2. computeCostoEnvio normalizaba con normalizeCiudad (src/lib/ciudad.ts).
--   3. ciudad.service.getCobertura decidia cobertura por origen_ciudad_id/destino_ciudad_id.
--
-- El comentario de 040 decia que (1) espejaba a (2). No lo hacia. Medido contra esta base:
--   entrada                                  normalizeCiudad   tarifa_norm_ciudad
--   chr(160) || 'Asuncion' || chr(160)       asuncion          " asuncion "   (espacio duro)
--   'Asuncio' || chr(769) || 'n'             asuncion          asuncion con tilde (NFD)
-- El segundo caso no es exotico: macOS escribe NFD, asi que lo trae cualquier CSV armado en
-- una Mac. La consecuencia era precio no determinista: el unique dejaba entrar dos filas que
-- el codigo considera la misma ruta, y computeCostoEnvio hacia .find() sobre el set activo sin
-- ORDER BY, asi que el precio cobrado dependia del orden en que Postgres devolviera las filas.
--
-- Un uuid no tiene tildes, ni espacios duros, ni NFD contra NFC. De aca en mas:
--   la unicidad de ruta se apoya en (origen_ciudad_id, destino_ciudad_id, tipo_servicio),
--   una tarifa viva no puede existir sin las dos ciudades resueltas,
--   origen/destino se derivan de ciudades por trigger y ningun escritor los puede desincronizar,
--   y queda UN solo normalizador (norm_ciudad), cuyo unico trabajo es resolver un nombre
--   tipeado o importado contra el catalogo. Adentro del sistema ya nadie compara texto.
--
-- Filas eliminadas: 7ee698d3 (Asuncion a "Alto Parana") tiene destino_ciudad_id NULL porque su
-- destino es un departamento, no una ciudad, asi que no es backfilleable ni borrable (envios la
-- referencian por FK). El CHECK esta acotado a las filas no eliminadas para que sobreviva tal
-- cual esta. Restaurarla queda bloqueado a proposito: no se puede cotizar una ruta sin ciudad.
--
-- NO toca el motor de precios (volumetric.ts) ni las reglas de negocio con RAISE EXCEPTION.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. El unico normalizador del sistema.
-- ---------------------------------------------------------------------------------------------
-- Cambia dos cosas respecto de tarifa_norm_ciudad, las dos por las que divergia del TS:
--   normalize(NFC) recompone lo descompuesto, sin esto translate() no ve una tilde escrita
--   como caracter combinante y 'Asuncion' + U+0301 no matchea con 'Asunción'.
--   Los espacios duros se mapean a espacio normal ANTES de colapsar y recortar: btrim no los
--   saca y \s de Postgres tampoco los matchea, a diferencia de JavaScript.
-- Se crea con nombre nuevo en vez de reemplazar el cuerpo de tarifa_norm_ciudad: el alcance
-- cambio (ya no resuelve tarifas, resuelve el catalogo de ciudades) y el comportamiento tambien.
CREATE OR REPLACE FUNCTION public.norm_ciudad(p_in text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 PARALLEL SAFE
AS $function$
  SELECT btrim(
           regexp_replace(
             translate(
               lower(normalize(p_in, NFC)),
               -- tildes, dieresis, enie, cedilla + espacios duros (NBSP, figure, thin,
               -- narrow NBSP, BOM). Los cinco ultimos van a espacio y despues se colapsan.
               'áàäâãéèëêíìïîóòöôõúùüûñç' || E'\u00a0\u2007\u2009\u202f\ufeff',
               'aaaaaeeeeiiiiooooouuuunc' || '     '
             ),
             '\s+', ' ', 'g'
           )
         );
$function$;

REVOKE EXECUTE ON FUNCTION public.norm_ciudad(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.norm_ciudad(text) TO service_role;

-- El resolver lee por aca. 262 filas hoy, pero el borde lo consulta en cada cotizacion y en
-- cada fila de una importacion masiva.
CREATE INDEX IF NOT EXISTS idx_ciudades_nombre_norm
  ON public.ciudades (public.norm_ciudad(nombre));

-- ---------------------------------------------------------------------------------------------
-- 2. El borde: nombre tipeado a ciudad del catalogo.
-- ---------------------------------------------------------------------------------------------
-- Unico punto donde un nombre se convierte en identidad. Toma el lote entero para que una
-- cotizacion resuelva origen y destino en una sola ida.
--
-- Devuelve la coincidencia SOLO cuando es unica. El catalogo permite el mismo nombre en dos
-- departamentos (unique es (nombre, departamento_id)) y hoy no hay ninguno repetido, pero el
-- dia que entre uno la respuesta correcta es "ambigua, mandame el id", no elegir una al azar:
-- elegir al azar es exactamente el bug que esta migracion viene a cerrar. El caller distingue
-- ese caso por coincidencias > 1.
CREATE OR REPLACE FUNCTION public.resolver_ciudades(p_nombres text[])
 RETURNS TABLE (nombre_input text, ciudad_id uuid, nombre_canonico text, coincidencias integer)
 LANGUAGE sql
 STABLE
 PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  SELECT entrada.nombre_input,
         CASE WHEN m.total = 1 THEN m.id END,
         CASE WHEN m.total = 1 THEN m.nombre END,
         m.total
    FROM unnest(p_nombres) AS entrada(nombre_input)
    CROSS JOIN LATERAL (
      SELECT count(*)::integer                            AS total,
             (array_agg(c.id ORDER BY c.nombre))[1]       AS id,
             (array_agg(c.nombre ORDER BY c.nombre))[1]   AS nombre
        FROM public.ciudades c
       WHERE public.norm_ciudad(c.nombre) = public.norm_ciudad(entrada.nombre_input)
    ) m
   WHERE entrada.nombre_input IS NOT NULL;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolver_ciudades(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_ciudades(text[]) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. El texto pasa a ser derivado.
-- ---------------------------------------------------------------------------------------------
-- Sin esto "el texto es solo para mostrar" es una convencion que vive en tarifa.service.ts y que
-- un UPDATE a mano contra la base rompe sin que nadie se entere.
CREATE OR REPLACE FUNCTION public.trg_tarifa_ruta_texto_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.origen_ciudad_id IS NOT NULL THEN
    SELECT nombre INTO NEW.origen FROM public.ciudades WHERE id = NEW.origen_ciudad_id;
  END IF;
  IF NEW.destino_ciudad_id IS NOT NULL THEN
    SELECT nombre INTO NEW.destino FROM public.ciudades WHERE id = NEW.destino_ciudad_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_tarifa_ruta_texto_fn() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_tarifa_ruta_texto_fn() TO service_role;

DROP TRIGGER IF EXISTS trg_tarifas_ruta_texto ON public.tarifas;
CREATE TRIGGER trg_tarifas_ruta_texto
  BEFORE INSERT OR UPDATE OF origen, destino, origen_ciudad_id, destino_ciudad_id
  ON public.tarifas
  FOR EACH ROW EXECUTE FUNCTION public.trg_tarifa_ruta_texto_fn();

-- Alinea lo que ya estaba escrito. Hoy toca cero filas (las cuatro tarifas de produccion ya
-- tienen el nombre canonico), y es el fix correcto si alguna vez hubo drift.
WITH canonico AS (
  SELECT t.id, co.nombre AS origen, cd.nombre AS destino
    FROM public.tarifas t
    JOIN public.ciudades co ON co.id = t.origen_ciudad_id
    JOIN public.ciudades cd ON cd.id = t.destino_ciudad_id
)
UPDATE public.tarifas t
   SET origen = c.origen, destino = c.destino
  FROM canonico c
 WHERE c.id = t.id
   AND (t.origen <> c.origen OR t.destino <> c.destino);

-- ---------------------------------------------------------------------------------------------
-- 4. Una tarifa viva no existe sin las dos ciudades resueltas.
-- ---------------------------------------------------------------------------------------------
-- Acotado a las no eliminadas: 7ee698d3 tiene que sobrevivir con su destino_ciudad_id NULL.
ALTER TABLE public.tarifas
  ADD CONSTRAINT tarifas_ruta_ciudad_resuelta
  CHECK (eliminado OR (origen_ciudad_id IS NOT NULL AND destino_ciudad_id IS NOT NULL))
  NOT VALID;

ALTER TABLE public.tarifas VALIDATE CONSTRAINT tarifas_ruta_ciudad_resuelta;

-- ---------------------------------------------------------------------------------------------
-- 5. La unicidad de ruta se muda del nombre normalizado a los ids.
-- ---------------------------------------------------------------------------------------------
-- idx_tarifas_cotizador tenia exactamente estas columnas y este predicado, sin ser unico, y
-- nadie lo usaba porque nadie buscaba por id. El indice unico ocupa su lugar y sirve las dos
-- cosas: la busqueda del cotizador y la garantia de que la ruta es una sola.
DROP INDEX IF EXISTS public.tarifas_ruta_servicio_unica;
DROP INDEX IF EXISTS public.idx_tarifas_cotizador;

CREATE UNIQUE INDEX tarifas_ruta_ciudad_servicio_unica
  ON public.tarifas (origen_ciudad_id, destino_ciudad_id, tipo_servicio)
  WHERE (activo = TRUE AND eliminado = FALSE);

-- idx_tarifas_ruta (origen, destino) se deja: el listado del admin filtra por nombre con ilike
-- y borrarlo no es parte de este cambio.

-- Ya no queda nadie que lo llame: era exclusivo del indice que se acaba de borrar.
DROP FUNCTION IF EXISTS public.tarifa_norm_ciudad(text);

-- PostgREST tiene que ver resolver_ciudades antes de que el API la invoque.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ROLLBACK manual (vuelve al estado 056):
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.tarifa_norm_ciudad(p_in text) RETURNS text
--     LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
--       SELECT regexp_replace(btrim(translate(lower(p_in),
--         'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc')), '\s+', ' ', 'g');
--     $f$;
--   REVOKE EXECUTE ON FUNCTION public.tarifa_norm_ciudad(text) FROM PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.tarifa_norm_ciudad(text) TO service_role;
--   DROP INDEX public.tarifas_ruta_ciudad_servicio_unica;
--   CREATE INDEX idx_tarifas_cotizador ON public.tarifas
--     (origen_ciudad_id, destino_ciudad_id, tipo_servicio)
--     WHERE (eliminado = FALSE AND activo = TRUE);
--   CREATE UNIQUE INDEX tarifas_ruta_servicio_unica ON public.tarifas
--     (public.tarifa_norm_ciudad(origen), public.tarifa_norm_ciudad(destino), tipo_servicio)
--     WHERE (activo = TRUE AND eliminado = FALSE);
--   ALTER TABLE public.tarifas DROP CONSTRAINT tarifas_ruta_ciudad_resuelta;
--   DROP TRIGGER trg_tarifas_ruta_texto ON public.tarifas;
--   DROP FUNCTION public.trg_tarifa_ruta_texto_fn();
--   DROP FUNCTION public.resolver_ciudades(text[]);
--   DROP INDEX public.idx_ciudades_nombre_norm;
--   DROP FUNCTION public.norm_ciudad(text);
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- El rollback exige revertir tambien el API: con 056 en la base, resolver_ciudades no existe y
-- toda cotizacion falla.
