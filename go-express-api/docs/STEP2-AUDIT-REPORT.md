# GO EXPRESS — Paso 2: Reporte de auditoria adversarial del nucleo financiero

## VEREDICTO: NO-GO. No se lanza. ~24 bugs confirmados (10 CRITICA, 10 ALTA, 4 MEDIA), la mayoria reproducidos contra prod con BEGIN/ROLLBACK.

Fecha: 2026-06-17. Metodo: 6 lentes adversariales en paralelo, cada hallazgo verificado por 2 agentes independientes (uno refuta por codigo, otro reproduce contra prod). 67 agentes, 2 rondas completas + sintesis. La ronda 3 y la sintesis automatica murieron por limite de sesion de Claude (resetea 7am Asuncion), no por falta de hallazgos: la convergencia (ronda seca real) aun NO esta probada. Hallazgos crudos recuperados en `docs/step2-findings-recovered.json`.

Conclusion central: el Paso 1 trajo el camino de CREACION de envios al ledger append-only. Los caminos de EDICION (PUT), BORRADO (soft-delete), IMPORT MASIVO (bulk) y la cadena COD -> liquidacion NO se trajeron a esa disciplina. La misma vulnerabilidad que cerramos en INSERT sigue abierta en UPDATE/DELETE/bulk.

---

## Causa raiz A — El trigger de debito es AFTER INSERT only

`trg_envio_cuenta_corriente_debito` (baseline :3120 / `trg_envio_cc_debito_fn` :1173) asienta el debito de cuenta corriente solo al INSERTAR el envio. No hay contraparte en UPDATE ni en DELETE. Resultado: cualquier cambio posterior al costo, o la anulacion del envio, deja el ledger desincronizado en silencio. El invariante `verificar_saldo_cc()` no lo detecta porque sigue siendo cache==SUM(movimientos); lo que diverge es factura-real vs ledger.

| Sev | Bug | Archivo | Impacto (repro) |
|---|---|---|---|
| CRITICA | Editar `envios.costo` via PUT no re-debita el ledger | envio.service.ts:679 + admin/envios.ts:114-124 + trigger :3120 | Sube costo 100k->150k: afiliado facturado 150k, ledger debita 100k. GO EXPRESS pierde 50k por envio, silencioso. Inverso: cliente paga de mas |
| CRITICA | Soft-delete de envio CC no reversa el debito | envio.service.ts:1085 softDelete + trigger :1173 | Deuda fantasma permanente. Envio CC cancelado deja su debito vivo (repro 100k-120k colgados) |

## Causa raiz B — PUT /admin/envios/:id abierto de par en par

`PUT /:id` usa `createEnvioSchema.partial()` que expone `costo`, `monto_a_cobrar`, `tipoPago`, `tarifaId` crudos del caller. El unico trigger de UPDATE (`trg_envio_block_tipo_pago_change`) solo cubre `tipo_pago`. El fix del Paso 1 (`computeCostoEnvio`) cubrio creacion, NO la edicion.

| Sev | Bug | Archivo | Impacto (repro) |
|---|---|---|---|
| CRITICA | Editar `monto_a_cobrar` (COD) crudo despues de cobrado, sin guard ni recalculo | admin/envios.ts:114-124 + envio.service.ts:680 + schema :61 | COD del afiliado se descuadra en el cierre del repartidor. Repro: cobrado real 500k vs snapshot 50k => 450k fuera de conciliacion, robo conciliado irreversible al cerrar |

## Causa raiz C — Import masivo persiste plata cruda del caller (bug 3 a medio parchear)

| Sev | Bug | Archivo | Impacto |
|---|---|---|---|
| CRITICA | Cliente bulk-import persiste costo/tipoPago/montoACobrar/tarifaId crudos | cliente/envios.ts:410-505 + bulkImportSchema | Afiliado pide costo=0 por linea y mueve plata real a costo cero, sin deuda. Envio gratis silencioso a escala |
| ALTA | Admin bulk-import persiste costo del caller sin computeCostoEnvio ni gate forzarCostoManual | envio.service.ts:947-1040 (`costo: input.costo ?? 0`) | Costo manual masivo sin rastro forense ni recotizacion. Actor admin autenticado (por eso ALTA) |

## Causa raiz D — Cadena de reconciliacion COD con huecos de tres puntas

Cobrado-sin-registrar, registrado-sin-liquidar, liquidado-sin-cobrar. El flag `cod_pago_pendiente` es la unica red y tiene fugas.

| Sev | Bug | Archivo | Impacto (repro) |
|---|---|---|---|
| CRITICA | 409 en registro de pago COD se traga sin marcar cod_pago_pendiente | repartidor/envios.ts:333-334 | Driver levanta el efectivo, sistema registra 0 y no flaggea. Liquidacion cierra con monto_cobrado=0 para plata real cobrada |
| CRITICA | COD entregado con cobro cero no crea pago NI marca pendiente, pero se liquida igual | repartidor/envios.ts:312 + crear_liquidacion :716,744 | Repro: COD 500k entregado-sin-cobro => pagos=0, flag=false, y crear_liquidacion espera 500k. Repartidor liquidado por plata que nunca cobro, fuera de toda cola |
| CRITICA | crear_liquidacion incluye envios con cod_pago_pendiente=true (monto 0) y los marca conciliados para siempre | baseline :716-758, :644-646 | Liquidado-sin-cobrar irreversible. Diferencia falsa -500k; cuando el pago real entra despues, ya esta conciliado |
| ALTA | cod_pago_pendiente nunca se limpia al registrarse el pago | repartidor/envios.ts:341 (unico set true) | La cola de reconciliacion miente para siempre: items resueltos quedan pendientes, fallos nuevos se entierran en el ruido |
| ALTA | Sobrecobro COD legitimo es estructuralmente irregistrable | repartidor/envios.ts:243-330 + cod.ts:40 vs create_pago_atomico :817 | Plata cobrada que nunca puede entrar al sistema. Cae en cod_pago_pendiente irresoluble |

## Causa raiz E — update_pago_atomico topa el COD en costo+seguro, no en monto_a_cobrar

| Sev | Bug | Archivo | Impacto (repro) |
|---|---|---|---|
| CRITICA | Pago COD marcado 'pagado' cuando solo se cobro el costo de envio, no el COD completo | 033:254 / baseline update_pago_atomico :1597 / pago.service.ts:272 | 50k de COD del afiliado registrados como cobrados-totales sin haberse cobrado. Envio sale de toda cola de cobro |
| ALTA | Tope costo+seguro: cobro parcial 30k de un COD 100k se marca pagado total; correccion al alza imposible | baseline :1624 / 033 seccion 2 | COD mal contabilizado. Correccion legitima congelada |
| MEDIA | No se puede subir un pago COD parcial por encima del costo de envio | 033:254-279 | Operador forzado a anular y recrear (ruta con sus propios bugs) |

## Causa raiz F — El ledger no es inmutable a nivel DB (solo por convencion)

| Sev | Bug | Archivo | Impacto (repro) |
|---|---|---|---|
| CRITICA | movimientos_cuenta_corriente sin guard contra UPDATE/DELETE | baseline :938, :3085-3197 (ningun trigger sobre movcc) | Un solo UPDATE/DELETE accidental desincroniza la deuda en el monto exacto, sin alerta. Rompe el invariante maestro |
| ALTA | pagos es DELETE-able pese a 'inmutable'; FK del ledger ON DELETE SET NULL orfana el credito | baseline :404, :3437, :3389 | Pago borrado deja credito flotando sin origen (repro 80k). Rompe trazabilidad pago->movimiento |
| MEDIA | Falta UNIQUE que garantice un credito por pago | baseline :938 | Doble credito por mismo pago no es imposible. Defensa en profundidad faltante |

## Causa raiz G — Pago editado/anulado sobre liquidacion YA CERRADA desincroniza la caja

| Sev | Bug | Archivo | Impacto (repro) |
|---|---|---|---|
| ALTA | Editar pago COD de envio en liquidacion cerrada desincroniza la caja, sin guard/motivo/auditoria | 033:209-319 + trg_pago_sync :1245 | 70k de diferencia entre caja cerrada y estado vivo, en silencio |
| ALTA | anular_pago_atomico de pago en liquidacion cerrada deja al repartidor liquidado por plata "no cobrada" | baseline :428 + trg :1245 + pago.service.ts:313 | Hueco de reconciliacion de tres puntas (repro 200k) |

## Causa raiz H — Concurrencia (sin perdida de plata, ruido operativo)

| Sev | Bug | Archivo | Impacto |
|---|---|---|---|
| MEDIA | crear_liquidacion concurrente devuelve 500 en vez de 409 | liquidacion.service.ts:100-150 + crear_liquidacion sin handler de exclusion_violation | El EXCLUDE bloquea la duplicacion (cero plata mal movida), pero el conflicto legitimo se enmascara como error de servidor |
| MEDIA | 409 unique_violation en create de pago COD se traga sin flag cuando ya existe pago de monto distinto | repartidor/envios.ts:333-334 | Diferencia cobrada en la calle (repro 20k) se pierde sin senal |

---

## Suite de invariantes para CI (Paso 3, vitest)

Cada uno bloquea el deploy si falla:

1. saldo_cuenta_corriente de cada cliente == SUM(movimientos_cuenta_corriente). Tolerancia 0.
2. Para todo envio CC: SUM de debitos del ledger por ese envio == costo+costo_seguro VIGENTE (no el del INSERT). Cubre A y B.
3. Todo envio CC anulado/soft-deleted tiene un movimiento de reversa que neutraliza su debito.
4. Todo COD entregado tiene exactamente un pago activo O esta en cod_pago_pendiente=true. Nunca ninguno de los dos.
5. cod_pago_pendiente=false para todo envio que ya tiene pago activo registrado (la cola no miente).
6. SUM(monto_cobrado de liquidacion) == SUM(pagos COD reales) de sus envios al momento de cerrar. Ningun envio con cod_pago_pendiente entra a una liquidacion.
7. Ningun pago con monto_recibido > monto_a_cobrar del envio (COD) ni > costo+seguro (CC). Tope correcto por tipo.
8. movimientos_cuenta_corriente y pagos: cero UPDATE/DELETE fisico posible (probar que la DB rechaza ambos).
9. Un credito de ledger por pago como maximo (UNIQUE).
10. Todo monto en BIGINT. Cero float/numeric en columnas de dinero.

---

## Plan de fix priorizado (Paso 3)

Bloqueantes para lanzar (todos los CRITICA y ALTA). Patron unico de fix, no parches sueltos: **toda mutacion de dinero (UPDATE, DELETE, bulk, COD) pasa por el ledger con reversa/re-debito, con inmutabilidad forzada a nivel DB, y cero input de monto confiado del caller.**

1. Trigger de debito CC: extender a AFTER UPDATE OF costo/costo_seguro (reversa + re-debito atomico) y a la anulacion (reversa). Cierra A.
2. Cerrar PUT /admin/envios/:id: quitar costo/monto_a_cobrar/tipoPago/tarifaId del schema de edicion, o gatearlos con recalculo server-side + auditoria. Cierra B.
3. computeCostoEnvio en AMBOS bulk-import (cliente y admin); quitar costo/monto del input del cliente. Cierra C.
4. Cadena COD: el guard montoCobrado>0 y los catch 409 marcan SIEMPRE cod_pago_pendiente; crear_liquidacion EXCLUYE envios con cod_pago_pendiente; el flag se limpia al registrar el pago; permitir registrar sobrecobro legitimo. Cierra D.
5. update/create_pago_atomico: topar COD por monto_a_cobrar, CC por costo+seguro. Cierra E.
6. Inmutabilidad DB: triggers BEFORE UPDATE/DELETE que RAISE en movimientos_cuenta_corriente y pagos; FK del ledger a RESTRICT no SET NULL; UNIQUE un-credito-por-pago. Cierra F.
7. Guard de liquidacion cerrada en update/anular_pago_atomico: bloquear o exigir reapertura auditada. Cierra G.
8. crear_liquidacion: EXCEPTION handler que mapea exclusion_violation a 409. Cierra H.

Despues de los fixes: re-correr la auditoria adversarial (resume del workflow) hasta dos rondas secas reales + suite de invariantes en verde. Recien ahi: production-ready.
