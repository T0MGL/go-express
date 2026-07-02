-- 046: A1 historico (backfill). La 045 arregla update_envio_estado_atomico solo hacia adelante:
-- todo envio que el admin marco 'entregado' ANTES de la 045 quedo con fecha_entrega_real NULL y
-- su COD cobrado fuera de toda liquidacion para siempre (crear/cerrar_liquidacion gatean por
-- (fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date BETWEEN rango).
--
-- Backfill: la fecha real de entrega es el PRIMER evento 'entregado' del timeline
-- (eventos_envio, que el RPC y el flujo repartidor insertan en la misma transaccion del cambio
-- de estado); si el timeline no tiene evento entregado (data pre-030), fallback a updated_at.
-- Solo envios vivos: los soft-deleted no liquidan y su fecha NULL es irrelevante.
--
-- Al 2026-07-01 esto afecta exactamente 1 fila en prod (GE2026001000). Esta migracion NO
-- remedia el monto de esa fila (monto_a_cobrar=0 viola I1): eso lo hace la 050 (hallazgo M5).
--
-- Idempotente: el predicado fecha_entrega_real IS NULL deja el re-run en 0 filas.
BEGIN;

DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.envios e
     SET fecha_entrega_real = COALESCE(
           (SELECT MIN(ev.created_at)
              FROM public.eventos_envio ev
             WHERE ev.envio_id = e.id
               AND ev.estado = 'entregado'),
           e.updated_at
         )
   WHERE e.estado = 'entregado'
     AND e.fecha_entrega_real IS NULL
     AND e.eliminado = FALSE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '046: backfill de fecha_entrega_real aplicado a % envios entregados', v_count;
END;
$$;

COMMIT;
-- ROLLBACK: no aplica un rollback mecanico (la fecha previa era NULL y el valor asignado sale
-- del timeline). Si hiciera falta revertir una fila puntual: UPDATE envios SET
-- fecha_entrega_real = NULL WHERE tracking_number = '...', solo si no entro a una liquidacion.
