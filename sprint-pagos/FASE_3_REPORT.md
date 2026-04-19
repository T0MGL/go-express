# FASE 3 REPORT: Ledger Cuenta Corriente

**Fecha:** 2026-04-19
**Branch:** `sprint-pagos/fase-3-ledger-cuenta-corriente`
**Estado:** Implementación COMPLETA + qa-gate PASS. Pendiente: aplicar migración 018 manualmente en Supabase Dashboard antes del merge.

## Resumen ejecutivo

Sistema completo de cuenta corriente B2B con ledger inmutable, append-only, atomic via RPC Postgres con SELECT FOR UPDATE y validación de límite de crédito bajo lock. Reemplaza al campo decorativo `clientes.saldo_cuenta_corriente` que existía en SQL pero nunca se actualizaba (hallazgo crítico 2.1 del audit). Backfill cronológico idempotente para reconstruir saldos históricos sin duplicar movimientos. Frontend cliente y admin completos con UI de tres cards (saldo, límite, disponible), tabla paginada de movimientos, formularios para ajuste, nota de crédito y edición de límite con motivo obligatorio y auditoría completa con IP/user-agent.

## Archivos tocados

### Backend nuevos
- `go-express-api/sql/018_cuenta_corriente.sql` (343 líneas, idempotente, RLS append-only)
- `go-express-api/src/lib/validators/cuentaCorriente.schema.ts`
- `go-express-api/src/services/cuentaCorriente.service.ts`
- `go-express-api/src/routes/admin/cuentaCorriente.ts` (5 endpoints + CSV export)
- `go-express-api/src/routes/cliente/cuentaCorriente.ts`
- `go-express-api/tests/admin/cuenta-corriente.test.ts` (23 tests)

### Backend modificados
- `go-express-api/src/lib/validators/index.ts` (export schemas CC)
- `go-express-api/src/routes/admin/index.ts` (mount `/clientes` con cuentaCorriente router)
- `go-express-api/src/routes/admin/envios.ts` (forzarSobreLimite + motivoOverride)
- `go-express-api/src/routes/cliente/index.ts` (mount `/cuenta-corriente`)
- `go-express-api/src/routes/cliente/cuenta.ts`, `routes/cliente/envios.ts` (validación límite + uso del cliente)
- `go-express-api/src/services/cliente.service.ts` (CLIENTE_COLUMNS + limiteCredito)
- `go-express-api/src/services/envio.service.ts` (validación de límite + mapeo de error PG del trigger a 422)
- `go-express-api/src/types/index.ts` (MovimientoCc, MovimientoCcRow, SaldoCuentaCorriente, TipoMovimientoCc, Cliente.limiteCredito)

### Frontend nuevos
- `src/pages/cliente/ClienteCuentaCorriente.tsx` (página portal cliente, paginada, filtros por tipo)
- `src/components/admin/AdminCuentaCorriente.tsx` (sección dentro del Dialog de detalle de cliente, 3 cards + tabla últimos 8 + 3 modals: Ajuste, Nota crédito, Editar límite)
- `src/hooks/api/use-cuenta-corriente.ts` (hooks TanStack Query: useSaldoCliente, useMovimientosCliente, useSaldoAdmin, useMovimientosAdmin, useCrearAjuste, useCrearNotaCredito, useUpdateLimiteCredito)

### Frontend modificados
- `src/App.tsx` (route `/portal/cuenta-corriente`)
- `src/components/cliente/ClienteLayout.tsx`, `ClienteSidebar.tsx` (item de menu)
- `src/hooks/api/index.ts` (export hooks CC)
- `src/pages/admin/Clientes.tsx` (sección Cuenta Corriente en Dialog detalle, max-w-2xl + scroll)

## Migración SQL (018)

### Componentes
- Enum `tipo_movimiento_cc` con `debito`, `credito`, `ajuste`, `nota_credito`, `reverso` (último preparado para Fase 4 anulación)
- Extensión de enums existentes: `auditoria_accion += 'ajuste', 'nota_credito'` y `auditoria_entidad += 'cuenta_corriente'`
- Tabla `movimientos_cuenta_corriente` con FK a clientes, envios (SET NULL on delete), pagos (SET NULL), usuarios. Append-only via REVOKE UPDATE/DELETE. RLS deny anon + authenticated.
- Indexes: `(cliente_id, created_at DESC)`, `(envio_id) WHERE NOT NULL`, `(pago_id) WHERE NOT NULL`, `(tipo, created_at DESC)`
- Columna nueva `clientes.limite_credito BIGINT NOT NULL DEFAULT 0` con CHECK `>= 0`
- Función `registrar_movimiento_cc(...)` con SECURITY DEFINER, SELECT FOR UPDATE del cliente, validación atómica de límite (RAISE P0003 si excede), INSERT en movimientos, UPDATE saldo
- Trigger `trg_envio_cuenta_corriente_debito` AFTER INSERT en envios
- Trigger `trg_pago_cuenta_corriente_credito` AFTER INSERT en pagos
- Backfill cronológico idempotente: solo backfillea clientes sin movimientos previos, ordena envios+pagos por created_at ASC, reconstruye saldo, setea saldo final en una pasada

### Comando para aplicar en producción

La conexión psql directa al host `db.oxyvhexsgppnkgcnqpkl.supabase.co` falla por DNS local. Aplicar manualmente vía Supabase Dashboard:

1. Abrir [Supabase Dashboard](https://supabase.com/dashboard/project/oxyvhexsgppnkgcnqpkl/sql/new) → SQL Editor → New query
2. Copiar el contenido completo de `go-express-api/sql/018_cuenta_corriente.sql`
3. Run
4. Verificar que la tabla `movimientos_cuenta_corriente` existe y la función `registrar_movimiento_cc` está disponible:
   ```sql
   SELECT count(*) FROM movimientos_cuenta_corriente;
   SELECT proname FROM pg_proc WHERE proname = 'registrar_movimiento_cc';
   ```
5. Smoke test del trigger: crear un envío `tipo_pago = 'cuenta_corriente'` desde el admin y verificar que aparece un movimiento debito en la tabla.

Alternativa: desde root del repo con `supabase` CLI linkeado al proyecto:
```bash
supabase db push --include 018_cuenta_corriente.sql
```

## qa-gate (deliverable final)

Iteración 1 (post implementación inicial): **FAIL**. 1 BLOCKER + 1 MAJOR + 4 MINORs.
Iteración 2 (post fixes): **PASS**.

### Fixes aplicados entre iteraciones

1. **BLOCKER (resuelto)** — Route `/portal/cuenta-corriente` no estaba registrada en `App.tsx`. La página estaba importada pero el sidebar linkeaba a una URL que caía en NotFound. Fix en `src/App.tsx:218-220`.

2. **MAJOR (resuelto)** — Validación de límite de crédito era advisory-only en TS (`verificarLimiteCredito`), pero el RPC `registrar_movimiento_cc` no re-validaba bajo lock. Race condition: dos POSTs concurrentes podían pasar la advisory check y ambos crear envíos sobre el límite. Fix:
   - SQL: la función `registrar_movimiento_cc` ahora lee `limite_credito` en el mismo SELECT FOR UPDATE, valida después del cálculo de saldo proyectado, RAISE EXCEPTION P0003 si `limite > 0 AND tipo IN ('debito', 'ajuste') AND monto > 0 AND nuevo_saldo > limite`.
   - TS service: mapeo de errores específicos: `limite_credito_excedido` → `AppError.unprocessable`, cliente no existe → `AppError.notFound`. Fallback a 500 DB_ERROR.
   - `envio.service.ts`: cuando el trigger del INSERT envío raisea P0003, mapea a 422 con mismo shape para mantener contrato consistente. Cierra UX gap del race window.

### Deuda residual aceptable (MINORs documentados, no bloquean merge)

1. **Triggers usan `creado_por = admin sistema` hard-coded**. Cuando un cliente del portal crea su propio envío, el debito en el ledger queda atribuido al admin sistema. Trade-off: la tabla `envios` no tiene columna `creado_por`. Solución requiere agregarla en una migración futura y leerla en el trigger con COALESCE. Roadmap.

2. **`forzarSobreLimite` en `envio.service.ts.create` no enforza `motivoOverride` en el service**, solo en el route handler. Si alguien llama el service directamente desde otro lugar sin `motivoOverride`, el override se asienta con descripción degradada. No hay otros call sites en el codebase, defense in depth débil. Mover validación al inicio del service en una iteración futura.

3. **`ALTER TYPE ADD VALUE` envuelto en `DO $$ BEGIN ... END $$;` con check de `pg_enum`**. El patrón canónico del repo (ver `004_add_logout_auditoria_accion.sql`) usa `ALTER TYPE ... ADD VALUE IF NOT EXISTS` directo. Funciona igual, solo es estilo. Refactor cosmético opcional.

4. **`extractApiError` no existe**: cada modal del frontend admin re-implementa `(err as { data?: { error?: string } })?.data?.error || 'fallback'`. Patrón se repite en otros mutations del repo. Crear helper en `src/lib/api.ts` cuando haya 5+ usos.

## Tests

- Typecheck backend: PASS (0 errors)
- Lint frontend: PASS (0 errors, 22 warnings preexistentes no relacionados con la fase)
- Tests integration nuevos: 23 tests escritos en `tests/admin/cuenta-corriente.test.ts` cubriendo trigger débito, trigger crédito, ajustes positivos/negativos, notas de crédito, paginación, filtros por tipo, límite de crédito (=0 sin restricción, >0 rechaza con 422), override admin con motivo, race condition con lock pesimista, portal cliente solo ve sus propios movimientos.
- Tests existentes (envíos): 24/24 PASS, sin regresiones
- **Bloqueador para correr los 23 tests nuevos:** la migración 018 NO está aplicada en Supabase. Una vez aplicada, los tests deberían pasar (la lógica está implementada según contrato).

## Decisiones no obvias

1. **Convención de signo en el ledger**: positivo = aumenta deuda del cliente (debito), negativo = reduce deuda. Saldo positivo = cliente debe a GoExpress, negativo = saldo a favor del cliente (sobrepago). Documentado en SQL COMMENT y en JSDoc del service.

2. **Tabla append-only enforced en DB**: REVOKE UPDATE/DELETE de PUBLIC y authenticated, RLS deny anon y authenticated. Service_role bypass. La única vía sancionada para mutar el saldo es vía RPC `registrar_movimiento_cc` con SECURITY DEFINER. Cualquier intento de UPDATE/DELETE manual desde otro path falla.

3. **`limite_credito = 0` significa "sin restricción configurada"**, no "límite cero". Decisión deliberada: no bloqueamos operaciones cuando el admin todavía no configuró el límite. Documentado en service y en UI.

4. **Backfill bypassa el RPC e inserta directo en la tabla**: justificado para reconstrucción cronológica histórica. Si invocara el RPC, cada inserción re-validaría limite contra saldo actual, bloqueando el backfill cuando un cliente histórico tenía saldos pasajeros sobre el límite por demoras de pago.

5. **Validación advisory en TS + validación atómica en RPC**: defense in depth. El advisory devuelve 422 friendly antes del INSERT para casos no-concurrentes. El RPC cierra la race window con lock pesimista. Ambas devuelven el mismo error code `limite_credito_excedido` para que el frontend no vea diferencia.

6. **Triggers no llaman al RPC en sentido pleno**: usan `PERFORM registrar_movimiento_cc(...)` que sí ejecuta toda la lógica incluyendo la validación de límite. Si la validación falla, la transacción del INSERT envío hace rollback.

7. **Form HTML simple en AdminCuentaCorriente** (no RHF): consistente con el patrón existente en `Clientes.tsx`. Validación inline con toast. Migrable a RHF + zodResolver más adelante si se quiere uniformizar.

8. **Componente admin embebido en el Dialog de detalle de Clientes** (no página dedicada): el flow del admin es "abrir cliente → ver/operar cuenta corriente sin salir del contexto". Página dedicada quedaría desconectada. Si crece la complejidad, separar a `/admin/clientes/:id/cuenta-corriente`.

## Definition of Done

- [x] Branch `sprint-pagos/fase-3-ledger-cuenta-corriente` creado desde main
- [ ] Migración aplicada en Supabase (PENDIENTE: hacer manualmente vía Dashboard)
- [x] Mapper + ENVIO_COLUMNS o equivalente + TS types + Zod + SQL en commits coherentes (sin schema drift)
- [ ] Tests integration nuevos pasan (PENDIENTE: requiere migración aplicada)
- [x] `npm run typecheck` PASS (backend)
- [x] `npm run lint` PASS (frontend, 0 errors)
- [x] Tests existentes no rotos (24/24 envíos PASS)
- [ ] E2E Playwright happy path (PENDIENTE: deuda no bloqueante, deuda asentada en CLAUDE.md sección 12 "Known gaps")
- [x] Sin `console.log`, sin `any`, sin em dash, sin comentarios obvios
- [x] qa-gate invocado, retorna PASS
- [x] FASE_3_REPORT.md creado

## Próximos pasos

1. Aplicar migración 018 vía Supabase Dashboard (1 minuto).
2. Correr `npm test` en `go-express-api/` para validar los 23 tests nuevos. Si todos pasan: merge a main. Si alguno falla: investigar diff entre lo asumido en el test y lo aplicado.
3. Smoke test manual: abrir admin, entrar a un cliente, registrar un ajuste, verificar que aparece en la tabla y que el saldo se actualiza.
4. Smoke test cliente: loguearse al portal, ir a `/portal/cuenta-corriente`, verificar saldo y movimientos.
5. Una vez mergeado, arrancar Fase 1 (IP/UA + adminWriteLimiter) en branch nuevo desde main. Spec en `sprint-pagos/FASE_1_IP_UA_RATELIMIT.md`.

## Riesgos

- **Aplicación de migración**: SQL es idempotente y testeada localmente en sintaxis. Riesgo concreto: si el usuario `'00000000-0000-4000-a000-000000000001'` (admin sistema) NO existe en `usuarios`, los triggers van a fallar con FK violation cuando alguien cree un envío `cuenta_corriente`. Verificar antes de aplicar:
  ```sql
  SELECT id, nombre FROM usuarios WHERE id = '00000000-0000-4000-a000-000000000001';
  ```
  Si no existe, insertarlo o cambiar el UUID hard-coded en el SQL antes de aplicar.

- **Cliente con saldo pre-existente no-cero**: se confirmó con Gaston que NO hay clientes en producción todavía. El backfill efectivamente skipea (no hay envíos cuenta_corriente históricos). Si por error hubiera datos, el backfill los respeta y reconstruye desde cero, no es destructivo.
