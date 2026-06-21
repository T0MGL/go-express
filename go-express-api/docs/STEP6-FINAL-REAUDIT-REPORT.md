# GO EXPRESS, Reauditoria Final Step 6: NO-GO

VEREDICTO: NO production-ready. 2 CRITICA y 4 ALTA bloqueantes (post-dedup). El criterio es cero CRITICA y cero ALTA: no se cumple. NO onboardear hasta cerrar y re-verificar contra prod.

Fecha: 2026-06-21. Acceso: prod oxyvhexsgppnkgcnqpkl, read-only, BEGIN/ROLLBACK, jamas COMMIT. Rondas: 3. Todos los hallazgos sobrevivieron verificacion adversarial y fueron reproducidos contra produccion con data sintetica dentro de la transaccion.

## Resumen ejecutivo

El nucleo COD-only quedo bien para el camino feliz: I1 piso/igualdad, conservacion payout = monto - tarifa, exclusion de rango GIST, indice unico de pago activo, gate de elegibilidad por pago pagado, y 62 invariantes verificados OK. El problema no es el camino feliz, es la superficie de tampering bajo sello. El patron de inmutabilidad (036-039) sella headers y detalle de liquidaciones cerradas contra UPDATE/DELETE, pero deja tres flancos abiertos que mueven plata de terceros sin auditoria: INSERT de detalle bajo liquidacion sellada (CRITICA), la clausula de excepcion del UPDATE que permite re-editar montos (CRITICA), y el GUC app.pago_rpc que queda pegajoso tras create_pago_atomico y deja el guard de inmutabilidad de pagos fail-open (ALTA). Suma a eso el cobro COD parcial que deja efectivo real fuera de toda liquidacion sin via de settlement fiel (ALTA), y costo/costo_seguro editables post-pago que re-dividen el split GO EXPRESS vs tienda en silencio (ALTA). Owner legalmente expuesto y plata real de afiliados: ninguno de estos seis puede quedar abierto al onboarding.

## Invariantes verificados OK

62 invariantes pasaron contra prod, incluyendo:

- I1: monto_a_cobrar >= costo + costo_seguro en INSERT y UPDATE; igualdad exacta para anticipado (037).
- Conservacion: payout_tienda = monto_a_cobrar - tarifa en ambos modos (anticipado = 0) en el camino feliz.
- Cero floats: todo BIGINT, nada se crea ni se destruye en cierres sin diferencia.
- Inmutabilidad header (038): UPDATE de header sellado manteniendo cerrada_en NOT NULL esta BLOQUEADO; DELETE de sellada BLOQUEADO; CHECK liquidacion_estado_coherente impide cerrada con cerrada_en NULL.
- Inmutabilidad detalle (039): UPDATE/DELETE de detalle bajo sello BLOQUEADO.
- Exclusion de rango GIST liquidaciones_repartidor_rango_no_solapado: dos crear_liquidacion concurrentes mismo repartidor/rango se serializan, segundo recibe liquidacion_rango_solapado, sin deadlock ni doble-claim.
- Indice unico parcial pagos_envio_id_unique_active: doble pago activo bloqueado al commit.
- Gate de elegibilidad crear_liquidacion/cerrar_liquidacion por EXISTS pago estado_pago='pagado'; conciliado en exactamente 1 liquidacion.
- Round-trip crear->cerrar->tamper(bloqueado UPDATE/DELETE)->reabrir->cerrar funciona; reabrir_liquidacion deja auditoria_log con motivo obligatorio.
- Lock de envio (E) serializa acceso concurrente; orden P->E->L sin deadlock observable.
- Remocion CC en DB: saldo_cuenta_corriente y limite_credito DROPPED, CHECK envios_tipo_pago_no_cc bloquea tipo_pago=cuenta_corriente, Zod tipoPagoEnum bloquea al borde.

## Hallazgos por severidad

Conteo: 2 CRITICA, 4 ALTA (post-dedup), 2 MEDIA, 2 BAJA. Bloqueantes: 6.

Nota de dedup: el JSON de entrada traia 8 ALTA, 4 MEDIA, 7 BAJA con duplicados exactos (mismo defecto reportado dos veces desde lentes distintas). Tras dedup quedan 4 ALTA unicas, 2 MEDIA, 2 BAJA. Detalle de fusiones al final.

| # | Severidad | Hallazgo | Archivo | Repro prod |
|---|---|---|---|---|
| 1 | CRITICA | INSERT-open de detalle bajo liquidacion sellada: 039 solo cubre UPDATE/DELETE, se inyecta detalle conciliado=TRUE sin reabrir, sin recompute, sin auditoria | sql/039_liquidacion_envios_inmutabilidad.sql | Si |
| 2 | CRITICA | Clausula de excepcion de 039 permite re-editar montos del detalle bajo sello: INSERT conciliado=FALSE y luego UPDATE a conciliado=TRUE forja monto_cobrado/monto_esperado | sql/039_liquidacion_envios_inmutabilidad.sql | Si |
| 3 | ALTA | GUC app.pago_rpc nunca reseteado en create_pago_atomico: trg_pagos_no_update_fisico fail-open, UPDATE crudo posterior en la misma tx forja monto_recibido | sql/036:296-393 vs 167-194 | Si |
| 4 | ALTA | Cobro COD parcial deja efectivo real fuera de toda liquidacion en ambos modos, sin via de settlement fiel; cod_pago_pendiente nunca se limpia | src/routes/repartidor/envios.ts + sql/036 gate elegibilidad | Si |
| 5 | ALTA | costo/costo_seguro editables post-pago re-dividen tarifa_retenida/payout_tienda en silencio al cerrar (lectura LIVE); guard solo cubre monto_a_cobrar de contra_entrega | sql/036 trg_envio_block_cod_monto_change + cerrar_liquidacion | Si |
| 6 | ALTA | UPDATE crudo que nula cerrada_en evade reabrir_liquidacion: reapertura sin auditoria, desync conciliado=TRUE bajo header pendiente atrapa envio fuera de toda liquidacion | sql/038_liquidacion_inmutabilidad.sql | Si |
| 7 | MEDIA | Ruta Asuncion->Ciudad del Este tiene DOS tarifas activas (30k y 40k): computeCostoEnvio elige sin ORDER BY, split GO EXPRESS vs tienda no determinista | src/lib/cotizacion.ts:56-70 + tabla tarifas | Si |
| 8 | MEDIA | cerrar_liquidacion con_diferencia computa payout_tienda sobre monto esperado, no sobre efectivo rendido: sobre-paga a la tienda el faltante del repartidor; update_pago_atomico no re-sincroniza monto_total al flipar a pagado | sql/036:846-851 cerrar_liquidacion + update_pago_atomico:478-497 | Si |
| 9 | BAJA | TipoPago type debt: ClienteRow declara columnas CC dropeadas y toApi/mapClienteRow las lee (devuelve undefined, no crash); forzarSobreLimite/motivoOverride plumbing inerte | src/types/index.ts, cliente.service.ts, routes/cliente/cuenta.ts, routes/admin/envios.ts | Si |
| 10 | BAJA | block_cod_monto_change no cubre anticipado ni costo/costo_seguro: defensa en profundidad faltante; no alcanzable por TS (PUT omite costo/monto), solo SQL crudo | trg_envio_block_cod_monto_change_fn + sql/037 | Si |

## Detalle de los bloqueantes

### CRITICA 1: INSERT de detalle bajo liquidacion sellada

trg_liquidacion_envios_inmutable es BEFORE DELETE OR UPDATE (confirmado en pg_trigger, sin clausula INSERT). No existe otro trigger ni constraint que guarde INSERT sobre liquidacion_envios. Reproducido: con la liquidacion ya sellada (estado=cerrada, cerrada_en NOT NULL, payout_tienda=4000, monto_total_esperado=9000), `INSERT INTO liquidacion_envios(...) VALUES (<liq_sellada>, <env2>, 50000, 50000, TRUE)` retorna INSERT 0 1 sin error. El detalle paso de sumar 9000 a 59000 mientras el header sellado sigue diciendo 9000. La bandera conciliado=TRUE es el unico gate que saca un envio de toda otra liquidacion, asi que un envio real pagado inyectado aqui queda marcado como liquidado pero su payout jamas se acredita a ningun header, y queda permanentemente excluido de liquidaciones futuras. Header y detalle de una liquidacion cerrada pueden divergir.

### CRITICA 2: Clausula de excepcion de 039 re-editable

El doc de 039 (lineas 18-22) afirma que la unica forma de tener OLD.conciliado=FALSE bajo padre sellado es dentro de cerrar_liquidacion, por eso la excepcion `IF TG_OP=UPDATE AND OLD.conciliado=FALSE AND NEW.conciliado=TRUE THEN RETURN NEW` seria segura. Falso. Como no hay guarda de INSERT: (1) INSERT de fila conciliado=FALSE para env nuevo bajo liquidacion ya cerrada pasa sin trigger; (2) UPDATE de esa fila `SET conciliado=TRUE, monto_cobrado=0, monto_esperado=0` lo PERMITE la excepcion porque solo mira conciliado, no verifica que el resto de columnas no muten. Resultado: montos forjados sobre detalle de liquidacion sellada, sin reabrir, sin auditoria. La excepcion convierte el INSERT gap de "colar fila final" en "colar fila y re-editarla a voluntad".

### ALTA 3: GUC app.pago_rpc fail-open

create_pago_atomico hace `set_config('app.pago_rpc','1',true)` al entrar pero, a diferencia de update_pago_atomico y anular_pago_atomico, NUNCA lo resetea a '0'. El flag queda en '1' el resto de la transaccion. Reproducido: tras create_pago_atomico en la misma tx, `UPDATE pagos SET monto_recibido=1 WHERE envio_id=...` retorna UPDATE 1 y el pago queda en 1, evadiendo trg_pagos_no_update_fisico (ultima linea de defensa P5/I8). NO alcanzable por el TS actual (todas las mutaciones van por RPC, supabase-js corre cada llamada en su propia tx del pooler, el SET LOCAL muere antes del siguiente statement). El hueco se abre con (a) un futuro path que corra la RPC y luego un UPDATE crudo en la misma tx DB, o (b) acceso directo a consola, que es justo el vector que este trigger existe para frenar. Backstop roto, ningun camino vivo lo explota hoy, por eso ALTA.

### ALTA 4: Cobro COD parcial huerfano

contra_entrega monto_a_cobrar=130000, repartidor reporta 120000 (diff 7.7% < tolerancia 10%, flujo silencioso sin nota). create_pago_atomico inserta estado_pago='pago_parcial', sync pone envios.monto_cobrado=120000 y cod_pago_pendiente=TRUE. crear_liquidacion gatea por estado_pago='pagado'; 'pago_parcial' NO cumple, el envio NUNCA es elegible. 120000 Gs reales en mano del repartidor, registrados como cobrados, que el sistema jamas exige rendir. Identico en anticipado. La unica salida (admin sube a full via update_pago_atomico) registra monto_cobrado=130000 cuando entraron 120000 (infla caja, sobre-paga tienda) y deja cod_pago_pendiente=TRUE permanente porque el sync de UPDATE no limpia el flag, volviendo inutil la cola del dashboard.

### ALTA 5: costo/costo_seguro editable post-pago

trg_envio_block_cod_monto_change solo dispara BEFORE UPDATE OF monto_a_cobrar y solo para contra_entrega. I1 solo valida el piso, no congela. cerrar_liquidacion recomputa tarifa_retenida=SUM(costo+seguro) y payout_tienda=SUM(monto-(costo+seguro)) leyendo costo LIVE. Reproducido: envio cobrado 100000, costo 30k->5k da tarifa 5000/payout 95000; 30k->90k da tarifa 90000/payout 10000. El efectivo total se conserva pero la division GO EXPRESS vs tienda se mueve 25k-60k Gs en silencio, sin auditoria. payout_tienda es el input documentado del store settlement de Part 3. No alcanzable hoy via API (envio.service.ts:632 omite costo a proposito), abierto a SQL crudo, migracion, herramienta admin, flujo n8n o nuevo path TS.

### ALTA 6: Reapertura cruda evade reabrir_liquidacion

Matiza el reporte previo: forjar payout/tarifa del header MANTENIENDO el sello esta BLOQUEADO por 038 (verificado). El hueco real: `UPDATE liquidaciones_repartidor SET estado='pendiente', cerrada_en=NULL, cerrada_por=NULL, monto_total_recibido=NULL WHERE id=<sellada>` PASA (el trigger permite porque NEW.cerrada_en IS NULL). Diferencias contra reabrir_liquidacion: 0 filas en auditoria_log (reabrir inserta 1 con motivo obligatorio >=10 chars) y el detalle queda conciliado=TRUE bajo header pendiente (reabrir lo pone FALSE). Ese desync atrapa el envio: crear_liquidacion lo excluye por NOT EXISTS(conciliado=TRUE) y un rango solapado es rechazado, dejando el envio sin via de settlement. No mueve plata directamente en este paso (payout se recomputa al re-cerrar), por eso ALTA, pero borra la traza forense que es la razon de ser de reabrir_liquidacion en un sistema con owner legalmente expuesto, y deja un estado invalido persistente.

## Plan de fix (orden de ejecucion)

1. CRITICA 1 + CRITICA 2 (mismo archivo, mismo cambio de raiz): extender trg_liquidacion_envios_inmutable a BEFORE INSERT OR UPDATE OR DELETE. En la rama INSERT, leer cerrada_en del padre (NEW.liquidacion_id) y RAISE si NOT NULL. cerrar_liquidacion hace el UPSERT del detalle ANTES del UPDATE que pone cerrada_en=NOW(), asi que en ese instante cerrada_en IS NULL y el flujo legitimo de cierre pasa. Ademas endurecer la clausula de excepcion del UPDATE: exigir NEW.monto_esperado IS NOT DISTINCT FROM OLD.monto_esperado AND NEW.monto_cobrado IS NOT DISTINCT FROM OLD.monto_cobrado AND NEW.envio_id = OLD.envio_id, para que la transicion de sellado no haga piggyback de cambios de plata.

2. ALTA 3: resetear el GUC al final de create_pago_atomico con `PERFORM set_config('app.pago_rpc','0',true);` inmediatamente despues del INSERT INTO pagos ... RETURNING (antes del INSERT a auditoria_log), igual que update/anular. Mejor a futuro: nonce por-statement en vez de un '1' pegajoso.

3. ALTA 5 + ALTA 10 (mismo guard): extender trg_envio_block_cod_monto_change para disparar tambien BEFORE UPDATE OF costo, costo_seguro y cubrir AMBOS modos (no solo contra_entrega): RAISE si EXISTS pago anulado=FALSE o EXISTS liquidacion_envios para el envio. Congela la tarifa una vez que hay cobro real. El ajuste de costo va por recreacion del envio, no por UPDATE in-place.

4. ALTA 6: gatear la transicion cerrada->pendiente detras de una GUC de sesion que solo reabrir_liquidacion setea (mismo patron que trg_pagos_no_update_fisico, reseteada al salir), y en el trigger 038 rechazar cualquier UPDATE que ponga cerrada_en de NOT NULL a NULL sin esa marca. Como minimo, si OLD.cerrada_en NOT NULL y NEW.cerrada_en NULL, exigir payout_tienda/tarifa_retenida/notas en NULL espejando reabrir.

5. ALTA 4: decidir politica de cobro parcial. Recomendado (COD all-or-nothing): rechazar montoCobrado < monto_a_cobrar en el endpoint de entrega, forzando incidencia/no-entrega en vez de pago parcial silencioso. Si el parcial es valido: incluir estado_pago IN ('pagado','pago_parcial') en el gate y liquidar por monto_cobrado REAL con payout_tienda = monto_cobrado - tarifa. En cualquier caso separar la cola "pago fallo" de "cobro parcial pendiente" y limpiar cod_pago_pendiente al resolver.

6. MEDIA 7: (a) dejar UNA tarifa activa por par origen/destino + indice unico parcial `CREATE UNIQUE INDEX ON tarifas (lower(unaccent(origen)), lower(unaccent(destino))) WHERE activo AND NOT eliminado`. (b) en computeCostoEnvio ordenar explicitamente y alertar como config invalida si hay mas de un match.

7. MEDIA 8: en cerrar_liquidacion rama con_diferencia, no derivar payout_tienda del esperado: dejarlo NULL hasta resolver via reabrir, o computar sobre efectivo rendido. Assert de conservacion: tarifa_retenida + payout_tienda <> monto_total_recibido debe fallar. En update_pago_atomico, re-sincronizar monto_total = v_monto_real en el mismo UPDATE cuando difiere, mas CHECK pagos_pagado_coherente (estado_pago <> 'pagado' OR monto_recibido >= monto_total). Gatear antes de habilitar Part 3.

8. BAJA 9: limpiar deuda de tipos (costo cero, TS no deployado): borrar saldo_cuenta_corriente/limite_credito de ClienteRow y Cliente, de toApi y mapClienteRow; dropear forzarSobreLimite/motivoOverride de createEnvioBodyWithOverride y envioService.create; borrar comentarios stale. Conservar forzarCostoManual.

## Notas de severidad y dedup

Las 4 ALTA bloquean por la misma razon: rompen un backstop de DB o dejan plata real de terceros sin trazabilidad de settlement, aunque hoy ningun camino TS vivo las explote directamente. Con owner legalmente expuesto, onboarding inminente y plata real de afiliados, un backstop roto no es deuda futura: es un flanco abierto al onboarding. Los gaps que alimentan payout_tienda (5, 8) deben cerrarse ANTES de construir Part 3 (store settlement, I11-I14, fuera de alcance), porque payout_tienda es el artefacto que Part 3 consumira y ya queda mal calculado y sellado.

Fusiones aplicadas (duplicados exactos en el JSON de entrada): ALTA 3 absorbe el duplicado "Sello de inmutabilidad de pagos fail-open"; ALTA 5 absorbe "costo/costo_seguro editable con pago activo y dentro de liquidacion" y "Cobro COD parcial deja efectivo real fuera (lente conservacion)"; ALTA 4 absorbe "Cobro COD parcial deja efectivo real fuera de todo settlement"; el reporte previo del ALTA "UPDATE crudo forja payout del header sellado" quedo refinado en ALTA 6 (el forje manteniendo sello esta de hecho bloqueado; el hueco real es la reapertura cruda sin auditoria). MEDIA 8 absorbe "update_pago_atomico flipa a pagado sin re-sincronizar monto_total". BAJA 9 absorbe los tres reportes de codigo muerto CC. Los hallazgos de "comentario miente sobre orden de lock" (crear_liquidacion E->L vs L->E) y "FOR UPDATE no serializa primer pago, el indice unico es la defensa real" se documentan como BAJA de documentacion: comportamiento correcto, comentario equivocado, blindar el indice unico como invariante no removible.

## Gate final

production-ready: NO. Re-correr el round-trip completo contra prod (crear->cerrar->INSERT debe fallar->reabrir->INSERT-legitimo-via-cerrar debe pasar; create_pago_atomico->UPDATE crudo debe RAISE; reapertura cruda debe fallar) DESPUES de aplicar los fixes 1-5, y re-auditar. Sin CERO CRITICA y CERO ALTA verificados contra prod, no se onboardea.
