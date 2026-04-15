# Auditoría UI Polish (Go Express)

Fecha: 2026-04-14
Auditor: Bright Idea CEO
Alcance: portal cliente (`/cliente/*`, `/portal/login`) y admin polish (`/admin/*`).
Contexto: ADMIN_UX_AUDIT.md Parte 1 y Parte 2 ya aplicado. Esta iteración es refinamiento premium: jerarquía, microcopy, fechas relativas, avatares, títulos dinámicos, 404 custom, empty states, voz consistente.
Regla: cero restructuración. Solo polish, copy, micro-interacciones.

---

## Resumen ejecutivo

El portal cliente estaba bien armado pero con voz genérica ("Registrar Nuevo Paquete", "Importación Masiva", "Dashboard") y muchos títulos en Title Case que hacen ver el producto como un dashboard SAP, no como un producto paraguayo premium. Fechas absolutas donde ya existía `formatDateSmart` (helper listo pero sin usar en cliente). Sin `document.title` dinámico. Avatar con una sola paleta (primary/8), perdiendo la lectura rápida de "quién soy". 404 básico. PortalLogin con copy formal ("Ingrese su contraseña") que no matchea el voseo paraguayo del resto.

Los 15 Quick Wins aplicados hoy cierran la brecha a un producto de estándar Linear/Stripe para el lanzamiento. El resto es roadmap incremental de las primeras dos semanas post-lanzamiento.

---

## Parte 1: Portal Cliente (hallazgos)

### 1.1 ClienteDashboard.tsx

1. **"Bienvenido · Resumen de operaciones" (linea 71-77)**: título sin personalidad, no usa el nombre real del cliente de forma protagonica. Un cliente se conecta 30 veces al mes, la primera pantalla debe reconocerlo.
   - **Mejora**: "Hola, {razonSocial}" con subtítulo "Así vienen los envíos de tu cuenta hoy".
   - Impacto: 5. Esfuerzo: S. **QUICK WIN APLICADO**.

2. **"Últimos Envíos" sin subtítulo de contexto (linea 133)**: tabla sin aire narrativo, parece un dump de SQL.
   - **Mejora**: agregar subtítulo "Los más recientes de tu cuenta" debajo.
   - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

3. **Fechas absolutas en tabla de últimos envíos (linea 185)**: `formatDate` devuelve "14 abr 2026"; un operador lee "Hoy" o "hace 2 horas" más rápido. El helper `formatDateSmart` ya existe en `lib/utils.ts` pero nadie en cliente lo usa.
   - **Mejora**: reemplazar `formatDate` por `formatDateSmart` en las dos apariciones (tabla y dialog).
   - Impacto: 4. Esfuerzo: S. **QUICK WIN APLICADO**.

4. **Empty state de tabla "Sin envíos recientes" (linea 170-173)**: una sola línea, sin ilustración, sin CTA, sin voz. Primera impresión cero para clientes nuevos.
   - **Mejora**: icono + título + copy cálido + CTA "Crear mi primer envío".
   - Impacto: 5. Esfuerzo: S. **QUICK WIN APLICADO**.

5. **Quick Actions con desc genéricas "Registrar paquete" "Carga masiva CSV" (linea 42-46)**: suenan a documentación técnica, no invitan a hacerlo.
   - **Mejora**: descripciones humanas, "Varios pedidos con CSV", "Calcular el costo antes", "Organizar los paquetes".
   - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

6. **Columna "Tracking" (linea 159)**: inglés en producto paraguayo, inconsistente con lo que ya se aplicó en admin (ADMIN_UX_AUDIT 1.2).
   - **Mejora**: "Seguimiento" + "Creado" para fecha.
   - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

7. **"Imprimir Etiqueta" casing Title Case (linea 244)**: rompe con el resto (sentence case).
   - **Mejora**: "Imprimir etiqueta".
   - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

### 1.2 ClienteEnvios.tsx

8. **"Mis Envíos · Segui el estado de todos tus paquetes" (linea 72-73)**: subtítulo repite lo obvio. Utilizar el count como subtítulo es más informativo (como en admin).
   - **Mejora**: subtítulo "{N} envíos en tu cuenta", fallback al copy original cuando N=0.
   - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

9. **Pills de estado en Title Case inconsistente: "En Reparto" "Fallido" (linea 21-28)**: mezcla de sentence y title. Operador cliente lee labels plurales ("Pendientes", "Entregados") más naturalmente porque selecciona conjuntos.
   - **Mejora**: pills en plural + sentence case: "Pendientes", "En camino", "En reparto", "Entregados", "Fallidos", "Con problema".
   - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

10. **Badges con label "En Reparto" "Problema" (linea 36-37)**: labels capitalizados inconsistentes.
    - **Mejora**: "En reparto", "Con problema".
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

11. **Empty state genérico "No se encontraron envíos" con subtítulo condicional (linea 161-177)**: un solo mensaje para tres casos distintos (búsqueda sin resultados / filtro vacío / cuenta vacía). El CTA solo aparece cuando `filterEstado === 'todos' && !searchTerm`, correcto, pero el copy podría guiar mejor los otros dos casos.
    - **Mejora**: tres copys diferenciados. Búsqueda: "Nada coincide con tu búsqueda" + hint de cómo buscar. Filtro: "Ningún envío en este estado" + hint a cambiar filtro. Cuenta vacía: "Todavía no tenés envíos" + CTA.
    - Impacto: 4. Esfuerzo: S. **QUICK WIN APLICADO**.

12. **Tabla con "Tracking" y "Fecha" (linea 127-133)**: mismo problema que dashboard.
    - **Mejora**: "Seguimiento" + "Creado".
    - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

13. **Paginación "Pagina 1 de 3 (42 envios)" (linea 181-183)**: faltan acentos, tipografia uniforme. Los números deberían estar en `font-data` (JetBrains Mono) para alineación tabular.
    - **Mejora**: "Página 1 de 3 · 42 envíos en total" con `font-data` en los números.
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

14. **"Nuevo Paquete" en CTA (linea 78)**: casing inconsistente, mejor "Nuevo envío" para matchear nomenclatura de admin.
    - **Mejora**: "Nuevo envío".
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

### 1.3 ClienteNuevoPaquete.tsx

15. **"Registrar Nuevo Paquete · Completa los datos del paquete para solicitar el envío" (linea 205-207)**: burocrático. "Nuevo envío" es más directo y matchea la nav.
    - **Mejora**: "Nuevo envío" + "Completá los datos del paquete y lo retiramos de tu depósito". Vende el servicio, no solo la acción.
    - Impacto: 4. Esfuerzo: S. **QUICK WIN APLICADO**.

16. **Section titles "Datos del Destinatario" "Detalles del Paquete" (linea 214, 277)**: corporate speak. El resto del producto ya usa "Quien recibe" (ADMIN_UX_AUDIT 1.3).
    - **Mejora**: "Quien recibe el paquete" + "El paquete".
    - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

17. **Toast "Paquete registrado exitosamente. Se generara tu número de tracking." (linea 191)**: "exitosamente" + "se generara" es muy formal. Falta acento.
    - **Mejora**: "Listo, tu paquete quedó registrado. Generamos el número de seguimiento en unos segundos."
    - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

18. **Toast de error "Error al registrar el paquete. Intenta nuevamente." (linea 194)**: formal y seco.
    - **Mejora**: "No pudimos registrar el paquete. Probá de nuevo en un momento."
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

19. **"Registrar Paquete" botón (linea 536)**: casing.
    - **Mejora**: "Registrar paquete".
    - Impacto: 1. Esfuerzo: S. **QUICK WIN APLICADO**.

20. **"Tamano del paquete" label con presets (linea 331)**: falta ñ. Acentos/ñ faltantes detectados en todo el archivo (`pequeno`, `tarificara`, `volumetrico`). Acordamos preservar los que no se tocaron en el audit previo, pero el `placeholder` de "Ej: Electronicos" se podría acentuar.
    - **Mejora**: revisar pase completo de acentos. Priorizar copy visible.
    - Impacto: 2. Esfuerzo: M. **ROADMAP** (no arriesgar encoding en pre-lanzamiento).

### 1.4 ClienteImportar.tsx

21. **"Importación Masiva · Carga multiples pedidos de una sola vez usando un archivo CSV" (linea 172-175)**: jerga enterprise. "Masiva" intimida; un operador chico puede pensar "no es para mí".
    - **Mejora**: "Importar paquetes" + "Cargá varios pedidos a la vez con un archivo CSV".
    - Impacto: 4. Esfuerzo: S. **QUICK WIN APLICADO**.

22. **Pasos "Como usar" (linea 187-193)**: casi todo bien, falta "Cómo" con tilde y voseo coherente ("Descarga" -> "Descargá", "Subi" -> "Subí").
    - **Mejora**: pase de voseo con tildes.
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

23. **Dropzone copy "Arrastra tu archivo CSV aqui" + "o hace clic para seleccionarlo" (linea 223-226)**: tuteo vs voseo, falta ñ.
    - **Mejora**: "Arrastrá tu archivo CSV acá" + "o hacé clic para elegirlo".
    - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

24. **"Importación exitosa! · Se importaron 5 envios correctamente. Go Express procesara..." (linea 240-242)**: exclamación corporativa, no se siente real.
    - **Mejora**: "Listo, recibimos tus pedidos" + copy más específico sobre el proceso.
    - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

25. **Stat chip "X validas" (linea 257)**: en jerga de importación "válido" es técnico. "Listas" comunica mejor que esa fila está buena para importar.
    - **Mejora**: "listas" en lugar de "validas".
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

26. **Errores granulares en tabla preview (linea 333)**: actualmente `errores.join(' . ')` con puntos como separador. Difícil de leer si una fila tiene 3 errores.
    - **Mejora**: lista vertical con bullets, o badge pills. El punto separador es confuso.
    - Impacto: 3. Esfuerzo: M. **MEJORA**.

### 1.5 ClienteCotizador.tsx

27. **"Cotizador de Envíos · Calcula el costo estimado de tu envío antes de crearlo" (linea 120-123)**: formal, mejor "Cotizador" a secas con subtítulo en voseo.
    - **Mejora**: "Cotizador" + "Calculá el costo estimado antes de crear el envío".
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

28. **Placeholder vacío "Completa el formulario · Los resultados de cotización apareceran aquí" (linea 245-247)**: tuteo + falta acento.
    - **Mejora**: voseo + copy extendido explicando dónde aparecen.
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

29. **Falta disclaimer debajo del resultado más económico (linea 316)**: un cliente puede asumir que el precio es final y reclamar si cambia. La info legal está en el banner inferior pero se pierde.
    - **Mejora**: pequeño disclaimer bajo el CTA "El precio final puede variar al verificar el paquete en depósito."
    - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

30. **Resultados sin animación de entrada**: cuando cotiza, los resultados aparecen sin stagger. Un fade-up con delay daría sensación premium.
    - **Mejora**: envolver en motion.div con stagger 0.06s entre cards.
    - Impacto: 2. Esfuerzo: M. **MEJORA**.

### 1.6 ClienteEtiquetas.tsx

31. **Input sin hint discoverable (linea 80-87)**: el user no sabe que puede apretar Enter. El hint dice "Presiona Enter" pero está en el bloque de etiquetas del form de NuevoPaquete, no acá.
    - **Mejora**: agregar hint con `<kbd>Enter</kbd>` debajo del input de nueva etiqueta.
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

32. **"No tienes etiquetas creadas aun · Crea tu primera etiqueta..." (linea 108-109)**: tuteo mixto y copy plano.
    - **Mejora**: voseo + copy con ejemplo concreto de para qué sirve.
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

33. **Sin colores reales en badges de etiquetas**: `colorToBadgeVariant` castea solo a 3 variantes (destructive/default/secondary). Si el backend soporta color custom, no se aprovecha.
    - **Mejora**: renderear badge con el color hex real con background alpha y texto saturado.
    - Impacto: 3. Esfuerzo: M. **MEJORA**.

### 1.7 ClienteCuenta.tsx

34. **"Mi Cuenta · Información de tu empresa y datos de contacto" (linea 99-100)**: casing + formal.
    - **Mejora**: "Mi cuenta" + "Los datos de tu empresa y contacto principal".
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

35. **Section titles "Datos de la Empresa" "Contacto Principal" (linea 108, 141)**: Title Case.
    - **Mejora**: sentence case.
    - Impacto: 1. Esfuerzo: S. **QUICK WIN APLICADO**.

36. **Toast "Datos actualizados correctamente" / "Error al actualizar los datos" (linea 67-70)**: corporate.
    - **Mejora**: "Listo, guardamos los cambios" / "No pudimos guardar los cambios. Probá de nuevo."
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

37. **Sin estadística de uso**: la cuenta de un cliente podría tener "Envíos este mes", "Total facturado", "Próximo corte" como info útil. Hoy la pagina es solo form de edición.
    - **Mejora**: agregar sección arriba con 3 stats + link a facturación (pendiente de backend de facturación).
    - Impacto: 4. Esfuerzo: L. **ROADMAP**.

### 1.8 ClienteProductos.tsx

38. **"Mis Productos · Productos guardados para agilizar..." (linea 136-137)**: casing + subtítulo puede ser más específico usando el count.
    - **Mejora**: subtítulo dinámico "N productos guardados para cargar envíos más rápido".
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

39. **"Ahorra tiempo en cada envío" banner (linea 148)**: tuteo, mejor voseo.
    - **Mejora**: "Ahorrá tiempo".
    - Impacto: 1. Esfuerzo: S. **QUICK WIN APLICADO**.

40. **Modal titulos "Nuevo Producto" / "Editar Producto" (linea 295)**: Title Case.
    - **Mejora**: sentence case.
    - Impacto: 1. Esfuerzo: S. **QUICK WIN APLICADO**.

41. **Empty state con copy plano (linea 251-265)**: las dos variantes (sin búsqueda / con búsqueda) tienen copy pobre.
    - **Mejora**: voseo + explicación del beneficio real de guardar productos.
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

42. **Delete confirmation muy escueto (linea 271-288)**: "Esta acción no se puede deshacer" sí, pero no recuerda al user qué producto va a borrar.
    - **Mejora**: mostrar nombre del producto en el mensaje: "Se va a eliminar {producto.nombre}. Los envíos ya creados con este producto no cambian."
    - Impacto: 3. Esfuerzo: S. **MEJORA**.

### 1.9 PortalLogin.tsx

43. **Copy formal castellano rioplatense "Ingrese su email/contrasena" (linea 53-58, 124, 142, 156)**: el resto del portal usa voseo. Primera impresión del producto no matchea con el interior.
    - **Mejora**: "Ingresá tu email", "Tu contraseña", "Credenciales inválidas. Revisá tu email y contraseña", "¿Todavía no tenés acceso? Pedile una invitación a tu contacto de GO EXPRESS".
    - Impacto: 4. Esfuerzo: S. **QUICK WIN APLICADO**.

44. **"Contrasena" sin ñ (linea 130, 142)**: errores de encoding que se arrastran.
    - **Mejora**: "Contraseña".
    - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

45. **Sin `document.title` en login (toda la pagina muestra el title default "Go Express Paraguay | Servicio de Courier...")**: el tab no dice "Portal de clientes".
    - **Mejora**: `document.title = 'Portal de clientes · GO EXPRESS'`.
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

---

## Parte 2: Admin polish (hallazgos nuevos, no redundantes con ADMIN_UX_AUDIT)

1. **Avatar con un solo tono** (Header.tsx linea 72, ClienteLayout.tsx linea 202): `bg-primary/8 text-primary` único. Al tener múltiples admins o al mirar el mismo nombre en distintos contextos, los avatares se vuelven indistinguibles.
   - **Mejora**: paleta de 8 colores, seleccionada por hash del nombre. Colores tintados que conviven con el brand primary.
   - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO** (nuevo `lib/avatar-color.ts`).

2. **`document.title` estático** (`index.html`): el tab siempre dice "Go Express Paraguay | Servicio de Courier...". No refleja en qué pantalla estás. Un operador con 6 tabs abiertos no encuentra el admin de envíos.
   - **Mejora**: useEffect en ambos Layouts setea `Sección · GO EXPRESS Admin` / `Sección · GO EXPRESS`.
   - Impacto: 4. Esfuerzo: S. **QUICK WIN APLICADO**.

3. **AnimatePresence sin respetar `prefers-reduced-motion`** (AdminLayout linea 80, ClienteLayout linea 251): page transitions hacen un y:3 -> y:0 con opacity. En macOS con reduce-motion activado esto ya se salteaba por defecto? No, `motion/react` no respeta `prefers-reduced-motion` salvo que uses el hook.
   - **Mejora**: `useReducedMotion()` + variant vacio cuando esté true.
   - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO**.

4. **Ausencia de `skip-link` para teclado** (AdminLayout, ClienteLayout): operador tabeando desde el inicio pasa por todos los items del sidebar antes de llegar al contenido. A11y 2.1 AA exige skip-link.
   - **Mejora**: utility CSS `.skip-link` que aparece al focusear.
   - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO** (utility agregada a `index.css`, pendiente de conectar en cada layout - **MEJORA**, queda el CSS listo).

5. **Premium-table sin sticky header** (index.css linea 311-337): en tablas largas (Envios 50+ filas) el usuario pierde los headers al scrollear.
   - **Mejora**: utility `.premium-table-sticky` agregada; aplicar opcionalmente en EnviosList/ClienteEnvios si la tabla es larga.
   - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO** (utility lista).

6. **Row focus ring en premium-table ausente**: tabear por una tabla no muestra qué fila está activa.
   - **Mejora**: `tr:focus-within` con ring subtle.
   - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

7. **Reduced-motion no aplicado a animate-pulse / animate-spin**: hay muchos skeletons con `animate-pulse` y spinners con `animate-spin` que no se suprimen con reduce-motion.
   - **Mejora**: media query global en index.css.
   - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

8. **404 page básica**: `NotFound.tsx` era 30 líneas de placeholder. Lanzamiento dia 1 cualquier typo en URL te llevaba a eso.
   - **Mejora**: página premium con 404 tipográfico animado, path visible para debug, 3 CTAs (volver, inicio, rastrear).
   - Impacto: 4. Esfuerzo: M. **QUICK WIN APLICADO**.

9. **ErrorBoundary copy genérico "Algo salio mal"** (ErrorBoundary.tsx linea 45-48): humano pero podría ser más cálido.
   - **Mejora**: "Algo se nos rompió acá" + "Ocurrió un error inesperado. Ya nos avisamos" (Sentry captura).
   - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

10. **"Cerrar Sesión" Title Case** en Header + ClienteLayout DropdownMenu: rompe sentence case.
    - **Mejora**: "Cerrar sesión".
    - Impacto: 1. Esfuerzo: S. **QUICK WIN APLICADO**.

11. **ClienteLayout sidebar-equivalent (top tabs) con mismas labels que admin**: "Dashboard", "Mis Envíos", "Nuevo"... inconsistentes con el producto (Dashboard es jerga).
    - **Mejora**: "Inicio", "Mis envíos", "Nuevo", sentence case.
    - Impacto: 2. Esfuerzo: S. **QUICK WIN APLICADO**.

12. **PortalLogin sin animate motion variants para el error**: aparece con `initial: {opacity: 0, height: 0}` que es correcto, pero no hay shake o emphasis.
    - **Mejora**: shake sutil X:[0,-4,4,-2,2,0] 0.3s en error.
    - Impacto: 1. Esfuerzo: S. **MEJORA**.

13. **Dashboard cliente stats sin animated counter**: el admin Dashboard ya usa `useAnimatedNumber` (Dashboard.tsx linea 46-48). Cliente dashboard no: los números aparecen estáticos.
    - **Mejora**: aplicar `useAnimatedNumber` a las 4 stats.
    - Impacto: 3. Esfuerzo: S. **MEJORA**.

14. **Importar CSV sin previsualización de columnas mapeadas**: user ve la tabla procesada pero no un snapshot de lo que interpretamos.
    - **Mejora**: antes de procesar, mostrar "Detectamos las columnas: nombre, teléfono, dirección, destino, peso, contenido" en un chip.
    - Impacto: 3. Esfuerzo: M. **MEJORA**.

15. **Toast position `bottom-right` para cliente** (sonner.tsx linea 10): en mobile bottom-right tapa el botón CTA principal. Desktop no hay issue.
    - **Mejora**: en mobile (sm:), posición `top-center`.
    - Impacto: 2. Esfuerzo: M. **MEJORA**.

16. **Avatar iniciales con dos primeras letras del string completo** (ClienteLayout linea 47-48): no toma la primera letra de cada palabra. "Guarani Capital" da "GU" en vez de "GC".
    - **Mejora**: función `getInitials(name, 2)` que separa por whitespace.
    - Impacto: 3. Esfuerzo: S. **QUICK WIN APLICADO** (nuevo helper en `lib/avatar-color.ts`).

17. **Loading skeleton de Suspense en AdminLayout no honra reduced-motion** (linea 87-96): `animate-pulse` siempre.
    - **Mejora**: queda cubierto por el media query global del index.css. **APLICADO**.

---

## Parte 3: Micro-interacciones (ideas)

1. **Avatar hash-based color**: el mismo cliente/admin siempre tiene el mismo color. Refuerza identidad. **APLICADO**.

2. **Animated counter en stats del ClienteDashboard**: números suben de 0 al valor real en ~600ms. Ya existe el hook. **PENDIENTE** (simple port).

3. **Stagger en recent shipments**: tabla actual aparece entera. Un stagger de 30ms por fila da sensación de "data cargando".
   - Dónde: `ClienteDashboard.tsx` tabla de últimos envíos.

4. **Success checkmark animation en Importar**: actualmente es un icono estático. Animar el path del CheckCircle con framer motion da feedback emocional.
   - Dónde: `ClienteImportar.tsx` bloque de importado exitoso.

5. **Toast de copy-to-clipboard**: al copiar un tracking, en lugar del toast text, un mini icono verde que aparece/desaparece inline. Ya existe `CopyButton` en admin; usar el mismo patrón en cliente.

6. **Pulse rojo en badges de problema**: envíos "Con problema" con un pulse sutil para que el operador/cliente los identifique sin leer.
   - Dónde: estados problema/fallido en todas las tablas. Utility `.status-pulse` ya existe en CSS.

7. **Smooth scroll en ScrollToTop de Layout**: ya usa `mainRef.current?.scrollTo({ top: 0 })` sin `behavior: 'smooth'`. Añadirlo.

8. **Hover preview de tracking en admin EnviosList**: al hover la row, un tooltip con mini-timeline del envio sin abrir el detalle.
   - Dónde: `EnviosList.tsx`. **MEJORA**.

9. **Keyboard shortcut discoverable**: admin ya tiene Cmd+K (CommandPalette). Falta mostrar hint en algún lado del header además del icono.
   - Dónde: `Header.tsx`. Hay kbd en desktop, OK. Agregar un toast informativo la primera visita. **ROADMAP**.

10. **Confetti sutil al marcar envío como entregado** (en admin EnvioDetail al cambiar estado). Usar una lib liviana o CSS keyframes de 5 partículas. **MEJORA**.

---

## Parte 4: Copy / voz (tabla antes / después)

| Lugar | Antes | Después | Aplicado |
|---|---|---|---|
| ClienteDashboard header | Bienvenido · Resumen de operaciones | Hola, {empresa} · Así vienen los envíos de tu cuenta hoy | SI |
| ClienteDashboard tabla | Últimos Envíos | Últimos envíos + Los más recientes de tu cuenta | SI |
| ClienteDashboard empty | Sin envíos recientes | Todavía no hay envíos + CTA + copy cálido | SI |
| ClienteDashboard quick | Registrar paquete | Registrar un paquete | SI |
| ClienteDashboard quick | Carga masiva CSV | Varios pedidos con CSV | SI |
| ClienteDashboard quick | Calcular costos | Calcular el costo antes | SI |
| ClienteDashboard quick | Descargar e imprimir | Organizar los paquetes | SI |
| ClienteEnvios header | Mis Envíos · Segui el estado... | Mis envíos · N envíos en tu cuenta | SI |
| ClienteEnvios pill | En Reparto | En reparto | SI |
| ClienteEnvios pill | Problema | Con problema | SI |
| ClienteEnvios table col | Tracking | Seguimiento | SI |
| ClienteEnvios table col | Fecha | Creado | SI |
| ClienteEnvios empty search | Probá con otros términos | Probá buscando por número de seguimiento, nombre del destinatario o ciudad | SI |
| ClienteEnvios CTA | Nuevo Paquete | Nuevo envío | SI |
| ClienteNuevoPaquete header | Registrar Nuevo Paquete · Completa los datos del paquete para solicitar el envío | Nuevo envío · Completá los datos del paquete y lo retiramos de tu depósito | SI |
| ClienteNuevoPaquete section | Datos del Destinatario | Quien recibe el paquete | SI |
| ClienteNuevoPaquete section | Detalles del Paquete | El paquete | SI |
| ClienteNuevoPaquete toast OK | Paquete registrado exitosamente. Se generara tu número de tracking. | Listo, tu paquete quedó registrado. Generamos el número de seguimiento en unos segundos. | SI |
| ClienteNuevoPaquete toast err | Error al registrar el paquete. Intenta nuevamente. | No pudimos registrar el paquete. Probá de nuevo en un momento. | SI |
| ClienteNuevoPaquete CTA | Registrar Paquete | Registrar paquete | SI |
| ClienteImportar header | Importación Masiva · Carga multiples pedidos... | Importar paquetes · Cargá varios pedidos a la vez con un archivo CSV | SI |
| ClienteImportar dropzone | Arrastra tu archivo CSV aqui · o hace clic para seleccionarlo | Arrastrá tu archivo CSV acá · o hacé clic para elegirlo | SI |
| ClienteImportar success | Importación exitosa! · Se importaron 5 envios correctamente. Go Express procesara... | Listo, recibimos tus pedidos · Se importaron 5 envíos. Los procesamos en las próximas horas y te notificamos cuando pasen a recolección. | SI |
| ClienteImportar stat | X validas | X listas | SI |
| ClienteImportar toast OK | X envíos importados correctamente | Listo, importamos X envíos | SI |
| ClienteImportar toast err | Error al importar los envíos. Intenta nuevamente. | No pudimos importar los envíos. Probá de nuevo. | SI |
| ClienteCotizador header | Cotizador de Envíos · Calcula el costo estimado de tu envío antes de crearlo | Cotizador · Calculá el costo estimado antes de crear el envío | SI |
| ClienteCotizador empty | Completa el formulario · Los resultados de cotización apareceran aquí | Completá el formulario · Los resultados de la cotización van a aparecer acá al apretar "Calcular cotización". | SI |
| ClienteCotizador disclaimer | (ausente) | El precio final puede variar al verificar el paquete en depósito. | SI |
| ClienteCuenta header | Mi Cuenta · Información de tu empresa y datos de contacto | Mi cuenta · Los datos de tu empresa y contacto principal | SI |
| ClienteCuenta section | Datos de la Empresa | Datos de la empresa | SI |
| ClienteCuenta section | Contacto Principal | Contacto principal | SI |
| ClienteCuenta CTA | Guardar Cambios | Guardar cambios | SI |
| ClienteCuenta toast OK | Datos actualizados correctamente | Listo, guardamos los cambios | SI |
| ClienteCuenta toast err | Error al actualizar los datos | No pudimos guardar los cambios. Probá de nuevo. | SI |
| ClienteEtiquetas section | Crear nueva etiqueta | Nueva etiqueta | SI |
| ClienteEtiquetas empty | No tienes etiquetas creadas aun · Crea tu primera etiqueta para organizar tus paquetes | Todavía no hay etiquetas · Creá tu primera etiqueta arriba. Sirven para filtrar envíos rápido, por ejemplo "Frágil" o "Cliente top". | SI |
| ClienteProductos header subtitle | Productos guardados para agilizar la creación de envíos | N productos guardados para cargar envíos más rápido | SI |
| ClienteProductos CTA | Nuevo Producto | Nuevo producto | SI |
| ClienteProductos CTA create | Crear producto | Crear mi primer producto | SI |
| ClienteProductos banner | Ahorra tiempo | Ahorrá tiempo | SI |
| ClienteProductos modal | Nuevo Producto / Editar Producto | Nuevo producto / Editar producto | SI |
| ClienteProductos CTA form | Crear Producto | Crear producto | SI |
| ClienteProductos CTA form edit | Guardar | Guardar cambios | SI |
| ClienteLayout dropdown | Mi Cuenta | Mi cuenta | SI |
| ClienteLayout dropdown | Cerrar Sesión | Cerrar sesión | SI |
| ClienteLayout nav | Dashboard | Inicio | SI |
| ClienteLayout nav | Mis Envíos | Mis envíos | SI |
| admin Header dropdown | Cerrar Sesión | Cerrar sesión | SI |
| PortalLogin header | Contrasena | Contraseña | SI |
| PortalLogin placeholder | Ingrese su contrasena | Tu contraseña | SI |
| PortalLogin error | Ingrese su email | Ingresá tu email | SI |
| PortalLogin error | Credenciales invalidas. Verifique su email y contrasena. | Credenciales inválidas. Revisá tu email y contraseña. | SI |
| PortalLogin hint | Si no tiene acceso al portal, solicite una invitacion a GO EXPRESS. | ¿Todavía no tenés acceso? Pedile una invitación a tu contacto de GO EXPRESS. | SI |
| ErrorBoundary title | Algo salio mal | Algo se nos rompió acá | SI |
| ErrorBoundary desc | Ocurrio un error inesperado. Podés intentar de nuevo o recargar la página. | Ocurrió un error inesperado. Ya nos avisamos. Probá recargar la página o volver a intentarlo en un momento. | SI |
| NotFound title | Página no encontrada | Este paquete se perdió en el camino | SI |
| NotFound desc | La página que buscas no existe o fue movida. Verifica la URL o volve al inicio. | La página que buscás no existe o fue movida. Si llegaste acá desde un link, avisanos y lo corregimos. Mientras tanto, podés volver al inicio o rastrear un envío. | SI |

---

## Parte 5: Top 15 Quick Wins aplicados

| # | Quick Win | Archivo(s) | Impacto | Estado |
|---|---|---|---|---|
| 1 | Document title dinámico por ruta (cliente + admin) | `components/cliente/ClienteLayout.tsx`, `components/admin/AdminLayout.tsx`, `pages/portal/PortalLogin.tsx`, `pages/NotFound.tsx` | 4 | APLICADO |
| 2 | Avatar con paleta hasheada por nombre (8 colores) + getInitials robusto | `lib/avatar-color.ts` (nuevo), `components/cliente/ClienteLayout.tsx`, `components/admin/Header.tsx` | 3 | APLICADO |
| 3 | 404 premium: 404 tipográfico animado + path visible + 3 CTAs + copy cálido | `pages/NotFound.tsx` | 4 | APLICADO |
| 4 | Fechas relativas (`formatDateSmart`) en ClienteDashboard y ClienteEnvios | `pages/cliente/ClienteDashboard.tsx`, `pages/cliente/ClienteEnvios.tsx` | 4 | APLICADO |
| 5 | Empty state del dashboard cliente con CTA "Crear mi primer envío" | `pages/cliente/ClienteDashboard.tsx` | 5 | APLICADO |
| 6 | Empty state diferenciado en ClienteEnvios (búsqueda / filtro / vacío) | `pages/cliente/ClienteEnvios.tsx` | 4 | APLICADO |
| 7 | Pase completo a sentence case + voseo en titulos, section headers, modals, CTAs, toasts | 8 archivos cliente + 1 error boundary | 4 | APLICADO |
| 8 | Columnas de tabla renombradas de "Tracking/Fecha" a "Seguimiento/Creado" | `pages/cliente/ClienteDashboard.tsx`, `pages/cliente/ClienteEnvios.tsx` | 3 | APLICADO |
| 9 | `useReducedMotion` respetado en AnimatePresence de ambos Layouts + media query global en CSS | `components/admin/AdminLayout.tsx`, `components/cliente/ClienteLayout.tsx`, `index.css`, `pages/NotFound.tsx` | 3 | APLICADO |
| 10 | Row focus-within y sticky header utility en premium-table | `index.css` | 2 | APLICADO |
| 11 | Kbd hint discoverable en ClienteEtiquetas input | `pages/cliente/ClienteEtiquetas.tsx` | 2 | APLICADO |
| 12 | Disclaimer debajo del CTA del cotizador | `pages/cliente/ClienteCotizador.tsx` | 3 | APLICADO |
| 13 | PortalLogin con voseo + acentos correctos + `document.title` | `pages/portal/PortalLogin.tsx` | 4 | APLICADO |
| 14 | ErrorBoundary con copy humano y cálido | `components/ErrorBoundary.tsx` | 2 | APLICADO |
| 15 | Paginación cliente con números en `font-data` y separador visual (punto medio) | `pages/cliente/ClienteEnvios.tsx` | 2 | APLICADO |

---

## Verificación

- `npx tsc --noEmit` frontend: limpio (sin output)
- `npx tsc --noEmit` backend: limpio (sin output)
- `npm run build`: OK (built in 9.36s)

---

## Archivos nuevos

- `src/hooks/use-document-title.ts`: hook reusable para setear title con restauración automática.
- `src/lib/avatar-color.ts`: paleta de 8 tonos + `getInitials` + hashing estable.

## Archivos modificados

- `src/components/admin/AdminLayout.tsx`: title dinámico + useReducedMotion.
- `src/components/admin/Header.tsx`: avatar hash-based + "Cerrar sesión".
- `src/components/cliente/ClienteLayout.tsx`: title dinámico + avatar + useReducedMotion + labels sentence case + "Mi cuenta" / "Cerrar sesión".
- `src/components/cliente/ClienteSidebar.tsx`: labels sentence case + "Inicio".
- `src/components/ErrorBoundary.tsx`: copy cálido.
- `src/index.css`: sticky table header utility + row focus ring + reduced-motion global + skip-link utility.
- `src/pages/NotFound.tsx`: rewrite premium.
- `src/pages/portal/PortalLogin.tsx`: voseo + acentos + document.title.
- `src/pages/cliente/ClienteDashboard.tsx`: copy, formatDateSmart, empty state con CTA, columnas renombradas, quick actions.
- `src/pages/cliente/ClienteEnvios.tsx`: copy, formatDateSmart, empty state diferenciado 3-way, pills plurales, columnas renombradas, paginación premium.
- `src/pages/cliente/ClienteNuevoPaquete.tsx`: header + section titles + toasts + CTA.
- `src/pages/cliente/ClienteImportar.tsx`: header + dropzone + success + toasts + voseo.
- `src/pages/cliente/ClienteCotizador.tsx`: header + empty state + disclaimer.
- `src/pages/cliente/ClienteCuenta.tsx`: header + section titles + CTA + toasts.
- `src/pages/cliente/ClienteEtiquetas.tsx`: header + section + empty state + kbd hint.
- `src/pages/cliente/ClienteProductos.tsx`: header dinámico + CTA + banner + modal + empty state.

---

## Hallazgos inesperados

1. **`formatDateSmart` ya existía en `lib/utils.ts` (linea 39-55) y nadie en cliente lo usaba**. El admin ya se pasó por el audit previo (ADMIN_UX_AUDIT 1.1 "Fechas en tabla ahora usan formatDateSmart"), pero nadie propagó al cliente. Tres sitios leyendo `formatDate` (2 en ClienteDashboard, 2 en ClienteEnvios). Fix: trivial, ya aplicado.

2. **`getInitials` duplicado localmente en ClienteLayout** (linea 47-48) tomaba las 2 primeras letras del string completo en lugar de primera letra de cada palabra. "Guarani Capital" => "GU" en vez de "GC". Era un bug latente. Fix: extraido a `lib/avatar-color.ts` con split correcto por whitespace.

3. **El `document.title` estaba congelado en el tag `<title>` de `index.html`**. Ninguna ruta del producto (admin, cliente, portal login) sobreescribía. Operadores con muchas tabs no podían distinguir pestañas. Fix: `useEffect` en ambos Layouts + PortalLogin + NotFound.

4. **`useReducedMotion` existe en `motion/react` pero no se usaba en ningún layout**. A11y 2.1 AA está comprometida. Fix: aplicado en ambos Layouts + NotFound + media query global como safety net para cualquier `animate-pulse`/`animate-spin` suelto.

5. **ClienteEtiquetas mapea cualquier color hex no "rojo/azul" a `secondary`** (linea 11-16): si el backend agregara soporte para color custom, la UI lo ignora. No es bug blocker (el producto hoy usa 2-3 colores fijos), pero es una oportunidad desperdiciada. **ROADMAP**.

6. **ClienteImportar errores join con ` . ` como separador** (linea 333): visualmente se lee como "error 1 punto error 2", confuso cuando hay 3+ errores en una fila. **MEJORA** (no aplicado para no cambiar funcionalidad de validación).

---

## Roadmap post-lanzamiento (primeras 2 semanas)

Ordenados por impacto / esfuerzo:

1. **ClienteDashboard stats con `useAnimatedNumber`** (ya existe el hook en admin). Impacto 3. Esfuerzo S.
2. **Toast `top-center` en mobile, `bottom-right` en desktop** (responsive fix). Impacto 2. Esfuerzo S.
3. **Errores granulares en ClienteImportar como lista** en lugar de ". "-separated string. Impacto 3. Esfuerzo M.
4. **Stagger de filas en tablas recientes** (ClienteDashboard + AdminDashboard). Impacto 2. Esfuerzo S.
5. **Confetti/celebracion sutil al entregar un envío** (admin EnvioDetail). Impacto 3. Esfuerzo M.
6. **Delete confirmation de productos/etiquetas con nombre del item**. Impacto 3. Esfuerzo S.
7. **Banner de "facturación / cuenta" en ClienteCuenta** con stats y link. Impacto 4. Esfuerzo L.
8. **Colores reales en badges de etiquetas** (usar hex del backend con alpha). Impacto 3. Esfuerzo M.
9. **Shake sutil en errores de PortalLogin**. Impacto 1. Esfuerzo S.
10. **Pulse en badges de problema** (utility `.status-pulse` ya existe). Impacto 3. Esfuerzo S.
11. **Skip link conectado a `main` en ambos Layouts** (utility ya en CSS). Impacto 2. Esfuerzo S.
12. **Premium-table con `.premium-table-sticky` opt-in en ClienteEnvios/EnviosList** (utility ya lista). Impacto 3. Esfuerzo S.
13. **Hover preview de tracking en EnviosList con mini-timeline**. Impacto 3. Esfuerzo M.
14. **Favicon con badge numérico cuando hay envios nuevos** (usar canvas + setFavicon). Impacto 3. Esfuerzo M.
15. **Notificaciones push del navegador para envíos con problema**. Impacto 4. Esfuerzo L.
