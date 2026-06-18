# GO EXPRESS — Plan maestro de remediacion 036 (COD-only, end to end, production-ready)

Spec unico y definitivo del nucleo financiero. **Decision de producto (2026-06-18): se elimina cuenta corriente. Modelo COD-only. La tarifa se netea del COD cobrado.** Esto no es alcance extra: borra el subsistema mas bug-denso y fragil en vez de arreglarlo.

Contexto: plata real de afiliados, owner legalmente expuesto, tolerancia CERO. Prod casi vacio (2 clientes, 1 envio, 0 pagos/movimientos/liquidaciones): la remocion de CC es data-safe, sin migracion de datos.

---

## 0. Modelo de negocio (la verdad unica)

No hay cuenta corriente, saldo, deuda, ni limite de credito. El repartidor cobra efectivo al entregar y GO EXPRESS SIEMPRE retiene su tarifa. Dos modos de cobro, ya presentes en el enum `tipo_pago`:

- **`anticipado` (producto prepago):** el cliente ya le pago el producto a la tienda. El repartidor cobra SOLO el envio (`monto_a_cobrar = costo + costo_seguro`). GO EXPRESS retiene todo. Payout a la tienda = 0.
- **`contra_entrega` (COD full):** el cliente paga todo al recibir (`monto_a_cobrar = producto + tarifa`). GO EXPRESS retiene la tarifa, la tienda recibe el resto.

**Formula unificada (cubre los dos): payout a la tienda = `monto_a_cobrar - (costo + costo_seguro)`; GO EXPRESS retiene `costo + costo_seguro`.** En anticipado da 0; en contra_entrega da el valor del producto.

- En AMBOS modos el repartidor cobra efectivo, asi que AMBOS entran a la liquidacion del repartidor (la plata cobrada se rinde). CORRECCION: el `crear_liquidacion` actual filtra `tipo_pago='contra_entrega'` y excluye `anticipado`, dejando el envio (cobrado en efectivo por el repartidor) sin reconciliar. 036 incluye ambos modos.
- La tarifa es un campo del envio, calculado server-side, neteado al liquidar.
- Regla de borde: `monto_a_cobrar >= costo + costo_seguro` siempre (en anticipado, igualdad), validado al crear. Sin CC no hay donde cargar un faltante.

> CONFIRMAR (asuncion declarada): en `anticipado` el repartidor cobra el envio en efectivo al entregar, por eso entra a la liquidacion. Si en `anticipado` no se cobra nada en la calle (envio tambien prepago), entonces anticipado NO entra a liquidacion y payout sigue 0. Gaston confirma cual de los dos.

---

## 1. Lo que se ELIMINA (subsistema cuenta corriente)

Migracion 036, parte 1. Todo esto sale del sistema:

- `tipo_pago = 'cuenta_corriente'`: deja de ser un valor valido. Quedan `anticipado` y `contra_entrega`. (Bloquear el valor por trigger/CHECK; con prod casi vacio no hay datos que migrar, verificar igual que no haya ninguno con CC.)
- Tablas/columnas: uso de `movimientos_cuenta_corriente`, `clientes.saldo_cuenta_corriente`, `clientes.limite_credito`, `envios.bypass_limite_credito`. (Drop o deprecacion explicita segun dependencias; verificar pg_depend antes.)
- Funciones: `registrar_movimiento_cc`, `verificar_saldo_cc`, `recompute_saldo_cc`, y toda rama CC en `create/update/anular_pago_atomico` y `crearNotaCredito` scoped a CC.
- Triggers: `trg_envio_cc_debito_fn` / `trg_envio_cuenta_corriente_debito` (el debito CC entero), `trg_pago_cc_credito_fn`.
- TS: chequeos de limite de credito en bulk, helpers y servicios de cuenta corriente.

**Bugs que se evaporan al remover CC** (no se arreglan, dejan de existir): causa raiz A entera (debito AFTER INSERT/UPDATE, soft-delete deuda fantasma), A2 (reversa neto completo), A3/B2 (bypass limite), H2/H9 (double-reverse, clawback NC), M1 (credito fantasma vs envio eliminado), y las invariantes de saldo CC. Del orden de la mitad de los ~43 hallazgos.

---

## 2. Lo que QUEDA: reconciliacion COD pura (5 principios)

**P1. Una sola fuente de verdad para "cobrado".** Un envio esta COBRADO si y solo si existe un `pago` con `anulado=FALSE` y `estado_pago='pagado'` que cubre `monto_a_cobrar`. La bandera `cod_pago_pendiente` es senal forense pura (divergencia de calle), NUNCA gate.

**P2. El cierre es el unico punto que sella.** `crear_liquidacion` es borrador. `cerrar_liquidacion` re-selecciona los envios elegibles con el MISMO predicado, bajo lock, re-snapshotea contra el cobro real, recomputa esperado y la tarifa neteada, y recien ahi `conciliado=TRUE`. La verdad se congela al cerrar, no al crear.

**P3. Una sola via de reversa.** El credito de un pago se reversa solo por `anular_pago`. (Sin CC, ya no hay reversa de debito ni colision: P3 se vuelve trivial.)

**P4. Un solo orden de lock, siempre: pagos (P) -> envios (E) -> liquidaciones (L).** Mata deadlocks y TOCTOU.

**P5. Inmutabilidad y server-side por DB.** `pagos` rechaza UPDATE/DELETE fisico por trigger. Tarifa y `monto_a_cobrar` calculados/validados server-side, nunca del caller crudo. Todo monto BIGINT.

---

## 3. Invariantes maestros (el contrato que CI prueba)

Los tests afirman ESTOS, fallan primero contra el estado actual, pasan con 036.

- **I1.** Ningun envio con `monto_a_cobrar < costo+costo_seguro` (el COD cubre la tarifa).
- **I2.** Un envio entra a `liquidacion_envios` si y solo si esta COBRADO (P1) y no esta conciliado en otra liquidacion.
- **I3.** Al cerrar: `monto_total_esperado == SUM(monto_a_cobrar del set vigente)`, `monto_cobrado por envio == cobro real`, `tarifa_retenida == SUM(costo+seguro del set)`. Nada conciliado sin cobro real.
- **I4.** Payout a la tienda por liquidacion `== SUM(COD cobrado) - SUM(tarifa)` del set vigente. Cero guaranies creados o destruidos (I incluye conservacion).
- **I5.** Tras `reabrir + pagar tarde + cerrar`: todo COD pagado del periodo queda conciliado en exactamente UNA liquidacion. Cero plata atrapada.
- **I6.** `cod_pago_pendiente=TRUE` no excluye de nada; se limpia solo por accion humana auditada, nunca como efecto colateral de editar un monto.
- **I7.** Ningun pago con `monto_recibido > monto_a_cobrar`.
- **I8.** `pagos`: cero UPDATE/DELETE fisico (DB lo rechaza). Un pago activo por envio (UNIQUE parcial).
- **I9.** Bajo cualquier interleaving concurrente (crear vs editar pago, cerrar vs anular, reabrir vs cerrar), I2-I4 se mantienen.
- **I10.** Cero floats en montos.
- **I11.** Settlement de tienda (por tienda, por periodo): `neto_tienda == SUM(monto_cobrado) - SUM(costo+costo_seguro)` sobre el set de envios entregados del periodo. contra_entrega aporta el producto (positivo), anticipado prepago aporta `-(costo+seguro)` (la tarifa que la tienda debe).
- **I12.** Todo envio entregado pertenece a exactamente UN settlement de tienda cerrado (cero doble pago, cero huerfano).
- **I13.** Un envio contra_entrega entra al settlement de tienda solo si su liquidacion de repartidor esta CERRADA (no se le paga a la tienda plata que el repartidor todavia no rindio). anticipado entra al estar entregado (no hay efectivo de calle).
- **I14.** Si `neto_tienda < 0`, existe una factura a la tienda por `|neto_tienda|`; los pagos de la tienda la reducen; cero linea de credito, cero saldo acumulado mutable. El settlement se calcula al cerrar, no se acumula.

---

## 4. Diseno por componente (comportamiento objetivo)

### 4.1 `crear_liquidacion` (borrador, gateado por cobro real)
CTE con `SELECT ... FOR UPDATE` (orden P->E): entregado + eliminado=FALSE + `tipo_pago IN ('anticipado','contra_entrega')` (AMBOS modos, ya no solo contra_entrega) + fecha en rango + `EXISTS (pago pagado no anulado)` + `NOT EXISTS (conciliado en otra liq)`. SIN condicion sobre `cod_pago_pendiente`. count/monto/INSERT salen del mismo conjunto materializado (`INSERT...SELECT...RETURNING`). Estado `pendiente`.

### 4.2 `cerrar_liquidacion` (unico punto de sello)
Bajo lock (...->L): re-selecciona el set con el predicado de 4.1; `DELETE` filas que ya no califican, `UPSERT` las que ahora califican; re-snapshotea `monto_cobrado` real, recomputa `monto_total_esperado = SUM(monto_a_cobrar)`, `tarifa_retenida = SUM(costo+costo_seguro)` y `payout_tienda = SUM(monto_a_cobrar - (costo+costo_seguro))` del set vigente; recien ahi `conciliado=TRUE`, `estado = (esperado==cobrado ? 'cerrada':'con_diferencia')`, `cerrada_en=now`. El payout es 0 para los `anticipado` y el valor del producto para los `contra_entrega`, por la misma formula.

### 4.3 `reabrir_liquidacion(p_liq_id, p_motivo, p_actor)`
SECURITY DEFINER. Opera sobre `cerrada` y `con_diferencia`. Revierte a `pendiente`, `conciliado=FALSE`, `cerrada_en=NULL`, montos finales NULL. Exige `motivo>=10`. Audita (`auditoria_accion='reabrir'`), cubierto por `liquidacion_estado_coherente`. Endpoint `PATCH /admin/liquidaciones/:id/reabrir`, rol admin, Zod, sin IDOR.

### 4.4 Guard de mutacion de pago (update/anular_pago_atomico)
Orden P->E->L. Antes de leer estado: `SELECT ... FROM liquidacion_envios le JOIN liquidaciones_repartidor l ... WHERE le.envio_id=p_envio_id FOR UPDATE OF l`. Bloquea si `l.estado IN ('cerrada','con_diferencia')` (`pago_en_liquidacion_cerrada`: "reabri la liquidacion para corregir"). Permite si `pendiente` o sin liquidacion.

### 4.5 Pago COD (create/update/anular_pago_atomico)
`SELECT FROM envios FOR UPDATE` (P->E) y `PERFORM 1 FROM pagos WHERE envio_id=... AND anulado=FALSE FOR UPDATE` primero (P). Tope: `monto_recibido <= monto_a_cobrar`. Sobrecobro COD legitimo documentado permitido. Sync trigger: en INSERT setea `monto_cobrado` y limpia el flag si cubre; en UPDATE sincroniza `monto_cobrado` SOLAMENTE, nunca toca `cod_pago_pendiente`.

### 4.6 Tarifa e inputs server-side
`computeCostoEnvio` en TODOS los paths (create, PUT, bulk cliente, bulk admin). Validar `monto_a_cobrar >= costo+costo_seguro` al crear (I1). PUT/bulk no aceptan costo/monto_a_cobrar/tarifaId crudos. Override admin solo con flag + auditoria.

### 4.7 Inmutabilidad y FKs
Triggers BEFORE UPDATE/DELETE en `pagos` que RAISE. FK `pagos.envio_id` -> RESTRICT. UNIQUE parcial `pagos_envio_id_unique_active`.

### 4.8 Settlement de tienda (subsistema NUEVO, misma arquitectura que liquidacion)
NO es cuenta corriente: no hay linea de credito, limite, ni saldo mutable acumulado. Es una conciliacion periodica que se calcula y sella, con factura cuando da negativo.

- **Tablas nuevas:** `store_settlement` (una por tienda+periodo: estado pendiente/cerrada/con_diferencia, neto, direccion pago/factura, cerrada_en, auditoria), `store_settlement_envios` (detalle inmutable con snapshot por envio), `store_invoice` (factura a la tienda cuando neto<0, con pagos de la tienda como eventos separados).
- **`crear_store_settlement(tienda, periodo)` (borrador):** CTE `FOR UPDATE` de los envios elegibles: entregados + en periodo + `NOT EXISTS (en otro store_settlement)` + (contra_entrega: su liquidacion de repartidor CERRADA / anticipado: entregado). Snapshot draft.
- **`cerrar_store_settlement` (unico punto de sello):** re-selecciona con el mismo predicado bajo lock, re-snapshotea `monto_cobrado` y `costo+seguro` reales, computa `neto = SUM(monto_cobrado) - SUM(costo+seguro)`. neto>=0 -> payable a la tienda; neto<0 -> crea `store_invoice` por `|neto|`. Recien ahi `conciliado=TRUE`, estado cerrada/con_diferencia.
- **`reabrir_store_settlement`:** SECURITY DEFINER, motivo>=10, audita, revierte conciliado y anula la factura/payout no cobrado. Unica via de correccion.
- **Orden de lock:** se integra al orden canonico (P->E->L->S, store settlement ultimo).
- **Endpoints:** crear/cerrar/reabrir + listar facturas + registrar pago de tienda, todos gateados por rol admin, Zod, sin IDOR. Inmutabilidad de `store_settlement_envios` y `store_invoice` por trigger.

---

## 5. Secuencia de implementacion (una migracion 036 + TS, un PR)

1. **036 parte 1 (remocion CC):** bloquear `tipo_pago='cuenta_corriente'`; verificar pg_depend; drop/deprecar funciones, triggers, columnas y tabla CC; verificar que prod no tiene envios CC (deberia ser 0). Verificar firmas en pg_proc antes de tocar funciones compartidas (`registrar_movimiento_cc` ya no se usa; confirmar que ningun caller vivo la llama).
2. **036 parte 2 (settlement COD repartidor):** 4.7 inmutabilidad+FK; 4.5 pagos (lock, tope, sync); 4.1 crear (ambos modos); 4.2 cerrar (re-snapshot + tarifa neteada + payout); 4.3 reabrir; 4.4 guard.
3. **036 parte 3 (settlement de tienda, subsistema NUEVO):** 4.8 tablas store_settlement/store_settlement_envios/store_invoice; crear/cerrar/reabrir store settlement; facturacion y pago de tienda; inmutabilidad.
4. **TS:** 4.6 server-side en todos los paths; endpoints reabrir liquidacion + settlement de tienda + facturas; mappings de errores nuevos.
5. **Verificacion contra prod** (BEGIN/ROLLBACK, data sintetica): repro de cada invariante I1-I14 antes/despues.

Idempotente, rollback explicito.

### Realidad de alcance y tiempo (honesto)
La parte 3 (settlement de tienda + facturacion) es un subsistema nuevo, no un fix. Con la disciplina que esto exige (diseno, build, tests contra spec, repro contra prod, y re-auditoria adversarial como gate), no es trabajo de horas. Apurarlo es repetir el error que dio 3 rondas fallidas. "Modelo completo antes de onboardear" implica que el onboarding del primer cliente NO es hoy.

---

## 6. Disciplina de tests (rompe el ciclo de auto-bendicion)

Invariantes I1-I10 en vitest, escritos contra ESTE spec (no contra el codigo). Cada uno FALLA primero contra pre-036 y pasa con 036. El que escribe los tests no copia el modelo del que escribe el SQL. Afirman el contrato de la seccion 3, punto.

---

## 7. Gate de cierre (no negociable)

1. Invariantes I1-I10 en verde, cada uno habiendo fallado primero contra pre-036.
2. Re-auditoria adversarial independiente de 036 (6 lentes, repro contra prod, loop hasta seco).
3. Production-ready SOLO con CERO CRITICA y CERO ALTA. Recien ahi: onboarding del primer cliente y cierre de liquidaciones habilitados.

Con CC fuera, la superficie de costura se reduce a la cadena COD-liquidacion, que es donde el Fix de cierre-re-valida (P2/4.2) corta el problema de raiz. Este es el plan que tiene chance real de salir limpio en una pasada.
