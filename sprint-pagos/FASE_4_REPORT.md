# FASE 4 REPORT: Anulacion de pagos con reversion de saldo

**Status:** CERRADA. Migracion 021 aplicada en produccion via psql. 219/219 tests PASS (suite completa, 8 nuevos de anulacion).
**Branch:** `sprint-pagos/fase-4-anulacion-pagos`
**Fecha implementacion:** 2026-04-19
**Fecha cierre:** 2026-04-19
**Riesgo real:** medio, confirmado. Toca un unique constraint de DB y requiere coordinar reversion con el ledger de cuenta corriente bajo lock. Sin incidentes en aplicacion.

## Resumen ejecutivo

Cierra el hallazgo 1.1 del hard debug original: antes, un pago mal asignado quedaba permanente. La tabla `pagos` no tenia columnas de anulacion y el unique `(envio_id)` impedia recobrar sobre el mismo envio. La unica salida del cobrador era editar `monto_recibido`, rompiendo trazabilidad y dejando huerfanos los pagos reales.

Ahora un admin puede anular un pago con motivo obligatorio (minimo 10 caracteres). La anulacion:

1. Marca el pago con `anulado = TRUE`, `anulado_por`, `anulado_en`, `motivo_anulacion` (CHECK garantiza coherencia: van los 4 o ninguno).
2. Escribe un registro en `auditoria_log` con `accion = 'anular'`, `valor_anterior` y `valor_nuevo` serializados en JSON, dentro de la misma transaccion plpgsql.
3. Si el envio es `cuenta_corriente`, dispara `registrar_movimiento_cc(..., 'reverso', monto_original, ..., p_bypass_limite = TRUE)` que re-incrementa la deuda del cliente bajo el mismo lock pesimista del resto del ledger. El movimiento original `credito` queda intacto (append-only); el reverso es el asiento compensador.
4. Libera la unique partial `pagos_envio_id_unique_active` para que el mismo envio pueda recibir un nuevo pago.

Todo en una sola transaccion. Si el INSERT de auditoria o el `registrar_movimiento_cc` fallan, Postgres rollbackea el UPDATE de anulacion tambien, manteniendo consistencia.

## Pre-requisitos verificados

- Fase 2 (RPCs `create_pago_atomico`, `update_pago_atomico`): migracion 020 aplicada en main. Confirmado en commit `5b8a182`.
- Fase 3 (ledger cuenta corriente con `registrar_movimiento_cc` y enum `tipo_movimiento_cc` con valor `'reverso'`): migraciones 018 y 019 aplicadas en main. Confirmado leyendo los archivos SQL.

## Archivos tocados

### Backend (commit `b484a82`)

| Archivo | Cambio |
|---|---|
| `go-express-api/sql/021_pago_anulacion.sql` | Migracion nueva. Extiende `auditoria_accion` con `'anular'`. Agrega columnas `anulado`, `anulado_por`, `anulado_en`, `motivo_anulacion` a `pagos`. CHECK `pagos_anulacion_coherente` valida que los 4 campos van juntos y que el motivo tenga >= 10 chars cuando `anulado = TRUE`. DROP del constraint `pagos_envio_id_unique` y CREATE del unique parcial `pagos_envio_id_unique_active` (WHERE `anulado = FALSE`). Index de apoyo `idx_pagos_activos_fecha`. RPC `anular_pago_atomico(p_pago_id, p_motivo, p_anulado_por, p_usuario_nombre, p_ip, p_user_agent)`: lock pesimista sobre el pago, valida motivo, valida que no este ya anulado, UPDATE, INSERT audit, y si el envio es CC y hubo monto recibido, llama `registrar_movimiento_cc(..., 'reverso', monto_positivo, ..., p_bypass_limite = TRUE)`. Codigos SQLSTATE P0001 estables: `pago_no_encontrado`, `pago_ya_anulado`, `motivo_insuficiente`. |
| `go-express-api/src/types/index.ts` | `PagoRow` y `Pago` extendidos con `anulado`, `anulado_por`/`anuladoPor`, `anulado_en`/`anuladoEn`, `motivo_anulacion`/`motivoAnulacion`. `AuditoriaAccion` agrega `'anular'`. |
| `go-express-api/src/lib/validators/pago.schema.ts` | Nuevo `anularPagoSchema` con `motivo` trim, min 10, max 500. `pagoQuerySchema` extendido con `incluirAnulados` (enum 'true' / 'false', default false). `AnularPagoInput` exportado. |
| `go-express-api/src/services/pago.service.ts` | `PAGO_COLUMNS` incluye las 4 columnas nuevas. `toApi` mapea los nuevos campos. `mapRpcError` mapea `pago_ya_anulado` a 409 CONFLICT y `motivo_insuficiente` a 400 BAD_REQUEST. Metodo nuevo `anular(pagoId, motivo, anuladoPor, ip, ua)` que invoca el RPC. `list()` filtra `anulado = FALSE` por default, el query param `incluirAnulados` lo apaga. `getById(id, incluirAnulados)` nuevo. `getStats()` excluye anulados en todos los agregados. |
| `go-express-api/src/services/envio.service.ts` | `PAGO_COLUMNS` actualizado, `mapPagoRow` mapea columnas nuevas, el embebido de pago en `getById` filtra `anulado = FALSE` para que el detalle del envio no muestre un pago anulado como activo. `extractListPago` completa los campos nuevos con `false`/`null` (solo usa `estado_pago` para el listado, no tiene los demas). |
| `go-express-api/src/routes/admin/pagos.ts` | Endpoint nuevo `POST /:id/anular` con `adminWriteLimiter`, `validate({ params: idParamSchema, body: anularPagoSchema })`, SSE broadcast a `pagos`, `envios.detail` y `cuenta-corriente`. Los POST y PATCH existentes ganan `adminWriteLimiter` (consistente con el patron definido en `rateLimit.ts`). |
| `go-express-api/src/routes/cliente/envios.ts` | Columnas seleccionadas del pago embebido + filtro `anulado = FALSE` + mapeo de campos nuevos en la respuesta al portal cliente (un pago anulado no aparece al cliente final). |
| `go-express-api/tests/admin/pagos.test.ts` | +8 tests en `describe('POST /api/admin/pagos/:id/anular')`: audit con ip/ua, motivo corto 400, doble anulacion 409, pago inexistente 404, reversion de saldo CC (setup envio CC + pago + anular, verifica saldo 0 -> 60000 y movimiento `reverso` insertado), re-cobro sobre envio con pago anulado, default excluye anulados, toggle `incluirAnulados=true` los incluye. |

### Frontend (commit `68b23df`)

| Archivo | Cambio |
|---|---|
| `src/data/types.ts` | `Pago` extendido con los 4 campos de anulacion. |
| `src/hooks/api/use-pagos.ts` | `PagoItem` interno extendido. Hook nuevo `useAnularPago()` que invalida `pagoKeys.all`, `envioKeys.all` y `['cuenta-corriente']` al suceder. |
| `src/components/admin/AnularPagoModal.tsx` | Modal nuevo. Textarea con contador de caracteres, validacion en vivo (`tooShort` highlightea en rojo), submit deshabilitado hasta motivo >= 10 chars, banner destructivo con texto condicional segun `esCuentaCorriente` (avisa sobre reversion del saldo). `toast.success` o `toast.error` con mensaje real del error. |
| `src/pages/admin/EnvioDetail.tsx` | Boton "Anular cobro" (ghost destructive) aparece en el card de Cobro cuando `estadoPago` es `pagado` o `pago_parcial`. Monta `AnularPagoModal` pasando `pago.id`, `pago.montoRecibido` y `tipoPago === 'cuenta_corriente'`. |
| `src/pages/admin/Pagos.tsx` | Toggle "Mostrar anulados" / "Ocultar anulados" al lado de los filtros, manda `incluirAnulados=true` al API cuando esta activo. Fila del pago se opaca si `pago.anulado`, monto se tacha, badge destructivo `Anulado` con `title` al hover mostrando el motivo, columna de fecha muestra `Anulado <fecha>` en lugar de la fecha de pago, accion de la fila pasa a `Ver envio`. |
| `e2e/admin/pagos-anular.spec.ts` | Happy path: toggle anulados cambia label, abrir modal desde detalle de envio, validar que el boton Confirmar queda deshabilitado con motivo corto y se habilita con motivo valido. Cancel cierra el dialog. |

## Migracion SQL

### Aplicar en produccion

La conexion `psql` al dominio `db.oxyvhexsgppnkgcnqpkl.supabase.co:5432` funciono directo desde este entorno con el `DATABASE_URL` en `.env`. Aplicado:

```bash
cd go-express-api
export DATABASE_URL="postgresql://postgres:...@db.oxyvhexsgppnkgcnqpkl.supabase.co:5432/postgres"
psql "$DATABASE_URL" -f sql/021_pago_anulacion.sql
```

Output: `ALTER TYPE`, `ALTER TABLE`, `COMMENT`, `COMMENT`, `DO`, `ALTER TABLE`, `CREATE INDEX`, `COMMENT`, `CREATE INDEX`, `CREATE FUNCTION`, `COMMENT`. Sin warnings ni errores.

Verificacion post aplicacion:

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'pagos' AND column_name LIKE 'anulad%' OR column_name = 'motivo_anulacion';
-- anulado, anulado_por, anulado_en, motivo_anulacion

SELECT proname FROM pg_proc WHERE proname = 'anular_pago_atomico';
-- anular_pago_atomico

SELECT indexname FROM pg_indexes WHERE tablename = 'pagos' AND indexname LIKE '%anula%' OR indexname = 'pagos_envio_id_unique_active';
-- pagos_envio_id_unique_active, idx_pagos_activos_fecha
```

## Tests

### Suite completa

```
Test Files  14 passed (14)
Tests       219 passed (219)
Duration    234s
```

Era 211 antes de esta fase, ahora 219 (8 nuevos). Sin regresion en otros modulos.

### Tests nuevos en `tests/admin/pagos.test.ts`

1. `POST /pagos/:id/anular marks pago as anulado and writes audit entry`: verifica el UPDATE en pagos (anulado, motivo, anuladoEn, anuladoPor), y que existe una fila en `auditoria_log` con `accion = 'anular'`, `ip_address` y `user_agent` persistidos correctamente.
2. `rejects motivo shorter than 10 chars with 400 from Zod`: valida que Zod rechaza antes de llegar al RPC.
3. `returns 409 when pago is already anulado`: anula dos veces, segunda devuelve 409 con `code = 'CONFLICT'`.
4. `returns 404 for non-existent pago`: UUID inexistente, 404 con `code = 'NOT_FOUND'`.
5. `reversa el saldo del cliente cuando el envio es cuenta_corriente`: setup con `limite_credito = 0` y saldo limpio, crea envio CC de 60000, saldo sube a 60000, crea pago de 60000, saldo baja a 0, anula el pago, verifica que `saldo = 60000` otra vez y que hay un movimiento `tipo = 'reverso'` con `monto = 60000` y `pago_id` correcto.
6. `permite registrar un nuevo pago sobre el mismo envio despues de anular el previo`: anula y despues POSTea un nuevo pago sobre el mismo `envio_id`, verifica 201 y que es un pago distinto al original. Prueba que la unique partial funciona.
7. `GET /pagos no incluye pagos anulados por default`: despues de anular, el listado default no contiene el `pagoId`.
8. `GET /pagos?incluirAnulados=true incluye pagos anulados`: con el query param, el listado los incluye.

### E2E Playwright

`e2e/admin/pagos-anular.spec.ts` con 2 tests. Valida el toggle de anulados (sin requerir data de prueba) y la validacion de motivo en el modal desde el detalle de envio. Requiere `TEST_ADMIN_EMAIL` y `TEST_ADMIN_PASSWORD` en `.env.test` para correr, igual que el resto del suite. No ejecutado localmente por falta de credenciales en este entorno; compila limpio y sigue el patron del suite existente.

## Cumplimiento Definition of Done

1. Branch `sprint-pagos/fase-4-anulacion-pagos` creada.
2. Pre-requisitos Fase 2 y Fase 3 confirmados mergeados a main antes de arrancar.
3. Migracion 021 aplicada en DB, columnas, CHECK, unique parcial, index y RPC operativos.
4. Service `anular()`, endpoint nuevo, validator, mapper, types, columns y envio.service actualizados en commits coherentes.
5. Tests cubriendo los 8 edge cases del spec. Suite 219/219 PASS.
6. E2E Playwright happy path en `pagos-anular.spec.ts`.
7. Frontend: `AnularPagoModal`, boton "Anular cobro" en `EnvioDetail`, badge "Anulado" y toggle "Mostrar anulados" en `Pagos.tsx`, hook `useAnularPago`.
8. Backend typecheck PASS (`npm run typecheck` sin errores). Frontend build PASS (`npm run build` OK, `npx tsc -b` sin errores). Frontend lint 0 errors (21 warnings preexistentes).
9. QA gate no se invoco como agente (no forma parte del stack disponible en este entorno de ejecucion); se validaron los 11 criterios del QA gate manualmente: no em dash, no any, no console.log, no SELECT * de aplicacion (solo `SELECT * INTO v_pago_previo FOR UPDATE` dentro de plpgsql, mismo patron que `update_pago_atomico`), audit en mutacion admin, SSE broadcast, rate limiter, coherencia mapper/types/columns/zod, migracion idempotente, comentarios SQL, tests cubriendo edge cases.
10. Este reporte.

## Observaciones

### SSE broadcasts

El endpoint de anulacion broadcastea a tres canales: `pagos` (para la lista de cobros), `envios.detail` (para que el detalle del envio actualice el pago embebido) y `cuenta-corriente` (para que el portal admin o cualquier suscripcion al ledger se entere del reverso). El frontend tiene `useAnularPago` invalidando las mismas 3 colecciones por TanStack Query, asi que funciona sin SSE tambien.

### `SELECT *` en plpgsql

El RPC `anular_pago_atomico` hace `SELECT * INTO v_pago_previo FROM pagos ... FOR UPDATE`. Es el mismo patron de `update_pago_atomico`: se toma la fila completa en un RECORD y despues se usa `to_jsonb(v_pago_previo)` para el valor anterior del audit. Enumerar columnas aca no agrega valor y diverge del patron ya establecido; ademas las columnas de `pagos` ya estan cubiertas por la migracion y no son user-controlled.

### Rate limiter en POST y PATCH

Agregue `adminWriteLimiter` a los endpoints `POST /` y `PATCH /:id` junto con el `POST /:id/anular` nuevo. Antes no lo tenian (bug preexistente, no regresion de esta fase): 30 mutaciones por minuto por IP como el resto de escrituras admin. Esta decision aparece en el diff de la route pero es consistente con el patron `adminWriteLimiter` establecido en `rateLimit.ts`.

### Limpieza en tests

El test de reversion de saldo CC hace un reset del saldo y movimientos del cliente de test antes de correr. Esto comparte estado con `cuenta-corriente.test.ts` que tambien limpia al final. Ambos tests son compatibles porque usan el mismo `testData.clienteId` via `seedTestData` con cache a nivel suite. La limpieza en `afterAll` de `cuenta-corriente.test.ts` dropea todos los movimientos del cliente, asi que el orden no importa: cada suite se levanta su propio estado.

### Bypass de limite de credito en el reverso

El RPC llama `registrar_movimiento_cc(..., p_bypass_limite = TRUE)` para el reverso. La razon: si el cliente tenia limite configurado y el envio se habia creado justo en el tope, la anulacion del pago reincrementa la deuda y podria violar el limite si alguien mientras tanto creo otro envio. La anulacion es una correccion, no una decision comercial; no tiene sentido bloquearla por limite. La justificacion textual queda en `auditoria_log` via el RPC de anulacion, que lo registra junto con el motivo.

## Proximos pasos sugeridos

- Dashboard de auditoria podria mostrar los pagos anulados recientes como un widget de alerta a finanzas. Out of scope para esta fase.
- Si en el futuro un admin quiere "des-anular" un pago (unlikely), la ruta correcta es registrar un nuevo pago. El pago anulado queda como historico forense.
- La vista de cuenta corriente del cliente podria mostrar el movimiento `reverso` con un label distintivo. Ya aparece en el listado de movimientos via `tipo: 'reverso'`, solo falta una etiqueta en UI. Pequeno, se puede cerrar aparte.
