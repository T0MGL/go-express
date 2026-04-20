# FASE 1 REPORT: IP/UA en auditoria de pagos + adminWriteLimiter

**Status:** COMPLETO
**Branch:** `sprint-pagos/fase-1-ip-ua-ratelimit` (base: `main`)
**Fecha:** 2026-04-19
**Riesgo real:** bajo, confirmado

## Resumen ejecutivo

Se cerraron los hallazgos 1.3 (auditoria sin IP/UA en pagos) y 1.10 (rate limit en mutaciones de pagos) del hard debug original. Tres archivos tocados, dos tests integration nuevos, 204/204 tests pasan, typecheck limpio.

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `go-express-api/src/services/pago.service.ts` | `create` y `update` aceptan `ipAddress?: string` y `userAgent?: string`, los propagan a `auditoriaService.log` |
| `go-express-api/src/routes/admin/pagos.ts` | POST y PATCH pasan `req.ip ?? undefined` y `req.headers['user-agent'] ?? undefined` al service, siguiendo el patron de `routes/admin/envios.ts` |
| `go-express-api/tests/admin/pagos.test.ts` | +2 tests: `create persists ip_address and user_agent in audit log`, `update persists ip_address and user_agent in audit log`. Importa `createClient` de `@supabase/supabase-js` con el patron de `cuenta-corriente.test.ts` |

Sin cambios en: `app.ts`, `middleware/rateLimit.ts`, `services/auditoria.service.ts`, SQL migrations, frontend.

## Decisiones tomadas

### 1. `adminWriteLimiter` ya estaba aplicado, no se duplica a nivel de route

El spec pedia "importar `adminWriteLimiter` y aplicar en POST/PATCH de pagos". Al revisar `app.ts` lineas 123-128, la aplicacion ya existe a nivel global para TODO `/api/admin` con metodos `POST|PUT|PATCH|DELETE`:

```ts
app.use('/api/admin', (req, res, next) => {
  if (env.NODE_ENV !== 'test' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return adminWriteLimiter(req, res, next);
  }
  next();
}, adminRoutes);
```

Agregar `adminWriteLimiter` otra vez en `routes/admin/pagos.ts` duplicaria el contador de rate limit sin beneficio. La nota 1.10 del audit original fue escrita cuando pagos estaba bajo `generalLimiter`. Hoy ya cumple. DoD check 5 se considera cumplido con la arquitectura actual.

**Accion:** documentar aqui, no modificar route. Si en el futuro se quiere un limite mas estricto que `adminWriteLimiter` especificamente para pagos (ej: 10/min en vez de 30/min), se crea un limiter dedicado tipo `pagoWriteLimiter` y se aplica a nivel de route.

### 2. `app.set('trust proxy', 1)` ya estaba configurado

Verificado en `src/app.ts:26`. Sin cambios necesarios. Con esto Express respeta `X-Forwarded-For` detras del proxy de Railway, que es lo que permite que el test con `.set('X-Forwarded-For', '203.0.113.77')` vea ese valor en `req.ip`.

### 3. Firma del service: parametros opcionales al final

Se mantuvieron `ipAddress` y `userAgent` como `string | undefined` opcionales, espejando el patron existente en `envio.service.ts` (ver `create`, `updateEstado`, `asignarRepartidor`). Asi los call sites que no tienen request context (si aparecieran en el futuro) pueden invocar sin romper compatibilidad, pero todos los call sites HTTP actuales pasan los valores.

### 4. Tests: patron `cuenta-corriente.test.ts` para leer `auditoria_log`

Se reutilizo el patron: crear un `supabase` local con service role, hacer el POST/PATCH via Supertest seteando `X-Forwarded-For` y `User-Agent`, despues query directo a `auditoria_log` filtrando por `entidad='pago'`, `entidad_id`, `accion`. Ambos tests asertan valor exacto de IP y UA, no solo `!= null`, para detectar regresion por bug de wiring.

## Resultado de checks

| Check | Resultado |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` (backend completo) | 204/204 PASS (antes 202) |
| Tests nuevos agregados | 2 (create, update) |
| Sin `any` | PASS |
| Sin em dash | PASS |
| Sin `console.log` | PASS |
| Sin `SELECT *` | PASS (no se agrego ninguna query) |
| Sin migraciones SQL | correcto, no hubo |
| Sin cambios frontend | correcto, no hubo |

## Definition of Done (11 checks del spec)

1. Branch `sprint-pagos/fase-1-ip-ua-ratelimit` creado desde `main`. OK
2. `app.set('trust proxy', 1)` verificado. OK, ya estaba en `app.ts:26`
3. `pago.service.ts` create/update aceptan IP/UA. OK
4. `routes/admin/pagos.ts` POST/PATCH pasan IP/UA al service. OK
5. `adminWriteLimiter` aplicado en POST/PATCH. OK, via middleware global en `app.ts:123-128` (ver decision 1)
6. Tests integration nuevos pasan. OK (2 tests, ambos PASS)
7. `npm run typecheck` pasa. OK
8. Tests existentes no rotos. OK (15 pagos tests previos siguen verdes, 204/204 global)
9. Sin `any`, sin em dash, sin `console.log`. OK
10. qa-gate PASS. Self-review PASS (ver seccion abajo)
11. `FASE_1_REPORT.md` creado. Este archivo

## QA self-review (criterios qa-gate)

- **Correctness:** IP/UA se propagan correctamente desde el HTTP request al audit log. Verificado con tests que leen la fila directamente y comparan valores exactos.
- **Security:** sin fallback a strings magicas. `req.ip ?? undefined` evita escribir "unknown" o similar en el audit log cuando el proxy no setea X-Forwarded-For. La columna `ip_address` en DB es nullable, por lo que NULL es aceptable y distinguible de datos sinteticos.
- **Consistencia:** mismo patron que `envio.service.ts` en signature y orden de parametros.
- **Performance:** cero queries adicionales en el hot path. El insert a `auditoria_log` ya ocurria, solo se agregan dos columnas al payload.
- **Tests:** coverage de happy path en create y update. Gaps conocidos abajo.

## Deuda residual

Ninguna.

Los tres issues abiertos al cierre inicial de esta fase fueron resueltos antes del sprint de Fase 5:

1. **Test explicito de `adminWriteLimiter`. RESUELTO.** Archivo: `go-express-api/tests/rate-limit.test.ts`. Como el limiter se aplica a nivel global en `app.ts:123-128` y esta desactivado cuando `NODE_ENV=test`, el test vive self-contained (estilo `tests/trust-proxy.test.ts`): mini-app Express que importa y monta el `adminWriteLimiter` real desde `src/middleware/rateLimit.ts`, supertest burstea POSTs con IPs diferentes por caso para que el store compartido no fugue quota. Asserts: happy path bajo el umbral, 429 con shape `{ error, code: TOO_MANY_REQUESTS }` en la request 31, headers draft-7 correctos (`RateLimit-Policy`, `RateLimit`, `Retry-After`), y cuota por IP (atacante bloqueado, request de otra IP pasa). Si alguien cambia el limite o la ventana del limiter real, este test quiebra.
2. **IP/UA en servicios legacy. RESUELTO.** Cerrado en commit `40839bd` (`feat(audit): persistir ip_address y user_agent en TODAS las mutaciones admin`). Cubre clientes, configuracion, envios, repartidores, tarifas, usuarios, warehouse y auth. Mismo patron que pago.service.ts.
3. **Normalizacion de IPv6 y proxies en chain. RESUELTO.** Cerrado en commit `40839bd`. Se agrego `go-express-api/tests/trust-proxy.test.ts` con 5 escenarios: request directa, un hop de XFF, IPv4 mapeado a IPv6 (`::ffff:1.2.3.4`), IPv6 puro (`2001:db8::1`) y chain multi-hop, validando la semantica de `trust proxy: 1` end to end.

## Commits

- `8d17da5` feat(pagos): persistir ip_address y user_agent en auditoria
- `643b396` docs(sprint-pagos): report de fase 1 cerrada
- `40839bd` feat(audit): persistir ip_address y user_agent en TODAS las mutaciones admin (cierra issues 2 y 3)
- (este commit) test(api): cobertura de adminWriteLimiter con mini-app aislado (cierra issue 1)
