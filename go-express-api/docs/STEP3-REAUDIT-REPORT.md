# GO EXPRESS — Paso 3: Re-auditoria adversarial post-034

## VEREDICTO: NO-GO. El sistema NO es production-ready. La remediacion 034 cerro 29 de los 24 hallazgos originales pero abrio/dejo abiertos 11 hallazgos nuevos (3 CRITICA, 7 ALTA, 1 MEDIA, 4 BAJA tras dedup). Un solo bloqueante CRITICA/ALTA = NO-GO. Hay 8 bloqueantes.

Fecha: 2026-06-17. Metodo: re-auditoria adversarial post-034, 3 rondas, verificacion por reproduccion contra prod (BEGIN/ROLLBACK, data sintetica, prod intacto). Originales confirmados cerrados: 29 (las 8 causas raiz del Paso 2 quedaron tecnicamente remediadas en su forma directa). Lo que sobrevivio son regresiones e interacciones entre los propios fixes de 034.

Contexto legal: plata real de afiliados, owner personalmente expuesto, tolerancia a error CERO, onboarding del primer cliente HOY. No se lanza con dinero atrapable o no contabilizable.

---

## Resumen ejecutivo

1. VEREDICTO: NO-GO. No se lanza hoy.
2. Originales cerrados: 29 (las 8 causas raiz remediadas en forma directa).
3. Bloqueantes nuevos: 8 (3 CRITICA + 5 ALTA).
4. CRITICA-1: COD genuinamente no-cobrado o parcial entra a la liquidacion (el flag se limpia, el filtro no mira el monto) y queda liquidado-sin-cobrar IRREVERSIBLE: no existe reabrir_liquidacion y los guards G+B sellan toda correccion.
5. ALTA: TOCTOU monto_a_cobrar vs create_pago (sin FOR UPDATE); soft-delete con nota_credito deja credito fantasma; edicion de costo al alza burla el limite de credito (bypass=TRUE hardcodeado); guard G sobre-bloquea 'con_diferencia'; TOCTOU guard-G vs cerrar_liquidacion (locks disjuntos); el sync trigger borra cod_pago_pendiente al editar el monto y mata la senal de divergencia.
6. MEDIA: pago CC contra envio soft-deleted asienta credito fantasma a nivel DB (guard solo en TS, ventana TOCTOU).
7. BAJA: re-debito de restauracion asimetrico; bypass en delta de costo (mismo defecto, no alcanzable por API); tipo_pago COD->CC sin debito; FK envio_id/pagos.envio_id no migradas a RESTRICT.
8. Production-ready: NO. La causa raiz D (liquidado-sin-cobrar irreversible) NUNCA se cerro de fondo y 034 la EMPEORO al sellar las vias de correccion. La suite de invariantes (inv3, inv6, inv11) blinda el comportamiento roto en CI, ocultando la regresion.

---

## Originales: 29 confirmados cerrados

Las 8 causas raiz del Paso 2 quedaron remediadas en su forma directa y verificada contra prod:
trigger de debito CC cubre INSERT + UPDATE OF costo/costo_seguro/eliminado (A); PUT /admin/envios/:id ya no acepta costo/monto_a_cobrar/tipoPago/tarifaId crudos (B); bulk-import recotiza server-side en cliente y admin (C); guard COD `>0` ahora `!==null`, catch 409 flaggea, flag se limpia al pagar, sobrecobro rechazado arriba (D, las puntas directas); tope por tipo de pago en create/update (E); triggers append-only en movimientos y pagos, UNIQUE un-credito-por-pago, pago_id FK a RESTRICT (F); guard de liquidacion en update/anular (G); exclusion_violation mapeada a 409 (H).

El problema NO es que los fixes no se aplicaron. Es que interactuan entre si y con el modelo de datos de formas que reabren el dano original o crean dano nuevo.

---

## Hallazgos nuevos por severidad

### CRITICA (3) — bloqueantes

| # | Hallazgo | Archivo | Repro prod |
|---|---|---|---|
| C1 | **COD no-cobrado/parcial entra a la liquidacion y queda liquidado-sin-cobrar IRREVERSIBLE.** El guard `!==null` de la cadena COD crea un pago `pendiente` con monto 0. El sync trigger (linea 533) setea `v_pendiente:=FALSE` SIEMPRE (independiente del monto). `crear_liquidacion` solo filtra `cod_pago_pendiente=FALSE` (lineas 604, 632), NUNCA verifica que el pago cubra `monto_a_cobrar`, asi que el envio entra con esperado=500000, cobrado=0. Al cerrar -> `con_diferencia`, `conciliado=TRUE`. Las dos mitades del fix D se pelean: la exclusion de `crear_liquidacion` es codigo muerto para el caso real que debia atrapar. | 034:508-543 (sync trigger) + 034:597-642 (crear_liquidacion) + repartidor/envios.ts | si |
| C2 | **034 sella el trap: el guard causa-G bloquea la unica correccion y no existe reabrir_liquidacion.** Cuando llega la plata real, `update_pago_atomico` y `anular_pago_atomico` raisean `pago_en_liquidacion_cerrada` (034:317-326, 438-447), `trg_envio_block_cod_monto_change` bloquea editar el monto (034:243-272), y NO existe RPC ni endpoint de reapertura (solo crear/cerrar en pg_proc y admin/liquidaciones.ts). Todos los mensajes de error instruyen 'reabrir la liquidacion', una operacion que no existe en ninguna capa. Pre-034 el operador al menos podia anular y rehacer; 034 welded la salida. | 034:317-326, 438-447, 243-272 + ausencia de reabrir | si |
| C3 | **El sync trigger destruye la senal forense de divergencia de calle al editar el monto.** El handler de 409 divergente marca `cod_pago_pendiente=TRUE` (envios.ts:355) como unica senal de que la plata de calle no coincide. Al corregir el pago via `update_pago_atomico`, el sync trigger (AFTER UPDATE OF monto_recibido) ve `anulado=FALSE` y setea `cod_pago_pendiente=FALSE` incondicional (linea 533). El envio sale de la cola con la divergencia sin resolver y entra a la liquidacion como conciliado. La cola de reconciliacion miente. | 034:508-543 + repartidor/envios.ts:355-358 + pago.service.ts:278-317 | si |

> Nota dedup: los 4 hallazgos originales del JSON sobre 'liquidado-sin-cobrar irreversible / guards G+B sellan la recuperacion / no existe reabrir' son facetas del mismo defecto y se consolidan en C1 (la entrada indebida) + C2 (la irreversibilidad). El hallazgo del sync trigger borrando el flag al editar es distinto (afecta la senal forense, no solo la liquidacion) y se mantiene como C3.

### ALTA (5) — bloqueantes

| # | Hallazgo | Archivo | Repro prod |
|---|---|---|---|
| A1 | **TOCTOU monto_a_cobrar vs create_pago.** `create_pago_atomico` lee `envios` SIN FOR UPDATE; bajo READ COMMITTED un UPDATE concurrente de `monto_a_cobrar` corre su guard cuando el pago aun no existe (EXISTS=0, pasa), y el pago snapshotea el monto viejo. Descuadre COD silencioso, conciliado irreversible al cerrar. Reabre causa B por carrera. Fix: `SELECT ... FROM envios WHERE id=p_envio_id FOR UPDATE` en create/update/anular. | 034 trg_envio_block_cod_monto_change + create_pago_atomico | si |
| A2 | **Soft-delete con nota_credito deja credito fantasma.** El trigger de soft-delete reversa solo `v_debito_neto = SUM(debito,ajuste,reverso)` (034:155-159), excluye `credito/nota_credito`. Un envio con NC scoped (`crearNotaCredito` input.envioId) deja, post-anulacion, ledger neto = -30000 a favor del afiliado por un envio que ya no existe. inv3 pasa en verde porque solo siembra debito puro. Fix: reversar el NETO COMPLETO del envio (-SUM(monto WHERE envio_id)). | 034:154-172 (trg_envio_cc_debito_fn soft-delete) | si |
| A3 | **Editar costo CC al alza burla el limite de credito.** La rama delta (034:219) hardcodea `TRUE` como p_bypass_limite, mientras el INSERT y la rama tasar-0->positivo (034:141, 208) pasan `COALESCE(NEW.bypass_limite_credito, FALSE)`. Un UPDATE costo=500000 lleva al cliente a 5x su limite sin override ni rastro de autorizacion. Inconsistencia interna. Fix: cambiar el `TRUE` de la linea 219 por `COALESCE(NEW.bypass_limite_credito, FALSE)`. | 034:213-220 | si |
| A4 | **Guard G sobre-bloquea 'con_diferencia'.** El guard usa `l.estado <> 'pendiente'`, que matchea `con_diferencia` igual que `cerrada`. El estado que MAS necesita correccion (problema abierto: robo, error de conteo, cobro tardio) queda inmutable identico a una caja cerrada limpia, sin via de resolucion. Fix: permitir editar/anular en `con_diferencia` hasta tener reabrir_liquidacion, bloquear solo `cerrada`. | 034:317-323, 438-444 | si |
| A5 | **TOCTOU guard-G vs cerrar_liquidacion (locks disjuntos).** update/anular lockean el PAGO (FOR UPDATE) y el guard G es un EXISTS no-locking; `cerrar_liquidacion` lockea la LIQUIDACION y no toca pagos. Conjuntos de lock disjuntos: U ve `pendiente` antes de que C commitee, C cierra, U muta el pago de una liquidacion ya cerrada sin que el guard lo rechace. Defeat directo del proposito de causa-G. Fix: en U, `SELECT 1 FROM liquidacion_envios le JOIN liquidaciones_repartidor l ... WHERE le.envio_id=... FOR UPDATE OF l` antes de evaluar el estado, mismo orden de lock que cerrar_liquidacion. | 034 update/anular_pago_atomico | si |

> Nota dedup: 3 hallazgos originales describen el mismo TOCTOU guard-G/reapertura como ALTA. Su componente de irreversibilidad ya esta en C2; el componente de carrera distinto (locks disjuntos) se conserva como A5. El componente 'guard sobre-bloquea con_diferencia' es un defecto de scope del guard, distinto de la carrera, y se conserva como A4.

### MEDIA (1)

| # | Hallazgo | Archivo | Repro prod |
|---|---|---|---|
| M1 | **Pago CC contra envio soft-deleted asienta credito fantasma a nivel DB.** Tras soft-delete (debito reversado, neto 0), un pago CC contra ese envio dispara `trg_pago_cc_credito_fn` incondicional, saldo -> negativo (credito a favor falso). El unico guard es un check TS en pago.service.ts:242, alcanzable por ventana TOCTOU entre el SELECT eliminado (:232) y el RPC (:246). Es la misma clase de defecto (inmutabilidad por convencion, no por DB) que 034 vino a cerrar. Fix: llevar el guard a la DB (chequear envios.eliminado en trg_pago_cc_credito_fn y/o create_pago_atomico bajo lock). | baseline trg_pago_cc_credito_fn + create_pago_atomico + pago.service.ts:232-246 | si |

### BAJA (4)

| # | Hallazgo | Archivo |
|---|---|---|
| B1 | Re-debito de restauracion (undelete) enforza el limite de credito (bypass FALSE), asimetrico con la rama de ajuste de costo (bypass TRUE). No alcanzable: ningun endpoint expone restore de envios. | 034:177-188 |
| B2 | Bypass en delta de costo (mismo defecto que A3, no alcanzable por API hoy: PUT omite costo). Landmine para el futuro endpoint de ajuste de costo. Se cierra con el mismo fix de A3. | 034:213-221 |
| B3 | Transicion tipo_pago COD->CC sin tocar costo crea envio CC vivo con factura real y ZERO debito. No alcanzable: PUT omite tipoPago, envioService no lo copia. Hueco de defensa en profundidad. Fix: agregar tipo_pago a la clausula UPDATE OF del trigger + manejar la transicion. | 034 trigger debito + verificar_saldo_cc |
| B4 | FK movimientos.envio_id quedo en SET NULL y pagos.envio_id en CASCADE; solo pago_id se migro a RESTRICT. Caminos de borrado muertos contra los triggers append-only en vez de fallar declarativamente por FK. No alcanzable (no hay hard-delete). Fix: migrar ambas a RESTRICT. | 034:79-92 + baseline:3381,3389 |

---

## Riesgo transversal: la suite de invariantes blinda la regresion

`tests/invariants/money-core.invariants.test.ts` codifica el comportamiento roto como correcto y lo bendice en CI:
- inv11 (:269-305) afirma que COD 0-cobro -> `con_diferencia` es aceptable ('no leak silencioso'). El problema no es visibilidad, es IRREVERSIBILIDAD. CI pasa mientras la plata queda atrapada.
- inv3 (:110-121) siembra solo un envio con debito puro antes del soft-delete, nunca con nota_credito; pasa en verde mientras A2 esta roto en prod.
- inv6 asume que `cod_pago_pendiente` excluye correctamente, sin testear el caso de pago pendiente de monto 0 que C1 deja entrar.

Cualquier fix DEBE reescribir inv3, inv6 e inv11 para que afirmen el comportamiento correcto (exclusion por cobro real, reversa del neto completo, recuperabilidad post-liquidacion), sino la regresion vuelve a colarse.

---

## Plan de fix (bloqueantes, en orden)

1. **crear_liquidacion gatea por cobro REAL, no por el flag (cierra C1).** Agregar a ambas ramas: `AND EXISTS (SELECT 1 FROM pagos p WHERE p.envio_id=e.id AND p.anulado=FALSE AND p.estado_pago='pagado')`. Y en el sync trigger (linea 533): `v_pendiente := (NEW.estado_pago <> 'pagado')`, no FALSE incondicional. Asi un COD cobrado parcial/cero queda en la cola y fuera de la liquidacion hasta tener cobro completo.
2. **Construir reabrir_liquidacion(p_liq_id, p_motivo, p_actor) SECURITY DEFINER (cierra C2 + A4).** Opera sobre `cerrada`/`con_diferencia`, revierte a `pendiente`, pone `liquidacion_envios.conciliado=FALSE`, exige motivo>=10, audita. Exponer PATCH /admin/liquidaciones/:id/reabrir gateado por rol. Agregar la transicion al check `liquidacion_estado_coherente` si no la cubre. Recien entonces los mensajes `pago_en_liquidacion_cerrada` son verdaderos.
3. **Separar la senal forense del flag operacional (cierra C3).** El sync trigger solo limpia `cod_pago_pendiente` en el INSERT del pago, nunca en UPDATE (en UPDATE solo sincroniza monto_cobrado). La divergencia de calle se limpia por una accion humana auditada, no como efecto colateral de editar el monto.
4. **FOR UPDATE del envio en create/update/anular_pago_atomico (cierra A1).** Una linea por funcion, serializa contra trg_envio_block_cod_monto_change.
5. **Soft-delete reversa el NETO COMPLETO del envio (cierra A2).** `v_debito_neto` -> SUM sobre TODOS los tipos asentados del envio_id, de modo que SUM(movimientos del envio)=0 post-anulacion. Endurecer inv3.
6. **bypass=COALESCE(NEW.bypass_limite_credito, FALSE) en la rama delta linea 219 (cierra A3 y B2).**
7. **Guard G atomico con FOR UPDATE OF la liquidacion antes de leer estado (cierra A5).**
8. **Guard envio.eliminado a nivel DB en trg_pago_cc_credito_fn / create_pago_atomico (cierra M1).**

No-bloqueantes (cerrar antes de exponer los endpoints respectivos): B1 (politica de limite en restore), B3 (tipo_pago en trigger), B4 (FK envio_id/pagos.envio_id a RESTRICT).

Tras los fixes: re-correr la suite de invariantes (reescrita) + repro adversarial de C1/C2/C3/A1/A2/A5/M1 contra prod en BEGIN/ROLLBACK. Recien con cero CRITICA y cero ALTA: production-ready.
