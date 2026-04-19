# FASE 1: IP/UA en auditoría de pagos + adminWriteLimiter

**Tiempo estimado:** 30 minutos
**Riesgo:** bajo
**Bloquea a:** ninguna fase
**Depende de:** ninguna fase

## Comando de invocación (pegar en sesión Claude nueva)

```
Lee /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/INDEX.md y /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/FASE_1_IP_UA_RATELIMIT.md, despues lee /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/CLAUDE.md, despues invoca al agency-ceo con el contenido de la seccion "Prompt para agency-ceo" del archivo FASE_1. Cuando el agency-ceo termine, verifica que dejo FASE_1_REPORT.md en sprint-pagos/.
```

## Contexto del audit

Hallazgo CRÍTICO 1.3 y ALTO 1.10 del hard debug original:

> **1.3 Auditoría sin IP ni user-agent en pagos.** En `services/pago.service.ts` líneas 193-200 y 252-260 la llamada a `auditoriaService.log` no pasa `ipAddress` ni `userAgent`, mientras que la tabla `auditoria_log` (sql/001:356-369) tiene esas columnas y `envio.service.ts:476-486` sí los pasa. Si un cobrador interno hace fraude (pagos fantasma) no hay forma de identificar la sesión.
>
> **1.10 Sin rate limit específico en mutaciones de pagos.** `routes/admin/pagos.ts:55-77` usa el general limiter. Para operación financiera debería usar `adminWriteLimiter`.

Confirmado por el agency-ceo durante el audit: `auditoriaService.log` ya acepta `ipAddress` y `userAgent` opcionales (`auditoria.service.ts` líneas 47-48). El refactor es solo wiring desde route handlers, no cambio de signature.

## Spec técnica

### Backend

**1. Verificar trust proxy en `app.ts`**
- Confirmar que `app.set('trust proxy', ...)` está configurado correctamente para que `req.ip` no sea undefined detrás del proxy de Railway.
- Si NO está configurado, agregarlo: `app.set('trust proxy', 1)` (o el valor que corresponda al setup de prod). Railway por default está detrás de un proxy.
- Documentar en comentario al lado por qué.

**2. Refactor `services/pago.service.ts`**
- En `create(input, creadoPor, ipAddress?, userAgent?)`: agregar parámetros opcionales `ipAddress` y `userAgent`, pasarlos a `auditoriaService.log`.
- En `update(id, input, actualizadoPor, ipAddress?, userAgent?)`: ídem.
- Tipar como `string | undefined`. No usar `any`.
- Mantener compatibilidad si se llama sin esos argumentos (default undefined), pero TODOS los call sites desde routes deben pasarlos.

**3. Refactor `routes/admin/pagos.ts`**
- Importar `adminWriteLimiter` de `middleware/rateLimit.ts`.
- Aplicar `adminWriteLimiter` en POST y PATCH (no en GET).
- Extraer `req.ip` y `req.headers['user-agent']` en cada handler de POST y PATCH, pasarlos al service.
- Patrón:
  ```ts
  const pago = await pagoService.create(
    req.body,
    req.userId!,
    req.ip,
    req.headers['user-agent']
  );
  ```

**4. Buscar otros call sites**
- `grep -rn "pagoService\.\(create\|update\)" go-express-api/src/`
- Asegurar que todos los call sites pasan IP/UA cuando estén en contexto de request HTTP.
- Si hay call sites sin contexto request (ej: jobs internos), pasar `undefined` explícito y comentar la razón.

### Tests

Archivo a tocar: `go-express-api/tests/admin/pagos.test.ts`.

Tests obligatorios a agregar:
- `'create persists ip_address and user_agent in audit log'`: hacer POST con `request(app).post(...).set('X-Forwarded-For', '1.2.3.4').set('User-Agent', 'test-agent')`, después leer `auditoria_log` y verificar que las columnas no son NULL.
- `'update persists ip_address and user_agent in audit log'`: ídem para PATCH.
- `'POST /pagos respects adminWriteLimiter'` (si los tests existentes ya validan rate limiters, mantener el patrón; si no, opcional).

### Definition of Done

1. ✅ Branch `sprint-pagos/fase-1-ip-ua-ratelimit` creado desde `main`.
2. ✅ `app.set('trust proxy', ...)` verificado o agregado en `app.ts`.
3. ✅ `pago.service.ts` create y update aceptan IP/UA.
4. ✅ `routes/admin/pagos.ts` POST y PATCH pasan IP/UA al service.
5. ✅ `adminWriteLimiter` aplicado en POST y PATCH de pagos.
6. ✅ Tests integration nuevos pasan (`cd go-express-api && npm test`).
7. ✅ `npm run typecheck` pasa.
8. ✅ Tests existentes no rotos.
9. ✅ Sin `any`, sin em dash, sin console.log.
10. ✅ qa-gate invocado, retorna PASS.
11. ✅ `FASE_1_REPORT.md` creado en sprint-pagos/ con: archivos tocados, commits, decisiones, deuda residual.

## Prompt para agency-ceo

```
EJECUTAR FASE 1 del sprint Pagos / Cuenta Corriente / Conciliaciones de GO EXPRESS.

Spec completa en /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/sprint-pagos/FASE_1_IP_UA_RATELIMIT.md.

Repo: /Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS
Standards: CLAUDE.md del repo (sección 4 + 5 + 13). No em dash. No any. No console.log.
Branch: sprint-pagos/fase-1-ip-ua-ratelimit desde main.

Alcance acotado: 30 min, low risk, no migraciones SQL, no frontend. Solo backend + tests.

Pasos:
1. Verificar trust proxy en app.ts. Agregar si falta.
2. Refactor pago.service.ts create y update para aceptar ipAddress y userAgent.
3. Refactor routes/admin/pagos.ts: importar adminWriteLimiter, aplicar en POST y PATCH, pasar req.ip y req.headers['user-agent'] al service.
4. Buscar otros call sites con grep, asegurar consistencia.
5. Agregar 2 tests integration en tests/admin/pagos.test.ts: verificar IP/UA persistidos en auditoria_log para create y update.
6. npm run typecheck + npm test pasan.
7. qa-gate PASS.
8. Crear FASE_1_REPORT.md en sprint-pagos/ con resumen.

Definition of Done: ver el archivo de spec.
```
