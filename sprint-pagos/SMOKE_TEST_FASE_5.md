# Smoke Test Fase 5: Liquidaciones de repartidor

Guion ejecutable para validar end to end el sistema de liquidaciones antes de habilitar a clientes en produccion. Tiempo estimado: 45 minutos.

Objetivo: confirmar que los 4 hallazgos criticos del audit (3.1 conciliacion real, 3.2 cache sync, 3.3 validacion 10%, 3.4 fix TZ) quedan cerrados end to end, no solo a nivel codigo o tests.

## Resultado esperado global

PASS si todos los pasos pasan sin errores y las verificaciones SQL devuelven los valores esperados. FAIL al primer paso que rompa, con rollback documentado al final.

## 0. Prerrequisitos (5 min)

### 0.1 Entornos

Ejecutar en **staging** primero. Si staging pasa, repetir en produccion con datos reales en ventana de bajo trafico (ej: 22:00 PY un dia de semana).

### 0.2 Credenciales necesarias

- Admin GoExpress con rol `administrador` o `supervisor`. Login via `/admin/login`.
- 1 repartidor con perfil activo en `repartidores`. Login via `/portal/login` (portal de repartidor).
- Acceso a Supabase SQL Editor (proyecto `oxyvhexsgppnkgcnqpkl`).

### 0.3 Datos de prueba

Crear desde admin 3 envios COD asignados al mismo repartidor, todos con `tipo_pago = 'contra_entrega'`, en el dia del test:

| # | Destinatario | monto_a_cobrar | Nota |
|---|---|---|---|
| A | Smoke Test A | Gs. 100.000 | cobra exacto |
| B | Smoke Test B | Gs. 200.000 | cobra 5% menos (Gs. 190.000), dentro de tolerancia |
| C | Smoke Test C | Gs. 300.000 | cobra 20% menos (Gs. 240.000), requiere nota de incidencia |

Anotar los 3 tracking numbers y los 3 envio_ids. Los necesitas abajo.

### 0.4 SQL de verificacion base

```sql
-- Debe devolver 3 filas, todas tipo_pago contra_entrega, estado distinto a entregado
select tracking_number, estado, tipo_pago, monto_a_cobrar, monto_cobrado, repartidor_id, tiene_incidencia
from envios
where tracking_number in ('GE-2026-XXXXXX', 'GE-2026-YYYYYY', 'GE-2026-ZZZZZZ');
```

## 1. Flujo happy path: entrega COD exacta (5 min)

Cubre hallazgo 3.2 (cache sync) y 3.3 path feliz.

### 1.1 Repartidor marca entregado envio A

Desde portal de repartidor, abrir envio A, marcar entregado con:
- nombreRecibe: `Juan Receptor A`
- documento: `1234567`
- montoCobrado: `100000`
- sin notaIncidencia

### 1.2 Verificacion

```sql
-- Envio debe estar entregado, monto_cobrado = 100000, sin incidencia
select tracking_number, estado, monto_cobrado, tiene_incidencia, fecha_entrega_real
from envios where tracking_number = 'GE-2026-XXXXXX';

-- Debe existir 1 pago contra_entrega asociado al envio, no anulado
select envio_id, metodo_pago, monto_total, monto_recibido, anulado, creado_en
from pagos where envio_id = '<envio_id_A>';

-- Debe existir 1 asiento en cuenta_corriente_ledger del envio, tipo 'pago_cod'
select envio_id, tipo_asiento, monto, creado_en
from cuenta_corriente_ledger where envio_id = '<envio_id_A>';

-- Debe existir auditoria del cambio_estado
select usuario, accion, entidad, descripcion, ip_address
from auditoria where entidad_id = '<envio_id_A>' order by created_at desc limit 3;
```

Resultado esperado:
- `envios.monto_cobrado = 100000` (seteado por trigger, no por update directo del handler)
- `envios.tiene_incidencia = false`
- `pagos` con `monto_recibido = 100000`, `anulado = false`, `creado_por = 00000000-0000-4000-a000-000000000001` (sistema)
- Asiento ledger creado
- Auditoria con `descripcion` mencionando el nombre del repartidor y el tracking

PASS: los 4 existen. FAIL: alguno falta o valores difieren.

## 2. Edge case: diferencia dentro de tolerancia (3 min)

Cubre hallazgo 3.3 tolerancia 10%.

### 2.1 Entregar envio B con 5% menos

Desde portal repartidor, envio B:
- nombreRecibe: `Maria Receptor B`
- montoCobrado: `190000` (es 5% menos que 200000)
- sin notaIncidencia

### 2.2 Verificacion

- Respuesta 200, body `{ ok: true, incidencia: false }`.
- `envios.monto_cobrado = 190000`.
- `envios.tiene_incidencia = false`.
- Pago creado con `monto_recibido = 190000`, `monto_total = 200000`.

PASS si la entrega se acepta y no marca incidencia.

## 3. Edge case: diferencia fuera de tolerancia SIN nota (3 min)

Cubre hallazgo 3.3 rechazo.

### 3.1 Intentar entregar envio C con 20% menos SIN nota

Desde portal repartidor, envio C:
- montoCobrado: `240000` (20% menos que 300000)
- sin notaIncidencia

### 3.2 Verificacion

Respuesta esperada: **HTTP 422** con body tipo:
```json
{
  "error": {
    "message": "La diferencia de cobro supera el 10% y requiere nota de incidencia",
    "code": "diferencia_cobro_excesiva"
  }
}
```

El envio **no cambia de estado**. Sigue en estado previo. Sin pago creado.

```sql
-- Envio sigue sin estado entregado, sin monto_cobrado, sin incidencia
select estado, monto_cobrado, tiene_incidencia from envios where tracking_number = 'GE-2026-ZZZZZZ';
-- No hay pago para el envio
select count(*) from pagos where envio_id = '<envio_id_C>';  -- debe ser 0
```

PASS si rechaza con 422 y el envio no muta. FAIL si deja pasar sin nota.

## 4. Edge case: diferencia fuera de tolerancia CON nota (3 min)

Cubre hallazgo 3.3 ruta permitida con incidencia.

### 4.1 Reintentar envio C con nota

Desde portal repartidor, envio C:
- montoCobrado: `240000`
- notaIncidencia: `Cliente dijo que falto parte del producto, aceptamos cobro parcial por entregar el resto despues`

### 4.2 Verificacion

- Respuesta 200, body `{ ok: true, incidencia: true }`.
- `envios.estado = entregado`, `envios.monto_cobrado = 240000`, `envios.tiene_incidencia = true`.
- `envios.incidencia_nota` igual al texto de la nota.
- Pago creado con `monto_total = 300000`, `monto_recibido = 240000`.

PASS si acepta la entrega y marca incidencia. FAIL si no marca el flag.

## 5. Crear liquidacion (5 min)

Cubre hallazgo 3.1 (conciliacion real) y 3.4 (TZ Asuncion).

### 5.1 Admin crea liquidacion

Desde admin, navegar a `/admin/liquidaciones`, click "Nueva liquidacion":
- Repartidor: el usado en pasos 1 a 4
- Fecha desde: dia del test (formato YYYY-MM-DD en TZ Asuncion)
- Fecha hasta: dia del test

Preview debe mostrar 3 envios (A, B, C) con total esperado = 600.000.

Submit.

### 5.2 Verificacion

Listado `/admin/liquidaciones` muestra la nueva en estado `pendiente`.

```sql
-- Liquidacion creada
select id, repartidor_id, fecha_desde, fecha_hasta, monto_total_esperado, monto_total_recibido, estado
from liquidaciones_repartidor order by created_at desc limit 1;
-- monto_total_esperado = 600000, monto_total_recibido = null, estado = 'pendiente'

-- Los 3 envios snapshot en la liquidacion
select envio_id, monto_esperado, monto_cobrado, conciliado
from liquidacion_envios where liquidacion_id = '<liquidacion_id>';
-- 3 filas, monto_esperado + monto_cobrado segun cada envio, conciliado = false en las 3
```

PASS: liquidacion creada con 3 envios snapshot correctos.

## 6. Cerrar liquidacion con diferencia (5 min)

Cubre hallazgo 3.1 estado `con_diferencia`.

### 6.1 Admin cierra con monto fisico

Asumir que el repartidor entregue en efectivo Gs. 530.000 (faltaron Gs. 530.000 vs 530.000 reales cobrados segun lo reportado, el calculo deberia ser: envio A 100000 + envio B 190000 + envio C 240000 = 530.000).

Espera: si el fisico recibido = suma de `monto_cobrado` = 530.000, la liquidacion cierra en `con_diferencia` porque el monto_total_esperado era 600.000, no 530.000. Esto es esperado y correcto.

Entonces, en el detalle de liquidacion, click "Cerrar liquidacion":
- montoRecibido: `530000`
- notas: `Diferencia de 70.000 explicada por envios B y C, revisar con cliente`

Submit.

### 6.2 Verificacion

- Liquidacion cambia a estado `con_diferencia`.
- UI muestra alerta visible de diferencia.

```sql
select id, monto_total_esperado, monto_total_recibido, diferencia, estado, cerrada_por, cerrada_en, notas
from liquidaciones_repartidor where id = '<liquidacion_id>';
-- monto_total_esperado=600000, monto_total_recibido=530000, diferencia=-70000, estado='con_diferencia'
-- cerrada_por y cerrada_en no nulos, notas con el texto

-- Los 3 envios ahora conciliados
select envio_id, conciliado from liquidacion_envios where liquidacion_id = '<liquidacion_id>';
-- conciliado = true en las 3

-- Auditoria del cierre
select usuario, accion, descripcion from auditoria
where entidad = 'liquidacion' and entidad_id = '<liquidacion_id>';
```

PASS: liquidacion `con_diferencia`, 3 envios conciliados, audit presente, Sentry recibe un log (verificar en Sentry si tiene issue abierto del evento).

## 7. Edge case: doble liquidacion rechazada (3 min)

Cubre el unique partial anti doble-liquidacion.

### 7.1 Intentar crear otra liquidacion con el mismo repartidor y rango

Repetir paso 5.1 con el mismo repartidor y el mismo dia.

### 7.2 Verificacion

Respuesta esperada: **HTTP 422 o 409** con mensaje que indica que los envios ya fueron conciliados en otra liquidacion. El RPC `crear_liquidacion` chequea rango solapado + envios conciliados.

Si intentara crear la liquidacion con los mismos envios, el unique partial `liquidacion_envios_unique_conciliado` rechazaria el INSERT.

```sql
-- Solo debe existir 1 liquidacion para el rango
select count(*) from liquidaciones_repartidor
where repartidor_id = '<repartidor_id>' and fecha_desde = '<dia_test>';  -- = 1
```

PASS: el segundo intento falla, la primera liquidacion sigue intacta.

## 8. Edge case: TZ frontera 22:30 PY (5 min)

Cubre hallazgo 3.4 fix TZ Asuncion.

### 8.1 Preparar envio en hora frontera

Crear un envio COD nuevo (envio D). Asignarle al mismo repartidor. Marcarlo como entregado a las **22:30 hora Paraguay** del dia del test.

Si el test se hace a otra hora, forzar `fecha_entrega_real` directo en SQL para simular:

```sql
update envios
set fecha_entrega_real = (current_date::timestamp + interval '22 hours 30 minutes') at time zone 'America/Asuncion',
    estado = 'entregado', monto_cobrado = monto_a_cobrar, tiene_incidencia = false
where tracking_number = 'GE-2026-AAAAAA';
```

### 8.2 Admin crea liquidacion del dia SIGUIENTE

Rango: dia siguiente al test, `fechaDesde = fechaHasta = <manana>`.

### 8.3 Verificacion

La liquidacion del dia SIGUIENTE NO debe incluir el envio D. Porque fecha_entrega_real 22:30 PY del dia X cae en el dia X en TZ Asuncion, NO en el dia X+1 (como caeria en UTC).

Listado de envios de la liquidacion (dia siguiente): vacio o sin el envio D.

### 8.4 Admin crea liquidacion del MISMO dia del test (rango de solo hoy)

Rango: `fechaDesde = fechaHasta = <hoy>`.

Liquidacion debe incluir SOLO el envio D (los A, B, C ya estan conciliados en la primera liquidacion, el unique partial los bloquea).

PASS: envio D aparece en liquidacion del dia correcto, no del dia siguiente. FAIL: si aparece en dia X+1, el fix TZ no se aplico.

## 9. Reporte COD legacy (2 min)

Cubre migracion del legacy `/conciliacion`.

### 9.1 Acceder al reporte COD

Desde admin, navegar a `/admin/reporte-cod` (ex `/conciliacion`).

### 9.2 Verificacion

- La pagina carga.
- Banner visible: "Para cierre de caja oficial, usar Liquidaciones".
- Tabla muestra entregas COD agrupadas por repartidor.
- Fechas coinciden con las del test (TZ Asuncion correcto).

PASS: pagina funcional con banner deprecation y TZ correcto.

## 10. Anulacion de pago: trigger sync resetea cache (5 min)

Cubre hallazgo 3.2 direccion inversa.

### 10.1 Anular el pago del envio A

Desde admin, abrir envio A, ir a pagos, anular el pago activo con motivo `Smoke test trigger sync inverso`.

### 10.2 Verificacion

```sql
-- Pago marcado anulado
select anulado, anulado_por, anulado_en, motivo_anulacion
from pagos where envio_id = '<envio_id_A>';
-- anulado = true, motivo seteado

-- Trigger sync: cache resetea a 0
select monto_cobrado from envios where id = '<envio_id_A>';
-- monto_cobrado = 0

-- Ledger revierte
select tipo_asiento, monto from cuenta_corriente_ledger where envio_id = '<envio_id_A>' order by creado_en;
-- Dos filas: 'pago_cod' con +monto, despues 'reversion' con -monto
```

PASS: `envios.monto_cobrado` vuelve a 0, ledger revierte. FAIL: cache queda con valor viejo.

## Criterios PASS / FAIL global

PASS global: 10 pasos PASS. Sistema habilitado para clientes.

FAIL parcial: documentar cual paso fallo en `FASE_5_SMOKE_TEST_REPORT.md` con:
- Paso exacto que rompio
- Output real vs esperado
- Logs / Sentry issue ID si aplica
- Decision: revertir migracion 022 o fixear forward

## Rollback plan (solo si smoke test FAIL)

1. Revertir UI: deshabilitar rutas `/admin/liquidaciones` via router comment en `src/App.tsx`, deploy frontend. Reporte COD queda como fallback.
2. Backend: los endpoints `/api/admin/liquidaciones/*` pueden quedar expuestos, no hay cliente consumiendolos. Sin urgencia.
3. Migracion 022: **NO REVERTIR**. Las tablas nuevas son aditivas, el trigger solo afecta escrituras nuevas de pagos COD, y el endpoint legacy `getReporteCOD` ya funciona con fix TZ aplicado. Revertir 022 rompe mas cosas de las que arregla.
4. Flujo de entrega COD del repartidor: si la validacion 10% molesta en campo, hotfix rapido en `lib/cod.ts` cambiando `DIFERENCIA_COD_TOLERADA` a un valor mas permisivo mientras se investiga. No deshabilitar el flujo completo.

## Limpieza post-test

Borrar los envios de smoke test para no contaminar metricas de produccion:

```sql
-- Soft delete
update envios set eliminado = true, eliminado_en = now(),
  motivo_eliminacion = 'Smoke test Fase 5, limpieza'
where tracking_number in ('GE-2026-XXXXXX', 'GE-2026-YYYYYY', 'GE-2026-ZZZZZZ', 'GE-2026-AAAAAA');

-- La liquidacion de smoke queda en DB como registro historico. Si molesta,
-- soft-deletear con update directo (no hay flujo de borrado de liquidaciones).
```

## Post smoke test

Si PASS: escribir `FASE_5_SMOKE_TEST_REPORT.md` con "PASS 2026-04-XX", habilitar a cliente. Avanzar al follow up (PDF de cierre de caja).

Si FAIL: escribir report con detalle del paso roto, decidir rollback vs fix forward, re-ejecutar smoke test completo despues del fix.
