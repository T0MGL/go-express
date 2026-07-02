-- 047: M1 (Step6). El sello de liquidaciones cerradas era reabrible con SQL crudo forjando la
-- GUC app.reabrir_rpc (un caller con UPDATE sobre la tabla puede SET app.reabrir_rpc='1' y
-- nular cerrada_en sin pasar por reabrir_liquidacion: cero auditoria, detalle conciliado=TRUE
-- desincronizado). El flag por GUC solo distingue "dentro de la RPC" si el caller no puede
-- setearlo, y cualquier sesion SQL puede.
--
-- Fix en dos capas:
--  1. PERMISOS (la de fondo): se revoca UPDATE sobre liquidaciones_repartidor a los roles de
--     request (anon, authenticated, service_role). La API escribe esta tabla UNICAMENTE via
--     las RPCs crear/cerrar/reabrir_liquidacion (SECURITY DEFINER, owner postgres, distinto
--     del rol de la app; verificado: liquidacion.service.ts no tiene ningun UPDATE directo).
--     Resultado: el UPDATE crudo del rol app falla por 42501 (permission denied), no por un
--     flag forjeable. La GUC queda como defensa en profundidad para sesiones con mas permisos.
--  2. TRAZA: trg_liquidacion_inmutable_fn registra en auditoria_log TODO unseal que permita,
--     asi ningun path que des-selle (ni siquiera uno privilegiado con la GUC seteada) queda
--     sin rastro forense. reabrir_liquidacion ademas escribe su propia fila con el actor real;
--     la del trigger es la red minima cuando el actor no es la RPC.
--
-- Idempotente (REVOKE es idempotente, CREATE OR REPLACE + DROP IF EXISTS). Transaccional.
BEGIN;

REVOKE UPDATE ON public.liquidaciones_repartidor FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_liquidacion_inmutable_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.cerrada_en IS NOT NULL THEN
      RAISE EXCEPTION 'liquidacion_cerrada_inmutable: no se puede eliminar la liquidacion cerrada %, reabrila primero', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  -- Sello vivo: ningun UPDATE mantiene cerrada_en NOT NULL (forje de payout/tarifa bajo sello).
  IF OLD.cerrada_en IS NOT NULL AND NEW.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'liquidacion_cerrada_inmutable: la liquidacion cerrada % solo se modifica via reabrir_liquidacion', OLD.id
      USING ERRCODE = 'P0001';
  END IF;

  -- Reapertura (cerrada_en NOT NULL -> NULL): SOLO via reabrir_liquidacion. Un UPDATE crudo que
  -- nule el sello sin esa marca borra la traza forense (auditoria_log) y deja el detalle desync.
  IF OLD.cerrada_en IS NOT NULL AND NEW.cerrada_en IS NULL THEN
    IF current_setting('app.reabrir_rpc', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'liquidacion_reapertura_invalida: una liquidacion cerrada solo se reabre via reabrir_liquidacion (deja auditoria y des-concilia el detalle)'
        USING ERRCODE = 'P0001';
    END IF;

    -- M1: todo unseal permitido deja traza propia del trigger, ademas de la fila que
    -- reabrir_liquidacion escribe con el actor real. Si alguien con la GUC seteada des-sella
    -- por fuera de la RPC, esta fila es la unica evidencia forense.
    INSERT INTO public.auditoria_log (
      usuario, usuario_id, accion, entidad, entidad_id,
      descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
    ) VALUES (
      'trigger:liquidacion_unseal',
      '00000000-0000-4000-a000-000000000001',
      'reabrir', 'liquidacion', OLD.id::TEXT,
      format('Unseal de liquidacion %s permitido por trigger (app.reabrir_rpc activo, estado %s -> %s)',
             OLD.id, OLD.estado, NEW.estado),
      to_jsonb(OLD), to_jsonb(NEW), NULL, NULL
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_liquidacion_inmutable ON public.liquidaciones_repartidor;
CREATE TRIGGER trg_liquidacion_inmutable
  BEFORE UPDATE OR DELETE ON public.liquidaciones_repartidor
  FOR EACH ROW EXECUTE FUNCTION public.trg_liquidacion_inmutable_fn();

COMMENT ON FUNCTION public.trg_liquidacion_inmutable_fn() IS
  'Sello de inmutabilidad del header de liquidacion (040 + 047). Cerrada: solo reabrir_liquidacion la des-sella (GUC transaccion-local app.reabrir_rpc). 047: el unseal ademas queda registrado en auditoria_log por el propio trigger, y el rol de la app no tiene UPDATE sobre la tabla (REVOKE), asi que el forje de la GUC desde un request es imposible por permisos.';

COMMIT;
-- ROLLBACK: GRANT UPDATE ON public.liquidaciones_repartidor TO anon, authenticated, service_role;
-- y re-crear trg_liquidacion_inmutable_fn con la definicion de sql/040 (sin el INSERT de
-- auditoria en la rama de unseal).
