# FASE 4: Anulación de pagos con reversión de saldo

**Tiempo estimado:** 1.5 horas
**Riesgo:** medio (toca constraint unique, requiere reversión de ledger)
**Bloquea a:** ninguna fase
**Depende de:** Fase 2 (RPCs atómicos), Fase 3 (ledger cuenta corriente para reversión)

## Comando de invocación

```
Lee /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/INDEX.md y /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/FASE_4_ANULACION_PAGOS.md, despues lee /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/CLAUDE.md, despues invoca al agency-ceo con el contenido de la seccion "Prompt para agency-ceo" del archivo FASE_4. Cuando termine verifica que dejo FASE_4_REPORT.md en sprint-pagos/.
```

## Contexto del audit

Hallazgo CRÍTICO 1.1 del hard debug original:

> **No hay anulación de pagos. Un pago mal asignado queda permanente.** El router solo expone GET, POST, PATCH. La tabla `pagos` (sql/001:240-253) no tiene columnas `eliminado*` ni `anulado*`. Si un cobrador registra un pago contra el envío equivocado, la única salida es editar `monto_recibido`, lo que rompe trazabilidad y deja huérfano el pago real.
>
> Impacto: imposible reabrir un envío para volver a cobrar. Imposible auditar errores. Cliente que reclama "cobraron dos veces" no se puede revertir limpio. Contador no puede emitir nota de crédito sin tocar manualmente la DB.

## Spec técnica

### Migración SQL

Archivo: `go-express-api/sql/0XX_anular_pagos.sql` (verificar próximo número con `ls`).

**1. Columnas nuevas en `pagos`**:
```sql
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS anulado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anulado_por UUID NULL REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS anulado_en TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT NULL;
```

**2. CHECK constraint de coherencia**:
```sql
ALTER TABLE pagos
  ADD CONSTRAINT pagos_anulacion_coherente
  CHECK (
    (anulado = FALSE AND anulado_por IS NULL AND anulado_en IS NULL AND motivo_anulacion IS NULL)
    OR
    (anulado = TRUE AND anulado_por IS NOT NULL AND anulado_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND length(motivo_anulacion) >= 10)
  );
```

**3. Drop unique constraint vieja, recrear como partial**:
```sql
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_envio_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS pagos_envio_id_unique_active
  ON pagos (envio_id) WHERE anulado = FALSE;
```

Verificar nombre real de la constraint en `sql/010_pago_unique_envio.sql` antes.

**4. Index para queries que filtran por `anulado`**:
```sql
CREATE INDEX IF NOT EXISTS idx_pagos_anulado
  ON pagos (anulado, fecha_pago DESC) WHERE anulado = FALSE;
```

**5. RPC `anular_pago_atomico`**:

Parámetros: `p_pago_id UUID, p_motivo TEXT, p_anulado_por UUID, p_ip INET, p_user_agent TEXT`.

Lógica:
- SELECT pago `FOR UPDATE`. Si no existe → `RAISE EXCEPTION 'pago_no_encontrado'`.
- Si `anulado = TRUE` → `RAISE EXCEPTION 'pago_ya_anulado'`.
- Si `length(p_motivo) < 10` → `RAISE EXCEPTION 'motivo_insuficiente'` (validación también en Zod, doble red).
- UPDATE `pagos SET anulado = TRUE, anulado_por = p_anulado_por, anulado_en = NOW(), motivo_anulacion = p_motivo`.
- INSERT en `auditoria_log` con `accion = 'anular'`, `entidad = 'pago'`, `valor_anterior = pago original (json)`, `valor_nuevo = pago anulado (json)`.
- Si el envío asociado tenía `tipo_pago = 'cuenta_corriente'`:
  - Buscar el movimiento crédito original con `WHERE pago_id = p_pago_id AND tipo = 'credito'`.
  - Llamar `registrar_movimiento_cc(cliente_id, envio_id, p_pago_id, 'reverso', monto_original_positivo, 'Reverso por anulacion del pago ' || p_pago_id || ': ' || p_motivo, p_anulado_por, p_ip, p_user_agent)`.
  - Esto re-incrementa la deuda del cliente.
- RETURN del pago anulado.

Toda esta lógica corre dentro del bloque plpgsql, atómica.

### Backend

**1. Validators**

Archivo `go-express-api/src/lib/validators/pago.schema.ts`:

```ts
export const anularPagoSchema = z.object({
  motivo: z.string().min(10, 'El motivo debe tener al menos 10 caracteres').max(500),
});
export type AnularPagoInput = z.infer<typeof anularPagoSchema>;
```

Wirear en `lib/validators/index.ts`.

**2. Service**

Archivo `services/pago.service.ts`, agregar método `anular`:

```ts
async function anular(
  pagoId: string,
  motivo: string,
  anuladoPor: string,
  ipAddress: string | undefined,
  userAgent: string | undefined,
) {
  const { data, error } = await supabase.rpc('anular_pago_atomico', {
    p_pago_id: pagoId,
    p_motivo: motivo,
    p_anulado_por: anuladoPor,
    p_ip: ipAddress ?? null,
    p_user_agent: userAgent ?? null,
  });

  if (error) {
    if (error.message?.includes('pago_no_encontrado')) {
      throw AppError.notFound('Pago no encontrado');
    }
    if (error.message?.includes('pago_ya_anulado')) {
      throw AppError.conflict('El pago ya está anulado');
    }
    throw error;
  }

  return mapPagoRowToApi(data[0]);
}
```

**3. Filtro `anulado = FALSE` en GETs**

- `pago.service.ts.list()` y `.getById()` deben filtrar `eq('anulado', false)` por default.
- Agregar query param opcional `incluirAnulados` (boolean, default false). Solo admin puede pasarlo `true`.
- En `pagoQuerySchema` agregar `incluirAnulados: z.coerce.boolean().optional().default(false)`.
- Verificar que stats (`getStats`) no incluya pagos anulados en los totales.

**4. Endpoint nuevo**

Archivo `routes/admin/pagos.ts`:

```ts
router.post(
  '/:id/anular',
  adminWriteLimiter,
  requireAdmin,
  validate({ params: idParamSchema, body: anularPagoSchema }),
  asyncHandler(async (req, res) => {
    const pago = await pagoService.anular(
      req.params.id,
      req.body.motivo,
      req.userId!,
      req.ip,
      req.headers['user-agent'],
    );
    sseService.broadcast({ entity: 'pago', action: 'anular', payload: pago });
    res.json(pago);
  }),
);
```

**5. Mapper / TS types**

- Actualizar `Pago` interface en `src/types/index.ts`: agregar `anulado`, `anuladoPor`, `anuladoEn`, `motivoAnulacion`.
- Actualizar `PAGO_COLUMNS` para incluir las columnas nuevas.
- Actualizar `mapPagoRowToApi` para mappearlas.

### Frontend

**1. Botón "Anular" en detalle de pago**

- Solo visible si `pago.anulado === false` y rol del usuario es admin.
- Modal con form RHF + zodResolver(anularPagoSchema).
- Campo `motivo` textarea con contador de caracteres (min 10).
- Confirmación: "Esta acción es irreversible y revertirá el saldo del cliente si aplica. ¿Continuar?".
- Mutación TanStack Query con invalidación de queries de pagos y de cuenta corriente del cliente.

**2. UI para pagos anulados**

- Badge visual "ANULADO" en listados (color destructivo).
- Tooltip o detalle mostrando: anulado por, fecha de anulación, motivo.
- Filtrar por default en listados (no mostrar anulados). Toggle "Mostrar anulados" para admins.

**3. Hook**

Agregar `useAnularPago()` mutation en `src/hooks/api/use-pagos.ts`.

### Tests

Archivo `go-express-api/tests/admin/pagos.test.ts`:

- `'POST /pagos/:id/anular marks pago as anulado with audit'`: verifica columnas de anulación, audit_log entry.
- `'POST /pagos/:id/anular requires motivo of min 10 chars'`: 422 si motivo corto.
- `'POST /pagos/:id/anular fails if already anulado'`: 409 segunda anulación.
- `'POST /pagos/:id/anular fails for non-existent pago'`: 404.
- `'anulando un pago de envio cuenta_corriente reversa el saldo del cliente'`: setup con envío CC + pago, anular, verificar movimiento `reverso` insertado y `saldo_cuenta_corriente` re-incrementado.
- `'anulando un pago permite registrar nuevo pago para el mismo envio'`: verifica que la unique partial funciona.
- `'GET /pagos no incluye anulados por default'`.
- `'GET /pagos?incluirAnulados=true incluye anulados solo para admin'`.

E2E Playwright: admin anula un pago desde el detalle.

### Definition of Done

1. ✅ Branch `sprint-pagos/fase-4-anulacion-pagos`.
2. ✅ Pre-req: Fase 2 (RPCs) y Fase 3 (ledger CC) mergeadas a `main`. Verificar antes de arrancar.
3. ✅ Migración aplicada localmente, columnas y RPC operativos.
4. ✅ Service + endpoint nuevo + validator + mapper + types actualizados en commits coherentes.
5. ✅ Tests cubriendo todos los edge cases listados arriba.
6. ✅ E2E Playwright happy path.
7. ✅ Frontend: botón anular, badge anulado, filtro toggle.
8. ✅ `npm run typecheck` y `npm run lint` pasan.
9. ✅ qa-gate PASS.
10. ✅ `FASE_4_REPORT.md`.

## Prompt para agency-ceo

```
EJECUTAR FASE 4 del sprint Pagos / Cuenta Corriente / Conciliaciones de GO EXPRESS.

Spec completa en /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/FASE_4_ANULACION_PAGOS.md.

Repo: /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS
Standards: CLAUDE.md del repo. No em dash. No any. No console.log. No SELECT *.
Branch: sprint-pagos/fase-4-anulacion-pagos.

Pre-requisito CRÍTICO a verificar antes de arrancar:
- Fase 2 (RPCs create_pago_atomico, update_pago_atomico) debe estar mergeada en main.
- Fase 3 (ledger cuenta_corriente con función registrar_movimiento_cc y enum tipo_movimiento_cc con valor 'reverso') debe estar mergeada en main.
Si alguna falta, parar y avisar.

Pasos:
1. Verificar pre-requisitos con git log y/o lectura de migraciones.
2. Verificar próximo número de migración SQL.
3. Crear migración: columnas anulado*, CHECK constraint, drop+recreate unique como partial, RPC anular_pago_atomico que reversa el saldo si aplica.
4. Actualizar service: método anular(), filtro anulado=false en list/getById, query param incluirAnulados.
5. Actualizar validators (anularPagoSchema), mapper (PAGO_COLUMNS), types (Pago interface).
6. Endpoint POST /api/admin/pagos/:id/anular con adminWriteLimiter, requireAdmin, validation, audit, SSE.
7. Frontend: botón anular en detalle, modal con motivo, badge anulado, filtro toggle, hook useAnularPago.
8. Tests integration cubriendo todos los edge cases del spec, especialmente reversión de saldo CC.
9. E2E Playwright happy path.
10. npm run typecheck + lint + test pasan.
11. qa-gate PASS.
12. FASE_4_REPORT.md.
```
