# FASE 5: Liquidaciones de repartidor + autogeneración de pago COD

**Tiempo estimado:** 3-4 horas
**Riesgo:** alto (refactor de flujo de entrega del repartidor, sistema nuevo completo, fix de TZ)
**Bloquea a:** ninguna fase
**Depende de:** Fase 2 (RPC `create_pago_atomico` para autogeneración), Fase 3 (ledger cuenta corriente, aunque no toca CC directamente)

## Comando de invocación

```
Lee /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/INDEX.md y /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/FASE_5_LIQUIDACIONES.md, despues lee /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/CLAUDE.md, despues invoca al agency-ceo con el contenido de la seccion "Prompt para agency-ceo" del archivo FASE_5. Cuando termine verifica que dejo FASE_5_REPORT.md en sprint-pagos/.
```

## Contexto del audit

Hallazgos CRÍTICOS 3.1, 3.2, 3.3 + ALTO 3.4 del hard debug original:

> **3.1 La "Conciliación" actual no es conciliación financiera.** Es un reporte COD por repartidor. NO matchea contra `pagos`, NO marca conciliado, NO genera asientos, NO permite imprimir cierre de caja, NO hay tabla `liquidaciones_repartidor`. El repartidor cobra COD en la calle, vuelve a la oficina, no hay flujo definido para entregar el efectivo. Si el repartidor reporta cobro y nunca entrega el efectivo, no hay alerta.
>
> **3.2 Doble fuente de verdad:** `envios.monto_cobrado` (entregas) vs `pagos.monto_recibido` (cobros). Dashboard y conciliación cuentan realidades distintas.
>
> **3.3 `monto_cobrado` sin CHECK contra `monto_a_cobrar`.** Repartidor puede reportar cualquier número.
>
> **3.4 Filtros de fecha usan TZ implícito UTC.** Entregas 22:30 PY caen en UTC del día siguiente, operador filtrando "hoy" no las ve.

Decisión arquitectural confirmada por Gaston: `envios.monto_cobrado` queda como CACHE sincronizado por trigger desde `pagos`. La fuente de verdad pasa a ser `pagos`. No deprecamos el campo para no romper queries existentes.

## Spec técnica

### Migración SQL

Archivo: `go-express-api/sql/0XX_liquidaciones_repartidor.sql` (verificar próximo número).

**1. Enum `estado_liquidacion`**: `'pendiente'`, `'cerrada'`, `'con_diferencia'`.

**2. Tabla `liquidaciones_repartidor`**:
```sql
id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4()
repartidor_id            UUID NOT NULL REFERENCES usuarios(id)
fecha_desde              DATE NOT NULL
fecha_hasta              DATE NOT NULL CHECK (fecha_hasta >= fecha_desde)
monto_total_esperado     BIGINT NOT NULL DEFAULT 0
monto_total_recibido     BIGINT NULL
diferencia               BIGINT GENERATED ALWAYS AS (COALESCE(monto_total_recibido, 0) - monto_total_esperado) STORED
estado                   estado_liquidacion NOT NULL DEFAULT 'pendiente'
cerrada_por              UUID NULL REFERENCES usuarios(id)
cerrada_en               TIMESTAMPTZ NULL
notas                    TEXT NULL
creado_por               UUID NOT NULL REFERENCES usuarios(id)
created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

CHECK de coherencia: `(estado = 'pendiente' AND cerrada_por IS NULL AND cerrada_en IS NULL AND monto_total_recibido IS NULL) OR (estado IN ('cerrada', 'con_diferencia') AND cerrada_por IS NOT NULL AND cerrada_en IS NOT NULL AND monto_total_recibido IS NOT NULL)`.

**3. Tabla `liquidacion_envios`**:
```sql
liquidacion_id   UUID NOT NULL REFERENCES liquidaciones_repartidor(id) ON DELETE CASCADE
envio_id         UUID NOT NULL REFERENCES envios(id)
monto_esperado   BIGINT NOT NULL
monto_cobrado    BIGINT NOT NULL
conciliado       BOOLEAN NOT NULL DEFAULT FALSE
PRIMARY KEY (liquidacion_id, envio_id)
```

Index: `(envio_id) WHERE conciliado = TRUE` para detectar envíos ya liquidados.

**4. Constraint anti doble-liquidación**:
- Un envío no puede aparecer en dos liquidaciones cerradas. Crear unique partial:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS liquidacion_envios_unique_conciliado
    ON liquidacion_envios (envio_id) WHERE conciliado = TRUE;
  ```

**5. Trigger sync `pagos` → `envios.monto_cobrado`** (cache):
- `AFTER INSERT OR UPDATE ON pagos`: si `tipo_pago` del envío es `contra_entrega` y `pago.anulado = FALSE`, actualizar `envios.monto_cobrado = pago.monto_recibido`.
- `AFTER UPDATE ON pagos WHEN anulado` (transición a TRUE): poner `envios.monto_cobrado = 0`.

**6. RPC `crear_liquidacion(p_repartidor_id, p_fecha_desde, p_fecha_hasta, p_creado_por)`**:
- Lockear conceptualmente: dos liquidaciones del mismo repartidor en rangos solapados deberían rechazarse. Implementar check.
- Buscar envíos COD entregados por `p_repartidor_id` en `[fecha_desde, fecha_hasta]` con `tipo_pago = 'contra_entrega'`, `estado = 'entregado'`, NO conciliados todavía. Filtrar `(fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date` para fix de TZ.
- INSERT en `liquidaciones_repartidor` con `monto_total_esperado = SUM(monto_a_cobrar)`.
- INSERT batch en `liquidacion_envios` con `monto_esperado = monto_a_cobrar` y `monto_cobrado = monto_cobrado` (del envío).
- INSERT en `auditoria_log`.
- RETURN liquidación.

**7. RPC `cerrar_liquidacion(p_liquidacion_id, p_monto_recibido, p_notas, p_cerrado_por, p_ip, p_user_agent)`**:
- SELECT FOR UPDATE.
- Si ya está cerrada → `RAISE EXCEPTION 'liquidacion_ya_cerrada'`.
- Calcular diferencia.
- UPDATE: `monto_total_recibido = p_monto_recibido`, `estado = 'cerrada'` si diferencia = 0 si no `'con_diferencia'`, `cerrada_por`, `cerrada_en`, `notas`.
- UPDATE batch `liquidacion_envios SET conciliado = TRUE WHERE liquidacion_id = p_liquidacion_id`.
- INSERT en `auditoria_log`.
- RETURN liquidación.

### Backend

**1. Refactor flujo de entrega COD del repartidor**

Archivo: `routes/repartidor/envios.ts` PATCH para marcar entregado.

Hoy: setea `envios.monto_cobrado` directamente. Cambiar a:

```ts
// dentro del handler de PATCH entregar
if (envio.tipo_pago === 'contra_entrega' && montoCobrado > 0) {
  // Validación de diferencia 10%
  const diferenciaPct = Math.abs(montoCobrado - envio.monto_a_cobrar) / envio.monto_a_cobrar;
  if (diferenciaPct > 0.10 && !notaIncidencia) {
    throw AppError.unprocessable(
      'diferencia_cobro_excesiva',
      'Diferencia mayor al 10%, requiere nota de incidencia',
    );
  }

  // Llamar RPC create_pago_atomico de Fase 2
  const pago = await pagoService.create({
    envioId: envio.id,
    montoTotal: envio.monto_a_cobrar,
    montoRecibido: montoCobrado,
    fechaPago: todayPY(),
    metodoPago: 'contra_entrega',
    observaciones: notaIncidencia ?? null,
  }, repartidorId, req.ip, req.headers['user-agent']);

  if (diferenciaPct > 0.10) {
    // Marcar incidencia
    await envioService.marcarIncidencia(envio.id, notaIncidencia, repartidorId);
  }
}
```

El trigger sync de pagos→envios.monto_cobrado mantiene el cache.

**2. Validators**

Archivo `lib/validators/liquidacion.schema.ts`:
- `crearLiquidacionSchema`: `repartidorId`, `fechaDesde`, `fechaHasta` (con `refine` `fechaHasta >= fechaDesde`).
- `cerrarLiquidacionSchema`: `montoRecibido` (BIGINT), `notas` (string opcional, max 500).
- `liquidacionQuerySchema`: paginación + filtros `repartidorId`, `estado`, `desde`, `hasta`.

**3. Service nuevo**

Archivo `services/liquidacion.service.ts`:
- `LIQUIDACION_COLUMNS` lista explícita.
- `mapLiquidacionRowToApi`.
- `crear(input, creadoPor)`: invoca RPC `crear_liquidacion`.
- `cerrar(id, input, cerradoPor, ip, ua)`: invoca RPC. Si la liquidación cierra con `estado = 'con_diferencia'`, log a Sentry.
- `list(filters)`, `getById(id)` con join a `liquidacion_envios` paginado.
- `listEnvios(liquidacionId)` para detalle.

**4. Routes nuevas**

Archivo `routes/admin/liquidaciones.ts`:
- `POST /api/admin/liquidaciones` (crear)
- `GET /api/admin/liquidaciones` (paginado, filtros)
- `GET /api/admin/liquidaciones/:id` (detalle con envíos)
- `PATCH /api/admin/liquidaciones/:id/cerrar`
- `GET /api/admin/repartidores/:id/liquidaciones` (filtrado por repartidor)

Wirear en `routes/admin/index.ts`. Aplicar `adminWriteLimiter` en mutaciones.

**5. Refactor `repartidor.service.getConciliacion`**

- Renombrar a `getReporteCOD` para claridad semántica (la "conciliación" real ahora es `liquidaciones`).
- Fix TZ: `(fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date` en los filtros.
- Mantener endpoint legacy `GET /api/admin/repartidores/:id/conciliacion` redirigiendo o devolviendo deprecation header. Decisión: dejarlo funcionando con el fix de TZ pero documentar como deprecated.

**6. TS types**

`src/types/index.ts`:
- `Liquidacion` interface
- `LiquidacionEnvio` interface
- `EstadoLiquidacion` union type

### Frontend

**1. Nueva página admin: `src/pages/admin/Liquidaciones.tsx`**

- Listado paginado de liquidaciones con filtros (repartidor, estado, rango fechas).
- Badges de estado con colores (`pendiente` warning, `cerrada` success, `con_diferencia` destructive).
- Tabla columnas: ID corto, repartidor, rango fechas, monto esperado, monto recibido, diferencia, estado, acciones.
- Botón "Nueva liquidación" abre wizard.

**2. Wizard de cierre: `src/components/admin/LiquidacionWizard.tsx`**

Multi-step:
- Paso 1: seleccionar repartidor + rango de fechas. Preview de envíos COD entregados en el rango (count + suma esperada).
- Paso 2: confirmar creación. POST. Liquidación queda `pendiente`.
- Paso 3 (cierre, separado en flujo): operador ingresa `montoRecibido` físico, opcional `notas`. PATCH cerrar. Si hay diferencia, alerta visual.

Usar Radix Dialog + RHF + zodResolver. Patrón espejo de `EnvioWizard.tsx`.

**3. Detalle de liquidación: `src/pages/admin/LiquidacionDetalle.tsx`**

- Header con resumen: repartidor, rango, montos, diferencia, estado.
- Tabla de envíos asociados (tracking, destinatario, monto esperado, monto cobrado, diferencia individual, conciliado).
- Si `pendiente`: botón "Cerrar liquidación".
- Si `con_diferencia`: alerta visible + razón en `notas`.

**4. Refactor `Conciliacion.tsx`**

- Renombrar archivo a `ReporteCOD.tsx` (actualizar route en `App.tsx`).
- Mantener funcionalidad actual pero con el fix de TZ.
- Banner informativo: "Para cierre de caja oficial, usar Liquidaciones".

**5. Hooks**

Archivo `src/hooks/api/use-liquidaciones.ts`:
- `useLiquidaciones(filters)`, `useLiquidacion(id)`, `useCrearLiquidacion()`, `useCerrarLiquidacion()`.

### Tests

**Backend (`go-express-api/tests/admin/`):**

- `liquidaciones.test.ts`:
  - Crear liquidación con N envíos COD entregados en rango → snapshot correcto, monto_total_esperado calculado.
  - Crear liquidación con rango sin envíos → liquidación con 0 envíos y monto 0.
  - Cerrar liquidación con monto exacto → estado `cerrada`, envíos marcados conciliados.
  - Cerrar liquidación con diferencia positiva → estado `con_diferencia`.
  - Cerrar liquidación ya cerrada → 409.
  - Doble liquidación del mismo envío → segundo intento rechaza vía unique partial.
  - Filtros de fecha con TZ correcto: envío entregado 22:30 PY del día X aparece en liquidación de día X.
  - `getReporteCOD` (ex-conciliacion) con TZ correcto.

- `repartidor.test.ts` (extender):
  - Marcar entregado COD con `montoCobrado` válido → genera pago atómicamente vía RPC.
  - Marcar entregado COD con diferencia >10% sin nota incidencia → rechazo 422.
  - Marcar entregado COD con diferencia >10% + nota incidencia → genera pago + marca incidencia.

**E2E Playwright:**

- `e2e/admin/liquidaciones.spec.ts`: crear liquidación → ver detalle → cerrar con monto exacto → ver estado cerrada.

### Definition of Done

1. ✅ Branch `sprint-pagos/fase-5-liquidaciones`.
2. ✅ Pre-req: Fase 2 (RPC create_pago_atomico) y Fase 3 (ledger CC) mergeadas en main. Verificar.
3. ✅ Migración aplicada: 2 tablas nuevas, RPCs, trigger sync, fix TZ verificado con datos de prueba en horario frontera.
4. ✅ Refactor PATCH entregar COD usando RPC create_pago_atomico, con validación 10%.
5. ✅ Service liquidacion.service.ts + 5 endpoints + validators + types + mapper.
6. ✅ Frontend: página Liquidaciones, wizard, detalle, refactor Conciliacion → ReporteCOD.
7. ✅ Tests integration cubriendo todos los edge cases (especialmente doble liquidación y TZ frontera).
8. ✅ E2E Playwright happy path.
9. ✅ npm run typecheck + lint + test pasan.
10. ✅ qa-gate PASS.
11. ✅ `FASE_5_REPORT.md` con: archivos tocados, comandos migración, decisiones (cache sync, deprecation legacy), deuda residual.

## Prompt para agency-ceo

```
EJECUTAR FASE 5 del sprint Pagos / Cuenta Corriente / Conciliaciones de GO EXPRESS.

Spec completa en /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/FASE_5_LIQUIDACIONES.md.

Repo: /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS
Standards: CLAUDE.md del repo. No em dash. No any. No console.log. No SELECT *.
Branch: sprint-pagos/fase-5-liquidaciones.

Pre-requisito CRÍTICO antes de arrancar:
- Fase 2 (RPC create_pago_atomico) mergeada en main.
- Fase 3 (ledger CC) mergeada en main.
Si alguna falta, parar y avisar.

Esta es la fase más grande del sprint. ~3-4h de trabajo. NO recortar tests ni saltar el wizard frontend, son no negociables.

Pasos:
1. Verificar pre-requisitos.
2. Verificar próximo número de migración SQL.
3. Crear migración: enums, 2 tablas (liquidaciones_repartidor + liquidacion_envios), unique partial anti doble-liquidación, trigger sync pagos→envios.monto_cobrado, RPCs crear_liquidacion + cerrar_liquidacion.
4. Refactor routes/repartidor/envios.ts PATCH entregar COD: usar pagoService.create (que ahora va por RPC), validar diferencia 10%, marcar incidencia si aplica. Eliminar el set directo de envios.monto_cobrado.
5. Service liquidacion.service.ts + validators + types + mapper.
6. 5 endpoints admin (crear, list, getById, cerrar, list por repartidor).
7. Refactor getConciliacion → getReporteCOD con fix TZ Asuncion.
8. Frontend: página Liquidaciones (listado), wizard de creación + cierre, página detalle, refactor Conciliacion.tsx → ReporteCOD.tsx.
9. Hooks TanStack Query.
10. Tests integration cubriendo todos los edge cases del spec, especialmente:
    - TZ frontera (entrega 22:30 PY)
    - Doble liquidación rechazada
    - Diferencia 10% con y sin nota
    - Cerrar con diferencia → estado con_diferencia
11. E2E Playwright happy path.
12. npm run typecheck + lint + test pasan.
13. qa-gate PASS.
14. FASE_5_REPORT.md.

Si encontrás un blocker técnico real durante la ejecución, parar y devolver pregunta concreta. No avances con assumption silenciosa.
```
