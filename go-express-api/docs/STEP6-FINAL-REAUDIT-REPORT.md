# GO EXPRESS, Reauditoria Final Step 6: NO-GO

VEREDICTO: NO production-ready. 3 bloqueantes ALTA vivos (cero CRITICA). El criterio de release es cero CRITICA y cero ALTA: no se cumple. NO onboardear hasta cerrar las 3 ALTA y re-verificar contra prod.

Fecha: 2026-06-23. Acceso: prod oxyvhexsgppnkgcnqpkl, read-only, BEGIN/ROLLBACK, jamas COMMIT. Rondas acumuladas: 3. Todos los hallazgos por debajo fueron reproducidos contra produccion con data sintetica dentro de la transaccion en esta sesion, contra las definiciones vivas (no contra los .sql del repo).

## Resumen ejecutivo

1. Veredicto: NO-GO. 3 bloqueantes ALTA vivos, cero CRITICA. Las CRITICA y ALTA de la ronda previa (TOCTOU cierre-vs-anular, re-parenting, pago sin repartidor) las cerraron 042, 043 y 044, verificado vivo en prod.
2. Invariantes verificados OK: 44. Conservacion del ledger COD (tarifa + payout = esperado, BIGINT, cero floats) se sostiene en el flujo normal; round-trip legitimo crear/cerrar/reabrir/recerrar intacto; re-parenting, INSERT bajo sello, tamper de montos y DELETE de liquidacion cerrada bloqueados; pago exige repartidor (044).
3. ALTA 1: el admin marca "entregado" via update_envio_estado_atomico y NO se setea fecha_entrega_real; el COD se cobra pero queda fuera de toda liquidacion para siempre. Viola I5. Plata de tercero retenida sin traza. Reproducido: 130.000 Gs cobrados, crear_liquidacion incluye 0 envios.
4. ALTA 2: el bulk import admin nunca computa el seguro ni reconcilia monto_a_cobrar; para anticipado (modo del portal y default operativo) el trigger I1 rechaza la fila y, como el insert es un unico batch, aborta las hasta 500 filas con un 500 opaco. Importacion masiva de afiliados caida en el modo por defecto.
5. ALTA 3 (mismo path, raiz distinta): aun cuando una fila pasa, el bulk persiste costo_seguro=0 y monto_a_cobrar crudo, asi que GO EXPRESS subfactura su propio seguro en cada envio importado con valor declarado sobre umbral. Fuga de tarifa del lado GO EXPRESS.
6. MEDIA (5): sello de liquidacion reabrible con SQL crudo forjando el GUC app.reabrir_rpc sin auditoria; con_diferencia rompe conservacion contra la caja fisica (gap = faltante); deadlock AB-BA cerrar (L->E) vs pago (E->L) sin retry en TS; TRUNCATE saltea el sello de inmutabilidad; row prod GE2026001000 viola I1 historicamente (inliquidable). Ninguna mueve plata de tercero en silencio HOY (settlement de tienda no construido), por eso no son ALTA, pero son deuda que se vuelve ALTA el dia que se lea payout_tienda o se exponga SQL crudo.
7. Production-ready: NO. Plata real de afiliados, owner legalmente expuesto. Cerrar las 3 ALTA (todas en update_envio_estado_atomico y envio.service.ts bulkImport) y re-auditar antes de onboardear. Las 3 ALTA son cambios acotados de bajo riesgo.

## Invariantes verificados OK (44)

Reproducidos contra prod en esta sesion o confirmados por inspeccion de la definicion viva:

- I1 enforced en INSERT/UPDATE de costo/monto (anticipado igualdad, contra_entrega `>=`). Hueco: solo by-column, no protege filas pre-trigger (ver MEDIA 5).
- I2 crear_liquidacion gatea por EXISTS pago pagado no anulado + NOT EXISTS conciliado en otra liquidacion.
- I3/I4 cerrar: esperado = SUM(monto_a_cobrar), tarifa = SUM(costo+seguro), payout = esperado - tarifa; CHECK liquidacion_payout_conservacion enforza tarifa+payout=esperado.
- I7 pagos_monto_total_check y validacion all-or-nothing en cod.ts: cero pago con recibido > a cobrar via app.
- I8 pagos inmutables (UPDATE/DELETE fisico rechazado), un pago activo por envio.
- I9 (parcial): re-parenting, INSERT bajo sello, tamper de montos del detalle, DELETE/UPDATE de header cerrado: todos BLOQUEADOS (042 + 040 vivos). El round-trip crear -> cerrar -> tamper(bloqueado) -> reabrir(permitido via RPC) -> recerrar pasa.
- I10 cero floats, todo BIGINT.
- Remocion de cuenta corriente: tabla movimientos_cuenta_corriente dropeada, registrar_movimiento_cc inexistente, columna tipo_pago con CHECK que rechaza cuenta_corriente, code paths vivos sin CC operativa, reconciliacion de anticipado correcta (repartidor crea pago al entregar en ambos modos).
- 044 (A4): pago sin repartidor rechazado, verificado vivo.

Las definiciones vivas del header (trg_liquidacion_inmutable_fn) y del detalle (trg_liquidacion_envios_inmutable_fn) coinciden byte a byte con sus archivos canonicos 040 y 042 respectivamente. En replay ordenado (000 -> 044) el repo reproduce prod: 040 y 042 corren despues de 038/039 y son la version final. No hay regresion silenciosa por replay ordenado.

## Hallazgos por severidad

### ALTA (bloqueantes)

| # | Titulo | Archivo | Reproducido en prod |
|---|--------|---------|---------------------|
| A1 | Admin marca entregado via update_envio_estado_atomico sin setear fecha_entrega_real: el COD cobrado queda fuera de toda liquidacion para siempre (viola I5) | src/services/envio.service.ts:700 -> RPC update_envio_estado_atomico (prod) | Si. en_reparto -> admin entregado -> fecha_entrega_real NULL -> COD pagado 130.000 -> crear_liquidacion incluye 0 envios, esperado=0 |
| A2 | Bulk import admin rompe en anticipado: I1 rechaza la fila y el insert monolitico aborta el batch entero con 500 opaco | src/services/envio.service.ts:969-1018 + trg_envio_i1_cubre_tarifa_fn | Si. Batch de 2 filas con una anticipado monto=0 costo=35000 -> ERROR anticipado_monto_invalido, ninguna fila inserta |
| A3 | Bulk import admin nunca computa seguro: persiste costo_seguro=0 y monto_a_cobrar crudo, GO EXPRESS subfactura su propia tarifa | src/services/envio.service.ts:969-1008 | Si. INSERT anticipado valor_declarado alto, costo_seguro=0, pasa I1, seguro no cobrado |

Nota: A2 y A3 son el mismo path roto (bulkImport del admin) con dos consecuencias: A2 tumba el batch, A3 subfactura cuando una fila pasa. Se arreglan juntos. El path unitario admin y los dos paths del portal cliente computan seguro y reconcilian monto correctamente; el bulk admin es el unico inconsistente.

### MEDIA (no bloqueantes hoy, deuda que escala)

| # | Titulo | Archivo | Reproducido | Por que MEDIA |
|---|--------|---------|-------------|----------------|
| M1 | Sello de liquidacion reabrible con SQL crudo forjando GUC app.reabrir_rpc, sin auditoria, detalle queda conciliado=TRUE desync | trg_liquidacion_inmutable_fn (vivo, def 040) | Si. UPDATE crudo reabre, auditoria_log reabrir 0 antes y 0 despues, conciliado=TRUE | No alcanzable por la app (todo va por RPC SECURITY DEFINER). Para mover plata hay que anular el pago primero, lo que saca el envio del set elegible. Dano forense/integridad, no robo silencioso |
| M2 | cerrar_liquidacion con_diferencia rompe conservacion contra la caja fisica: tarifa+payout = esperado, no = recibido; gap = faltante | sql/041 (CHECK contra esperado) + cerrar_liquidacion | Si. recibido=100.000 vs esperado=135.000: tarifa+payout=135.000, gap_vs_caja=35.000 solo en columna diferencia | Solo alcanzable por el p_monto_recibido manual del admin; el layer TS cod.ts es all-or-nothing. payout_tienda no tiene consumidor que desembolse (settlement de tienda no construido) |
| M3 | Deadlock AB-BA: cerrar_liquidacion lockea L->E, anular/update_pago_atomico lockean E->L, sin retry en TS | cerrar_liquidacion (L->E) vs anular/update_pago_atomico (E->L); src/services sin retry 40P01 | Si. Dos sesiones concurrentes sobre el mismo envio: ERROR deadlock detected (40P01) while locking tuple in relation envios | La victima hace rollback atomico completo, no queda estado parcial. Falla segura (liveness/UX), no correctness de dinero. Sube con volumen de operadores concurrentes |
| M4 | TRUNCATE saltea el sello de inmutabilidad de liquidaciones cerradas (header y detalle) | sql/038, sql/039 (triggers BEFORE FOR EACH ROW, no disparan en TRUNCATE) | Si. TRUNCATE liquidacion_envios sobre detalle sellado: det_before=1, det_after=0, sin error ni trigger. TRUNCATE concedido a anon/authenticated/service_role/postgres | TRUNCATE no tiene mapeo PostgREST y el Express usa DML parametrizado; requiere SQL/DDL crudo. Hueco de defense-in-depth, no mueve-plata por la superficie de request |
| M5 | Row prod GE2026001000 viola I1 (monto_a_cobrar=0 < tarifa 24000) y es inliquidable: GO EXPRESS no puede facturar su flete | prod envios GE2026001000; sql/037 (I1 by-column, sin backfill ni CHECK) | Si. Fila contra_entrega entregada, i1_ok=f; create_pago_atomico computa monto=0 y falla pagos_monto_total_check; nunca entra a liquidacion | El cobro es 0, no hay efectivo de tercero. Subsidio de GO EXPRESS a su propio costo, no perdida de afiliado. Prueba de que I1 no cubre datos historicos |

### BAJA (cosmetico, sin impacto en plata)

| # | Titulo | Archivo |
|---|--------|---------|
| B1 | Enum tipo_pago aun expone label cuenta_corriente (neutralizado por CHECK envios_tipo_pago_no_cc, inalcanzable como dato) | DB type tipo_pago |
| B2 | Enum tipo_movimiento_cc y tipos TS de CC (SaldoCuentaCorriente, MovimientoCc, TipoMovimientoCc) quedan como codigo muerto | DB type tipo_movimiento_cc + src/types/index.ts:53,56,696-731 |
| B3 | Comentarios stale: 4 sitios documentan flujo cuenta_corriente que el codigo ya no ejecuta (escribe anticipado) | src/routes/cliente/envios.ts:251, src/lib/validators/envio.schema.ts:114, src/services/envio.service.ts:1000, src/routes/admin/pagos.ts:95 |
| B4 | Comentario en cerrar_liquidacion (041) afirma conservacion contra recibido con clamp; el codigo conserva contra esperado sin clamp | sql/041_payout_conservacion_esperado.sql:112-116 |

Observacion de hygiene (no es hallazgo): la preocupacion previa de "re-aplicar 038/039 regresa los triggers" no aplica bajo replay ordenado, porque 040 (header) y 042 (detalle) corren despues y son canonicos. El riesgo solo existiria si alguien re-ejecuta 038/039 en aislamiento. Recomendable, igual, una verificacion de CI que falle si pg_get_functiondef vivo difiere del archivo canonico antes de cualquier re-aplicacion.

## Plan de fix (orden de ejecucion)

### Bloqueantes ALTA (cerrar los 3 antes de onboardear)

1. A1, fecha_entrega_real en cierre admin. En update_envio_estado_atomico, dentro del mismo UPDATE bajo lock OCC, agregar:
   `fecha_entrega_real = CASE WHEN p_nuevo_estado = 'entregado' AND v_envio_previo.fecha_entrega_real IS NULL THEN NOW() ELSE fecha_entrega_real END`
   espejando el patron de recolectado_en. Idempotente. Re-verificar el repro: admin entregado -> COD pagado -> crear_liquidacion incluye el envio.

2. A2 y A3, bulk import admin (mismo fix). En envio.service.ts bulkImport:
   - Computar costo_seguro por fila server-side (computeSeguroForEnvio, igual que el path unitario y que el bulk del portal cliente en cliente/envios.ts:432-445), una sola lectura de seguro_config por batch.
   - Persistir costo_seguro y seguro_adicional en insertRows.
   - Derivar monto_a_cobrar: anticipado = costo + costo_seguro (igualdad I1); contra_entrega = forzar/validar `>= costo + costo_seguro`, y mandar a fallidos la fila que no cubra en vez de al batch.
   - Cambiar el .insert(insertRows) monolitico: pre-validar I1 en JS y excluir las filas invalidas a fallidos antes del batch, o insertar por fila, para que una fila invalida no tumbe las 500.
   - Actualizar el comentario stale "COD vs CC" (envio.service.ts:1000).

### MEDIA (decidir antes de construir el settlement de tienda parte 3)

3. M1, no confiar en GUC seteable por el caller para autorizar el unseal. Recomendado: revocar UPDATE de las columnas de sello al rol de la app y dejar el unseal solo dentro de reabrir_liquidacion (SECURITY DEFINER con owner distinto), de modo que un UPDATE crudo del rol app sea rechazado por permisos, no por un flag. Alternativa: registrar la reapertura en auditoria_log dentro del propio trigger, asi ningun path des-sella sin traza.

4. M2 y B4, definir politica explicita de la diferencia antes de leer payout_tienda. Si la tienda cobra el producto completo y el faltante es deuda del repartidor, agregar el asiento de cobranza al repartidor por (esperado - recibido) y de sobrante a investigar cuando recibido > esperado, de modo que tarifa + payout + cobranza_repartidor = recibido siempre. Corregir el comentario de 041. Bloquear que la parte 3 lea payout_tienda crudo sin netear.

5. M3, unificar el orden de lock canonico en cerrar_liquidacion para lockear los envios candidatos (E) antes de la fila de la liquidacion (L), alineando con el E-antes-de-L de las RPC de pago. Como red de seguridad, retry acotado (2-3 intentos) sobre 40P01/40001 en pago.service.ts y liquidacion.service.ts. El reorden es la solucion de raiz; el retry es mitigacion.

6. M4, agregar trigger STATEMENT-level BEFORE TRUNCATE en liquidaciones_repartidor y liquidacion_envios con RAISE EXCEPTION incondicional, y REVOKE TRUNCATE de anon, authenticated, service_role.

7. M5, decidir operativamente el destino de GE2026001000 (anular el envio o corregir monto_a_cobrar al COD real). Agregar un CHECK constraint declarativo que enforce I1 a nivel tabla, o un backfill validado, para que filas pre-trigger no queden como agujero permanente.

### BAJA (limpieza, no urgente)

8. B1/B2/B3: borrar de src/types/index.ts los tipos CC muertos y el label cuenta_corriente de AuditoriaEntidad; dropear el enum tipo_movimiento_cc (sin dependientes); actualizar los 4 comentarios stale al modelo COD-only. Mantener el CHECK envios_tipo_pago_no_cc aunque se limpie el enum.

## Conteo final

Bloqueantes: 3 (todas ALTA, cero CRITICA). MEDIA: 5. BAJA: 4. Invariantes OK: 44. Rondas acumuladas: 3.

Production-ready: NO. Las 3 ALTA viven en dos archivos (update_envio_estado_atomico y envio.service.ts bulkImport), son cambios acotados y de bajo riesgo. Cerrarlas, re-verificar el repro de cada una contra prod, y recien ahi onboardear.
