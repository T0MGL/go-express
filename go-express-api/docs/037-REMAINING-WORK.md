# GO EXPRESS 037: trabajo restante para production-ready

Estado tras el fix mecanico de 2026-06-19 (commit 4691f5b). La re-auditoria del 036 encontro 31 hallazgos. Los ~16 CRITICA eran UNA causa raiz mecanica (el TS seguia referenciando objetos DB que 036 dropeo): YA RESUELTO en codigo, tsc limpio, pusheado. Falta deployar (Railway CLI deslogueado) y cerrar los huecos de logica/modelo que siguen abajo.

## YA RESUELTO (commit 4691f5b, pendiente de deploy)
- create envio admin y portal cliente: no inserta bypass_limite_credito (columna dropeada) ni hardcodea tipo_pago=cuenta_corriente (bloqueado por CHECK).
- portal cliente crea anticipado con monto_a_cobrar = costo+costo_seguro (cumple el CHECK monto>=tarifa).
- CLIENTE_COLUMNS sin saldo_cuenta_corriente/limite_credito (dropeadas) que tiraban 500 en todo read de cliente.
- rutas /cuenta-corriente desmontadas (admin y portal); servicio CC y validador CC borrados.
- enum tipoPago, tipos y validador limpios. tsc exit 0.

## DECISION DE MODELO PENDIENTE (Gaston, bloquea el diseno de anticipado)
En `anticipado`, el repartidor cobra la tarifa en efectivo al entregar, o el envio va totalmente prepago y el repartidor cobra 0?
- Opcion A (la que dejo aplicada): repartidor COBRA la tarifa. monto_a_cobrar = costo+seguro. Entra a la liquidacion del repartidor como cobro real. payout_tienda = 0. NO requiere store settlement para el caso basico. Requiere que la app de repartidor permita cobrar en anticipado (hoy solo cobra contra_entrega).
- Opcion B (lo que sugeriste antes, prepago total): repartidor cobra 0. monto_a_cobrar = 0 (relaja I1 para anticipado). La tarifa la debe la tienda, se recupera por el store settlement neto + factura (parte 3). Requiere construir la parte 3 entera.
Confirmar A o B. A es lo mas rapido a production-ready; B es mas trabajo pero matchea "el envio tambien va prepago".

## HUECOS DE LOGICA/SQL (migracion 037 + principal-engineer, pase de las 2am)
1. anticipado y la liquidacion del repartidor: si Opcion A, la app de repartidor (src/routes/repartidor/envios.ts:243, esCod = tipo_pago==='contra_entrega') debe permitir cobrar y crear el pago tambien para anticipado, sino el efectivo cobrado nunca entra a la liquidacion (plata sin reconciliar). Si Opcion B, anticipado NO entra a liquidacion y monto_a_cobrar=0.
2. I1 enforzado solo en INSERT: el codigo referencia trg_envio_block_cod_monto_change pero el trigger NO EXISTE en 036. Crearlo para que monto_a_cobrar>=costo+seguro (y, para anticipado en Opcion A, ==) tambien se enforce en UPDATE.
3. liquidaciones_repartidor y liquidacion_envios sin inmutabilidad a nivel DB: el sello del cierre es violable por UPDATE/DELETE ad-hoc. Agregar triggers BEFORE UPDATE/DELETE que RAISE cuando estado IN ('cerrada','con_diferencia'), salvo via reabrir_liquidacion.
4. anticipado monto_a_cobrar fantasma: enforce server-side que anticipado tenga monto_a_cobrar == costo+seguro exacto (payout_tienda=0), no solo >=. Sin esto, un anticipado con monto inflado crea deuda fantasma a la tienda.
5. Store settlement (parte 3) si Opcion B: tablas store_settlement/store_settlement_envios/store_invoice, crear/cerrar/reabrir, neto por tienda = SUM(monto_cobrado)-SUM(tarifa), factura si negativo. Ver 036-MASTER-REMEDIATION-PLAN.md seccion 4.8.

## ACCIONES DE GASTON (desbloqueo)
1. `railway login` (o deploy desde el dashboard de Railway) para que el fix 4691f5b llegue al backend vivo. Railway CLI esta deslogueado: tambien bloquea introspeccion de prod.
2. Pasar el error del build de Vercel (cuenta separada) para cerrar el deploy del frontend.
3. Confirmar Opcion A o B de anticipado.

## GATE
Tras 037 + deploy: re-auditoria adversarial (limite de subagentes resetea 2am Asuncion). Production-ready solo con cero CRITICA y cero ALTA.
