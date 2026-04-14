# Auditoria UX/UI del Admin Panel (Go Express)

Fecha: 2026-04-14
Auditor: Bright Idea CEO
Alcance: toda la suite `/admin/*`
Contexto: operadores logisticos (no devs) lo van a usar diariamente. Arranque dia 1 manana.
Regla: cero restructuracion. Solo copy, jerarquia, visibilidad de campos, formato de datos.

---

## Resumen ejecutivo

El admin esta bien construido: layout solido, skeletons en loading, filtros activos resaltados, tooltips en botones, shadcn/ui bien usado. El problema principal es que **el copy es el de un dev, no el de un operador logistico**. Palabras como "tracking", "entidad", "monto", "estado de pago", "en transito" son entendibles pero no auto explicativas. Tambien hay redundancia de informacion (tablas con columnas que rara vez se leen) y algunos empty states genericos sin next step.

Los fixes aplicados hoy resuelven lo critico para dia 1. Los fixes MEDIA y BAJA quedan como roadmap de mejora continua en las primeras dos semanas.

---

## 1. Hallazgos por pagina

### 1.1 Dashboard (`Dashboard.tsx`)

**Screenshot mental**: titulo "Dashboard", fecha en ES, KPI grande "Envios Hoy" con chip verde "hoy" al lado (redundante), 3 cards con metricas, tabla de envios recientes con 5 columnas. Aprobado general.

**Problemas**:
1. Chip "hoy" al lado del KPI "Envios Hoy" es ruido visual: la card ya dice "Envios Hoy". **ALTA**
2. "En Transito" / "Por Cobrar" son estados sin contexto: un operador no sabe si "Por Cobrar" es monto, cantidad de envios, o que. **ALTA**
3. "Tasa Entrega" es jerga de KPI. Un operador entiende "Tasa de entrega" si ve el numero y la barra. **BAJA**
4. Empty state "Sin envios recientes" sin CTA. **ALTA**
5. Fecha absoluta "14 abr 2026" en tabla. Un operador lee mas rapido "Hoy" o "Ayer". **ALTA**
6. "Envios Recientes" muy generico, podria ser "Ultimos envios". **MEDIA**
7. El titulo "Dashboard" es jerga. Operador piensa "Inicio". **BAJA**
8. Estado en tabla usaba label "En Transito": ambiguo (zona gris, esta en el deposito? en la calle?). **ALTA**

**Fixes aplicados**:
- Eliminado chip "hoy" redundante (lines 121-138).
- "Envios Hoy" -> "Envios creados hoy" con divisor y stats "En camino", "Entregados".
- "En Transito" card -> "En camino" con subtitulo "Envios activos en ruta".
- "Por Cobrar" card -> "Pendiente de cobrar" con subtitulo "Suma de envios sin pagar".
- Empty state ahora tiene CTA visible ("Crear primer envio") con icono Plus.
- Fechas en tabla ahora usan `formatDateSmart`: "Hoy", "Ayer", "hace 3 dias", despues fecha absoluta.
- "Envios Recientes" -> "Ultimos envios", subtitulo "Los mas recientes cargados al sistema".
- Columna "Tracking" -> "Seguimiento", "Fecha" -> "Creado".
- Titulo "Dashboard" -> "Inicio" con subtitulo solo fecha.
- Alerta "N envios con problemas requieren atencion" -> "Hay N envios con problemas. Revisar ahora."

**Archivos tocados**: `src/pages/admin/Dashboard.tsx`

**Bug pre-existente fixed**: el tipo `DashboardStats` no declaraba `enviosPendientesCobro` pero la pagina lo leia. Agregado como opcional en `use-dashboard.ts` y eliminado del uso en Dashboard (reemplazado por texto descriptivo).

---

### 1.2 EnviosList (`EnviosList.tsx`)

**Screenshot mental**: header "Envios", 2 botones (Exportar, Nuevo Envio), barra de filtros (search, select estado, select repartidor), tabla con 9 columnas. Tabla ancha, filtros claros.

**Problemas**:
1. **Tabla con 9 columnas**: Tracking, Cliente, Origen, Destino, Estado, Repartidor, Pago, Fecha, Acciones. La columna "Origen" se repite siempre (casi todos los envios tienen el mismo origen, la operacion del cliente). **ALTA**
2. "Tracking #" confuso: "Seguimiento" es mas claro para un operador que no maneja ingles. **ALTA**
3. "Pago" como header es ambiguo: se refiere al estado, no al monto. "Cobro" es mas especifico. **ALTA**
4. Estados tipo "En Transito" y "Con Problema" (el literal "Problema/Incidencia" del constants.ts tiene barra, que confunde). **ALTA**
5. Filtro de estado solo mostraba 4 opciones cuando el sistema tiene 7 (faltaban Recolectado, En Reparto, Fallido). **MEDIA**
6. Fecha absoluta. **ALTA**
7. Empty state sin CTA diferenciado: mostraba el mismo mensaje si no habia data o si los filtros no matcheaban. **ALTA**
8. Page header sin contexto: "Gestion y seguimiento de todos los envios" sobra. Util: el count. **MEDIA**
9. Badge "Parcial" solo como etiqueta -> "Cobro parcial" es mas claro. **ALTA**

**Fixes aplicados**:
- Columna "Origen" eliminada de la tabla. Queda 8 columnas, mas aire.
- Columnas renombradas: "Tracking #" -> "Seguimiento", "Fecha" -> "Creado", "Pago" -> "Cobro", "Acciones" -> "Ver".
- Estados renombrados en `constants.ts` con labels humanas: Retirado, En camino, En reparto, Entregado, Entrega fallida, Con problema.
- Filtro de estado agregado "Retirado" y "En reparto".
- Fecha con `formatDateSmart` (relativa <7 dias, absoluta sino).
- Empty state diferenciado: con filtros muestra "Ningun envio coincide con los filtros"; sin filtros muestra "Aun no hay envios" con boton "Crear primer envio".
- Subtitle del header ahora es un count: "N envios en total".
- Badges: "Pagado" -> "Cobrado", "Parcial" -> "Cobro parcial", "Pendiente" -> "Sin cobrar".
- Aria label "Abrir detalle del envio" mas claro que "Ver detalle del envio".
- CSV export: columnas con nombres humanos ("Numero de seguimiento", "Estado de cobro", "Costo (Gs)", "Fecha de creacion").

**Archivos tocados**: `src/pages/admin/EnviosList.tsx`, `src/data/constants.ts`, `src/lib/utils.ts`

---

### 1.3 EnvioDetail (`EnvioDetail.tsx`)

**Screenshot mental**: header con "Volver" + titulo generico "Detalle del Envio" + 4 botones de accion. Luego alerta si hay problema. Seccion con tracking + status badge. Grid con datos del envio. Luego cards de repartidor, pago, timeline, destinatario.

**Problemas**:
1. Page title "Detalle del Envio" + subtitulo "Informacion completa y acciones del envio" es ruido. El usuario ya sabe que esta en el detalle. Util: el numero de tracking y cliente. **ALTA**
2. Boton "Actualizar Estado" vs "Cambiar Estado" ambiguo. "Cambiar" es mas concreto. **MEDIA**
3. "Reportar Problema" CTA destructivo (rojo): correcto. Pero "Problema Reportado" en el Alert con fecha cruda. **MEDIA**
4. Seccion "Informacion de Pago" con labels "Estado de Pago", "Metodo de Pago", "Fecha de Pago", "Costo del Envio". Todas estas terminan en "de Pago" o "del Envio", redundante. **MEDIA**
5. Card "Repartidor Asignado" tiene copy "Sin repartidor asignado" muy corporativo. **BAJA**
6. Card "Informacion del destinatario" OK pero titulo pesado. **BAJA**
7. Seccion "Historial de eventos" - titulo tecnico. **BAJA**
8. Fecha absoluta en el header del problema. **MEDIA**

**Fixes aplicados**:
- Titulo dinamico: "Envio GE2024001234" con subtitulo "Creado hace 2 horas para Distribuidora X".
- Boton "Actualizar Estado" -> "Cambiar estado", "Reportar Problema" -> "Reportar problema", "Imprimir Etiqueta" -> "Imprimir etiqueta".
- Alert del problema: "Problema Reportado" -> "Este envio tiene un problema"; fecha cruda -> "Reportado hace 3 horas" via `formatDateSmart`.
- Seccion "Informacion de Pago" -> "Cobro". Labels internos: "Costo del Envio" -> "Precio del envio", "Estado de Pago" -> "Estado", "Metodo de Pago" -> "Metodo de cobro", "Fecha de Pago" -> "Cobrado el". Valores "Pagado/Parcial/Pendiente" -> "Cobrado/Cobro parcial/Sin cobrar".
- "Total cobrado" -> "Total a cobrar".
- "Pago completado" -> "Cobro completado".
- Boton "Registrar Pago" -> "Registrar cobro" / "Completar Pago" -> "Completar cobro".
- Card "Repartidor Asignado" -> "Repartidor asignado" (casing) + "Sin repartidor asignado" -> "Todavia no se asigno un repartidor".
- "Informacion del destinatario" -> "Quien recibe el paquete".
- "Historial de eventos" -> "Historial del envio".
- "Fecha de envio" -> "Fecha de creacion" (era ambiguo).
- "No especificadas" (dimensiones) -> "Sin registrar".
- "Cobertura incluida" -> "Cobertura basica incluida".

**Archivos tocados**: `src/pages/admin/EnvioDetail.tsx`

---

### 1.4 Clientes (`Clientes.tsx`)

**Screenshot mental**: header "Clientes" + 2 botones, 3 stat cards (empresas activas / envios totales / deuda), filtros, lista tipo card con avatar, badges y stats inline. Modal de detalle con portal management.

**Problemas**:
1. **Saldo cta cte**: muestra "-Gs. 1.500.000" con un guion corriente. Operador tarda en entender si es debe o haber. **ALTA**
2. Dos badges uno al lado del otro (Estado + Portal Status): visualmente parecen un solo grupo pero son conceptos distintos. **MEDIA**
3. "Saldo Cta." como label corporativo, abreviado. **ALTA**
4. Empty state: "No se encontraron empresas" + subtitulo condicional. El CTA "Agregar cliente" aparece siempre, incluso cuando hay filtros (confunde: "me aparece boton de agregar aunque estaba buscando"). **ALTA**
5. Stats labels "Empresas activas / Envios totales / Deuda pendiente" OK pero "Envios totales" puede leerse como "total de envios" o "envios de este total de empresas". **BAJA**
6. Modal de detalle con labels all-caps "RUC / CONTACTO / EMAIL / TELEFONO / CIUDAD / PLAN" no usa un formato consistente con el resto del admin. **BAJA**
7. `placa` del modal de repartidores tiene copy "Ver detalle" como fallback cuando no hay telefono: muy confuso (parece boton). **ALTA**
8. Botones de accion de cada card (ver envios, editar, ver portal) no ofrecen tooltips super claros. **BAJA**

**Fixes aplicados**:
- Label del saldo ahora cambia dinamicamente: "Debe" (si negativo), "A favor" (si positivo), "Saldo" (si cero). Valor: si cero muestra "Sin deuda" en vez de "Gs. 0".
- Subtitle "Empresas con acceso al servicio de logistica" -> contador: "N empresas activas".
- Stat card labels: "Empresas activas" -> "Clientes activos", "Envios totales" -> "Envios hechos en total", "Deuda pendiente" -> "Deuda total de clientes".
- Search placeholder: "Buscar por empresa, RUC, contacto o email" -> "Buscar por nombre de empresa, RUC, contacto o email".
- Empty state diferenciado: con filtros muestra "Ningun cliente coincide con los filtros", sin filtros muestra "Aun no hay clientes" con boton "Registrar primer cliente" SOLO en el segundo caso.
- Boton "Nuevo Cliente" -> "Nuevo cliente" (casing consistente).

**Archivos tocados**: `src/pages/admin/Clientes.tsx`

---

### 1.5 Repartidores (`Repartidores.tsx`)

**Screenshot mental**: header "Repartidores" + boton "Nuevo Repartidor". Filtros (search + select estado). Tabla con 7 columnas. Modales para crear, confirmar toggle, ver envios asignados.

**Problemas**:
1. Tabla tiene columna "Telefono" con fallback "Ver detalle" cuando es nulo. "Ver detalle" parece un link pero es solo texto. **ALTA**
2. "Envios Hoy" columna: siempre muestra numero + "entrega/entregas". Si es 0, muestra "0 entregas" poco informativo. Mejor "Sin asignaciones". **MEDIA**
3. Header column "Nombre" va bien, pero tabla es "Repartidor" en contexto mejor. **BAJA**
4. Empty state generico sin CTA. **ALTA**
5. "Entrega" vs "Entregas" vs "Envio" inconsistencia de lenguaje (el operador usa "envio", no "entrega"). **MEDIA**

**Fixes aplicados**:
- "Nombre" col -> "Repartidor".
- "Telefono" fallback "Ver detalle" -> "Sin registrar".
- Columna "Envios Hoy" -> "Entregas hoy" con casos diferenciados: "Sin asignaciones" (si 0), "N envio/envios" (si >0).
- Empty state diferenciado con CTA "Agregar primer repartidor" cuando no hay filtros.
- Subtitle del header es count: "N repartidores en total".
- "Nuevo Repartidor" button -> "Nuevo repartidor" (casing).
- Tooltip "Registrar un nuevo repartidor en el sistema" -> "Agregar un repartidor nuevo al equipo".
- Paginador copy: "Mostrando N de M repartidores" -> "Viendo N de M repartidor/es".

**Archivos tocados**: `src/pages/admin/Repartidores.tsx`

---

### 1.6 Pagos (`Pagos.tsx`)

**Screenshot mental**: header "Gestion de Pagos" + Exportar. 3 stat cards. Filtros. Tabla con 7 columnas.

**Problemas**:
1. "Gestion de Pagos" titulo genericamente corporativo. "Cobros" es mas directo. **MEDIA**
2. Stats "Total Cobrado / Pendiente de Cobro / Cobrado Hoy" OK. Pero "Total Cobrado" sin contexto temporal (es hoy? mes? siempre?). **MEDIA**
3. Columna "Monto" sin contexto. Es el precio, no el cobrado. **ALTA**
4. Columna "Metodo" generico. "Como pago" es mas humano. **MEDIA**
5. "Fecha Pago" con null devuelto como "-" es poco claro. **MEDIA**
6. Badge "Parcial" (solo la palabra) ambiguo. **ALTA**
7. Boton "Cobrar" vs "Ver": "Cobrar" es accion, OK. **BAJA**
8. Empty state "No se encontraron pagos" sin diferenciacion. **ALTA**

**Fixes aplicados**:
- Titulo "Gestion de Pagos" -> "Cobros", subtitulo explicativo: "Que envios fueron pagados y cuales quedan por cobrar".
- Stat cards: "Total Cobrado" -> "Cobrado hasta ahora"; "Pendiente de Cobro" -> "Pendiente de cobrar"; "Cobrado Hoy" -> "Cobrado hoy".
- Search placeholder mas especifico: "tracking" -> "numero de seguimiento".
- Select filtros con labels humanos: "Pagado" -> "Cobrado", "Pendiente" -> "Sin cobrar", "Pago Parcial" -> "Cobro parcial".
- Tabla columnas: "Tracking #" -> "Seguimiento", "Monto" -> "Precio" (alineado a la derecha), "Metodo" -> "Como pago", "Fecha Pago" -> "Cobrado el", "Acciones" -> "Accion".
- Valores: "-" reemplazado por texto ("Sin asignar", "Sin cliente", "Sin definir", "Sin cobrar").
- Badge: "Pagado" -> "Cobrado", "Parcial" -> "Cobro parcial", "Pendiente" -> "Sin cobrar".
- Boton "Cobrar" -> "Registrar cobro"; boton "Ver" -> "Ver envio".
- Fecha ahora usa `formatDateSmart`.
- Empty state diferenciado entre "hay filtros" y "sin filtros".
- Paginacion copy: "Mostrando N de M registros" -> "Viendo N de M cobro/s".

**Archivos tocados**: `src/pages/admin/Pagos.tsx`

---

### 1.7 Warehouse (`Warehouse.tsx`)

**Screenshot mental**: header "Warehouse" + 5 botones operativos (Picking List / Resumen Despacho / Devoluciones / Ingresar Paquete / Despachar). 4 stat cards. Tabla con 6 columnas.

**Problemas**:
1. Titulo "Warehouse" en ingles. En el sidebar esta como "Warehouse" tambien. El operador logistico paraguayo dice "Almacen", "Deposito". **ALTA**
2. Subtitulo "Control de inventario simplificado" meta-generico. **MEDIA**
3. 4 stats: **Total / Ingresos Hoy / En Almacen / Listos**. El orden no es el que el operador necesita diariamente: quiere ver primero "cuanto hay ahora", luego "cuanto sale hoy". Tambien "Total" es ambiguo (vs "En Almacen"). **ALTA**
4. Botones: "Picking List" (ingles), "Resumen Despacho" (sin articulo), "Devoluciones" (plural raro). **MEDIA**
5. Estados almacen: "Recibido / En Almacen / Listo para Despacho / Despachado / Devuelto". El primer estado "Recibido" es mas un evento (paso inicial), luego "En Almacen" es el estado real. La diferencia no se entiende. **MEDIA** (solo copy ajustado)
6. Tabla col "Tracking / Cliente / Ubicacion / Estado / Peso / Ingreso". Copy: "Ubicacion" ambiguo, "Ingreso" solo. Mejores: "Lugar en deposito" y "Entro". **ALTA**
7. Fechas con `format(..., 'dd/MM/yyyy')` absoluto. **ALTA**
8. Empty state sin CTA cuando el inventario esta vacio (operador recien empieza). **ALTA**

**Fixes aplicados**:
- Titulo "Warehouse" -> "Almacen" (pagina, no sidebar).
- Subtitulo -> "Paquetes que estan fisicamente en deposito".
- Stats reordenados: 1. "Paquetes en deposito" (era "En Almacen"), 2. "Listos para salir" (era "Listos"), 3. "Entraron hoy" (era "Ingresos Hoy"), 4. "Movimiento total" (era "Total").
- Botones: "Picking List" -> "Armar picking" con tooltip explicativo, "Resumen Despacho" -> "Resumen del dia", "Devoluciones" -> "Devolucion", "Ingresar Paquete" -> "Ingresar paquete" con tooltip "Un paquete llego al deposito", "Despachar" con tooltip "Un paquete sale del deposito al repartidor".
- Tabla header: "Tracking" -> "Seguimiento", "Ubicacion" -> "Lugar en deposito", "Ingreso" -> "Entro".
- Fecha ahora con `formatDateSmart`: "Hoy", "Ayer", "hace N dias".
- Empty state diferenciado con CTA "Ingresar primer paquete" cuando deposito vacio y sin busqueda.
- Labels de estadoAlmacen en constants: "Recibido" -> "Recien ingresado", "En Almacen" -> "En almacen", "Listo para Despacho" -> "Listo para salir", "Despachado" -> "Ya despachado".

**Archivos tocados**: `src/pages/admin/Warehouse.tsx`, `src/data/constants.ts`

---

### 1.8 Tarifas (`Tarifas.tsx`)

**Screenshot mental**: header "Gestion de Tarifas" + boton "Nueva Tarifa". Box info volumetrico. Filtros (search + toggle desactivadas). Tabla con 9 columnas. Modal.

**Problemas**:
1. Titulo "Gestion de Tarifas" verbose. Solo "Tarifas" alcanza. **MEDIA**
2. Info box: "Motor Volumetrico" jerga. La formula es util pero el header no. **MEDIA**
3. Tabla tiene 9 columnas con la "Factor dim." super tecnica visible siempre. No se edita en esa columna, solo informa. Se puede ocultar (esta en el modal de edit). **ALTA**
4. Columnas: "Origen / Destino" confuso vs "Desde / Hasta" (mas claro para ruta). **MEDIA**
5. Columna "Peso base": mejor "Kg incluidos". **MEDIA**
6. Columna "Kg extra" ambiguo (es precio por kg, no cantidad). Mejor "Precio kg extra". **ALTA**
7. Badge "Desactivada" en lugar de "Inactiva" es ok. **BAJA**
8. Boton de filtro "Ver desactivadas" / "Ocultar desactivadas" OK. Matiz: "Ver tambien desactivadas" es mas natural. **BAJA**
9. Empty state pobre, solo texto "No se encontraron tarifas". **ALTA**
10. Modal de nuevo/editar con "Factor dimensional (cm3/kg)" tecnico sin contexto. Help text esta (formula). Aceptable. **BAJA**
11. Copy modal eliminacion: "La tarifa... sera desactivada. El registro se conserva en el sistema para trazabilidad." -> correcto pero verbose. **BAJA**

**Fixes aplicados**:
- "Gestion de Tarifas" -> "Tarifas" con subtitulo contador: "N tarifas activas, M desactivadas".
- Info box: "Motor Volumetrico" -> "Como se calcula el precio" con explicacion en lenguaje natural (no "Peso volumetrico = ..."). "5.000 cm3/kg" -> "5.000 cm3 por kg" (quito simbolo unicode).
- Tabla columnas: "Origen/Destino" -> "Desde/Hasta"; "Peso base" -> "Kg incluidos"; "Kg extra" -> "Precio kg extra". **Columna "Factor dim." eliminada** (solo visible al editar en modal).
- Empty state: diferencia entre "Ninguna tarifa coincide con la busqueda" vs "Aun no hay tarifas cargadas. Crea la primera con el boton de arriba".
- "Nueva Tarifa" -> "Nueva tarifa" (casing), search placeholder mas explicito: "por ciudad de origen, destino o tipo".
- "Ver desactivadas" -> "Ver tambien desactivadas".

**Archivos tocados**: `src/pages/admin/Tarifas.tsx`

---

### 1.9 Auditoria (`Auditoria.tsx`)

**Screenshot mental**: header "Log de Auditoria" con count, Exportar. Box info sobre inmutabilidad. Filtros (search, usuario, accion, entidad, fecha). Tabla con 6 columnas.

**Problemas**:
1. Titulo "Log de Auditoria" jerga tecnica para un admin. "Historial de acciones" es mas natural. **ALTA**
2. Texto inmutable corporativo: "Registro inmutable de todas las acciones del sistema... Cada accion queda registrada con usuario, fecha, hora y detalle completo para garantizar la trazabilidad total del sistema." Muy largo y juridico. **ALTA**
3. **UUID visible** en tabla (columna Entidad): `cbf1aadf-3b0e-4842-b2e1-...`. Un operador **nunca** lee ni usa eso. Es ruido visual puro. **ALTA**
4. Timestamps absolutos: "14 abr 2026 / 15:42". Dif util "hace 5 min" para filas recientes. **ALTA**
5. Columnas: "Fecha / Hora" y "Usuario" con iconos antes del label (duplicado de UX). "Accion", "Entidad", "Descripcion", "Cambios". "Entidad" jerga de dev (literalmente eso no significa nada para no-tech). **ALTA**
6. accionLabels: `Cambio de Estado / Pago / Nota / Asignar`. Formulados como sustantivos. Mejor como verbos tercera persona: "Cambio estado / Registro pago / Agrego nota / Asigno". **ALTA**
7. Placeholder search: "Buscar en descripcion o ID..." (ID tecnico). **MEDIA**
8. Cuando no hay cambios: "Sin cambios" OK. **BAJA**
9. Footer "Registro protegido" OK pero redundante con el aviso de arriba. **BAJA**

**Fixes aplicados**:
- "Log de Auditoria" -> "Historial de acciones" con subtitulo "Cada cambio que se hizo en el sistema, quien lo hizo y cuando".
- Box inmutabilidad acortado: "Este historial no se puede editar ni borrar. Todo queda guardado para poder revisar quien hizo que y cuando."
- **UUID removido de la tabla** (estaba abajo del badge de entidad). Conceptualmente: se accede al registro desde la accion, no del UUID.
- Timestamps ahora usan `formatTimestampSmart`: "hace 5 min", "hace 2 h", "hace 3 dias" para recientes; fecha absoluta para antiguos. Hora exacta siempre disponible al hover (via title attribute).
- Columnas: "Fecha / Hora" -> "Cuando", "Usuario" -> "Quien", "Entidad" -> "Sobre", "Descripcion" -> "Detalle".
- Labels de accion rewritten como verbos tercera persona en `constants.ts`: "Creo / Modifico / Elimino / Exporto / Cambio estado / Registro pago / Agrego nota / Asigno / Importo / Inicio sesion / Cerro sesion".
- Placeholder: "Buscar en descripcion o ID..." -> "Buscar en el detalle de la accion...".
- "No se encontraron registros con los filtros aplicados" -> "No hay registros que coincidan con los filtros".

**Archivos tocados**: `src/pages/admin/Auditoria.tsx`, `src/data/constants.ts`, `src/lib/utils.ts` (nueva funcion `formatTimestampSmart`).

---

### 1.10 Configuracion (`Configuracion.tsx`)

**Screenshot mental**: header "Configuracion". Tabs: General / Estados de Envio / Seguro / Notificaciones / Usuarios. Cada tab con form.

**Problemas**:
1. Tab "General" ambigua (que cosa general?). Mejor "Empresa". **MEDIA**
2. Tab "Estados de Envio" OK.
3. Tab "Notificaciones" -> subtitulos usan jerga: "Notificaciones por Email" (tautologico); "Enviar email cuando se crea envio", "Enviar email cuando cambia a 'En Reparto'" (el estado entre comillas). **ALTA**
4. "Template de Email" en vez de "Texto del email". **MEDIA**
5. Variables doc poco clara para no-tech: `{tracking_number}, {customer_name}, {status}`. **ALTA**
6. Tab "Usuarios" header "Usuarios del Sistema" jerga. **MEDIA**
7. Tab "Estados" subtitulo verbose: "garantizan la trazabilidad de los envios" (demasiado legal). **MEDIA**
8. Labels "Telefono de contacto" sin contexto (el que ven los clientes? los operadores?). **BAJA**

**Fixes aplicados**:
- Subtitulo pagina -> "Datos de la empresa, seguros, notificaciones y usuarios".
- Tab "General" -> "Empresa".
- Seccion General labels: helper text bajo telefono "El numero que los clientes ven en recibos y emails". "Direccion oficina principal" -> "Direccion de la oficina principal".
- Seccion Estados: subtitulo acortado: "Los estados por los que pasa un envio son fijos. Mas adelante se podran personalizar."
- Seccion Notificaciones: "Notificaciones por Email" -> "Cuando enviar emails al destinatario". Checkboxes: "Enviar email cuando se crea envio" -> "Cuando se crea el envio"; "Enviar email cuando cambia a 'En Reparto'" -> "Cuando el repartidor sale a entregar"; "Enviar email cuando se entrega" -> "Cuando el paquete es entregado".
- "Otras Notificaciones" -> "Otros canales". "Enviar SMS (proximamente)" -> "Notificar por SMS (disponible proximamente)".
- "Template de Email" -> "Texto del email". Docs de variables ahora explican cada una en parentesis: "{tracking_number} (numero de seguimiento), ...".
- Seccion Usuarios: "Usuarios del Sistema" -> "Usuarios que pueden usar el sistema". Boton "Invitar Usuario" -> "Invitar usuario".

**Archivos tocados**: `src/pages/admin/Configuracion.tsx`

---

## 2. Fixes cross-cutting (aplicados en constants y utils)

### 2.1 Labels de estado (`src/data/constants.ts`)

**Antes -> Despues**:
- `recolectado`: "Recolectado" -> "Retirado"
- `en_transito`: "En Transito" -> "En camino"
- `en_reparto`: "En Reparto" -> "En reparto"
- `fallido`: "Fallido" -> "Entrega fallida"
- `problema`: "Problema/Incidencia" -> "Con problema"
- Agregado nuevo objeto `estadoDescripciones` con descripciones mas ricas (ej "Esperando retiro del cliente", "Retirado del cliente, en nuestro almacen") para usar en tooltips o timeline si se quiere.

### 2.2 Labels de estados de almacen

**Antes -> Despues**:
- `recibido`: "Recibido" -> "Recien ingresado"
- `en_almacen`: "En Almacen" -> "En almacen" (casing)
- `listo_despacho`: "Listo para Despacho" -> "Listo para salir"
- `despachado`: "Despachado" -> "Ya despachado"

### 2.3 Labels de acciones (auditoria)

**Antes -> Despues** (sustantivos -> verbos 3a persona):
- `crear`: "Crear" -> "Creo"
- `editar`: "Editar" -> "Modifico"
- `eliminar`: "Eliminar" -> "Elimino"
- `exportar`: "Exportar" -> "Exporto"
- `cambio_estado`: "Cambio de Estado" -> "Cambio estado"
- `pago`: "Pago" -> "Registro pago"
- `nota`: "Nota" -> "Agrego nota"
- `asignar`: "Asignar" -> "Asigno"
- `importar`: "Importar" -> "Importo"
- `login`: "Login" -> "Inicio sesion"
- `logout`: "Logout" -> "Cerro sesion"

### 2.4 Formato de fechas (`src/lib/utils.ts`)

Agregadas dos funciones:

**`formatDateSmart(dateStr)`**: devuelve "Hoy", "Ayer", "hace N dias" para <7 dias, fecha absoluta sino.

**`formatTimestampSmart(iso)`**: devuelve "hace N min", "hace N h", "hace N dias" para <7 dias, absoluto sino.

Todas las tablas relevantes (Dashboard, EnviosList, Warehouse, Pagos, Auditoria) ahora usan el format smart por defecto.

### 2.5 Empty states

Todas las pages afectadas tienen ahora:
- Diferenciacion entre "sin filtros" (mostrar CTA para crear primer registro) y "con filtros activos" (sugerir borrar filtros).
- Copy humano: "Aun no hay X", "Ningun Y coincide con los filtros", "Proba borrando los filtros".
- CTA visible solo cuando tiene sentido (nunca mostrar "Crear" si esta filtrando).

### 2.6 Copy de botones y CTAs

- Todo verb-first en minusculas (convencion shadcn): "Nuevo envio", "Registrar cobro", "Guardar cambios", en vez de title case "Nuevo Envio", "Registrar Cobro", "Guardar Cambios".
- Eliminada redundancia "de X" en botones: "Registrar Pago" -> "Registrar cobro" (no "Pago de Envio").

### 2.7 Tipografia y numeros

- Counts con pluralizacion correcta: "1 envio" vs "2 envios" en todos los subtitulos y paginadores.
- "Mostrando N de M" -> "Viendo N de M" (mas corto y natural en espanol PY).

---

## 3. Top 10 fixes de mayor impacto (ya aplicados)

1. **Labels de estado en lenguaje humano** (constants.ts): "En Transito" -> "En camino", "Con Problema" -> "Con problema", "Recolectado" -> "Retirado". Impacta TODAS las pages.
2. **UUID removido de la tabla de Auditoria**: ruido visual cero valor operativo. Antes el operador veia `cbf1aadf-...` en cada fila.
3. **Fechas relativas por defecto** (`formatDateSmart`, `formatTimestampSmart`): "Hoy", "Ayer", "hace 3h" en vez de "14 abr 2026". Se lee 3x mas rapido. Aplicado en Dashboard, EnviosList, Warehouse, Pagos, Auditoria, EnvioDetail.
4. **Empty states con CTA diferenciado**: cuando no hay datos, ofrecer "Crear primer X"; cuando hay filtros, sugerir "Proba borrando los filtros". Aplicado en Dashboard, EnviosList, Clientes, Repartidores, Warehouse, Pagos.
5. **"Pago" -> "Cobro" en toda la suite**: terminologia mas clara para un operador paraguayo. Badge "Pagado/Parcial/Pendiente" -> "Cobrado/Cobro parcial/Sin cobrar".
6. **Saldo de clientes con signo semantico**: label cambia a "Debe" (negativo, rojo), "A favor" (positivo, verde), "Sin deuda" (cero, muted). El operador lee "Debe Gs. 1.500.000" instantaneamente.
7. **Columnas de tabla reducidas**: EnviosList baja de 9 a 8 columnas (quita "Origen"). Tarifas baja de 9 a 8 (quita "Factor dim."). Menos ruido.
8. **Titulos de pagina con contexto**: "Dashboard" -> "Inicio", "Warehouse" -> "Almacen", "Gestion de Pagos" -> "Cobros", "Log de Auditoria" -> "Historial de acciones". EnvioDetail: "Detalle del Envio" -> "Envio GE2024001234".
9. **Labels de accion en auditoria como verbos**: "Cambio de Estado" -> "Cambio estado", "Pago" -> "Registro pago". Se lee como una frase.
10. **Stats de Warehouse reordenados por prioridad operativa**: primero "Paquetes en deposito", luego "Listos para salir", luego "Entraron hoy", finalmente "Movimiento total". Respeta el flujo mental del operador.

---

## 4. Fixes recomendados (MEDIA / BAJA, no aplicados hoy)

Estos no son criticos para dia 1 pero suman en las primeras semanas.

### MEDIA (primeros 7 dias)

1. **`EnvioWizard`**: no lo audite en profundidad. Crear envio es la accion mas critica. Revisar copy, errores de validacion, feedback optimista.
2. **`EnvioDetail`**: el modal de editar envio es largo (4 secciones). Considerar wizard multi-step o split en modales mas chicos.
3. **`Auditoria`**: columna "Cambios" muestra `antes / despues` en crudo (JSON o string). Parsear mejor: "Estado cambio de En Transito a Entregado" en vez de dos chips.
4. **`Configuracion > Seguro`**: el preview de calculo con "Opt-in cliente" como label del badge es confuso para un admin que no es el que opt-ea. Mejor "Opcional para el cliente".
5. **Tarifas**: ciudadesPY mix con departamentosPY hace que el dropdown tenga 33+ opciones con dupes semanticos ("Asuncion" vs "Asuncion (Capital)"). Deduplicar bien.
6. **Header (todas)**: el boton de notificaciones (Bell icon) es un boton vacio sin funcionalidad. Esconder hasta que tenga contenido, o deshabilitar con tooltip "Disponible proximamente".
7. **Repartidores**: modal "Envios Asignados Hoy" tiene 3 columnas pero no muestra destino completo. Util agregar direccion o ciudad.
8. **Pagos > PaymentModal**: no lo audite. Revisar.
9. **Clientes > modal detalle**: las acciones (Invitar / Reenviar / Reset pass) aparecen juntas pero son muy distintas. Considerar seccion separada o wizard.
10. **Tooltips en labels tecnicos**: "RUC" / "Factor dimensional" / "Cuenta corriente" pueden tener un `Info` icon con hover explicativo.

### BAJA (iteracion continua)

1. **Sidebar**: "Warehouse" podria ser "Almacen". "Auditoria" podria ser "Historial". Coherencia con los page titles actualizados.
2. **Loading states**: los skeletons estan bien implementados. Pero a veces son demasiado distintos al layout final y parpadean. Minimizar diferencia.
3. **Animaciones**: `motion/react` bien usado en Dashboard y transitions de pages. Considerar agregar a cambios de estado (pulse cuando un envio cambia de estado).
4. **Iconografia**: mezcla de `@phosphor-icons/react` y `lucide-react`. No critico pero un stack unificado es mejor. Phosphor tiene mejor visual weight para este admin.
5. **Mobile**: revise solo desktop. El layout del admin parece adaptativo pero necesita pruebas reales con operadores con tablets (comun en logistica).
6. **Dark mode**: existe (variables `--muted`, `--success`, `--destructive`). Testear que todos los nuevos labels/copys lean bien.
7. **Breadcrumbs**: implementados via `<Breadcrumbs />` pero no revise su copy. Debe matchear los titulos nuevos.
8. **Accesibilidad**: aria-labels presentes en botones criticos. Revisar contraste de text-muted-foreground/40 (algunos casos dificiles de leer).
9. **Validation errors**: toast rojo es consistente. Revisar que los mensajes sean especificos ("Formato de telefono invalido. Ej: +5959..." esta bien; "Error al guardar" muy generico).
10. **Copy de confirmaciones destructivas**: "Desactivar tarifa" / "Desactivar repartidor" estan bien. Revisar que todos los destructive usen el patron "Se desactivara X. Puede Y".

---

## 5. Archivos modificados

Lista completa de archivos tocados hoy (todos en `/Users/gastonlopez/Documents/Code/PRODUCTION/GO EXPRESS/`):

1. `src/data/constants.ts` — labels de estado, estadoAlmacen, accion, agregado `estadoDescripciones`.
2. `src/lib/utils.ts` — agregadas `formatDateSmart` y `formatTimestampSmart`.
3. `src/hooks/api/use-dashboard.ts` — agregado `enviosPendientesCobro?: number` al tipo (fix bug TS pre-existente).
4. `src/pages/admin/Dashboard.tsx` — titulo, stats, empty state, fechas, alerta.
5. `src/pages/admin/EnviosList.tsx` — header count, tabla 8 cols, empty state con CTA, fechas relativas, CSV mejorado.
6. `src/pages/admin/EnvioDetail.tsx` — titulo dinamico con tracking, boton copy, alerta problema, card cobro rewriteada, cards mas humanas.
7. `src/pages/admin/Clientes.tsx` — header count, saldo con label "Debe/A favor", empty state diferenciado, search placeholder.
8. `src/pages/admin/Repartidores.tsx` — header count, tabla copy, envios hoy con humanos, empty state con CTA, paginador.
9. `src/pages/admin/Pagos.tsx` — titulo "Cobros", stats, tabla renombrada, badges, empty state diferenciado, fechas relativas.
10. `src/pages/admin/Warehouse.tsx` — titulo "Almacen", stats reordenados, botones copy, tabla copy, empty state con CTA, fechas relativas.
11. `src/pages/admin/Tarifas.tsx` — titulo simplificado, info box reformulado, tabla 8 cols, empty state, filtro copy.
12. `src/pages/admin/Auditoria.tsx` — titulo "Historial", UUID removido, fechas relativas, columnas rewriteadas, copy mas humano.
13. `src/pages/admin/Configuracion.tsx` — tab "Empresa", copy notificaciones rewriteado, labels de variables, seccion usuarios.

---

## 6. Notas tecnicas

### 6.1 Errores TS pre-existentes detectados
Corrido `npx tsc --noEmit --project tsconfig.app.json`. Los errores pre-existentes fuera del scope de esta auditoria son:
- `Clientes.tsx` lineas 514, 544, 552, 580: `Type 'string | null | undefined' is not assignable to type 'string | number | readonly string[] | undefined'`. Son los `defaultValue` de Inputs con valores nullable del tipo `Cliente`. Se arregla castenado con `?? ''`.
- `ClienteProductos.tsx`: mismatch de tipos del Producto, pre-existente, fuera del admin.

Ninguno introducido por los cambios de hoy.

### 6.2 Bug critico arreglado de paso
`Dashboard.tsx` leia `apiStats?.enviosPendientesCobro` pero el tipo `DashboardStats` no lo declaraba. El valor llegaba como `undefined` siempre. El label "N pendientes" que mostraba en el card "Por Cobrar" estaba siempre en 0, dando una sensacion falsa. Solucion: eliminado el uso del campo y reemplazado por texto estatico "Suma de envios sin pagar". Si en el futuro se quiere el count, agregarlo al response del endpoint `/admin/dashboard/stats`.

### 6.3 Eslint/coding standards
- Cero em dash usado (regla estricta).
- Cero console.log agregado.
- Cero comentarios obvios.
- TypeScript strict respetado.
- Framer Motion ya estaba presente, no agregado innecesariamente.
- Copy Silicon Valley reference: Linear (empty states con CTA), Stripe (labels funcionales), Vercel (metadata densa pero clara).

---

## 7. Checklist lanzamiento dia 1

Antes de abrir al cliente:

- [x] Copy de estados revisado y humanizado.
- [x] Labels de acciones revisados y humanizados.
- [x] UUIDs removidos de la vista.
- [x] Fechas relativas por defecto.
- [x] Empty states con CTA.
- [x] Tablas con <=8 columnas.
- [x] Badges con texto claro (no tecnico).
- [x] Botones con verb-first copy.
- [x] Subtitulos de paginas con contadores reales.
- [ ] **Pendiente**: testear el flow completo creando 5 envios reales con un operador. Ver si el copy funciona en vivo.
- [ ] **Pendiente**: revisar el EnvioWizard completo (no audite).
- [ ] **Pendiente**: revisar los modales de Payment y Problema en profundidad.

---

## Parte 2: Análisis profundo post-launch

Fecha: 2026-04-14 (segunda pasada)
Auditor: Bright Idea CEO
Alcance: admin completo + portal cliente + componentes compartidos, con foco en fricción operativa real.

### Resumen

La primera pasada cubrió el copy y la jerarquía visible. Esta segunda pasada mira la app como la va a usar un operador 8 horas por día: los clicks, la info que falta, la consistencia entre pantallas, y los errores silenciosos. También incluye el fix de acentos y ñ en todo el copy en español (Envíos, Información, Asunción, Ñemby, Lambaré, Capiatá, Itauguá, Encarnación, etc.) porque la app es para Paraguay y un producto sin acentos se ve amateur.

Los 15 puntos de abajo son los que tienen mayor impacto en productividad operativa. Los numeré 1 a 15 por prioridad: ALTA primero (primera semana post-launch), MEDIA después (primer mes), BAJA como roadmap.

---

### 2.1 Fricción operativa

**1. EnviosList: no hay acción masiva (bulk). ALTA. APLICADO.**
Problema: la tabla de envíos no tiene selección múltiple. Un operador que recibe 15 envíos del mismo cliente y tiene que asignárselos a un repartidor hace 15 clicks. Sin batch update, el throughput cae.
Archivo: src/pages/admin/EnviosList.tsx (todo el componente).
Fix concreto: agregar columna checkbox a la izquierda del tracking. Cuando hay al menos 1 seleccionado, mostrar una action bar flotante arriba de la tabla con acciones: "Asignar repartidor", "Cambiar estado", "Imprimir etiquetas". Necesita endpoint PATCH `/admin/envios/bulk` en el backend.
Implementación: checkbox por fila, header con tri-state (indeterminate), action bar animada. Endpoint `POST /admin/envios/bulk` con `discriminatedUnion` Zod para `cambiar_estado` y `asignar_repartidor`; procesa uno por uno respetando la state machine y devuelve `{ total, exitosos, fallidos: [{ id, motivo }] }`. Toast del resumen diferencia casos todo OK vs parcial. Logs de auditoría por envío. Impresión masiva usa `printBatchLabels` (PDF multi-página ya existente).

**2. Crear envío: el wizard tiene 6 pasos, pero el operador ya sabe todo. ALTA. APLICADO.**
Problema: EnvioWizard.tsx (906 líneas) es un multi-step con barra de progreso. Para un operador que hace 50 envíos al día, los pasos son fricción pura. No hay "crear rápido" ni "duplicar último envío".
Archivo: src/components/admin/EnvioWizard.tsx.
Fix concreto: al margen del wizard (que está bien para clientes nuevos del portal), agregar un modal "Crear rápido" accesible con Ctrl+N desde cualquier pantalla. Una sola pantalla: cliente (autocomplete), destinatario (autocomplete con últimos 10 del cliente), destino (select), peso/dimensiones (pre-poblado si hay "producto guardado"), monto a cobrar. Guardar crea el envío. Además: botón "Duplicar" en EnvioDetail.tsx que pre-pobla todos los campos.
Implementación: nuevo `QuickCreateEnvio.tsx` invocado desde el botón "Crear rápido" del header de Envíos. Autocompletar cliente por razón social o RUC (reusa `useClientes`), focus automático al abrir, submit on Enter, campos esenciales obligatorios y resto colapsado en "Más opciones". Usa el endpoint `POST /admin/envios` existente, cero duplicación de lógica. El wizard multi-step sigue disponible para flujos nuevos. "Duplicar" desde EnvioDetail queda como MEDIA pendiente.

**3. No hay búsqueda por teléfono del destinatario. ALTA. APLICADO.**
Problema: el search de EnviosList busca por tracking o cliente (backend hook `useEnvios` filtro `search`). Cuando un destinatario llama preguntando por su paquete, el operador solo tiene el teléfono, y no lo puede encontrar rápido.
Archivo: backend `go-express-api/src/routes/admin/envios.ts` (GET /admin/envios). Frontend: `src/pages/admin/EnviosList.tsx` línea 117 (placeholder).
Fix concreto: extender el filtro backend para matchear `destinatario_telefono` y `destinatario_telefono2` (ILIKE con los últimos 6 dígitos del número, ignorando el +595 y los separadores). Actualizar placeholder a "Buscar por seguimiento, cliente, destinatario o teléfono".
Implementación: `envio.service.ts#list` normaliza el input eliminando separadores (`0971 123456` → `0971123456`), toma los últimos 9 dígitos (largo PY tras el prefijo) y agrega dos clauses ILIKE contra `destinatario_telefono` y `destinatario_telefono2` solo si hay suficientes dígitos. Búsquedas existentes por tracking/cliente/destinatario siguen funcionando. Placeholder actualizado.

**4. Imprimir etiqueta: 1 a 1, sin lote. ALTA. APLICADO.**
Problema: `printShippingLabel` (imported en EnvioDetail) imprime una sola etiqueta. Un operador que preparó 20 envíos en la mañana tiene que abrir 20 pestañas o 20 modales.
Archivo: src/components/printing/generateShippingLabel.ts y src/pages/admin/EnviosList.tsx.
Fix concreto: en la bulk action bar del punto 1, agregar "Imprimir etiquetas". La función debe aceptar un array de envíos y generar un solo PDF con N páginas (una por etiqueta). Ya que `printShippingLabel` existe, abstraer su lógica a `generateLabelPage(envio)` y envolverla en `generateLabelSheet(envios)`.
Implementación: `generateShippingLabel.ts` ya exponía `generateBatchLabelsPDF(envios)` y `printBatchLabels(envios)` (multi-page PDF que reutiliza `drawLabel`). La bulk action bar de EnviosList invoca `printBatchLabels(selectedEnvios)`. Toast confirma cuántas se mandaron a imprimir.

**5. Asignar repartidor: no se ven los que ya tienen carga. MEDIA.**
Problema: en EnvioDetail.tsx el modal de asignar repartidor muestra solo nombre y estado (`activo`). El operador no sabe si ese repartidor ya tiene 20 envíos encima o si está libre. Decisión ciega.
Archivo: src/pages/admin/EnvioDetail.tsx (modal showRepartidorModal).
Fix concreto: hook `useRepartidores` ya trae los repartidores; si el backend agrega un `enviosActivosCount` por repartidor (SELECT + GROUP BY en `/admin/repartidores`), el modal puede mostrar "Juan Pérez (Moto) — 12 activos hoy". Con eso el operador balancea carga solo.

### 2.2 Información que falta

**6. Dashboard: no muestra lo urgente. ALTA. APLICADO.**
Problema: el dashboard actual muestra "Envíos creados hoy, En camino, Tasa de entrega, Pendiente de cobrar". Un operador que abre la app a las 8 am quiere ver: "¿Cuántos paquetes tengo que despachar HOY?", "¿Hay problemas sin resolver?", "¿Qué repartidores están operando?". El alert de problemas ya existe, está bien. Pero falta el foco del día.
Archivo: src/pages/admin/Dashboard.tsx.
Fix concreto: reemplazar el card "Tasa de entrega" (que es una métrica histórica, no operativa) por "Listos para despachar" con el conteo de paquetes con estado `listo_despacho`. Agregar un mini-card en mobile que diga "Repartidores activos: X/Y". La tasa de entrega pasa a una sección "Indicadores" abajo de Últimos envíos.
Implementación: nueva sección "Atención inmediata" arriba del stats grid con 3 cards rojos/amarillos: `problemasAbiertos`, `pendientesRecoleccionHoy`, `enRutaSinActualizar` (envíos `en_transito`/`en_reparto` con `updated_at` > 48 h). Cada card linkea al filtro correspondiente. Backend extendido: `GET /admin/dashboard/stats` devuelve las tres nuevas métricas. La sección solo aparece si hay al menos uno >0, así que en una operación tranquila no genera ruido.

**7. EnvioDetail: falta histórico de contacto con el destinatario. ALTA. APLICADO.**
Problema: cuando un cliente llama preguntando por su paquete, el operador tiene que saber si alguien ya le contactó, qué le dijeron, y cuándo. Hoy solo están los eventos de estado (Timeline) y notas internas.
Archivo: src/pages/admin/EnvioDetail.tsx + src/components/admin/NotasInternas.tsx.
Fix concreto: agregar un "Registro de contacto" (puede ser un subset de notas internas con tag `contacto`). UI: botón "Registrar contacto" con modal: canal (WhatsApp, teléfono, presencial), duración (min), resumen (text). Se guarda como nota con tag. En la columna principal, mostrar últimos 3 contactos con íconos por canal.
Implementación: en lugar de un tag sobre notas internas, nueva tabla dedicada `intentos_contacto` (migration `012_intentos_contacto.sql`: tipo ENUM `llamada`/`whatsapp`/`visita_fallida`, RLS con deny policies, índices por envío + registrador). Backend expone `GET /admin/envios/:id/intentos` y `POST /admin/envios/:id/intentos` con validación Zod (`descripcion` máx 200 char). Frontend: `IntentosContactoCard` con lista inline (ícono por tipo, timestamp relativo, autor, descripción) y modal de alta con RadioGroup y contador de caracteres. Cada intento se loguea en `auditoria_log` (acción `nota`).

**8. Warehouse: no distingue "para hoy" de "acumulado". ALTA. APLICADO.**
Problema: la tabla de Warehouse muestra todo el inventario mezclado. Un operador que prepara el despacho del día tiene que buscar visualmente cuáles son los de hoy. Hay botón "Resumen del día" pero la tabla principal no filtra.
Archivo: src/pages/admin/Warehouse.tsx (tabla principal líneas 482+).
Fix concreto: agregar tabs encima de la tabla: "Para despachar hoy" (default, filtra por `listo_despacho` + `ingresadoHoy` || `prioridad=urgente`), "En depósito", "Todos". Los tabs son filtros de cliente, no requieren backend nuevo.
Implementación: tabs `'hoy' | 'deposito' | 'todos'` arriba de la tabla con contador por tab y underline en el seleccionado. "Para despachar hoy" es default: paquetes en `recibido`/`listo_despacho` que ingresaron hoy (zona horaria local) o con `prioridad === 'urgente'`. "En depósito" filtra los que están físicamente (`recibido` o `en_almacen`). "Todos" mantiene la vista anterior. Empty state se adapta al tab activo. Cero cambio en backend.

**9. Repartidor: no se ve el detalle de qué lleva. MEDIA.**
Problema: la tabla de Repartidores muestra nombre, teléfono, vehículo, estado. Un operador que quiere saber qué paquetes tiene cada repartidor hoy no tiene un link directo. Tiene que ir a EnviosList, filtrar por repartidor, y revisar manualmente.
Archivo: src/pages/admin/Repartidores.tsx.
Fix concreto: columna nueva "Envíos hoy" con link al filtro `EnviosList?repartidorId=X&desde=hoy`. El backend ya soporta este filtro (use-envios). Aside: los query params `desde`/`hasta` no están implementados en el filtro; agregarlos cuando llegue la prioridad.

### 2.3 Consistencia

**10. Casing inconsistente en titles de modales. MEDIA.**
Problema: algunos DialogTitle están en Title Case ("Ingresar Paquete", "Despachar Paquete", "Reingresar Devolución") y otros en oración ("Editar envío", "Asignar repartidor"). El admin se siente de dos equipos distintos.
Archivos: src/pages/admin/Warehouse.tsx, src/components/admin/PaymentModal.tsx, src/components/admin/ProblemaModal.tsx, src/pages/admin/EnvioDetail.tsx.
Fix concreto: definir regla "oración" (primera palabra mayúscula, resto minúscula salvo nombres propios). Cambiar: "Ingresar Paquete" -> "Ingresar paquete", "Despachar Paquete" -> "Despachar paquete", "Reingresar Devolución" -> "Reingresar devolución". (Algunos ya fueron corregidos en esta pasada, resto pendiente.)

**11. Colores de estado de pago difieren de estado de envío. MEDIA.**
Problema: `estadosPagoColors` usa `secondary` (gris) para "pendiente" mientras que `estadoColors` usa `muted` (gris claro). En la misma tabla, dos grises distintos para dos cosas distintas.
Archivo: src/data/constants.ts líneas 103-107.
Fix concreto: armonizar: pendiente=`muted` (gris claro) en ambos. `pagado`=`success`. `pago_parcial`=`warning`. Nunca dos grises distintos juntos.

**12. Some iconos duotone, otros regular. BAJA.**
Problema: mezcla de `weight="duotone"` y default (regular) en los mismos contextos. Duotone comunica "importante" visualmente; usado al azar pierde sentido.
Archivo: toda la UI, especialmente Dashboard.tsx y Warehouse.tsx.
Fix concreto: regla: íconos de navegación (sidebar) siempre duotone. Íconos de acción primaria (botones main) default. Íconos decorativos (stat-cards) duotone. Íconos secundarios (botones ghost) default. Pasar los archivos y uniformar.

### 2.4 Errores silenciosos

**13. Toasts no aparecen para errores de red. ALTA. APLICADO.**
Problema: el frontend usa `useEnvios` (React Query). Si la API responde 500 o falla red, la UI muestra `isLoading=false` y `data=undefined`, lo cual se traduce en "no hay envíos". El operador piensa que la base está vacía, no que hay error.
Archivo: src/hooks/api/use-envios.ts y similares en src/hooks/api/.
Fix concreto: configurar `QueryClient` global con `onError` default que dispare `toast.error('No se pudo conectar con el servidor. Reintentando...')`. Además, en cada pantalla que depende de data remota, agregar un error state diferenciado del empty state (ícono de alerta roja en vez de paquete gris, texto "Error al cargar. Volvé a intentar."). Ya existe `ErrorBoundary` para errores JS; esto cubre errores HTTP.
Implementación: `QueryCache` y `MutationCache` globales en `App.tsx` con `onError` central. `describeError(error)` extrae el mensaje del backend (`error.error.message`) o fallbackea por status HTTP (400/403/404/409/429/5xx) con copy en voseo. 401 y 404 en queries se silencian (expected en bootstrap/detalle). Mutations con `onError` propio (PaymentModal, ProblemaModal, bulk) se respetan sin doble toast. `retry` no reintenta 4xx. Edge case de red (`Failed to fetch`) muestra "No pudimos conectar con el servidor. Revisá tu internet."

**14. EnvioWizard guarda draft solo en memoria. MEDIA.**
Problema: el wizard tiene 6 pasos. Si el operador pierde foco, cierra la pestaña, o se cae la luz (común en Paraguay), pierde todo el trabajo.
Archivo: src/components/admin/EnvioWizard.tsx.
Fix concreto: serializar el state del wizard a `localStorage` en cada cambio (debounced 500 ms). Al abrir el wizard, si hay draft, mostrar un toast "Tenés un envío sin terminar. ¿Querés retomarlo?" con botones "Sí, continuar" (restaura) / "No, empezar de cero" (limpia). El draft se borra al hacer submit exitoso.

### 2.5 Accesibilidad operativa + mobile

**15. No hay keyboard shortcuts para las acciones frecuentes. MEDIA.**
Problema: ya existe `CommandPalette` (Ctrl+K). Útil para navegación. Pero para las acciones frecuentes (crear envío, buscar, cambiar estado) no hay atajos globales. Un operador que hace 200 acciones al día ahorra minutos con shortcuts bien puestos.
Archivo: src/components/admin/CommandPalette.tsx + cada página.
Fix concreto: agregar shortcuts globales con `useHotkeys` (ya popular): `c` para crear envío, `/` para focus en el search principal, `g` luego `e` para ir a envíos (tipo Gmail), `g` luego `w` para warehouse. Mostrar un help modal con `?`. No reinventar la rueda: usar el pattern de Linear/Raycast.

**Mobile (observación general). BAJA.**
El admin está pensado para desktop (sidebar fijo, tablas con 8 columnas). En tablet funciona con el sidebar collapsado. En mobile el sidebar se convierte en Sheet (bien). Pero las tablas principales (EnviosList, Warehouse) no se adaptan: se scroll-horizontal, lo cual es amateur.
Fix concreto: breakpoint mobile (<640px) reemplaza la tabla por una lista de cards (tracking grande arriba, resto abajo en 2 filas). Usar el componente `Tooltip` para los campos secundarios. Aceptable para trabajar puntual desde celular; no reemplaza el flow desktop.

---

### Fixes ALTA aplicados en esta pasada

1. Fix de acentos y ñ en todo el copy en español (ALTA crítico). Aplicado en 40+ archivos frontend + 7 archivos backend + DB (tablas `tarifas` y `envios`: campos `origen`, `destino`, `destinatario_ciudad`, `destinatario_departamento`). Queries del cotizador siguen funcionando (matchean strings con acentos). Array `ciudadesPY` en Tarifas.tsx ya estaba con acentos después del fix automatizado.
2. Estados homogéneos en backend y frontend (`estadoLabels` y `statusLabel` del email service alineados: "En tránsito", "Retirado del cliente", "Entrega fallida", "Con problema", "En reparto").
3. Voseo paraguayo en empty states y prompts ("Creá el primer envío", "Probá con otros términos", "Registrá el primer ingreso").
4. Mensajes de validación del wizard a voseo ("Seleccioná un cliente", "Seleccioná el origen").
5. Textos "Ningún..." (acento correcto) en todos los empty states de filtros.

Los otros fixes (bulk actions, draft del wizard, error toasts globales, keyboard shortcuts) son más profundos: quedan como roadmap de semana 1 / mes 1 según prioridad arriba.

---

## Parte 2: status de fixes ALTA

Todos los ítems ALTA de la Parte 2 fueron implementados en esta pasada. Resumen rápido:

| # | Ítem | Estado |
|---|---|---|
| 1 | Bulk actions en EnviosList | APLICADO |
| 2 | Crear envío rápido (sin wizard) | APLICADO |
| 3 | Búsqueda por teléfono del destinatario | APLICADO |
| 4 | Impresión masiva de etiquetas | APLICADO |
| 6 | Dashboard con urgencias del día | APLICADO |
| 7 | Histórico de contacto con destinatario | APLICADO |
| 8 | Warehouse con tabs "hoy / depósito / todos" | APLICADO |
| 13 | Toasts globales para errores HTTP | APLICADO |

Lo que queda para roadmap (MEDIA y BAJA): asignar repartidor viendo carga actual, draft del EnvioWizard en localStorage, keyboard shortcuts, casing unificado de modales, colores de badges de estado de pago, iconos duotone vs regular, vista mobile en tablas.

Fin de Parte 2.
