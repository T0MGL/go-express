# Sprint Pagos / Cuenta Corriente / Conciliaciones

Origen: hard debug de 2026-04-19 detectó que 2 de las 3 áreas core financieras de GO EXPRESS no existen como sistema y la tercera tiene defectos críticos de atomicidad. Cliente todavía sin lanzar a producción, ventana de fix antes del go-live.

Cada fase es un archivo `FASE_N_*.md` ejecutable standalone en una sesión Claude nueva. Pegas el comando de la sección "Comando de invocación" del archivo y la sesión arranca con todo el contexto.

## Estado de fases

| # | Fase | Estado | Sesión | Tiempo estimado |
|---|---|---|---|---|
| 3 | Ledger Cuenta Corriente | CERRADA (23/23 tests PASS) | sesión inicial | 3-4h |
| 1 | IP/UA + adminWriteLimiter en pagos | CERRADA | nueva | 30min |
| 2 | RPC atómicos pago + auditoría | CERRADA (211/211 suite PASS, RPC aplicado) | nueva | 1.5h |
| 4 | Anulación de pagos | CERRADA (219/219 tests PASS, migración 021 aplicada) | nueva | 1.5h |
| 5 | Liquidaciones de repartidor + auto pago COD | CERRADA (247/247 tests PASS, migración 022 aplicada) | nueva | 3-4h |

Sprint completo. Branch principal: `main` contiene todas las fases mergeadas.

## Orden recomendado de ejecución (post Fase 3)

```
Fase 3 (esta sesión) → ✅
Fase 1 (quick win, no bloquea nada)
Fase 2 (RPC atomicidad, base para Fase 4 reversión y Fase 5 auto-pago)
Fase 4 (anulación de pagos, depende de Fase 3 ledger + Fase 2 RPC)
Fase 5 (liquidaciones, depende de Fase 2 RPC + Fase 3 ledger)
```

## Dependencias técnicas entre fases

```
Fase 1 (IP/UA)            ──┐
                            ├── Independientes
Fase 3 (Ledger CC)        ──┘

Fase 2 (RPC atómicos)     ──┐
                            ├── Fase 4 (Anulación)   [depende de 2 + 3]
                            └── Fase 5 (Liquidación) [depende de 2 + 3]
```

## Standards no negociables (aplican a todas las fases)

Cada fase respeta `CLAUDE.md` del repo (sección 4 Production Standards, sección 5 Anti-patterns, sección 13 Definition of done). Resumen operativo:

- TS strict, no `any`, no `@ts-ignore`, no type assertions para tapar errores reales
- No em dash, no doble guion como separador. En todo: código, SQL, comentarios, commits, docs
- No `SELECT *`. Lista explícita de columnas
- No `console.log`. Usar `logger` del backend
- Mutaciones financieras: BIGINT en Gs, atómicas vía RPC Postgres, audit con IP/UA
- Soft-delete con `motivo` obligatorio donde aplique
- Validación: Zod en boundary, una vez. RHF + zodResolver en frontend
- Tests: integration en `go-express-api/tests/` para todo endpoint nuevo, e2e Playwright para flows admin críticos
- Schema drift = defecto: si agregás columna SQL, en el mismo commit actualizás mapper + ENVIO_COLUMNS o equivalente + TS type + Zod schema
- qa-gate obligatorio antes de cerrar fase. FAIL → corregir y re-submit hasta PASS
- `npm run typecheck` y `npm test` en `go-express-api/`, `npm run lint` en root, deben pasar antes del qa-gate
- Conventional commits, una fase = un set pequeño de commits lógicos en su propio branch (ej: `sprint/fase-N-nombre`)

## Convenciones del sprint

- Migraciones SQL: numeración secuencial real (chequear `go-express-api/sql/` antes de elegir número)
- Branches: `sprint-pagos/fase-N-nombre`
- Mailbox / queue del agency-ceo se actualiza al cerrar cada fase
- Cada fase deja un `FASE_N_REPORT.md` en este directorio con resumen de lo hecho, archivos tocados, comandos para aplicar migraciones, decisiones no obvias, deuda residual
