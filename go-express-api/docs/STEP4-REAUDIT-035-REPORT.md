# STEP 4 RE-AUDIT (post-035): VEREDICTO NO-GO. NO production-ready.

Fecha: 2026-06-18 | Ronda: 3 | Metodo: verificacion adversarial independiente, repros contra prod en BEGIN/ROLLBACK con data sintetica (prod NUNCA tocado).

## Veredicto

**NO-GO. NO production-ready.** La 035 cerro los 8 bloqueantes del Paso 3 en su forma directa, pero la interaccion entre sus propios fixes (C1 x C3 sobre todo) reabrio el agujero central que venia a cerrar y agrego corrupcion de ledger. Production-ready exige CERO CRITICA y CERO ALTA (feedback_production_ready_means_ready, owner legalmente expuesto, plata real de afiliados, tolerancia a error CERO). Hay **1 CRITICA + 10 ALTA**. Un solo bloqueante = NO-GO. No se puede onboardear al primer cliente.

## Estado de los 8 bloqueantes del Paso 3

**8/8 confirmados cerrados en su forma directa.** (36: ver detalle por bloqueante; los 8 cerrados, los 28 checks de soporte verificados via lectura de SQL desplegado + repros).

| ID | Cierre directo | Verificacion |
|---|---|---|
| C1 | Cerrado | crear_liquidacion gatea por EXISTS pago pagado + NOT EXISTS conciliado (035:276-287, 310-321). El caso "entra mal" quedo cerrado. |
| C2 | Cerrado | reabrir_liquidacion existe, SECURITY DEFINER, FOR UPDATE de la liq, motivo>=10, audita (035:58-129). PATCH gateado por rol. |
| C3 | Cerrado | rama UPDATE del sync trigger no toca cod_pago_pendiente salvo en anular (035:190-204). |
| A1 | Cerrado | FOR UPDATE del envio en create/update/anular (035:792, 588, 709). |
| A2 | Cerrado en aislamiento | soft-delete reversa neto completo (035:402-415). Correcto solo; roto en composicion (ver H2, H9). |
| A3 | Cerrado | bypass=COALESCE(NEW.bypass_limite_credito,FALSE) en rama delta (035:459). |
| A4 | Cerrado parcial | guard permite con_diferencia, bloquea cerrada (035:567-577, 692-702). El narrowing abrio H7, H10. |
| A5 | Cerrado | FOR UPDATE OF l antes de leer estado, mismo orden que cerrar (035:561-565, 686-690). |

**Veredicto del cierre:** los 8 estan cerrados en el sentido literal del Paso 3. El problema es que C3 (no limpiar el flag en UPDATE) y A2 (reversar neto completo) y A4 (abrir con_diferencia) crearon regresiones nuevas que solo aparecen en composicion. Cerrar un bloqueante en aislamiento no equivale a cerrarlo en el sistema.

## Hallazgos nuevos (11 bloqueantes + 4 no-bloqueantes)

Conteo: **CRITICA 1, ALTA 10, MEDIA 4, BAJA 1.** Todos reproducidos contra prod (BEGIN/ROLLBACK) salvo H14 (analisis de codigo + repro de su premisa).

| # | Sev | Titulo | Causa raiz |
|---|---|---|---|
| H1 | CRITICA | COD parcial completado via edicion de pago queda ATRAPADO fuera de toda liquidacion | Colision C1 x C3: crear_liquidacion gatea por cod_pago_pendiente=FALSE (035:271,306) pero la rama UPDATE del trigger nunca limpia el flag (035:190-204). |
| H2 | ALTA | Double-reverse: soft-delete + anular crean deuda fantasma contra envio anulado (regresion A2) | A2 reversa neto por envio_id; anular reversa credito por pago_id (035:730-752). Sin guard eliminado en anular. Doble reverso del mismo credito. |
| H3 | ALTA | COD cobrado completo via update_pago queda STRANDED (colision C1 vs C3) | Misma raiz que H1, vector update_pago_atomico. |
| H4 | ALTA | COD cobrado total atrapado tras completar parcial via update_pago; comentario 035:192-193 es falso | Misma raiz que H1. cerrar_liquidacion NO limpia el flag (verificado: solo crear + trigger lo referencian). |
| H5 | ALTA | crear_liquidacion: carrera de 2 snapshots (COUNT vs INSERT...SELECT) infla monto_total_esperado | crear_liquidacion sin lock sobre envios candidatos (035:264-321). El nuevo filtro EXISTS-pagado vuelve divergentes las 2 lecturas bajo READ COMMITTED. |
| H6 | ALTA | Re-cierre re-concilia (TRUE) un envio cuyo cobro se revirtio: COD no cobrado trabado fuera de toda liquidacion | cerrar_liquidacion blanket conciliado=TRUE (baseline:644-646) + crear filtra NOT EXISTS conciliado. reabrir no des-vincula filas. |
| H7 | ALTA | C1 burlado: anular/bajar pago con liq PENDIENTE + cerrar = COD liquidado-sin-cobrar (conciliado=TRUE y pendiente=TRUE simultaneo) | cerrar_liquidacion no re-valida cobro real (solo crear lo hace). Guard A4 solo cubre cerrada, no pendiente. |
| H8 | ALTA | reabrir->corregir->cerrar NO re-snapshotea: COD pagado tarde STRANDED permanente | reabrir solo des-concilia (035:109-111); cerrar no inserta filas nuevas. El flujo que 035 construyo no incorpora plata tardia. |
| H9 | ALTA | Soft-delete CC con nota_credito/ajuste negativo clawbackea credito legitimo del afiliado (regresion A2) | A2 reversa v_neto_total (TODOS los tipos, 035:403-406), barriendo nota_credito independiente. 034 sub-reversaba, 035 sobre-reversa. |
| H10 | ALTA | A4 abre mutacion directa de liq con_diferencia (settled) sin reabrir: corrompe detalle, crea COD conciliado-sin-cobrar | Guard A4 narroweado a solo cerrada (035:567-577, 692-702). 034 cubria cerrada Y con_diferencia. |
| H11 | ALTA | COD que llega a pagado despues de creada la liq de su rango: registrado-sin-liquidar para siempre | reabrir no re-snapshotea; recrear choca rango_solapado (035:250-253). Misma clase que H8 por vector "asentar pago tras cierre de caja". |

No-bloqueantes (no afectan el veredicto, se arreglan en el mismo PR):

| # | Sev | Titulo |
|---|---|---|
| H12 | MEDIA | A1 crea inversion de orden de lock: deadlock create vs update/anular sobre mismo envio (sin perdida de plata, errcode 40P01 crudo al operador). |
| H13 | MEDIA | liquidacion_envios.monto_cobrado/esperado stale tras reabrir->corregir->cerrar (detalle miente vs envio real). |
| H14 | MEDIA | liquidacion_envios.monto_cobrado stale por el ciclo de 035; inv11 es falso-verde (re-blinda en CI la regresion C1xC3). |
| H15 | BAJA | Re-cerrar tras reabrir usa monto_total_esperado congelado e incluye envios anulados como conciliado: diferencia fantasma. |

## Dedup: cuatro raices, no once bugs independientes

Los 11 bloqueantes colapsan en **4 causas raiz**. Arreglar las 4 cierra los 11 (+ los 4 no-bloqueantes salvo H12, que es independiente).

**RAIZ A: colision C1 x C3 (el flag como gate de liquidacion).** -> H1 (CRITICA), H3, H4, H11. Tambien H14 (inv11 blinda esta misma regresion).
La 035 dejo cod_pago_pendiente como gate en crear_liquidacion (C1) Y dejo de limpiarlo en UPDATE (C3). Cualquier COD completado por el camino natural (editar el pago) queda con el flag stuck en TRUE y desaparece de toda liquidacion. El comentario 035:192-193 que dice que el flag "se limpia al cerrar la liquidacion" es falso: cerrar_liquidacion nunca lo toca, y el envio jamas entra a una liq para que un cierre pudiera limpiarlo.

**RAIZ B: cerrar_liquidacion confia en el snapshot de crear, nunca re-valida ni re-snapshotea.** -> H6, H7, H8, H11, H15 (+ H13, H14). Tambien el lado de inclusion indebida.
reabrir solo des-concilia filas existentes; cerrar solo pone conciliado=TRUE sobre filas preexistentes y lee monto_total_esperado congelado. El cobro real al momento del cierre no se re-evalua. Esto rompe el flujo de cobro tardio que C2/A4/reabrir venian a habilitar (plata llega despues, no entra: H8/H11) Y permite cerrar un envio cuyo pago se anulo despues del snapshot (H7).

**RAIZ C: A2 reversa el neto completo, colisionando con el reverso de credito de otras vias.** -> H2, H9.
Dos fuentes reversan el mismo credito: A2 (scoped a envio_id, barre TODOS los tipos) y anular_pago (scoped a pago_id, barre credito). Composicion = double-reverse (H2). Y A2 barre creditos legitimos independientes del flete, nota_credito por dano (H9). 034 sub-reversaba; 035 invirtio el error a sobre-reversar.

**RAIZ D: A4 narroweado + crear_liquidacion sin lock.** -> H10, H5.
H10: el guard A4 bajo de "cerrada Y con_diferencia" (034) a solo "cerrada", dejando con_diferencia (estado settled, caja ya contada) mutable in-place sin reabrir. H5: crear_liquidacion ejecuta COUNT e INSERT como dos snapshots separados sin lock pesimista sobre los envios candidatos.

## Plan de fix (un solo PR, 036)

Orden por dependencia. Cada fix lleva su invariante reescrito (la suite actual bendice los bugs: inv3 codifica el clawback de H9 como correcto, inv6/inv11 dan falso-verde sobre H1/H3).

**Fix 1 (RAIZ A, cierra H1/H3/H4/H11 + corrige H14).** En crear_liquidacion ELIMINAR la condicion `e.cod_pago_pendiente = FALSE` de AMBAS ramas (count y snapshot, 035:271 y 306). Dejar SOLO el EXISTS pago pagado + NOT EXISTS conciliado como gate. El cobro real es la verdad; el flag queda como senal forense pura (C3), no como gate. Reescribir inv6 (COD completado via edicion entra a liquidacion) e inv11 (sin flag-flip por SQL crudo ni reasignacion de repartidor: afirmar el camino real). Re-correr S1/S3/S6.

**Fix 2 (RAIZ B, cierra H6/H7/H8/H11 + corrige H13/H15).** cerrar_liquidacion debe RE-SELECCIONAR los envios elegibles del rango con el mismo predicado que crear_liquidacion (entregado + contra_entrega + eliminado=FALSE + EXISTS pago pagado + fecha en rango + NOT EXISTS conciliado en OTRA liq), bajo lock: DELETE las filas de liquidacion_envios de esta liq que ya no califican, UPSERT las que ahora califican, re-snapshotear monto_cobrado := envios.monto_cobrado real y recomputar monto_total_esperado = SUM(monto_a_cobrar) sobre el set vigente, ANTES de marcar conciliado=TRUE. Esto convierte cerrar en el unico punto que sella el invariante "todo lo conciliado tiene cobro real" y "monto_total_esperado refleja el set vigente". Invariantes: (a) tras reabrir+pagar-tarde+cerrar, todo COD pagado del periodo queda conciliado en exactamente una liquidacion; (b) tras anular un pago de un envio en liq pendiente, cerrar NO deja ese envio conciliado; (c) detalle liquidacion_envios cuadra con el envio real al cerrar.

**Fix 3 (RAIZ C, cierra H2/H9).** Una sola fuente de reversa del credito de pago. En la rama soft-delete de trg_envio_cc_debito_fn (035:402-415) reversar SOLO `v_debito_neto` (SUM sobre tipo IN debito,ajuste,reverso), NO `v_neto_total`. Asi el credito legitimo (nota_credito) sobrevive al soft-delete (saldo final = -nota_credito, correcto) y el credito de un pago se reversa por su propia via en anular_pago. Reescribir inv3: sembrar debito + nota_credito independiente, exigir que el credito SOBREVIVA al soft-delete (neto del envio = -nota_credito, no 0). Agregar invariante de soft-delete+anular en cualquier orden: SUM(mov del envio)=0 y saldo restaurado.

**Fix 4 (RAIZ D, cierra H10/H5).**
H10: en update_pago_atomico y anular_pago_atomico cambiar el guard de `l.estado = 'cerrada'` a `l.estado IN ('cerrada','con_diferencia')` (035:573, 698). Ambos son settled (cerrada_en NOT NULL); la unica via de correccion es reabrir.
H5: en crear_liquidacion materializar los envio_id elegibles en una CTE con SELECT ... FOR UPDATE al inicio, calcular count/monto sobre ese conjunto fijo e insertar desde el MISMO conjunto. Alternativa: un solo INSERT...SELECT con RETURNING y derivar count/monto del RETURNING. Invariante: crear_liquidacion concurrente con editar-pago no diverge esperado vs SUM(liquidacion_envios).

**Fix 5 (H12, independiente, MEDIA, no bloquea pero va en el PR).** Imponer orden de lock unico: al inicio de create_pago_atomico, ANTES del SELECT envios FOR UPDATE, agregar `PERFORM 1 FROM pagos WHERE envio_id=p_envio_id AND anulado=FALSE FOR UPDATE;` (orden P->E, igual que update/anular). Rompe el ciclo de deadlock a nivel DB.

## Gate de cierre

Re-auditar 036 con el mismo metodo adversarial ANTES de declarar production-ready. Patron confirmado 3 rondas seguidas: cada remediacion introdujo regresiones que solo la verificacion independiente caza. No declarar ready hasta que una ronda de re-auditoria salga limpia (CERO CRITICA, CERO ALTA) Y la suite de invariantes afirme el comportamiento correcto (no el roto). Bloquear onboarding del primer cliente hasta entonces.
