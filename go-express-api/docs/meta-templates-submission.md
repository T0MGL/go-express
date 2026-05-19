# Meta WhatsApp Templates: paquete de submission

Paquete listo para crear los **6 templates UTILITY** en Meta Business Manager (`business.facebook.com/wa/manage/message-templates`). Cada sección es self-contained: una tabla campo por campo con el mismo orden del wizard de Meta, el body literal para pegar, y notas de aprobación.

**Estado de submission (2026-05):**
- Templates 1 a 6: registrados y aprobados en Meta.
- Templates 7 (`goexpress_fallido_destinatario_v1`) y 8 (`goexpress_problema_v1`): **NOT SUBMITTED**. Decisión de producto: notificación por email exclusivamente.

**Dependencia externa para el template 6:** el botón estático `Contactános` apunta a `https://goexpressparaguay.com/whatsapp`. Ese path es un redirect 307 a `wa.me/595991600777?text=...` configurado en `vercel.json` del repo raíz del sitio público. Meta valida la URL antes de aprobar el template. Verificar que el redirect responde 307 antes de submitear el template 6 (en otro caso Meta rechaza por URL inválida).

**Fuente de copy:** `docs/notification-templates.md` Paso 6 (tabla con bodies aprobados internamente). Este doc reformatea ese contenido al formato exacto del wizard Meta para acelerar el alta.

**Pre-requisitos antes de abrir el wizard:**
1. WhatsApp Business Account de GO EXPRESS asociada a la app `GO EXPRESS Production` (Meta for Developers).
2. Phone number verificado en API Setup, `Phone number ID` copiado a `.env` como `META_WA_PHONE_NUMBER_ID`.
3. System User Token permanente (`META_WA_TOKEN`) con permisos `whatsapp_business_messaging` + `whatsapp_business_management`.
4. Para cada template el button URL apunta a la página pública de tracking (`https://goexpressparaguay.com/track?q=<tracking_number>`), que ya está deployada y no requiere auth.

**Reglas Meta que aplican a todos los templates de este paquete:**
- Categoría UTILITY: cada mensaje se dispara por un cambio de estado real del envío persistido en `envios.estado`. No hay envío proactivo de marketing.
- Idioma `es_PY` (Spanish Paraguay). Si la UI no expone PY, seleccionar Spanish y luego cambiar el código a `es_PY` desde la vista de detalle del template aprobado. Fallback de runtime `es` si Meta tarda en habilitar PY (manejado en `whatsapp.service.ts`).
- Variables máximo 10 por template. Acá usamos entre 2 y 4 por body.
- Variables nunca al inicio del body, nunca al final, nunca consecutivas (`{{1}} {{2}}` pegadas). Verificado en cada template.
- Sample values obligatorios y realistas. Usamos los mismos en todo el paquete para que Meta vea consistencia.
- Footer fijo `GO EXPRESS Paraguay`, sin variables, sin emojis.
- Button único Call to Action tipo Visit Website, URL dinámica con sufijo variable al final.
- Cero lenguaje promocional (oferta, descuento, promo). Cero emojis decorativos. Cero em dash.
- Acentos y ñ obligatorios (memoria interna `feedback_spanish_accents_mandatory.md`).

**Sample values comunes a todo el paquete:**
- destinatario_nombre → `María González`
- remitente_nombre → `Tienda Aurora SA`
- tracking_number → `GE2026001234`
- destino_ciudad → `Encarnación`

**Mapeo de variables a código (para `whatsapp.service.ts`):** cada sección abajo incluye la columna `Variable mapping (code)` con la ruta del campo del row `Envio` que va a hidratar cada `{{N}}` al armar los `components.parameters` en el POST a `graph.facebook.com/.../messages`.

---

## Template 1: goexpress_envio_creado_v1

| Campo Meta              | Valor                                                                |
|-------------------------|----------------------------------------------------------------------|
| Name                    | `goexpress_envio_creado_v1`                                          |
| Category                | UTILITY                                                              |
| Language                | Spanish (PY), código `es_PY`                                         |
| Header type             | Text                                                                 |
| Header text             | `Pedido confirmado`                                                  |
| Header sample           | n/a (sin variables en header)                                        |
| Body text               | ver bloque "Body literal" abajo                                      |
| Body samples            | {{1}}=`María González`, {{2}}=`Tienda Aurora SA`, {{3}}=`GE2026001234`, {{4}}=`Encarnación` |
| Footer text             | `GO EXPRESS Paraguay`                                                |
| Buttons type            | Call to Action (URL)                                                 |
| Button 1 type           | Visit website, URL type Dynamic                                      |
| Button 1 text           | `Rastrear envío`                                                     |
| Button 1 URL base       | `https://goexpressparaguay.com/track?q=`                             |
| Button 1 URL suffix var | `{{1}}`                                                              |
| Button 1 URL sample     | `GE2026001234`                                                       |
| Variable mapping (code) | {{1}}=`envio.destinatarioNombre`, {{2}}=`envio.clienteNombre`, {{3}}=`envio.trackingNumber`, {{4}}=`envio.destino`, button {{1}}=`envio.trackingNumber` |

**Body literal (copiar y pegar):**
```
Hola {{1}}, {{2}} registró un envío para vos.

Número de tracking: {{3}}
Destino: {{4}}

Te vamos a ir avisando cada cambio de estado.
```

**Notas de aprobación:**
- UTILITY justificado: se dispara por INSERT en `envios` (acción del cliente empresa cargando el pedido). Es transaccional puro.
- Riesgo de rechazo: BAJO. Sin claims promocionales, todas las variables aportan información del pedido real.
- Workaround si Meta rechaza por categoría: re-submitear como SERVICE manteniendo el mismo body. UTILITY y SERVICE comparten elegibilidad de uso aquí.
- Flag riesgo Meta: **LOW**. Patrón canónico de notificación transaccional, 4 variables informativas, header descriptivo.

---

## Template 2: goexpress_recolectado_v1

| Campo Meta              | Valor                                                                |
|-------------------------|----------------------------------------------------------------------|
| Name                    | `goexpress_recolectado_v1`                                           |
| Category                | UTILITY                                                              |
| Language                | Spanish (PY), código `es_PY`                                         |
| Header type             | Text                                                                 |
| Header text             | `Paquete retirado`                                                   |
| Header sample           | n/a                                                                  |
| Body text               | ver bloque "Body literal" abajo                                      |
| Body samples            | {{1}}=`María González`, {{2}}=`Tienda Aurora SA`, {{3}}=`GE2026001234`, {{4}}=`Encarnación` |
| Footer text             | `GO EXPRESS Paraguay`                                                |
| Buttons type            | Call to Action (URL)                                                 |
| Button 1 type           | Visit website, URL type Dynamic                                      |
| Button 1 text           | `Rastrear envío`                                                     |
| Button 1 URL base       | `https://goexpressparaguay.com/track?q=`                             |
| Button 1 URL suffix var | `{{1}}`                                                              |
| Button 1 URL sample     | `GE2026001234`                                                       |
| Variable mapping (code) | {{1}}=`envio.destinatarioNombre`, {{2}}=`envio.clienteNombre`, {{3}}=`envio.trackingNumber`, {{4}}=`envio.destino`, button {{1}}=`envio.trackingNumber` |

**Body literal:**
```
Hola {{1}}, retiramos tu paquete donde {{2}}.

Tracking: {{3}}
Destino: {{4}}

Te avisamos cuando salga al próximo tramo.
```

**Notas de aprobación:**
- UTILITY justificado: dispara por cambio de `envios.estado` a `recolectado` cuando el repartidor confirma la recolección en el portal.
- Riesgo: BAJO.
- Flag riesgo Meta: **LOW**.

---

## Template 3: goexpress_en_transito_v1

| Campo Meta              | Valor                                                                |
|-------------------------|----------------------------------------------------------------------|
| Name                    | `goexpress_en_transito_v1`                                           |
| Category                | UTILITY                                                              |
| Language                | Spanish (PY), código `es_PY`                                         |
| Header type             | Text                                                                 |
| Header text             | `Paquete en tránsito`                                                |
| Header sample           | n/a                                                                  |
| Body text               | ver bloque "Body literal" abajo                                      |
| Body samples            | {{1}}=`María González`, {{2}}=`Encarnación`, {{3}}=`GE2026001234`    |
| Footer text             | `GO EXPRESS Paraguay`                                                |
| Buttons type            | Call to Action (URL)                                                 |
| Button 1 type           | Visit website, URL type Dynamic                                      |
| Button 1 text           | `Rastrear envío`                                                     |
| Button 1 URL base       | `https://goexpressparaguay.com/track?q=`                             |
| Button 1 URL suffix var | `{{1}}`                                                              |
| Button 1 URL sample     | `GE2026001234`                                                       |
| Variable mapping (code) | {{1}}=`envio.destinatarioNombre`, {{2}}=`envio.destino`, {{3}}=`envio.trackingNumber`, button {{1}}=`envio.trackingNumber` |

**Body literal:**
```
Hola {{1}}, tu paquete está en camino al centro de distribución de {{2}}.

Tracking: {{3}}

Te avisamos cuando salga a reparto.
```

**Notas de aprobación:**
- UTILITY: dispara por cambio a `en_transito` (movimiento entre hubs).
- Header `Paquete en tránsito` con tilde correcta. Meta acepta tildes en headers Text sin problema.
- Riesgo: BAJO.
- Flag riesgo Meta: **LOW**.

---

## Template 4: goexpress_en_deposito_v1

| Campo Meta              | Valor                                                                |
|-------------------------|----------------------------------------------------------------------|
| Name                    | `goexpress_en_deposito_v1`                                           |
| Category                | UTILITY                                                              |
| Language                | Spanish (PY), código `es_PY`                                         |
| Header type             | Text                                                                 |
| Header text             | `Paquete en depósito`                                                |
| Header sample           | n/a                                                                  |
| Body text               | ver bloque "Body literal" abajo                                      |
| Body samples            | {{1}}=`María González`, {{2}}=`Encarnación`, {{3}}=`GE2026001234`    |
| Footer text             | `GO EXPRESS Paraguay`                                                |
| Buttons type            | Call to Action (URL)                                                 |
| Button 1 type           | Visit website, URL type Dynamic                                      |
| Button 1 text           | `Rastrear envío`                                                     |
| Button 1 URL base       | `https://goexpressparaguay.com/track?q=`                             |
| Button 1 URL suffix var | `{{1}}`                                                              |
| Button 1 URL sample     | `GE2026001234`                                                       |
| Variable mapping (code) | {{1}}=`envio.destinatarioNombre`, {{2}}=`envio.destino`, {{3}}=`envio.trackingNumber`, button {{1}}=`envio.trackingNumber` |

**Body literal:**
```
Hola {{1}}, tu paquete llegó al depósito de {{2}}.

Tracking: {{3}}

En las próximas horas hábiles lo asignamos a un repartidor.
```

**Notas de aprobación:**
- UTILITY: dispara por cambio a `en_deposito` (paquete en hub de destino, antes de asignar repartidor).
- Gap conocido: el dispatcher actual todavía no contempla `en_deposito` (ver Gaps en `notification-templates.md`). El template puede crearse y aprobarse aunque el código no lo dispare todavía. Mejor tenerlo aprobado y wirearlo en el código después.
- Riesgo: BAJO.
- Flag riesgo Meta: **LOW**.

---

## Template 5: goexpress_en_reparto_v1

**Estado:** aprobado en Meta 2026-05. El body final difiere del propuesto originalmente (cambios consensuados con cliente antes del submit). Esta sección refleja el body real aprobado.

| Campo Meta              | Valor                                                                |
|-------------------------|----------------------------------------------------------------------|
| Name                    | `goexpress_en_reparto_v1`                                            |
| Category                | UTILITY                                                              |
| Language                | Spanish (PY), código `es_PY`                                         |
| Header type             | Text                                                                 |
| Header text             | `Tu paquete sale a entrega hoy`                                      |
| Header sample           | n/a                                                                  |
| Body text               | ver bloque "Body literal" abajo                                      |
| Body samples            | {{1}}=`GE2026001234`, {{2}}=`Av. Mariscal López 1234, Villa Morra, Asunción` |
| Footer text             | `Go Express Paraguay`                                                |
| Buttons type            | Call to Action (URL)                                                 |
| Button 1 type           | Visit website, URL type Dynamic                                      |
| Button 1 text           | `Rastrear envío`                                                     |
| Button 1 URL base       | `https://goexpressparaguay.com/track?q=`                             |
| Button 1 URL suffix var | `{{1}}`                                                              |
| Button 1 URL sample     | `GE2026001234`                                                       |
| Variable mapping (code) | {{1}}=`envio.trackingNumber`, {{2}}=dirección compuesta (ver `whatsapp.service.ts buildDireccionDestinatario`), button {{1}}=`envio.trackingNumber` |

**Body literal:**
```
El repartidor ya tiene tu encomienda y lo lleva a tu dirección. 📦

Tracking: {{1}}
Dirección: {{2}}

Estate atento/a al timbre o llamada.
```

**Cambios vs propuesta inicial:**
- Sin saludo `Hola {{nombre}}`. Body arranca directo.
- `paquete` → `encomienda`.
- `Destino: <ciudad>` → `Dirección: <dirección compuesta>`. La variable {{2}} ahora es la dirección legible del destinatario, no solo la ciudad.
- Emoji 📦 al final de la primera línea (parte del body aprobado, no es variable).
- `Estate atento/a` con inclusivo.
- Footer pasa a `Go Express Paraguay` (con espacio).

**Notas de aprobación:**
- UTILITY: el más accionable del paquete. Dispara por cambio a `en_reparto`.
- Riesgo: BAJO.
- Variante COD aparte: `goexpress_en_reparto_cod_v1` no incluida en este paquete. Submitirla en una segunda tanda cuando esté wireado el flow COD en el dispatcher.
- Flag riesgo Meta: **LOW**.

---

## Template 6: goexpress_entregado_destinatario_v1

**Estado:** aprobado en Meta 2026-05. El body final difiere del propuesto originalmente. Header en uppercase, 1 sola variable, segundo botón estático. Esta sección refleja el template real aprobado.

| Campo Meta              | Valor                                                                |
|-------------------------|----------------------------------------------------------------------|
| Name                    | `goexpress_entregado_destinatario_v1`                                |
| Category                | UTILITY                                                              |
| Language                | Spanish (PY), código `es_PY`                                         |
| Header type             | Text                                                                 |
| Header text             | `ENTREGADO`                                                          |
| Header sample           | n/a                                                                  |
| Body text               | ver bloque "Body literal" abajo                                      |
| Body samples            | {{1}}=`María González`                                               |
| Footer text             | `Gracias por usar Go Express!`                                       |
| Buttons type            | 2 botones: 1 URL dinámico + 1 URL estático                           |
| Button 1 type           | Visit website, URL type Dynamic                                      |
| Button 1 text           | `Ver detalles`                                                       |
| Button 1 URL base       | `https://goexpressparaguay.com/track?q=`                             |
| Button 1 URL suffix var | `{{1}}`                                                              |
| Button 1 URL sample     | `GE2026001234`                                                       |
| Button 2 type           | Visit website, URL type **Static**                                   |
| Button 2 text           | `Contactános`                                                        |
| Button 2 URL            | `https://goexpressparaguay.com/whatsapp` (sin variables)             |
| Variable mapping (code) | body {{1}}=`envio.destinatarioNombre`, button 1 {{1}}=`envio.trackingNumber`, button 2: sin parameters (URL fija) |

**Body literal:**
```
Hola {{1}}, tu encomienda fue entregada con éxito. ✅
```

**Cambios vs propuesta inicial:**
- Header pasa de `Paquete entregado` → `ENTREGADO` (uppercase, sin variables, sin emoji decorativo).
- Body queda en una sola línea con una sola variable. Emoji ✅ y cierre `con éxito` son parte del template aprobado.
- `paquete` → `encomienda`.
- Footer pasa a `Gracias por usar Go Express!`.
- Se agrega **segundo botón estático** `Contactános` que apunta a `https://goexpressparaguay.com/whatsapp`. Ese path es un redirect Vercel 307 hacia `wa.me/595991600777?text=...`. Meta no permite `wa.me/*` directo, por eso el indirect via dominio propio.

**Notas de aprobación:**
- UTILITY: confirmación transaccional de entrega.
- Pre-requisito: el redirect `/whatsapp` debe estar deployado en `goexpressparaguay.com` antes del submit. Meta valida la URL del botón estático en el momento del review. Si responde 404 o no redirige, rechaza.
- Variante remitente aparte: `goexpress_entregado_remitente_v1` se submitea en segunda tanda (target audiencia: cliente empresa, no consumidor final). Misma categoría UTILITY.
- Riesgo: BAJO.
- Flag riesgo Meta: **LOW**.

**Componente Meta API al enviar (referencia código):**
Solo el botón dinámico requiere `parameters` en el POST a `/messages`. El estático va implícito en el template aprobado.
```js
components: [
  { type: 'body', parameters: [{ type: 'text', text: destinatarioNombre }] },
  { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: trackingNumber }] },
]
```

---

## Template 7: goexpress_fallido_destinatario_v1

**Estado: NOT SUBMITTED (decisión: email only).** Este template está documentado para referencia futura. Hoy no se registra en Meta: el evento `fallido` se notifica solo por email (HTML largo con motivo + CTA reagendar) tanto al destinatario como al remitente. El código de `whatsapp.service.ts` no incluye mapping para este evento (`resolveTemplate` devuelve `null` y el orquestador loguea `descartado` con razón `sin_template_wa`). Si en el futuro se decide habilitarlo, registrar en Meta con la spec abajo y re-agregar el case en `WHATSAPP_TEMPLATE_NAMES` + `TEMPLATES` + `resolveTemplate`.

| Campo Meta              | Valor                                                                |
|-------------------------|----------------------------------------------------------------------|
| Name                    | `goexpress_fallido_destinatario_v1`                                  |
| Category                | UTILITY                                                              |
| Language                | Spanish (PY), código `es_PY`                                         |
| Header type             | Text                                                                 |
| Header text             | `No pudimos entregarte el paquete`                                   |
| Header sample           | n/a                                                                  |
| Body text               | ver bloque "Body literal" abajo                                      |
| Body samples            | {{1}}=`María González`, {{2}}=`GE2026001234`, {{3}}=`Encarnación`    |
| Footer text             | `GO EXPRESS Paraguay`                                                |
| Buttons type            | Call to Action (URL)                                                 |
| Button 1 type           | Visit website, URL type Dynamic                                      |
| Button 1 text           | `Ver detalle`                                                        |
| Button 1 URL base       | `https://goexpressparaguay.com/track?q=`                             |
| Button 1 URL suffix var | `{{1}}`                                                              |
| Button 1 URL sample     | `GE2026001234`                                                       |
| Variable mapping (code) | {{1}}=`envio.destinatarioNombre`, {{2}}=`envio.trackingNumber`, {{3}}=`envio.destino`, button {{1}}=`envio.trackingNumber` |

**Body literal:**
```
Hola {{1}}, intentamos entregar tu paquete {{2}} en {{3}} y no fue posible.

Vamos a coordinar un nuevo intento en las próximas 24 horas hábiles.
```

**Notas de aprobación:**
- UTILITY: notificación transaccional crítica de excepción en delivery.
- El header es largo (32 chars), dentro del límite de 60.
- Body cierra con una promesa concreta de servicio (nuevo intento en 24h hábiles). No incluye número de contacto externo para evitar que Meta lo recategorice a SERVICE.
- Riesgo: BAJO-MEDIO. Meta a veces marca templates con `no fue posible` o `no pudimos` como negativos y pide reformular. Si rechaza, alternativa: cambiar header a `Intento de entrega no completado` y mantener el body.
- Flag riesgo Meta: **MED**. Tono negativo del header puede gatillar revisión manual, pero el contenido es 100% transaccional. Aprobación probable en primera ronda.

---

## Template 8: goexpress_problema_v1

**Estado: NOT SUBMITTED (decisión: email only).** Este template está documentado para referencia futura. Hoy no se registra en Meta: el evento `problema` se notifica solo por email (HTML con detalle del problema, CTA WhatsApp de soporte). El código de `whatsapp.service.ts` no incluye mapping para este evento (mismo path que `fallido`). Si en el futuro se decide habilitarlo, registrar en Meta con la spec abajo y re-agregar el case en `WHATSAPP_TEMPLATE_NAMES` + `TEMPLATES` + `resolveTemplate`.

| Campo Meta              | Valor                                                                |
|-------------------------|----------------------------------------------------------------------|
| Name                    | `goexpress_problema_v1`                                              |
| Category                | UTILITY                                                              |
| Language                | Spanish (PY), código `es_PY`                                         |
| Header type             | Text                                                                 |
| Header text             | `Novedad con tu envío`                                               |
| Header sample           | n/a                                                                  |
| Body text               | ver bloque "Body literal" abajo                                      |
| Body samples            | {{1}}=`María González`, {{2}}=`GE2026001234`                         |
| Footer text             | `GO EXPRESS Paraguay`                                                |
| Buttons type            | Call to Action (URL)                                                 |
| Button 1 type           | Visit website, URL type Dynamic                                      |
| Button 1 text           | `Rastrear envío`                                                     |
| Button 1 URL base       | `https://goexpressparaguay.com/track?q=`                             |
| Button 1 URL suffix var | `{{1}}`                                                              |
| Button 1 URL sample     | `GE2026001234`                                                       |
| Variable mapping (code) | {{1}}=`envio.destinatarioNombre`, {{2}}=`envio.trackingNumber`, button {{1}}=`envio.trackingNumber` |

**Body literal:**
```
Hola {{1}}, hay una novedad con tu envío {{2}}.

Nuestro equipo está trabajando para resolverlo. Te contactamos a la brevedad.
```

**Notas de aprobación:**
- UTILITY: notificación de excepción operativa en el envío (`envios.estado = 'problema'`).
- Solo 2 variables, las mínimas para hacer accionable la información.
- Body intencionalmente vago en el motivo para evitar leaks operativos en el template aprobado. El detalle del problema va al canal email (HTML largo) y, si se necesita, en una conversación de soporte WhatsApp posterior dentro de la ventana de 24h.
- Riesgo: BAJO.
- Flag riesgo Meta: **LOW**.

---

## Resumen y orden recomendado de submission

Estado real del paquete (2026-05): 6 templates aprobados, 2 no submitidos por decisión de producto.

| # | Template                                | Estado          | Riesgo Meta | Justificación 1 línea                                              |
|---|------------------------------------------|-----------------|-------------|--------------------------------------------------------------------|
| 1 | `goexpress_envio_creado_v1`              | APPROVED        | LOW         | Notificación canónica de orden creada, 4 variables, sin claims.    |
| 2 | `goexpress_recolectado_v1`               | APPROVED        | LOW         | Movimiento de paquete tracked, transaccional puro.                 |
| 3 | `goexpress_en_transito_v1`               | APPROVED        | LOW         | Update de tránsito entre hubs, informativo.                        |
| 4 | `goexpress_en_deposito_v1`               | APPROVED        | LOW         | Llegada a hub de destino, transaccional.                           |
| 5 | `goexpress_en_reparto_v1`                | APPROVED (v2)   | LOW         | Body reformulado: encomienda + dirección compuesta, 2 variables.   |
| 6 | `goexpress_entregado_destinatario_v1`    | APPROVED (v2)   | LOW         | Header uppercase, 1 variable, 2 botones (dynamic + static).        |
| 7 | `goexpress_fallido_destinatario_v1`      | NOT SUBMITTED   | n/a         | Decisión producto: email only.                                     |
| 8 | `goexpress_problema_v1`                  | NOT SUBMITTED   | n/a         | Decisión producto: email only.                                     |

---

## Checklist pre-submit (correr de arriba a abajo)

- [ ] Estoy logueado con la cuenta Admin del Business Manager de GO EXPRESS, no con cuenta personal sin permisos.
- [ ] La WhatsApp Business Account de GO EXPRESS aparece en el selector de WhatsApp Manager.
- [ ] El número está verificado y el `Phone number ID` está en `.env` (`META_WA_PHONE_NUMBER_ID`).
- [ ] El System User Token está generado, copiado y guardado en password manager (no se puede recuperar después).
- [ ] El webhook callback URL del backend está deployado y responde 200 al GET con `hub.challenge`.
- [ ] Tengo abierto este doc en una pestaña y `docs/notification-templates.md` en otra como referencia cruzada.
- [ ] El dominio `goexpressparaguay.com/track` está accesible públicamente (probar en incógnito con `?q=GE2026001234`).

## Checklist post-aprobación (cuando Meta marca approved)

- [ ] Copiar el `name` exacto que Meta asignó a cada template en una constante del código (`WHATSAPP_TEMPLATES.envio_creado = 'goexpress_envio_creado_v1'`, etc.).
- [ ] Verificar que el `language.code` del template aprobado es `es_PY`. Si quedó `es`, ajustar el `whatsapp.service.ts` para enviar `language: { code: 'es' }` o duplicar el template con código correcto.
- [ ] Correr el curl de testing del Paso 8 de `notification-templates.md` contra el template #1 con un número whitelisted.
- [ ] Verificar que aparece la row correspondiente en `notificaciones_log` con `proveedor_message_id` poblado.
- [ ] Recién entonces, habilitar el flag de feature en producción para empezar a notificar a clientes reales.
