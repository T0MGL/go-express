# GO EXPRESS — Paso 2: Re-auditoría adversarial del núcleo financiero

Constancia del plan. Se ejecuta DESPUES de cerrar el Paso 1 (re-arquitectura del núcleo de dinero sobre ledger append-only). No se lanza a producción hasta que este paso vuelva limpio y la suite de invariantes del Paso 3 pase en verde.

Fecha de constancia: 2026-06-09
Owner: agency-ceo (Bright Idea)
Contexto legal: Gaston está personalmente expuesto. Plata de terceros (afiliados). Tolerancia a error: cero.

---

## 1. Objetivo

Encontrar todo bug financiero que el primer barrido NO vio. El primer pase encontró 8 (3 CRITICA, 2 ALTA, 3 menores). Un solo barrido no prueba ausencia de bugs. Este paso busca confianza demostrable, no cobertura aparente: cada hallazgo verificado de forma independiente, cada invariante de dinero probado.

Criterio de éxito: la re-auditoría vuelve sin un solo bug CRITICA ni ALTA abierto, y cada clase de falla quedó cubierta por al menos un agente independiente que la cazó de punta a punta.

---

## 2. Clases de falla (lenses). Una por agente, ciego a las demás

Cada agente recibe SOLO su lente. No ve los hallazgos de los otros hasta la síntesis. Esto evita el sesgo de confirmación y fuerza cobertura real.

1. **Concurrencia y race conditions.** Dos requests sobre el mismo saldo, mismo pago, misma liquidación, mismo envío. Buscar toda mutación de dinero sin lock pesimista (SELECT FOR UPDATE) o sin RPC atómico. Probar: doble pago simultáneo, anulación concurrente con edición, dos liquidaciones solapadas del mismo repartidor, bypass de límite de crédito en paralelo.

2. **Conservación del dinero (money invariants).** Nada se crea ni se destruye. Para cada flujo, la suma entra = suma sale. Buscar: COD cobrado que no impacta el saldo del negocio, plata acreditada dos veces, anulación que no reversa el monto exacto, redondeo que pierde o inventa guaraníes. PYG sin decimales: todo monto debe ser BIGINT, cero floats.

3. **Edge cases de estado financiero.** Anulación tras COD cobrado, pago parcial, pago de más, anulación de pago ya liquidado, envío anulado con pago asociado, cambio de tipo de pago tras pago existente, reembolso, devolución. Cada transición de estado que toca plata, trazada de input a saldo.

4. **Integridad transaccional SQL.** Toda mutación multi-paso de dinero dentro de una transacción explícita. Buscar: writes parciales si falla el segundo paso, triggers que asumen INSERT pero no cubren UPDATE/DELETE, RPCs que no son atómicos de verdad, falta de constraints (unique, exclude, check) que deberían hacer imposible el estado inválido a nivel DB.

5. **Validación de inputs en cada endpoint.** Todo número que viene del cliente HTTP (costo, monto_total, monto_recibido, límite) recalculado o validado server-side contra la fuente real. Buscar: cualquier monto que se persiste tal cual lo manda el caller. Zod en cada input. El bug 3 del primer pase nació acá.

6. **Reconciliación COD.** El dinero que el repartidor cobra en la calle vs lo que se le acredita al negocio vs lo que se liquida al repartidor. Buscar gaps de tres puntas: cobrado-sin-registrar, registrado-sin-liquidar, liquidado-sin-cobrar. Toda falla de registro de pago COD debe caer en cola visible, nunca swallowed.

---

## 3. Cómo se ejecuta

- **Fan-out paralelo.** Un agente por lente, en simultáneo, cada uno ciego a los demás. Cada uno entrega: lista de hallazgos con archivo:línea, escenario reproducible exacto, severidad (CRITICA/ALTA/MEDIA/BAJA), y fix propuesto con código.
- **Verificación adversarial por hallazgo.** Cada finding pasa por un segundo agente independiente cuyo único trabajo es REFUTARLO. Default: refutado, salvo que el escenario reproduzca contra prod (datos descartables, transacción con ROLLBACK, prod intacto) o contra la suite de tests. Un finding sobrevive solo si la refutación falla. Esto mata los falsos positivos antes de que lleguen a Gaston.
- **Reproducción contra prod real.** Los CRITICA y ALTA se reproducen con números reales, no inferidos. Misma técnica que el primer pase: datos de test dentro de BEGIN ... ROLLBACK, triggers y RPCs reales de prod, cero efecto sobre datos reales.
- **Loop hasta seco.** Se repiten rondas de fan-out hasta que dos rondas consecutivas no traigan ningún hallazgo nuevo. Un contador simple "encontré N y paro" deja la cola de bugs sin cazar.
- **Síntesis y dedup.** Al cerrar, un agente junta todos los hallazgos sobrevivientes, deduplica por archivo+línea, y arma el reporte final ordenado por severidad.

---

## 4. Invariantes de dinero a probar (alimentan el Paso 3)

Cada uno se convierte en un test de CI que corre en cada deploy. Si uno falla, el deploy se bloquea.

- Saldo de cada afiliado = SUM(movimientos de su cuenta corriente). Sin excepción, sin tolerancia.
- Todo COD marcado cobrado tiene exactamente un movimiento de cuenta corriente asociado.
- Suma de montos de una liquidación = suma de COD de los envíos que incluye.
- Ningún pago con monto_recibido > monto_total del envío real.
- Ningún pago duplicado por envío (unique pago-envío respetado).
- Anulación de pago reversa exactamente el crédito original, ni más ni menos.
- Cero rangos de liquidación solapados por repartidor.
- Todo monto en BIGINT. Cero columnas float/numeric en dinero.

---

## 5. Veredicto final del Paso 2

Una línea: ¿se puede lanzar o NO? Seguido de la tabla de hallazgos sobrevivientes por severidad, las queries de validación corridas contra prod y qué encontraron, y el estado de cada invariante (verde/rojo).

Regla dura: NO se declara listo para producción con un solo bug CRITICA o ALTA abierto. Sin excepción.

El reporte pasa por qa-gate antes de llegar a Gaston. FAIL: corregir y re-submit hasta PASS.
