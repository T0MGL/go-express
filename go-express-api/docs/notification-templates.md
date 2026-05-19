# Templates de notificación de envíos

## ¿Qué hace cada template? (memoria rápida)

| Template                                | Se dispara cuando...                                 | Notifica a                       | Propósito                                                | Canales          |
|-----------------------------------------|------------------------------------------------------|----------------------------------|----------------------------------------------------------|------------------|
| `goexpress_envio_creado_v1`             | cliente carga el envío en el sistema                 | destinatario                     | confirmar pedido, dar tracking                           | WhatsApp + email |
| `goexpress_recolectado_v1`              | repartidor confirma retiro en el remitente           | destinatario                     | aviso de recolección, paquete en movimiento              | WhatsApp + email |
| `goexpress_en_transito_v1`              | paquete sale del hub origen                          | destinatario                     | paquete viaja al hub destino                             | WhatsApp + email |
| `goexpress_en_deposito_v1`              | paquete llega al hub destino                         | destinatario                     | en breve asignamos repartidor                            | WhatsApp + email |
| `goexpress_en_reparto_v1`               | repartidor sale a entregar                           | destinatario                     | salimos a tu dirección hoy, atención al timbre           | WhatsApp + email |
| `goexpress_entregado_destinatario_v1`   | repartidor confirma entrega                          | destinatario                     | confirmación final, CTA tracking, CTA WhatsApp soporte   | WhatsApp + email |
| (sin template WA) solo email            | entrega fallida                                      | destinatario + remitente         | aviso de fallo, promesa de reintento                     | Email only       |
| (sin template WA) solo email            | problema operativo                                   | destinatario + remitente         | aviso genérico, equipo trabajando                        | Email only       |

Para detalle wizard Meta (header / body / footer / buttons / samples por template) ver `meta-templates-submission.md`.

---

Templates de notificación que recibe el **destinatario final del paquete** (y en eventos terminales el **remitente**, que es el cliente empresa de GO EXPRESS). No son para el cliente empresa en cambios intermedios: ahí sería spam y el `email.service.ts` ya lo evita por diseño (`013_envio_destinatario_email.sql`).

Todo el contenido respeta:
- Español rioplatense neutro Paraguay, con tildes y ñ obligatorios.
- Sin em dash, sin doble guion como separador, sin emojis decorativos.
- Variables en formato `{{snake_case}}` alineado con las columnas reales del schema (`envios.*`) y los campos del tipo `Envio` mapeado en `src/types/index.ts`.
- WhatsApp compliance: categoría Meta, header + body + footer + máx 1 button URL, sin lenguaje promocional, sin emoji en header.
- HTML responsive mobile-first, fallback plain-text incluido para cada email.

---

## Tabla resumen

| # | Evento | Status enum (`envio_estado`) | Canal Email | Canal WhatsApp | Canal SMS | Prioridad | Audiencia |
|---|--------|------------------------------|-------------|----------------|-----------|-----------|-----------|
| 1 | Envío creado | `pendiente` (al INSERT) | Sí | Sí | Sí | Alta | Destinatario |
| 2 | Retirado del remitente | `recolectado` | Sí | Sí | No | Media | Destinatario |
| 3 | En tránsito | `en_transito` | Sí | Sí | No | Baja | Destinatario |
| 4 | En depósito | `en_deposito` | Sí (gap, ver Next steps) | Sí | No | Baja | Destinatario |
| 5 | Sale a reparto | `en_reparto` | Sí | Sí | Sí | Alta | Destinatario |
| 6 | Entregado | `entregado` | Sí (2 destinatarios) | Sí | No | Alta | Destinatario + Remitente |
| 7 | Entrega fallida | `fallido` | Sí (2 destinatarios) | Email only | Sí | Alta | Destinatario + Remitente |
| 8 | Problema con el envío | `problema` | Sí | Email only | No | Alta | Destinatario |

SMS se reserva sólo para eventos con valor accionable inmediato del destinatario (creación con tracking, salida a reparto, fallido con CTA a reagendar). El resto es spam SMS.

---

## Variables disponibles por evento

Todas las variables salen del row de `envios` después del mapeo `mapEnvioRowToApi` (`src/services/envio.service.ts`). El dispatcher las recibe ya descifradas y resueltas (nombre, dirección, teléfono del destinatario están desencriptados in-process).

### Globales (siempre presentes en cualquier evento)

| Variable | Origen | Tipo | Ejemplo |
|----------|--------|------|---------|
| `{{tracking_number}}` | `envios.tracking_number` | string | `GE2026001234` |
| `{{tracking_url}}` | derivada: `https://goexpressparaguay.com/track?q={{tracking_number}}` | url | `https://goexpressparaguay.com/track?q=GE2026001234` |
| `{{destinatario_nombre}}` | `envios.destinatario_nombre` (desencriptado) | string | `María González` |
| `{{remitente_nombre}}` | `envios.cliente_nombre` | string | `Tienda Aurora SA` |
| `{{destino_ciudad}}` | `envios.destino` o `envios.destinatario_ciudad` | string | `Encarnación` |
| `{{empresa_nombre}}` | `configuracion.empresa.nombre` | string | `GO EXPRESS` |
| `{{empresa_telefono}}` | `configuracion.empresa.telefono` | string | `+595 21 555 0000` |
| `{{empresa_whatsapp}}` | derivada de `empresa_telefono` con formato wa.me | url | `https://wa.me/595215550000` |

### Específicas por evento

**`pendiente` (envío creado)**
- `{{origen_ciudad}}` desde `envios.origen`
- `{{eta_estimada}}` no existe en schema, omitir (ver gap en Next steps)

**`recolectado`**
- `{{fecha_recoleccion}}` desde `envios.recolectado_en` (ISO 8601, formatear server-side a `dd/MM/yyyy HH:mm`)

**`en_reparto`**
- `{{instrucciones_entrega}}` desde `envios.instrucciones_entrega` (opcional, sólo render si presente)
- `{{horario_entrega}}` desde `envios.horario_entrega` (opcional)
- `{{repartidor_nombre}}` desde `repartidores.nombre` JOIN por `envios.repartidor_id` (opcional, sólo render si presente)
- `{{monto_a_cobrar}}` desde `envios.monto_a_cobrar` (sólo si `envios.tipo_pago = 'contra_entrega'` y `monto_a_cobrar > 0`)
- `{{monto_a_cobrar_formato}}` derivada: `Gs ${monto.toLocaleString('es-PY')}`

**`entregado`**
- `{{fecha_entrega}}` desde `envios.fecha_entrega_real`
- `{{entregado_por_nombre}}` desde `envios.entregado_por_nombre` (firma de quien recibió, opcional)
- `{{monto_cobrado_formato}}` desde `envios.monto_cobrado` (sólo en COD)

**`fallido`**
- `{{motivo_fallido}}` desde `envios.entrega_notas` o `envios.problema_descripcion`, lo que esté presente
- `{{proximo_intento_texto}}` literal fijo: `Vamos a coordinar un nuevo intento en las próximas 24 horas hábiles.`

**`problema`**
- `{{problema_descripcion}}` desde `envios.problema_descripcion`
- `{{problema_fecha}}` desde `envios.problema_fecha`

**`en_deposito`**
- `{{deposito_ciudad}}` derivada de la zona logística (no está en schema, hardcodear como `destino_ciudad` por ahora, ver Next steps)

**`en_transito`**
- ninguna específica más allá de las globales

---

## 1. Envío creado (`pendiente`)

**Disparador:** `triggerNotification('envio_creado', envio)` en `envio.service.ts:609` después del INSERT.
**Gate:** `notificaciones_config.envio_creado = true`.
**Pre-requisito:** `envios.destinatario_email IS NOT NULL` para email. Para WhatsApp/SMS, `envios.destinatario_telefono` siempre existe (NOT NULL).

### Email

**Asunto:** `Tu pedido está en camino. Tracking {{tracking_number}}`

**Body HTML (responsive, mobile-first):**
```html
<!-- Header con isotipo {{empresa_nombre}}, gradient brand -->
<h1>Hola {{destinatario_nombre}}, tu pedido está en camino</h1>

<p>{{remitente_nombre}} registró un envío para vos a través de {{empresa_nombre}}.
Te vamos a ir avisando cada cambio de estado.</p>

<!-- Caja destacada con número de tracking -->
<div class="tracking-box">
  <span class="label">Número de tracking</span>
  <span class="value mono">{{tracking_number}}</span>
</div>

<!-- Tabla de datos -->
<table>
  <tr><td>Remitente</td><td>{{remitente_nombre}}</td></tr>
  <tr><td>Destino</td><td>{{destino_ciudad}}</td></tr>
  <tr><td>Estado</td><td><span class="badge badge-blue">Pendiente</span></td></tr>
</table>

<a class="cta" href="{{tracking_url}}">Rastrear envío</a>

<footer>
  <p>{{empresa_nombre}} Paraguay</p>
</footer>
```

**Plain-text fallback:**
```
Hola {{destinatario_nombre}},

{{remitente_nombre}} registró un envío para vos a través de {{empresa_nombre}}.
Te vamos a ir avisando cada cambio de estado.

Tracking: {{tracking_number}}
Destino: {{destino_ciudad}}
Estado: Pendiente

Seguilo acá: {{tracking_url}}

{{empresa_nombre}} Paraguay
```

### WhatsApp

**Categoría Meta:** UTILITY
**Nombre interno del template:** `goexpress_envio_creado_v1`
**Idioma:** `es_PY` (fallback `es`)

```
Header (text): Pedido confirmado
Body:
Hola {{1}}, {{2}} registró un envío para vos.

Número de tracking: {{3}}
Destino: {{4}}

Te vamos a ir avisando cada cambio de estado.

Footer: GO EXPRESS Paraguay
Button (URL, dynamic): Rastrear envío -> https://goexpressparaguay.com/track?q={{5}}
```

Mapeo de variables:
- `{{1}}` = `destinatario_nombre`
- `{{2}}` = `remitente_nombre`
- `{{3}}` = `tracking_number`
- `{{4}}` = `destino_ciudad`
- `{{5}}` = `tracking_number` (param del button URL dinámico)

### SMS

```
{{empresa_nombre}}: tu pedido {{tracking_number}} de {{remitente_nombre}} está registrado, destino {{destino_ciudad}}. Seguilo: {{tracking_url}}
```

Máximo 160 caracteres si todas las variables son cortas. Para tracking_url usar acortador (`goexp.py/{token}`) si supera el límite.

---

## 2. Retirado del remitente (`recolectado`)

**Disparador:** `triggerNotification('cambio_estado', envio)` en `envio.service.ts:788` cuando `envios.estado` pasa a `recolectado`.
**Gate:** `notificaciones_config.recolectado = true`.

### Email

**Asunto:** `Tu paquete está en camino. {{tracking_number}}`

```html
<h1>Hola {{destinatario_nombre}}, tu paquete fue retirado</h1>

<p>Pasamos a buscar el paquete donde {{remitente_nombre}}.
Ya está en nuestras manos y se está preparando para el envío.</p>

<div class="tracking-box">
  <span class="label">Número de tracking</span>
  <span class="value mono">{{tracking_number}}</span>
</div>

<table>
  <tr><td>Remitente</td><td>{{remitente_nombre}}</td></tr>
  <tr><td>Destino</td><td>{{destino_ciudad}}</td></tr>
  <tr><td>Estado</td><td><span class="badge badge-blue">Retirado del remitente</span></td></tr>
</table>

<a class="cta" href="{{tracking_url}}">Rastrear envío</a>
```

**Plain-text:**
```
Hola {{destinatario_nombre}},

Pasamos a buscar el paquete donde {{remitente_nombre}}.
Ya está en nuestras manos.

Tracking: {{tracking_number}}
Destino: {{destino_ciudad}}
Estado: Retirado del remitente

Seguilo acá: {{tracking_url}}
```

### WhatsApp

**Categoría Meta:** UTILITY
**Template:** `goexpress_recolectado_v1`

```
Header (text): Paquete retirado
Body:
Hola {{1}}, retiramos tu paquete donde {{2}}.

Tracking: {{3}}
Destino: {{4}}

Te avisamos cuando salga al próximo tramo.

Footer: GO EXPRESS Paraguay
Button (URL): Rastrear envío -> https://goexpressparaguay.com/track?q={{5}}
```

---

## 3. En tránsito (`en_transito`)

**Disparador:** `triggerNotification('cambio_estado', envio)` cuando pasa a `en_transito`.
**Gate:** `notificaciones_config.en_transito = true`.

### Email

**Asunto:** `Tu paquete está en tránsito. {{tracking_number}}`

```html
<h1>Hola {{destinatario_nombre}}, tu paquete está en tránsito</h1>

<p>Tu paquete ya salió hacia el centro de distribución. Pronto llega a tu zona.</p>

<div class="tracking-box">
  <span class="label">Número de tracking</span>
  <span class="value mono">{{tracking_number}}</span>
</div>

<table>
  <tr><td>Destino</td><td>{{destino_ciudad}}</td></tr>
  <tr><td>Estado</td><td><span class="badge badge-blue">En tránsito</span></td></tr>
</table>

<a class="cta" href="{{tracking_url}}">Rastrear envío</a>
```

**Plain-text:**
```
Hola {{destinatario_nombre}},

Tu paquete está en tránsito hacia {{destino_ciudad}}.

Tracking: {{tracking_number}}
Seguilo acá: {{tracking_url}}
```

### WhatsApp

**Categoría Meta:** UTILITY
**Template:** `goexpress_en_transito_v1`

```
Header (text): Paquete en tránsito
Body:
Hola {{1}}, tu paquete está en camino al centro de distribución de {{2}}.

Tracking: {{3}}

Te avisamos cuando salga a reparto.

Footer: GO EXPRESS Paraguay
Button (URL): Rastrear envío -> https://goexpressparaguay.com/track?q={{4}}
```

---

## 4. En depósito (`en_deposito`)

**Disparador:** actualmente **no cableado**. La transición `en_transito -> en_deposito` existe en `VALID_TRANSITIONS` (`envio.service.ts:48`) pero `notifKeyFor()` no contempla `en_deposito` y `email.service.ts` no tiene `sendEnDeposito()`. Ver Next steps.
**Gate sugerido:** agregar `notificaciones_config.en_deposito` con default `true`.

### Email

**Asunto:** `Tu paquete llegó al depósito de destino. {{tracking_number}}`

```html
<h1>Hola {{destinatario_nombre}}, tu paquete llegó al depósito</h1>

<p>Tu paquete está en nuestro depósito de {{destino_ciudad}}.
En las próximas horas hábiles lo asignamos a un repartidor.</p>

<div class="tracking-box">
  <span class="label">Número de tracking</span>
  <span class="value mono">{{tracking_number}}</span>
</div>

<table>
  <tr><td>Destino</td><td>{{destino_ciudad}}</td></tr>
  <tr><td>Estado</td><td><span class="badge badge-blue">En depósito</span></td></tr>
</table>

<a class="cta" href="{{tracking_url}}">Rastrear envío</a>
```

**Plain-text:**
```
Hola {{destinatario_nombre}},

Tu paquete llegó al depósito de {{destino_ciudad}}.
En las próximas horas hábiles lo asignamos a un repartidor.

Tracking: {{tracking_number}}
Seguilo acá: {{tracking_url}}
```

### WhatsApp

**Categoría Meta:** UTILITY
**Template:** `goexpress_en_deposito_v1`

```
Header (text): Paquete en depósito
Body:
Hola {{1}}, tu paquete llegó al depósito de {{2}}.

Tracking: {{3}}

En las próximas horas hábiles lo asignamos a un repartidor.

Footer: GO EXPRESS Paraguay
Button (URL): Rastrear envío -> https://goexpressparaguay.com/track?q={{4}}
```

---

## 5. Sale a reparto (`en_reparto`)

**Disparador:** `triggerNotification('cambio_estado', envio)` cuando pasa a `en_reparto`.
**Gate:** `notificaciones_config.en_reparto = true`.
**Notas:** el más alto valor accionable. Incluir monto COD si aplica.

### Email

**Asunto:** `Tu paquete sale a entrega hoy. {{tracking_number}}`

```html
<h1>Hola {{destinatario_nombre}}, tu paquete sale a entrega hoy</h1>

<p>El repartidor ya tiene tu paquete. Estate atento porque lo llevan a tu dirección.</p>

<div class="tracking-box tracking-box-green">
  <span class="label">Número de tracking</span>
  <span class="value mono">{{tracking_number}}</span>
</div>

<table>
  <tr><td>Destino</td><td>{{destino_ciudad}}</td></tr>

  {{#if instrucciones_entrega}}
  <tr><td>Instrucciones</td><td>{{instrucciones_entrega}}</td></tr>
  {{/if}}

  {{#if horario_entrega}}
  <tr><td>Horario</td><td>{{horario_entrega}}</td></tr>
  {{/if}}

  {{#if monto_a_cobrar_formato}}
  <tr><td>Pago contra entrega</td><td><strong>{{monto_a_cobrar_formato}}</strong></td></tr>
  {{/if}}

  <tr><td>Estado</td><td><span class="badge badge-green">En reparto</span></td></tr>
</table>

<a class="cta cta-green" href="{{tracking_url}}">Rastrear envío</a>

{{#if monto_a_cobrar_formato}}
<p class="note">Recordá tener el monto exacto preparado para agilizar la entrega.</p>
{{/if}}
```

**Plain-text:**
```
Hola {{destinatario_nombre}},

Tu paquete sale a entrega hoy. Estate atento porque lo llevamos a tu dirección.

Tracking: {{tracking_number}}
Destino: {{destino_ciudad}}
{{#if instrucciones_entrega}}Instrucciones: {{instrucciones_entrega}}{{/if}}
{{#if monto_a_cobrar_formato}}Pago contra entrega: {{monto_a_cobrar_formato}}{{/if}}

Seguilo acá: {{tracking_url}}
```

### WhatsApp

**Categoría Meta:** UTILITY
**Template:** `goexpress_en_reparto_v1` (aprobado en Meta 2026-05, body actualizado vs propuesta original).

```
Header (text): Tu paquete sale a entrega hoy
Body:
El repartidor ya tiene tu encomienda y lo lleva a tu dirección. 📦

Tracking: {{1}}
Dirección: {{2}}

Estate atento/a al timbre o llamada.

Footer: Go Express Paraguay
Button (URL, dynamic): Rastrear envío -> https://goexpressparaguay.com/track?q={{1}}
```

Mapeo de variables (real, post-aprobación Meta):
- `{{1}}` = `envio.trackingNumber`
- `{{2}}` = dirección destinatario compuesta (`envio.destinatarioDireccion` + barrio + ciudad, ver `whatsapp.service.ts buildDireccionDestinatario`)
- button `{{1}}` = `envio.trackingNumber`

Cambios respecto a la propuesta inicial:
- Quitamos saludo `Hola {{nombre}}`. El template Meta arranca directo.
- `paquete` → `encomienda` por preferencia de copy del cliente.
- `Destino: ciudad` → `Dirección: <calle, barrio, ciudad>` para que el destinatario reconozca la dirección concreta.
- Emoji 📦 al final de la primera línea (parte del body aprobado, no es variable).
- `Estate atento/a` con inclusivo.
- Variante COD `goexpress_en_reparto_cod_v1` NO registrada todavía. Si en algún momento se necesita, submitir aparte siguiendo el patrón.

### SMS

```
{{empresa_nombre}}: tu paquete {{tracking_number}} sale a entrega hoy en {{destino_ciudad}}. {{#if monto_a_cobrar_formato}}COD {{monto_a_cobrar_formato}}. {{/if}}Detalle: {{tracking_url}}
```

---

## 6. Entregado (`entregado`)

**Disparador:** `triggerNotification('entregado', envio)` cuando pasa a `entregado`. Único evento intermedio que dispara email **también al remitente** (`email.service.ts:333-377` ya lo hace).
**Gate:** `notificaciones_config.entregado = true`.

### Email destinatario

**Asunto:** `Envío {{tracking_number}} entregado`

```html
<h1>Tu envío fue entregado</h1>

<p>El paquete llegó a destino exitosamente. Gracias por confiar en {{empresa_nombre}}.</p>

<div class="tracking-box tracking-box-success">
  <span class="label">Número de tracking</span>
  <span class="value mono">{{tracking_number}}</span>
</div>

<table>
  <tr><td>Destino</td><td>{{destino_ciudad}}</td></tr>
  <tr><td>Destinatario</td><td>{{destinatario_nombre}}</td></tr>
  {{#if entregado_por_nombre}}
  <tr><td>Recibió</td><td>{{entregado_por_nombre}}</td></tr>
  {{/if}}
  {{#if fecha_entrega}}
  <tr><td>Fecha</td><td>{{fecha_entrega}}</td></tr>
  {{/if}}
  <tr><td>Estado</td><td><span class="badge badge-success">Entregado</span></td></tr>
</table>

<a class="cta" href="{{tracking_url}}">Ver detalle del envío</a>
```

**Plain-text destinatario:**
```
Tu envío fue entregado.

Tracking: {{tracking_number}}
Destino: {{destino_ciudad}}
{{#if entregado_por_nombre}}Recibió: {{entregado_por_nombre}}{{/if}}
{{#if fecha_entrega}}Fecha: {{fecha_entrega}}{{/if}}

Gracias por confiar en {{empresa_nombre}}.
```

### Email remitente (cliente empresa)

**Asunto:** `Envío {{tracking_number}} entregado a {{destinatario_nombre}}`

```html
<h1>Envío entregado exitosamente</h1>

<p>Hola {{remitente_nombre}}, confirmamos la entrega del envío que registraste.</p>

<table>
  <tr><td>Tracking</td><td>{{tracking_number}}</td></tr>
  <tr><td>Destinatario</td><td>{{destinatario_nombre}}</td></tr>
  <tr><td>Destino</td><td>{{destino_ciudad}}</td></tr>
  {{#if entregado_por_nombre}}
  <tr><td>Recibió</td><td>{{entregado_por_nombre}}</td></tr>
  {{/if}}
  {{#if monto_cobrado_formato}}
  <tr><td>Cobrado en entrega</td><td><strong>{{monto_cobrado_formato}}</strong></td></tr>
  {{/if}}
  <tr><td>Estado</td><td><span class="badge badge-success">Entregado</span></td></tr>
</table>

<a class="cta" href="{{tracking_url}}">Ver POD</a>
```

### WhatsApp destinatario

**Categoría Meta:** UTILITY
**Template:** `goexpress_entregado_destinatario_v1` (aprobado en Meta 2026-05, body actualizado vs propuesta original).

```
Header (text): ENTREGADO
Body:
Hola {{1}}, tu encomienda fue entregada con éxito. ✅

Footer: Gracias por usar Go Express!
Button 1 (URL, dynamic): Ver detalles -> https://goexpressparaguay.com/track?q={{1}}
Button 2 (URL, static):  Contactános  -> https://goexpressparaguay.com/whatsapp
```

Mapeo de variables (real, post-aprobación Meta):
- body `{{1}}` = `envio.destinatarioNombre`
- button 1 `{{1}}` = `envio.trackingNumber`
- button 2: URL estática, sin variables

Cambios respecto a la propuesta inicial:
- Header pasa a `ENTREGADO` (uppercase, sin emoji decorativo).
- Body de 1 variable, el emoji ✅ y el cierre `con éxito` son parte del template aprobado.
- `paquete` → `encomienda`.
- Footer pasa a `Gracias por usar Go Express!`.
- Se agrega **segundo botón estático** `Contactános` que apunta a `https://goexpressparaguay.com/whatsapp`. Ese path es un **redirect 307** en Vercel (`vercel.json` del repo raíz `GO EXPRESS/`) hacia `wa.me/595991600777?text=...`. Meta no permite `wa.me/*` directo en botones de template, por eso el indirect via dominio propio.

### WhatsApp remitente

**Categoría Meta:** UTILITY
**Template:** `goexpress_entregado_remitente_v1`

```
Header (text): Envío entregado
Body:
Hola {{1}}, confirmamos la entrega del envío {{2}} a {{3}} en {{4}}.

{{#if monto_cobrado_formato}}Cobrado en entrega: {{5}}.{{/if}}

Footer: GO EXPRESS Paraguay
Button (URL): Ver POD -> https://goexpressparaguay.com/track?q={{6}}
```

Nota: Meta no soporta condicionales en templates aprobados. Si hay COD, crear template paralelo `goexpress_entregado_remitente_cod_v1` con la línea de monto fija. Si no, usar el base.

---

## 7. Entrega fallida (`fallido`)

**Disparador:** `triggerNotification('fallido', envio)` cuando pasa a `fallido`. Notifica destinatario **y** remitente (`email.service.ts:258-302`).
**Gate:** `notificaciones_config.fallido = true`.

### Email destinatario

**Asunto:** `Intento de entrega fallido. {{tracking_number}}`

```html
<h1>Hola {{destinatario_nombre}}, no pudimos entregarte el paquete</h1>

<p>El repartidor intentó entregar el paquete pero no fue posible completar la entrega.
Nuestro equipo coordinará un nuevo intento.</p>

<div class="tracking-box tracking-box-warning">
  <span class="label">Número de tracking</span>
  <span class="value mono">{{tracking_number}}</span>
</div>

<table>
  <tr><td>Destino</td><td>{{destino_ciudad}}</td></tr>
  {{#if motivo_fallido}}
  <tr><td>Motivo</td><td>{{motivo_fallido}}</td></tr>
  {{/if}}
  <tr><td>Estado</td><td><span class="badge badge-warning">Entrega fallida</span></td></tr>
</table>

<p>{{proximo_intento_texto}}</p>

<a class="cta" href="{{tracking_url}}">Ver detalle</a>

<p class="note">Si querés coordinar el próximo intento o cambiar la dirección,
escribinos por WhatsApp al <a href="{{empresa_whatsapp}}">{{empresa_telefono}}</a>.</p>
```

**Plain-text destinatario:**
```
Hola {{destinatario_nombre}},

No pudimos entregar tu paquete en {{destino_ciudad}}.
{{#if motivo_fallido}}Motivo: {{motivo_fallido}}{{/if}}

{{proximo_intento_texto}}

Tracking: {{tracking_number}}
Detalle: {{tracking_url}}

Coordiná el próximo intento por WhatsApp: {{empresa_telefono}}
```

### Email remitente

**Asunto:** `Entrega fallida: {{tracking_number}}`

```html
<h1>No se pudo completar la entrega</h1>

<p>Hola {{remitente_nombre}}, el repartidor no pudo entregar el paquete a {{destinatario_nombre}}.
Se coordinará un nuevo intento.</p>

<table>
  <tr><td>Tracking</td><td>{{tracking_number}}</td></tr>
  <tr><td>Destinatario</td><td>{{destinatario_nombre}}</td></tr>
  <tr><td>Destino</td><td>{{destino_ciudad}}</td></tr>
  {{#if motivo_fallido}}
  <tr><td>Motivo</td><td>{{motivo_fallido}}</td></tr>
  {{/if}}
  <tr><td>Estado</td><td><span class="badge badge-warning">Entrega fallida</span></td></tr>
</table>

<a class="cta" href="{{tracking_url}}">Ver detalle</a>
```

### WhatsApp destinatario

**Categoría Meta:** UTILITY
**Template:** `goexpress_fallido_destinatario_v1`

```
Header (text): No pudimos entregarte el paquete
Body:
Hola {{1}}, intentamos entregar tu paquete {{2}} en {{3}} y no fue posible.

Vamos a coordinar un nuevo intento en las próximas 24 horas hábiles.

Si querés coordinarlo vos, escribinos al {{4}}.

Footer: GO EXPRESS Paraguay
Button (URL): Ver detalle -> https://goexpressparaguay.com/track?q={{5}}
```

### SMS destinatario

```
{{empresa_nombre}}: intento fallido en {{tracking_number}}. Coordinaremos nuevo intento. Reagendar: {{empresa_telefono}} o {{tracking_url}}
```

---

## 8. Problema con el envío (`problema`)

**Disparador:** `triggerNotification('problema', envio)` cuando pasa a `problema`.
**Gate:** `notificaciones_config.problema = true`.
**Nota:** estado abierto, requiere acción del equipo. El email debe explicar que el cliente no necesita hacer nada todavía.

### Email

**Asunto:** `Novedad con tu envío {{tracking_number}}`

```html
<h1>Hola {{destinatario_nombre}}, hay una novedad con tu envío</h1>

<p>Nuestro equipo está trabajando para resolverlo.</p>

<div class="tracking-box tracking-box-attention">
  <span class="label">Número de tracking</span>
  <span class="value mono">{{tracking_number}}</span>
</div>

<table>
  {{#if problema_descripcion}}
  <tr><td>Detalle</td><td>{{problema_descripcion}}</td></tr>
  {{/if}}
  <tr><td>Estado</td><td><span class="badge badge-attention">Con problema</span></td></tr>
</table>

<a class="cta" href="{{tracking_url}}">Rastrear envío</a>

<p class="note">Te contactaremos a la brevedad. Si necesitás ayuda inmediata, escribinos por WhatsApp al <a href="{{empresa_whatsapp}}">{{empresa_telefono}}</a>.</p>
```

**Plain-text:**
```
Hola {{destinatario_nombre}},

Hay una novedad con tu envío {{tracking_number}}.
{{#if problema_descripcion}}Detalle: {{problema_descripcion}}{{/if}}

Nuestro equipo está trabajando para resolverlo.
Te contactaremos a la brevedad.

Detalle: {{tracking_url}}
Ayuda inmediata: {{empresa_telefono}}
```

### WhatsApp

**Categoría Meta:** UTILITY
**Template:** `goexpress_problema_v1`

```
Header (text): Novedad con tu envío
Body:
Hola {{1}}, hay una novedad con tu envío {{2}}.

Nuestro equipo está trabajando para resolverlo. Te contactamos a la brevedad.

Si necesitás ayuda inmediata, escribinos al {{3}}.

Footer: GO EXPRESS Paraguay
Button (URL): Rastrear envío -> https://goexpressparaguay.com/track?q={{4}}
```

---

## Estilos CSS de referencia (email)

Mantener consistencia con el `baseTemplate()` de `email.service.ts`. Paleta:

| Token | Color | Uso |
|-------|-------|-----|
| Brand primary | `#0643F7` | Headers, CTAs neutros, badge informativo |
| Brand accent | `#C8E640` | Acento de header (gradient + barra) |
| Success | `#10B981` | Estado entregado |
| Warning | `#F59E0B` | Estado problema |
| Danger | `#EF4444` | Estado fallido |
| Reparto | `#97D700` | Estado en reparto |
| Text primary | `#1a1a2e` | Títulos |
| Text secondary | `#6b7280` | Body |
| Text muted | `#9ca3af` | Footer |
| Border subtle | `#eef0f4` | Separadores |
| Bg page | `#f0f2f5` | Background del email |
| Bg card | `#ffffff` | Background de la tarjeta principal |

Font stack: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. Mono para tracking: `'JetBrains Mono', SFMono-Regular, Consolas, monospace`.

Container: 520px max-width, 16px de border-radius, padding 40px 36px desktop, 24px 20px mobile.

---

## Política de canales

| Evento | Email | WhatsApp | SMS | Razón |
|--------|-------|----------|-----|-------|
| Envío creado | Sí | Sí | Sí | Primer contacto, alto valor de tracking |
| Recolectado | Sí | Sí | No | Informativo, no accionable |
| En tránsito | Sí | Sí | No | Informativo |
| En depósito | Sí | Sí | No | Informativo |
| En reparto | Sí | Sí | Sí | Accionable, alto riesgo de no estar en casa |
| Entregado | Sí (x2) | Sí (x2) | No | Confirmación, no accionable |
| Fallido | Sí (x2) | Sí (x2) | Sí | Accionable, requiere reagendar |
| Problema | Sí | Sí | No | Informativo, equipo gestiona |

WhatsApp solamente se envía a destinatarios que tienen `envios.destinatario_telefono` válido en formato `+595XXXXXXXXX` (usar `src/lib/phone.ts` para normalizar antes de enviar).

Frecuencia: 1 mensaje por evento, sin reintentos automáticos en caso de éxito Meta (Meta ya tiene retry interno). Si Meta devuelve error permanente (número inválido, opt-out), loggear y no reintentar.

---

## Gaps detectados en el codebase

1. **`en_deposito` sin notificación cableada.** El estado existe en el enum (`025_en_deposito_estado.sql`) y en `VALID_TRANSITIONS` pero ni `notifKeyFor()` (`envio.service.ts:207`), ni `notificaciones_config` (`024_notificaciones_config.sql`), ni `email.service.ts` lo contemplan. Cuando el envío pasa a `en_deposito` no se manda nada al destinatario.

2. **WhatsApp no cableado.** No hay cliente Meta Graph API ni Twilio. La key `whatsapp_enabled: false` en `configuracion.notificaciones` (vieja, de `001_schema.sql`) es legacy, ya no se lee. La nueva `notificaciones_config` (`024`) solo tiene flags email-bound.

3. **SMS no cableado.** Sin proveedor, sin servicio, sin schema flags.

4. **Branding multi-tenant inexistente.** GO EXPRESS hoy es single-tenant. La tabla `clientes` modela empresas que contratan envíos, no tenants del SaaS. `email.service.ts` hardcodea logo (`isotipo.png`), color `#0643F7`, dominio `goexpressparaguay.com`, copy `GO EXPRESS Paraguay`. Si en algún momento se vende el SaaS a un segundo operador logístico, esto no soporta white-label sin refactor.

5. **Acentos faltantes en templates existentes.** El `email.service.ts` actual escribe `transito`, `esta`, `numero`, `direccion`, `recibira` sin tildes. Conflicto directo con la política Spanish acentos obligatorios (memory `feedback_spanish_accents_mandatory.md`). Resend acepta UTF-8 sin problema. Hay que reemplazar.

6. **`EMAIL_FROM` no coincide con dominio canónico.** `.env` define `envios@goexpressparaguay.com` pero el sistema fuerza display name a `GO EXPRESS` siempre. Verificar que el dominio esté verificado en Resend antes de mandar a producción.

7. **`RESEND_API_KEY` vacía.** El servicio loggea warning y sigue sin enviar. En production esto silencia 100% de las notificaciones email.

8. **No hay schema de templates persistido.** Los HTML viven hardcoded en `email.service.ts`. Si quisieran editar copy sin redeploy, hace falta una tabla `notification_templates` con columnas `(evento, canal, asunto, body_html, body_text, version, activo)`.

9. **Sin tracking de delivery por mensaje.** El `triggerNotification` es fire-and-forget puro. No hay tabla `notification_log` con `(envio_id, evento, canal, destinatario, enviado_en, status, error)`. Imposible saber qué clientes recibieron qué notificaciones, o auditar quejas tipo "nunca me llegó nada".

10. **`{{eta_estimada}}` no existe en schema.** Mencioné la variable como deseable para el evento `pendiente`, pero la columna no existe en `envios`. Hay que decidir si se agrega (`envios.eta_estimada DATE`) o si se omite del template.

---

## Next steps de implementación

### Schema (nueva migración `031_notification_log.sql` y `032_notification_templates.sql`)

```sql
-- 031_notification_log.sql
CREATE TYPE notif_canal AS ENUM ('email', 'whatsapp', 'sms');
CREATE TYPE notif_evento AS ENUM (
  'envio_creado', 'recolectado', 'en_transito', 'en_deposito',
  'en_reparto', 'entregado', 'fallido', 'problema'
);
CREATE TYPE notif_status AS ENUM ('enviado', 'fallido', 'descartado');

CREATE TABLE IF NOT EXISTS notificaciones_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envio_id UUID NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
  evento notif_evento NOT NULL,
  canal notif_canal NOT NULL,
  destinatario TEXT NOT NULL,
  status notif_status NOT NULL,
  proveedor_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_log_envio ON notificaciones_log(envio_id, created_at DESC);
CREATE INDEX idx_notif_log_status ON notificaciones_log(status) WHERE status = 'fallido';

ALTER TABLE notificaciones_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon" ON notificaciones_log FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON notificaciones_log FOR ALL TO authenticated USING (false) WITH CHECK (false);
```

```sql
-- 032_add_en_deposito_to_notif_config.sql
UPDATE configuracion
SET value = jsonb_set(value, '{en_deposito}', 'true'::jsonb, true)
WHERE key = 'notificaciones_config';
```

Actualizar `src/lib/notificaciones.ts` para sumar `en_deposito: boolean` al tipo `NotificacionesConfig`, a `NOTIFICACIONES_KEYS`, a `NOTIFICACIONES_DEFAULTS` y a `parseNotificacionesConfig`.

### Services

1. **`email.service.ts`**: agregar `sendEnDeposito(envio: Envio)` siguiendo el patrón de `sendEnTransito`. Corregir tildes en todos los strings ya existentes. Reemplazar los HTML hardcoded por funciones que reciban variables y devuelvan el HTML compilado, dejando los strings finales en una sola sección.

2. **`envio.service.ts:207`**: sumar `case 'en_deposito': return 'en_deposito';` en `notifKeyFor()`. Sumar `case 'en_deposito': await emailService.sendEnDeposito(envio); break;` en el switch de `triggerNotification` (líneas 247-256).

3. **Nuevo `whatsapp.service.ts`**: cliente Meta Cloud API (`POST https://graph.facebook.com/v21.0/{phone-number-id}/messages` con `messaging_product: 'whatsapp'`, `type: 'template'`). Variables a `.env`: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`. Cada `send*` método dispara el template correspondiente con los `components` parametrizados según los `{{N}}` definidos arriba.

4. **Nuevo `sms.service.ts`**: cliente proveedor SMS local Paraguay (Tigo Business / Personal Business / Claro Empresas, o agregador internacional tipo Twilio si la cobertura LATAM funciona). Decidir proveedor antes de implementar, los códigos cortos PY son regulados.

5. **`envio.service.ts triggerNotification`**: extender el fire-and-forget para correr `Promise.allSettled([email.send, whatsapp.send, sms.send])` según la matriz de canales por evento, y persistir cada intento en `notificaciones_log`. Mantener fire-and-forget para no bloquear la HTTP response.

### Templates Meta (proceso manual previo a deploy WhatsApp)

Cada template WhatsApp listado arriba requiere:
1. Crear en Meta Business Manager > WhatsApp Manager > Message Templates.
2. Categoría: UTILITY (todos los listados arriba lo son).
3. Idioma: `es_PY`. Fallback `es`.
4. Esperar aprobación (24 a 48 horas, suele ser inmediato si la categoría está bien).
5. Guardar el `name` exacto en una constante por evento, ej. `WHATSAPP_TEMPLATES.envio_creado = 'goexpress_envio_creado_v1'`.

### Branding multi-tenant (decisión de Gaston)

Si GO EXPRESS se vende como SaaS a un segundo operador logístico, hace falta:
- Tabla `tenants (id, nombre_comercial, logo_url, color_primary, color_accent, dominio_tracking, email_from, whatsapp_phone_id, whatsapp_token)`.
- Foreign key `clientes.tenant_id` y `envios.tenant_id`.
- `email.service.ts` toma `tenant` como parámetro y reemplaza logo, colores, dominio, sender.
- WhatsApp Business Account por tenant.

Sin esa decisión, los templates siguen siendo single-tenant GO EXPRESS y la sección `{{empresa_*}}` se hidrata desde `configuracion.empresa` (key existente).

### Operación

- Conseguir `RESEND_API_KEY` para `goexpressparaguay.com` y poblar `.env`.
- Verificar dominio sender en Resend (DNS records SPF/DKIM).
- Definir proveedor SMS y abrir cuenta.
- Habilitar WhatsApp Cloud API en Meta Business Manager con número dedicado.
- Crear todos los templates WhatsApp listados y esperar aprobación antes de wirear el código.

---

## Setup Meta WhatsApp Cloud API

Esta sección describe los pasos exactos en Meta Business Manager para activar WhatsApp Cloud API y dejar los **6 templates** de utility aprobados antes de que el código empiece a despachar. Los eventos `fallido` y `problema` se notifican **solo por email** (decisión de producto, no se registran templates WhatsApp para esos estados).

**Pre-requisito Vercel:** el template `goexpress_entregado_destinatario_v1` incluye un botón estático `Contactános` que apunta a `https://goexpressparaguay.com/whatsapp`. Ese path debe existir como redirect en `vercel.json` del sitio público apuntando a `wa.me/595991600777?text=...`. Sin ese redirect Meta no aprueba el template (URL `wa.me/*` no se permite directo en botones).

**Contexto del código:**
- Cliente: `src/services/whatsapp.service.ts` (solo outbound, sin SDK).
- Orquestador: `src/services/notificaciones.service.ts` (fan-out email + WhatsApp en paralelo, persiste cada intento en `notificaciones_log`).
- Endpoint verification: `GET /api/public/webhooks/whatsapp` (responde con `hub.challenge` si el `hub.verify_token` matchea `META_WA_VERIFY_TOKEN`). `POST` devuelve 200 sin procesar nada (la app no consume inbound ni statuses por decisión explícita).
- Graph API version default: `v22.0` (configurable via `META_WA_GRAPH_VERSION`). La última versión estable al momento de implementación es `v25.0` (febrero 2026). Subir cuando los release notes muestren breaking changes que apliquen.

**Env vars requeridas (ver `.env.example`):**

| Variable | Origen | Notas |
|----------|--------|-------|
| `META_WA_TOKEN` | System User Token permanente | NO usar el temp 24h del Dashboard. Genera uno desde Business Settings > System Users > Add token. Permisos: `whatsapp_business_messaging` + `whatsapp_business_management`. |
| `META_WA_PHONE_NUMBER_ID` | Meta App > WhatsApp > API Setup | Es el `phone_number_id` (no el display number). |
| `META_WA_GRAPH_VERSION` | constante | Default `v22.0`. Hay que revisar y subir antes de que la versión actual entre en deprecation (~24 meses post release). |
| `META_WA_VERIFY_TOKEN` | string aleatorio que vos eligís | Debe ser idéntico en el código y en el campo "Verify Token" del Webhook de la app en Meta. Generar con `openssl rand -hex 32`. |

### Paso 1: crear la app en Meta for Developers

1. Ir a `https://developers.facebook.com/apps` con la cuenta personal de Gastón asociada a la Business Manager de GO EXPRESS.
2. Click "Create App" > tipo "Business" > nombre `GO EXPRESS Production`.
3. Asociar la app al Business Account de GO EXPRESS (no a una cuenta personal).

### Paso 2: agregar el producto WhatsApp

1. Dentro de la app, panel izquierdo, "Add products" > seleccionar **WhatsApp**.
2. Aceptar términos.
3. En "Getting Started" elegir la WhatsApp Business Account (WABA) existente de GO EXPRESS o crear una nueva si no existe.

### Paso 3: configurar el número de teléfono

1. WhatsApp > API Setup > "Add phone number".
2. Usar un número dedicado para notificaciones outbound (no el WhatsApp personal de operaciones). Recomendado: `+595 21 555 0000` o similar línea fija/empresa registrada a nombre de GO EXPRESS.
3. Verificar el número via SMS o llamada.
4. Una vez verificado, copiar el `Phone number ID` que aparece debajo. Este valor va a `META_WA_PHONE_NUMBER_ID`.

### Paso 4: generar System User Token permanente

1. Business Settings (`business.facebook.com/settings`) > Users > System Users > "Add" > rol Admin.
2. Click en el system user creado > "Add Assets" > seleccionar la WhatsApp Business Account de GO EXPRESS y darle acceso "Full control".
3. "Generate new token" > seleccionar la app GO EXPRESS Production > expiración "Never" > seleccionar permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
4. Copiar el token UNA SOLA VEZ y guardarlo. Va a `META_WA_TOKEN`. Si se pierde, hay que regenerarlo desde el mismo flujo (rota el valor en el `.env`).

### Paso 5: configurar el webhook (verification)

1. WhatsApp > Configuration > Webhook > "Edit".
2. Callback URL: `https://api.goexpressparaguay.com/api/public/webhooks/whatsapp` (ajustar al dominio real del backend).
3. Verify Token: el mismo string aleatorio que pusiste en `META_WA_VERIFY_TOKEN` (genera con `openssl rand -hex 32`).
4. Click "Verify and Save". Meta hace GET a la URL con `hub.verify_token` y `hub.challenge`. El endpoint del backend retorna el challenge si los tokens matchean.
5. Suscribirse a los webhook fields: dejar todos sin tildar (no procesamos inbound). Solo se necesita la verificación para activar la app. Si Meta no permite save sin al menos uno, tildar `messages` y dejar que el handler `POST` devuelva 200 silencioso.

### Paso 6: crear los 6 templates de utility

Ir a WhatsApp Manager (`business.facebook.com/wa/manage/message-templates`) > Create template. Para cada uno:

- **Category:** UTILITY
- **Name:** exactamente como está en la columna "Template Name" abajo (lowercase, snake_case)
- **Language:** Spanish (Paraguay) → código `es_PY`. Si la UI no lo expone, usar Spanish y luego cambiar el código a `es_PY` desde la vista de detalle. Fallback Spanish genérico (`es`) si Meta rechaza.
- **Header:** Text (sin variables; los emojis están permitidos en body, no en header)
- **Body:** copiar exacto del cuerpo definido en este doc, respetando los `{{1}}, {{2}}, ...`
- **Footer:** `Go Express Paraguay` (o `Gracias por usar Go Express!` solo para el template 6)
- **Buttons:** Call to Action URL dinámico apuntando a `https://goexpressparaguay.com/track?q={{1}}` con sample `GE2026001234`. El template 6 además incluye un segundo botón **estático** que apunta a `https://goexpressparaguay.com/whatsapp`.

| # | Template Name | Body (literal, ya aprobado) | Variables posicionales |
|---|---------------|------------------------------|------------------------|
| 1 | `goexpress_envio_creado_v1` | `Hola {{1}}, {{2}} registró un envío para vos.\n\nNúmero de tracking: {{3}}\nDestino: {{4}}\n\nTe vamos a ir avisando cada cambio de estado.` | {{1}}=destinatario, {{2}}=remitente, {{3}}=tracking, {{4}}=destino |
| 2 | `goexpress_recolectado_v1` | `Hola {{1}}, retiramos tu paquete donde {{2}}.\n\nTracking: {{3}}\nDestino: {{4}}\n\nTe avisamos cuando salga al próximo tramo.` | {{1}}=destinatario, {{2}}=remitente, {{3}}=tracking, {{4}}=destino |
| 3 | `goexpress_en_transito_v1` | `Hola {{1}}, tu paquete está en camino al centro de distribución de {{2}}.\n\nTracking: {{3}}\n\nTe avisamos cuando salga a reparto.` | {{1}}=destinatario, {{2}}=destino, {{3}}=tracking |
| 4 | `goexpress_en_deposito_v1` | `Hola {{1}}, tu paquete llegó al depósito de {{2}}.\n\nTracking: {{3}}\n\nEn las próximas horas hábiles lo asignamos a un repartidor.` | {{1}}=destinatario, {{2}}=destino, {{3}}=tracking |
| 5 | `goexpress_en_reparto_v1` | `El repartidor ya tiene tu encomienda y lo lleva a tu dirección. 📦\n\nTracking: {{1}}\nDirección: {{2}}\n\nEstate atento/a al timbre o llamada.` | {{1}}=tracking, {{2}}=dirección destinatario |
| 6 | `goexpress_entregado_destinatario_v1` | `Hola {{1}}, tu encomienda fue entregada con éxito. ✅` | {{1}}=destinatario |

Eventos `fallido` y `problema` **no se registran** como template WhatsApp. Notificación solo por email (decisión de producto: el detalle operativo cabe mejor en HTML largo y permite escalado interno sin saturar al cliente vía WhatsApp).

Sample values para cada placeholder al enviar a aprobación:
- destinatario → `María González`
- remitente → `Tienda Aurora SA`
- tracking → `GE2026001234`
- destino → `Encarnación`
- dirección destinatario → `Av. Mariscal López 1234, Villa Morra, Asunción`

Aprobación esperada: 24 a 48 horas para UTILITY bien formateado. Suele ser inmediato si no hay claims promocionales.

**Botón estático del template 6:** además del botón dinámico `Ver detalles` → `https://goexpressparaguay.com/track?q={{1}}`, agregar un segundo botón `Contactános` tipo **URL estático** con URL completa `https://goexpressparaguay.com/whatsapp`. Ese path es un redirect Vercel 307 hacia `wa.me/595991600777`, configurado en `vercel.json` del repo raíz del sitio público.

### Paso 7: poblar `.env` y deployar

Una vez aprobados los 6 templates y obtenido el token:

```env
META_WA_TOKEN=EAA...                       # System User Token permanente
META_WA_PHONE_NUMBER_ID=123456789012345    # del API Setup
META_WA_GRAPH_VERSION=v22.0
META_WA_VERIFY_TOKEN=                      # mismo valor que pusiste en el webhook
```

Reiniciar el API. El logger emite `[WA WEBHOOK]` y `[WA]` para diagnosticar.

### Paso 8: testing manual (curl)

Con un envío real en estado `pendiente` y un teléfono que tenga WhatsApp activo (idealmente un número whitelisted en testing antes de subir a producción con clientes reales), comprobar que el send funciona contra Meta directo:

```bash
# Sustituir TOKEN, PHONE_NUMBER_ID, RECIPIENT (formato 595XXXXXXXXX, sin +) y los samples.
curl -X POST "https://graph.facebook.com/v22.0/PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "595981123456",
    "type": "template",
    "template": {
      "name": "goexpress_envio_creado_v1",
      "language": { "code": "es_PY" },
      "components": [
        {
          "type": "body",
          "parameters": [
            { "type": "text", "text": "María González" },
            { "type": "text", "text": "Tienda Aurora SA" },
            { "type": "text", "text": "GE2026001234" },
            { "type": "text", "text": "Encarnación" }
          ]
        },
        {
          "type": "button",
          "sub_type": "url",
          "index": "0",
          "parameters": [
            { "type": "text", "text": "GE2026001234" }
          ]
        }
      ]
    }
  }'
```

Respuesta esperada (200):
```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "595981123456", "wa_id": "595981123456" }],
  "messages": [{ "id": "wamid.HBgM..." }]
}
```

Si el código del API ya está deployado, el flow end-to-end se testea creando un envío via `POST /api/admin/envios` o cambiando estado via `POST /api/admin/envios/:id/estado` con un envío real cuyo `destinatario_telefono` sea válido y esté en el rango whitelisted durante testing. Verificar luego:
```sql
SELECT evento, canal, status, destinatario, proveedor_message_id, error, created_at
FROM notificaciones_log
WHERE envio_id = '<envio_id>'
ORDER BY created_at DESC;
```

### Errores comunes en producción

- `131026 Re-engagement message`: el template no existe o no está aprobado en `es_PY`. Verificar nombre exacto + idioma.
- `131047 Re-engagement message`: la ventana de 24h se cerró, pero como mandamos templates de UTILITY esto solo aparece si el template fue downgrade a marketing por Meta.
- `131051 Unsupported message type`: payload mal formado, casi siempre `components` con tipo equivocado.
- `132001 Template name does not exist in the translation`: el nombre matchea pero el `language.code` no. Probar `es` como fallback si `es_PY` no funciona aún.
- `100 Invalid parameter`: el `to` viene con `+` o con espacios. El servicio lo limpia, pero si vino malformado de la DB, queda log fallido.
- `190 Invalid OAuth access token`: el System User Token expiró o fue revocado. Regenerar desde Business Settings.

### Limitaciones conscientemente fuera de scope

- No procesamos mensajes inbound. Si un destinatario responde al WhatsApp, queda sin respuesta automatizada. La operación tradicional via WhatsApp Business app o chatwoot lo absorbe por fuera.
- No consumimos delivery receipts (sent/delivered/read). El campo `proveedor_message_id` en `notificaciones_log` queda como pista para linkear manualmente si en el futuro se quiere agregar.
- No hay retry policy. Si Meta devuelve error, queda registrado y no se reintenta.
- No hay multi-tenant. El token y el phone_number_id son únicos para GO EXPRESS. Si se vende el SaaS a otro operador, refactor pendiente.
