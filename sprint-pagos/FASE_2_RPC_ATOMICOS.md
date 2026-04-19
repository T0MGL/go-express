# FASE 2: RPC atómicos pago + auditoría

**Tiempo estimado:** 1.5 horas
**Riesgo:** medio (refactor de service crítico, requiere migración SQL)
**Bloquea a:** Fase 4 (anulación reusa el RPC), Fase 5 (autogeneración pago COD usa el RPC)
**Depende de:** Fase 3 (la migración de Fase 3 ya creó la columna `ip_address` y `user_agent` en `auditoria_log` si no existían; verificar)

## Comando de invocación

```
Lee /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/INDEX.md y /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/FASE_2_RPC_ATOMICOS.md, despues lee /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/CLAUDE.md, despues invoca al agency-ceo con el contenido de la seccion "Prompt para agency-ceo" del archivo FASE_2. Cuando termine verifica que dejo FASE_2_REPORT.md en sprint-pagos/.
```

## Contexto del audit

Hallazgo CRÍTICO 1.2 del hard debug original:

> **Mutación pago + auditoría + SSE NO es atómica.** El INSERT en `pagos` se hace primero. Después, fuera de cualquier transacción, se llama `auditoriaService.log(...)`. Si la auditoría falla (DB lenta, error de red, `usuarios` row faltante), el pago queda creado sin rastro forense. No existe `BEGIN/COMMIT` ni RPC en Postgres.
>
> Impacto: cumplimiento normativo roto (Paraguay exige trazabilidad de movimientos financieros). Una caída de Supabase entre operaciones causa pagos sin audit log.
>
> Fix: envolver create/update/anular en RPCs Postgres que hagan INSERT pago + INSERT auditoria_log en una sola transacción.

## Spec técnica

### Migración SQL

Archivo: `go-express-api/sql/0XX_pago_rpc_atomico.sql` (verificar próximo número con `ls go-express-api/sql/` antes).

Funciones plpgsql a crear (todas idempotentes con `CREATE OR REPLACE FUNCTION`):

**1. `create_pago_atomico`**

Parámetros:
```
p_envio_id          UUID
p_monto_total       BIGINT
p_monto_recibido    BIGINT
p_fecha_pago        DATE
p_metodo_pago       metodo_pago_enum
p_referencia        TEXT
p_observaciones     TEXT
p_creado_por        UUID
p_ip                INET
p_user_agent        TEXT
```

Retorno: `TABLE (...todos los campos del pago insertado)`.

Lógica:
- BEGIN transacción implícita (cada función plpgsql es atómica por default, todo o nada).
- Calcular `estado_pago`:
  - `pendiente` si `monto_recibido = 0`
  - `parcial` si `0 < monto_recibido < monto_total`
  - `completo` si `monto_recibido = monto_total`
  - `excedente` si `monto_recibido > monto_total` (o lanzar error si la regla es no permitir; decidir con audit existente)
- INSERT en `pagos` con todos los campos.
- INSERT en `auditoria_log` con `usuario_id = p_creado_por`, `accion = 'crear'`, `entidad = 'pago'`, `entidad_id = pago.id`, `descripcion`, `ip_address = p_ip`, `user_agent = p_user_agent`, `valor_nuevo = json del pago`.
- RETURN QUERY del pago insertado.
- LANGUAGE plpgsql, SECURITY DEFINER (porque escribe en `auditoria_log` que puede tener RLS distinta).

**2. `update_pago_atomico`**

Parámetros: ID del pago + campos a actualizar (algunos opcionales) + actualizado_por + ip + user_agent.

Lógica:
- SELECT pago actual (`FOR UPDATE` para lock).
- Si no existe → RAISE EXCEPTION 'pago_no_encontrado'.
- Si `anulado = TRUE` (post Fase 4) → RAISE EXCEPTION 'pago_anulado_no_modificable'.
- UPDATE con campos provistos.
- INSERT en `auditoria_log` con `accion = 'actualizar'`, `valor_anterior = json viejo`, `valor_nuevo = json nuevo`.
- RETURN QUERY del pago actualizado.

**3. `anular_pago_atomico` (preparación para Fase 4)**

Parámetros: `p_pago_id`, `p_motivo`, `p_anulado_por`, `p_ip`, `p_user_agent`.

Lógica (queda creada pero no se usa hasta Fase 4 que agrega columnas `anulado*` a `pagos`):
- Si la migración de Fase 4 no se aplicó todavía, esta función puede crear pero sin tocar columnas que aún no existen. Mejor opción: crear esta función en la migración de Fase 4, no en Fase 2. Decisión: **dejar fuera de Fase 2**, crear en Fase 4 cuando las columnas existan.

### Backend refactor

**1. `services/pago.service.ts`**

Refactor de `create()`:
```ts
async function create(input, creadoPor, ipAddress, userAgent) {
  // Validaciones pre-RPC (siguen en TS porque AppError es más limpio que excepciones plpgsql):
  // 1. Envio existe y no eliminado
  // 2. monto_recibido <= monto_total (regla de negocio actual, confirmar)
  // 3. fecha_pago razonable

  const { data, error } = await supabase.rpc('create_pago_atomico', {
    p_envio_id: input.envioId,
    p_monto_total: input.montoTotal,
    p_monto_recibido: input.montoRecibido,
    // ...
    p_creado_por: creadoPor,
    p_ip: ipAddress ?? null,
    p_user_agent: userAgent ?? null,
  });

  if (error) {
    // 23505 = unique violation (ya hay pago para ese envío)
    if (error.code === '23505') {
      throw AppError.conflict('Ya existe un pago para este envio');
    }
    throw error;
  }

  return mapPagoRowToApi(data[0]);
}
```

Igual patrón para `update()`.

**2. Manejo de errores plpgsql**

- Errores tipados con `RAISE EXCEPTION 'codigo' USING ERRCODE = 'P0001'`.
- En TS, mapear a `AppError`:
  - `pago_no_encontrado` → `AppError.notFound`
  - `pago_anulado_no_modificable` → `AppError.conflict`

### SSE

- Mantener el broadcast SSE en el handler de la route, DESPUÉS del `await pagoService.create/update`. El RPC garantiza atomicidad DB; el SSE es side effect de presentación, no de integridad.
- No mover SSE al RPC (Postgres no debe disparar HTTP).

### Tests

Archivo `go-express-api/tests/admin/pagos.test.ts`:

- `'create rolls back if auditoria insert fails'`: simular fallo. Una forma: temporalmente truncar `auditoria_log` con un BEFORE INSERT trigger que RAISE EXCEPTION en el contexto del test (suite específica con setup/teardown). Verificar que el pago tampoco se persistió.
- `'create returns 409 on duplicate envio_id'` (probablemente ya exists, mantener).
- `'update returns 404 if pago does not exist'`.
- `'create persists ip and user_agent in auditoria_log via RPC'` (refuerza Fase 1, pero ahora vía RPC).

Si simular fallo de auditoría es muy invasivo, alternativa aceptable: test unitario del RPC directamente (ejecutar el SQL en una transacción de test, romper el INSERT en auditoria_log con un constraint, verificar que el pago no se creó).

### Definition of Done

1. ✅ Branch `sprint-pagos/fase-2-rpc-atomicos` desde `main` (o desde merge de Fase 1 si ya está mergeado).
2. ✅ Migración SQL aplicada localmente, RPCs `create_pago_atomico` y `update_pago_atomico` callable.
3. ✅ `pago.service.ts` refactorizado para usar `supabase.rpc(...)`. Sin INSERT directo a `pagos`.
4. ✅ Errores plpgsql mapeados a `AppError`.
5. ✅ Tests integration nuevos pasan, incluyendo el de rollback.
6. ✅ Tests existentes no rotos.
7. ✅ `npm run typecheck` y `npm run lint` pasan.
8. ✅ qa-gate PASS.
9. ✅ `FASE_2_REPORT.md` con: comando de migración, archivos tocados, decisiones (manejo de errores, dónde quedó la validación), deuda residual.

## Prompt para agency-ceo

```
EJECUTAR FASE 2 del sprint Pagos / Cuenta Corriente / Conciliaciones de GO EXPRESS.

Spec completa en /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/FASE_2_RPC_ATOMICOS.md.

Repo: /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS
Standards: CLAUDE.md del repo (sección 4 + 5 + 13). No em dash. No any. No console.log. No SELECT *.
Branch: sprint-pagos/fase-2-rpc-atomicos desde main (verificar si Fase 1 ya está mergeada).

Pre-requisito a verificar antes de arrancar:
- Fase 1 (IP/UA en service signature) debería estar mergeada. Si no, hablar con el operador antes de avanzar.
- Fase 3 (cuenta corriente) puede estar mergeada o no, no afecta esta fase.

Pasos:
1. Verificar próximo número de migración SQL con ls go-express-api/sql/.
2. Crear migración con RPCs create_pago_atomico y update_pago_atomico (NO anular_pago_atomico, esa es de Fase 4).
3. Refactor pago.service.ts create() y update() para usar supabase.rpc en vez de inserts directos.
4. Mantener validaciones de negocio en TS (envio existe, monto razonable). Mover solo el INSERT pago + INSERT auditoria al RPC.
5. Mapear errores plpgsql a AppError (pago_no_encontrado → 404, conflict → 409).
6. Mantener SSE broadcast en el handler de route, después del await.
7. Test de rollback: el pago no se persiste si la auditoría falla.
8. npm run typecheck + npm test pasan.
9. qa-gate PASS.
10. Crear FASE_2_REPORT.md.

Definition of Done en el archivo de spec.
```
