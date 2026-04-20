# FASE 5 REPORT: Liquidaciones de repartidor + autogeneracion de pago COD

**Status:** CERRADA. Migracion 022 aplicada en produccion via psql. 247/247 tests PASS (suite completa, 28 nuevos entre cod + liquidaciones).
**Branch:** `sprint-pagos/fase-5-liquidaciones`
**Fecha implementacion:** 2026-04-19
**Riesgo real:** alto, confirmado. Toca el flujo de entrega del repartidor, introduce un sistema financiero nuevo, fuerza un fix de TZ y unifica la fuente de verdad de pagos COD. Aplicado sin incidentes.

## Resumen ejecutivo

Cierra los hallazgos 3.1, 3.2, 3.3 y 3.4 del hard debug original:

- **3.1.** La "conciliacion" previa era un reporte operativo, no un cierre de caja financiero. Ahora hay tabla `liquidaciones_repartidor` + `liquidacion_envios` con estados `pendiente`, `cerrada`, `con_diferencia`. Cada cierre queda asentado con monto esperado, monto recibido, diferencia y auditoria. Se renombra la pagina previa a "Reporte COD" y se aclara que es vista operativa, no financiera.
- **3.2.** `envios.monto_cobrado` era doble fuente de verdad con `pagos.monto_recibido`. Ahora es un cache sincronizado por trigger desde `pagos`. La fuente de verdad pasa a ser `pagos`. Queries existentes (dashboard, reportes) siguen funcionando sin refactor.
- **3.3.** Al marcar entregado COD el repartidor reportaba un monto sin validacion. Ahora el route handler aplica `validarDiferenciaCobroCod()` antes de DB y exige nota de incidencia si la diferencia supera 10%. El monto reportado se persiste via `create_pago_atomico` (RPC de Fase 2), no por set directo a `envios.monto_cobrado`.
- **3.4.** Filtros de fecha usaban UTC implicito. El RPC `crear_liquidacion` filtra por `(fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date`. El reporte COD filtra por los limites UTC que corresponden a los dias PY (usando offset fijo `-04:00` de Asuncion sin DST desde 2024).

## Pre-requisitos verificados

- Fase 2 (RPCs `create_pago_atomico`, `update_pago_atomico`): commit `5b8a182` mergeado en main.
- Fase 3 (ledger CC con `registrar_movimiento_cc`): commit `d7f003c` mergeado en main.
- Fase 4 (anulacion de pagos + trigger sync de anulados): commit `68b23df` mergeado en main.

Antes de arrancar se verifico `git log --oneline -20 main` y los 3 commits de cada fase estan presentes.

## Archivos tocados

### Backend

| Archivo | Cambio |
|---|---|
| `go-express-api/sql/022_liquidaciones_repartidor.sql` | Migracion nueva. Enum `estado_liquidacion` (`pendiente`, `cerrada`, `con_diferencia`). Extension de `auditoria_entidad` con `'liquidacion'`. Tabla `liquidaciones_repartidor` con CHECK de coherencia de estado y columna generada `diferencia`. Tabla `liquidacion_envios` con snapshot de monto esperado/cobrado. Index parcial unique `liquidacion_envios_unique_conciliado` para bloquear doble cierre del mismo envio. Trigger `trg_pago_sync_envio_cobrado` (AFTER INSERT OR UPDATE OF monto_recibido/anulado) que mantiene `envios.monto_cobrado` en sync. RPCs `crear_liquidacion` (snapshot + audit) y `cerrar_liquidacion` (lock pesimista, calculo diferencia, marca conciliado, audit) con SQLSTATE P0001 estables (`rango_invalido`, `repartidor_no_encontrado`, `liquidacion_no_encontrada`, `liquidacion_ya_cerrada`, `notas_requeridas`, `monto_invalido`). |
| `go-express-api/src/types/index.ts` | Agrega `EstadoLiquidacion`, `LiquidacionRepartidorRow`, `LiquidacionEnvioRow`, `LiquidacionRepartidor`, `LiquidacionEnvio`. Extiende `AuditoriaEntidad` con `'liquidacion'`. |
| `go-express-api/src/lib/validators/liquidacion.schema.ts` | Nuevo. `crearLiquidacionSchema` (refinado para fechaHasta >= fechaDesde), `cerrarLiquidacionSchema`, `liquidacionQuerySchema`, `estadoLiquidacionEnum`. |
| `go-express-api/src/lib/validators/index.ts` | Re-export del nuevo schema. |
| `go-express-api/src/lib/cod.ts` | Nuevo helper `validarDiferenciaCobroCod` + constante `DIFERENCIA_COD_TOLERADA = 0.10` + `CodValidationError` con codigo estable. Extraido del route handler para testeo unitario sin montar el middleware de repartidor. |
| `go-express-api/src/services/liquidacion.service.ts` | Nuevo. `LIQUIDACION_COLUMNS` y `LIQUIDACION_ENVIO_COLUMNS` explicitos. `mapLiquidacionRowToApi`, `mapLiquidacionEnvioRow`. `mapLiquidacionRpcError` traduce los SQLSTATE a `AppError`. Metodos `crear()`, `cerrar()` (Sentry warning si cierra con diferencia), `list()` (join con `repartidores` + conteo de envios), `getById()` (detalle con envios + join a envios para tracking y cliente), `listByRepartidor()`. |
| `go-express-api/src/routes/admin/liquidaciones.ts` | Nuevo. 4 endpoints: `GET /`, `GET /:id`, `POST /` (con `adminWriteLimiter`), `PATCH /:id/cerrar` (con `adminWriteLimiter`). SSE broadcast a `['liquidaciones']`. |
| `go-express-api/src/routes/admin/index.ts` | Wirea `/liquidaciones` dentro de admin. |
| `go-express-api/src/routes/admin/repartidores.ts` | Nuevo `GET /:id/reporte-cod` como endpoint oficial. `GET /:id/conciliacion` se mantiene como alias deprecated con header `Deprecation: true` + `Link: .../reporte-cod; rel="successor-version"`. `GET /:id/liquidaciones` delegando a `liquidacionService.listByRepartidor`. |
| `go-express-api/src/services/repartidor.service.ts` | Renombra `getConciliacion` a `getReporteCOD`. Fix TZ: filtra fechas usando limites UTC del dia PY (`${dia}T00:00:00-04:00` y `${dia}T23:59:59.999-04:00`) para cubrir entregas 22:30 PY sin romper el filtro. |
| `go-express-api/src/routes/repartidor/envios.ts` | PATCH `/mis-envios/:id/entregado` refactor. Nuevo campo `notaIncidencia` en el body. Aplica `validarDiferenciaCobroCod()` antes de tocar DB: si >10% sin nota manda 422 `diferencia_cobro_excesiva`, con nota marca `tiene_incidencia = TRUE` y guarda la nota en `incidencia_nota`. Eliminado el set directo `envios.monto_cobrado = montoCobrado`. Ahora invoca `pagoService.create()` (RPC de Fase 2) con `SISTEMA_USER_ID` como creador (el repartidor no esta en `usuarios(id)`; su identidad se preserva en la descripcion de auditoria y en `envios.repartidor_id`). El trigger `trg_pago_sync_envio_cobrado` se encarga de sincronizar `envios.monto_cobrado`. Envios no-COD mantienen el comportamiento previo de cache directo. |

### Frontend

| Archivo | Cambio |
|---|---|
| `src/hooks/api/use-liquidaciones.ts` | Nuevo. `useLiquidaciones` (listado paginado), `useLiquidacion` (detalle con envios), `useCrearLiquidacion`, `useCerrarLiquidacion`. Query keys consistentes con el patron del repo. |
| `src/hooks/api/use-conciliacion.ts` | Reescrito. Apunta al nuevo `/reporte-cod`. Exporta `useReporteCOD` como nombre canonico y mantiene `useConciliacion` como alias compat. Tipos renombrados a `ReporteCODResponse`/`ReporteCODEntrega` con alias `ConciliacionResponse`/`ConciliacionEntrega` para no romper componentes en transicion. |
| `src/components/admin/LiquidacionWizard.tsx` | Nuevo. `LiquidacionWizard` (dialog Radix con select repartidor + rango de fechas, validacion en vivo de rango invalido, POST via hook, navega al detalle al crear). `CerrarLiquidacionModal` (monto fisico recibido, calcula diferencia en vivo, exige 10+ chars de notas cuando hay diferencia, banner con color distinto para faltante vs sobrante). |
| `src/pages/admin/Liquidaciones.tsx` | Nuevo. Listado paginado con filtros (repartidor, estado, rango de fechas). Tabla con badges estado coloreados, ID corto mono, rango, esperado, recibido, diferencia (destructive si != 0), acciones. Empty state con CTA. |
| `src/pages/admin/LiquidacionDetalle.tsx` | Nuevo. Header con repartidor, rango, badge de estado. Banner destructivo con nota si cierra `con_diferencia`. Stats de envios, esperado, recibido, diferencia. Tabla de envios asociados (tracking linkea al envio, diferencia individual resaltada en ambar si != 0, flag conciliado). Boton "Cerrar liquidacion" si pendiente, monta `CerrarLiquidacionModal`. |
| `src/pages/admin/ReporteCOD.tsx` | Nuevo (reemplaza `Conciliacion.tsx`). Mismo layout + datos que el previo, pero banner informativo arriba: "Para cierre de caja oficial usar Liquidaciones" con link a `/admin/liquidaciones`. |
| `src/pages/admin/Conciliacion.tsx` | Eliminado. Reemplazado por `ReporteCOD.tsx`. |
| `src/App.tsx` | Ruta nueva `/admin/liquidaciones`, `/admin/liquidaciones/:id`, `/admin/reporte-cod`. La vieja `/admin/conciliacion` redirige a `/admin/reporte-cod` via `<Navigate replace />`. |
| `src/components/admin/Sidebar.tsx` | Nuevo item `Liquidaciones` con icono `ClipboardText` en la seccion Sistema. |
| `src/pages/admin/Repartidores.tsx` | Link de la accion "Ver conciliacion" apunta a `/admin/reporte-cod` en lugar de `/admin/conciliacion`. |
| `e2e/admin/liquidaciones.spec.ts` | Happy path: listado accesible + wizard abre y boton Crear deshabilitado sin repartidor, detalle de una liquidacion existente, banner de deprecation en reporte-cod, redirect de ruta legacy. |

## Migracion SQL

### Apply

```bash
cd go-express-api
export DATABASE_URL="postgresql://postgres:...@db.oxyvhexsgppnkgcnqpkl.supabase.co:5432/postgres"
psql "$DATABASE_URL" -f sql/022_liquidaciones_repartidor.sql
```

Output primera corrida: `DO`, `ALTER TYPE`, `CREATE TABLE`, `COMMENT` x5, `CREATE INDEX` x2, `CREATE TABLE`, `COMMENT` x4, `CREATE INDEX` x2, `COMMENT`, `CREATE FUNCTION`, `COMMENT`, `NOTICE: trigger ... does not exist, skipping`, `DROP TRIGGER`, `CREATE TRIGGER`, `CREATE INDEX`, `CREATE FUNCTION`, `COMMENT`, `CREATE FUNCTION`, `COMMENT`. Sin warnings ni errores.

### Verificacion post aplicacion

```sql
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name LIKE 'liquidac%';
-- liquidacion_envios, liquidaciones_repartidor

SELECT proname FROM pg_proc
 WHERE proname IN ('crear_liquidacion','cerrar_liquidacion','trg_pago_sync_envio_cobrado_fn');
-- cerrar_liquidacion, crear_liquidacion, trg_pago_sync_envio_cobrado_fn

SELECT enumlabel FROM pg_enum WHERE enumtypid = 'estado_liquidacion'::regtype;
-- pendiente, cerrada, con_diferencia
```

## Tests

### Suite completa

```
Test Files  16 passed (16)
Tests       247 passed (247)
Duration    265.59s
```

Era 219 antes de la fase, ahora 247 (28 nuevos: 18 en `liquidaciones.test.ts` + 10 en `cod.test.ts`). Sin regresion en otros modulos.

### Tests nuevos en `tests/admin/liquidaciones.test.ts` (18)

1. `crea liquidacion con N envios COD entregados en el rango y calcula monto total esperado`: 3 envios entregados hoy PY, monto_total_esperado coincide, detalle devuelve los 3 envios.
2. `crea liquidacion con rango sin envios y devuelve monto 0`: rango 2099, `montoTotalEsperado = 0`, 0 envios.
3. `rechaza rango invalido (fechaHasta < fechaDesde) con 400`: Zod refine bloquea antes del RPC.
4. `rechaza repartidor inexistente con 404`: RPC tira `repartidor_no_encontrado`, mapper devuelve 404.
5. `requiere auth`: 401 sin Bearer.
6. **TZ frontera:** `entrega reportada a las 22:30 PY del dia X aparece en liquidacion del dia X, no del dia X+1`. Envio con `fecha_entrega_real = 2026-03-16T02:30:00Z` (= 22:30 PY del 15). Liquidacion del 15 PY lo incluye. Liquidacion del 16 PY no lo incluye. Valida el cast `AT TIME ZONE 'America/Asuncion'` del RPC.
7. `cierra liquidacion con monto exacto -> estado cerrada, envios marcados conciliados`: happy path, todos los envios quedan con `conciliado = TRUE`.
8. `cierra con diferencia y notas -> estado con_diferencia`: faltan 5000, nota >= 10 chars, estado `con_diferencia`, diferencia -5000.
9. `cerrar con diferencia SIN notas -> 422`: mismo escenario sin notas, RPC tira `notas_requeridas`, mapper devuelve 422.
10. `cerrar liquidacion ya cerrada -> 409`: segundo cierre devuelve `liquidacion_ya_cerrada`.
11. `devuelve 404 para liquidacion inexistente`.
12. **Doble liquidacion rechazada:** `un envio ya conciliado en una liquidacion cerrada no entra en una segunda liquidacion`. Crea A con envio X, cierra A (X queda `conciliado = TRUE`). Crea B para el mismo rango; el envio X NO aparece en B (filtrado por `NOT EXISTS` en el RPC + defense-in-depth via unique parcial).
13. `GET /liquidaciones filtra por repartidorId`.
14. `GET /liquidaciones filtra por estado`.
15. `GET /liquidaciones incluye repartidorNombre y cantidadEnvios`: join con repartidores + conteo batch.
16. `GET /repartidores/:id/liquidaciones lista filtradas por repartidor`.
17. **Trigger sync pagos -> envios.monto_cobrado:** crear pago COD actualiza `envios.monto_cobrado` a `monto_recibido` (hallazgo 3.2).
18. **Trigger anular resetea cache:** anular un pago COD resetea `envios.monto_cobrado` a 0.

### Tests nuevos en `tests/admin/cod.test.ts` (10)

Tests puros del validador `validarDiferenciaCobroCod`. No requieren DB ni auth. Cubren:

1. Monto exacto, no hay incidencia.
2. Diferencia 5% (dentro del tolerado), no hay incidencia.
3. Diferencia 10% (limite inclusivo), no hay incidencia.
4. Diferencia 20% sin nota, lanza `CodValidationError`.
5. Diferencia 20% con nota corta (< 10 chars), lanza `CodValidationError`.
6. Diferencia 20% con nota valida, marca `hayIncidencia = true`.
7. Sobrecobro 20% con nota, marca incidencia.
8. `montoEsperado = 0`, no hay regla aplicable, pasa silenciosamente.
9. Error expone `code = 'diferencia_cobro_excesiva'` estable.
10. `DIFERENCIA_COD_TOLERADA` exportada para sync UI/backend.

### E2E Playwright

`e2e/admin/liquidaciones.spec.ts` con 4 tests: listado + wizard abre, detalle de una liquidacion existente si hay data, banner de deprecation en reporte-cod, redirect de `/admin/conciliacion` a `/admin/reporte-cod`. Sigue el patron de los otros e2e del repo (requiere credenciales en `.env.test` para correr la fixture `adminPage`).

## Cumplimiento Definition of Done

1. Branch `sprint-pagos/fase-5-liquidaciones` creada desde main.
2. Pre-requisitos Fase 2 y Fase 3 verificados mergeados.
3. Migracion 022 aplicada en DB. 2 tablas nuevas + trigger sync + 2 RPCs operativos.
4. Refactor PATCH entregar COD usando RPC `create_pago_atomico`, con validacion 10% via `validarDiferenciaCobroCod`.
5. Service + 4 endpoints (`GET /`, `GET /:id`, `POST /`, `PATCH /:id/cerrar`) + 1 endpoint adicional en repartidores (`GET /:id/liquidaciones`) + validator + types + mapper.
6. Frontend: pagina Liquidaciones (listado), wizard (crear + cerrar), detalle, refactor Conciliacion -> ReporteCOD con banner.
7. Tests integration cubriendo TODOS los edge cases del spec: TZ frontera, doble liquidacion rechazada, diferencia 10% con y sin nota, cerrar con diferencia -> con_diferencia.
8. E2E Playwright happy path.
9. Backend `npm run typecheck` PASS. Backend `npm test` 247/247 PASS. Frontend `npm run build` + `npx tsc -b` PASS. Frontend `npm run lint` 0 errors (21 warnings preexistentes del repo).
10. qa-gate no se invoco como agente (no forma parte del stack disponible en este entorno, mismo criterio que Fase 4); se validaron los 11 criterios manualmente: no em dash en archivos nuevos (verificado con grep), no any, no console.log, no SELECT * en aplicacion (hay un `SELECT * INTO v_previa FOR UPDATE` dentro de plpgsql del RPC `cerrar_liquidacion`, mismo patron que `update_pago_atomico` y `anular_pago_atomico`), audit en todas las mutaciones admin, SSE broadcast, rate limiter `adminWriteLimiter` en POST y PATCH, coherencia mapper/types/columns/zod, migracion idempotente (`IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object`), comentarios SQL densos, tests cubriendo edge cases.
11. Este reporte.

## Decisiones no obvias

### Cache `envios.monto_cobrado` sincronizado por trigger

La spec confirma esta decision arquitectural. La fuente de verdad pasa a ser `pagos`. `envios.monto_cobrado` es cache unidireccional. El trigger `trg_pago_sync_envio_cobrado` es `AFTER INSERT OR UPDATE OF monto_recibido, anulado ON pagos` y actualiza el cache solo para envios `tipo_pago = 'contra_entrega'`. Permite:

- Mantener queries existentes (dashboard, reportes) sin refactor.
- Sincronizacion atomica: cualquier mutacion de pago propaga al cache en la misma transaccion via el RPC.
- Anulacion resetea el cache a 0, coherente con el reverso de saldo CC.

No deprecamos la columna para no romper consumidores. Si a futuro se quiere eliminar, primero se migran los consumidores a consultar `pagos` directamente.

### Deprecation del endpoint `/conciliacion`

El endpoint `/api/admin/repartidores/:id/conciliacion` se mantiene vivo como alias al nuevo `/reporte-cod`, con headers `Deprecation: true` y `Link: .../reporte-cod; rel="successor-version"`. Esto cubre:

- Bookmarks externos o links compartidos.
- Frontend bundles staleados durante deploys.
- Tests o integraciones que aun referencian el path viejo.

El frontend ya apunta al nuevo path. La decision de mantener el alias (en lugar de 301) es porque 301 requeriria forwardear query params + body manualmente; es mas simple tener dos paths que delegan al mismo service method.

### Usuario "Sistema GoExpress" como `creado_por` del pago generado por repartidor

El pago COD autogenerado al marcar entregado debe persistir `creado_por` en `pagos`, que FKea a `usuarios(id)`. El repartidor no es entidad `usuarios`, es `repartidores`. Opciones evaluadas:

1. Crear un registro `usuarios` por cada repartidor y mantener FK. **Rechazado:** duplica modelo y requiere mantener sync.
2. Dropear la FK o hacerla nullable. **Rechazado:** rompe invariante de pagos.
3. **Elegido:** atribuir al usuario sistema (`00000000-0000-4000-a000-000000000001`), preservar identidad del repartidor en la descripcion de auditoria y en `envios.repartidor_id`. Mismo patron que usan los triggers CC (`trg_envio_cc_debito_fn`).

El trade-off: filtrar "pagos creados por X repartidor" requiere join a `envios` y no por `pagos.creado_por`. Acceptable porque ese dato ya vive en `envios.repartidor_id` que si tiene FK correcta.

### Validacion 10% en TS, no en DB

La regla de diferencia 10% con nota obligatoria se evalua en el route handler via `validarDiferenciaCobroCod`. Podria moverse al RPC pero complica el contrato (el RPC pasaria a depender del body del handler). Mantenerla en TS:

- Deja el RPC de pagos generico y reusable.
- El test unitario de `cod.ts` corre sin DB ni middleware.
- Si en el futuro otro flujo genera pagos COD (admin registrando un pago manual desde el panel), puede reusar el mismo validador.

### Atomicidad del flujo de entrega COD

El PATCH de entrega no es transaccional end-to-end. Ejecuta en orden:

1. UPDATE del envio (estado, POD, incidencia).
2. `create_pago_atomico` (pago + auditoria del pago en una tx).
3. Evento de envio + auditoria del cambio de estado (fuera de tx).

Si el paso 2 falla, el envio queda como entregado sin pago asociado, loggeado a Sentry. La liquidacion simplemente no tomara ese envio hasta que un admin cree el pago manualmente. Es la misma semantica que tenia el codigo previo (que tampoco era transaccional) y es acceptable porque el envio marcado entregado es dato operativo mas urgente que el pago registrado (se puede reconciliar despues). Si se quiere atomicidad total haria falta mover todo el flujo a un RPC plpgsql compuesto; fuera de scope.

### Unique parcial `liquidacion_envios_unique_conciliado`

Bloquea doble cierre del mismo envio en dos liquidaciones cerradas. La primera linea de defensa es el `NOT EXISTS` dentro de `crear_liquidacion` (filtra envios ya conciliados). El unique parcial es defense-in-depth para race conditions entre dos admins cerrando liquidaciones en paralelo.

### Temp table rechazada por Supabase

La primera version del RPC `crear_liquidacion` usaba `CREATE TEMP TABLE ... ON COMMIT DROP` + `DELETE FROM tmp ... INSERT`. Supabase tiene un trigger global de proteccion que rechaza `DELETE` sin `WHERE` con SQLSTATE 21000. Refactorizado a dos queries consecutivas sobre `envios` con el mismo predicado (la primera agrega, la segunda inserta). Costo: una query extra; beneficio: compatibilidad con las policies de plataforma. Documentado en el SQL.

## Deuda residual

1. **Auditoria de repartidores usa SISTEMA_USER_ID.** El problema viene de antes: `auditoria_log.usuario_id` FKea a `usuarios(id)` y el repartidor no esta en esa tabla, asi que `auditoriaService.log` con `usuarioId: repartidorId` falla silenciosamente. Este fix se aplico solo al handler de entrega (parte de esta fase); los otros handlers del repartidor (recolectado, incidencia) siguen con el bug preexistente. No es regresion pero vale anotarlo: en un proximo PR, alinear todos los `auditoriaService.log` del repartidor a pasar `SISTEMA_USER_ID` con el nombre real del repartidor en la descripcion. Stacktrace: la auditoria hoy queda como noise en logs, no como excepcion.

2. **Ledger CC no registra reverso cuando se anula un pago COD.** El RPC `anular_pago_atomico` condiciona el reverso a `tipo_pago = 'cuenta_corriente'`. Un pago COD anulado resetea el cache de `envios.monto_cobrado` (via trigger nuevo) pero no genera movimiento CC porque no corresponde. Esto es intencional; lo dejo anotado para no generar duda en auditorias futuras.

3. **Rate limiter global para RPC de crear_liquidacion.** El endpoint tiene `adminWriteLimiter` (30 req/min/IP) pero el RPC en si puede ser pesado si el rango es grande y hay cientos de envios COD entregados. Para el volumen actual (decenas de envios por repartidor por dia) no es problema. Si se escala a miles, considerar un cap explicito en `crear_liquidacion` o un batched materialization.

4. **Liquidaciones pendientes no tienen TTL.** Si un admin crea una liquidacion y nunca la cierra, queda pendiente indefinidamente. Los envios que contiene siguen siendo candidatos para otras liquidaciones (el NOT EXISTS filtra solo `conciliado = TRUE`, que equivale a cerradas). Aceptable: la liquidacion pendiente es solo un snapshot, no bloquea operacion. Si se quisiera auto-expirar, se puede agregar un cron.

5. **No hay bulk close de liquidaciones.** Cada liquidacion se cierra una a una desde el detalle. Si finanzas quiere cerrar 10 al final del dia, son 10 clicks. Acceptable para el volumen actual, escalable despues.

6. **Frontend warnings de ESLint (21 preexistentes).** Ninguno nuevo introducido por esta fase salvo los 2 react-hooks/exhaustive-deps heredados de `Conciliacion.tsx` -> `ReporteCOD.tsx`. Mismo patron que el resto del codigo.

## Proximos pasos sugeridos

- **Dashboard widget "Liquidaciones pendientes por cerrar".** Una tarjeta en el dashboard admin que muestre el conteo de liquidaciones pendientes + total esperado pendiente de cierre. Util para finanzas al cerrar el dia.
- **Alerta automatica si el mismo repartidor acumula 2+ cierres con diferencia en una semana.** Ya existe Sentry warning por cierre con diferencia; un cron diario puede detectar patrones y crear una alerta operativa.
- **Exportar liquidacion a PDF (cierre de caja imprimible).** El detalle de la liquidacion tiene toda la data, solo falta un boton "Imprimir" que arme un PDF con tabla de envios + totales + firma del operador.
- **Migrar el bug preexistente de auditoria de repartidores** (punto 1 de deuda residual) como tarea aparte.
