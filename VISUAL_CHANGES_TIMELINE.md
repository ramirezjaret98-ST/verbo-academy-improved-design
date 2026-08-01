# Visual Changes Timeline

Registro cronológico y objetivo de **todos los cambios visuales** aplicados a esta versión del proyecto (versión "con cambios"), para poder compararla contra la versión base sin cambios.

Reglas de este archivo:
- Es documentación pura. No afecta build, rutas, lógica ni datos.
- Cada nueva intervención visual se registra al final con fecha, qué se hizo y en qué archivo/componente exacto.
- No se registran aquí cambios de lógica de datos (esos van en `DATA_MODEL.md`).

Leyenda de alcance: `CSS` = tokens/utilidades globales · `COMP` = componente · `ROUTE` = archivo de ruta · `DEP` = dependencia.

---

## Entrada 001 — Auditoría de oportunidades de animación (Student Dashboard)
**Tipo:** análisis (sin cambios de código)
**Archivos revisados:** `src/routes/student.index.tsx`, `src/routes/student.tsx`, componentes UI compartidos.

Hallazgos priorizados:
| Oportunidad | Ubicación | Diagnóstico |
|---|---|---|
| Entrada del modal de rating | `RatingModal` | Aparición instantánea, sin transición de backdrop |
| Entrada/salida de banners | `AnnouncementBanner` | Aparece y desaparece de golpe, sin colapso de altura |
| Modal de detalles de sesión | `SessionDetailsModal` | Sin transición de entrada |
| Grid de próximas sesiones | `student.index.tsx` | Sin jerarquía temporal de aparición |

Descartados a propósito (para no dañar usabilidad):
- Dropdown de `TopNav` — uso muy frecuente (10+ veces/día), animar añade fricción.
- Filas de historial de sesiones — animar dificulta el escaneo de datos.
- Barras de rendimiento de assets — ya cuentan con transición de `width`.

---

## Entrada 002 — Implementación del sistema de animaciones
**Tipo:** cambio visual aplicado

### CSS — `src/styles.css`
Nuevas utilidades y keyframes con propósito definido:
- `@keyframes verbo-overlay-in` — fade de opacidad puro para backdrops.
- `@keyframes verbo-modal-in` — `opacity` + `scale(0.96)` + `translateY(8px)`, easing `cubic-bezier(0.23, 1, 0.32, 1)`.
- `@keyframes verbo-banner-out` — fade combinado con colapso de altura para el descarte de banners.
- `.verbo-press` — feedback táctil de 160 ms con `scale(0.97)` en botones.
- Regla en cascada: `.verbo-overlay-in > *:not(style)` dispara automáticamente `verbo-modal-in` en el panel hijo, evitando duplicar clases en cada modal.
- Overrides de `prefers-reduced-motion`: se elimina el movimiento (scale/translate) y se conserva solo el puente de opacidad.

Tokens de easing preexistentes respetados: `cubic-bezier(0.16, 1, 0.3, 1)` (`verbo-fade-up`) y `cubic-bezier(0.23, 1, 0.32, 1)` (`verbo-pop-in`).

### COMP — implementación puntual
- `RatingModal.tsx` — `verbo-overlay-in` en backdrop + `verbo-modal-in` en la tarjeta; `.verbo-press` en el botón de acción primaria.
- `SessionDetailsModal.tsx` — backdrop y panel envueltos en las animaciones de entrada.
- `BadgeUnlockCelebration.tsx` — `.verbo-overlay-in` en backdrop, `.verbo-modal-in` en la tarjeta, `.verbo-press` en el botón "Equip".
- `AnnouncementBanner.tsx` — entrada escalonada de 60 ms por banner; estado local `exiting` + timeout `EXIT_MS = 200 ms` para que la animación de salida termine antes de remover el anuncio del store (sin cambiar la lógica del store).

### COMP — aplicación masiva de `.verbo-overlay-in`
Contenedor principal actualizado en: `CantAttendModal`, `RatingTrendModal`, `CancelSessionFlow`, `CoreFreemiumFlow`, `PlanModal`, `NotificationsBell`, `ClubReservationModal`, `MaterialLibrary`, `ReportContentIssueModal`, `CertificateShareModal`, `ClubReportModal`, `ReportConductModal`.

**Impacto comparativo:** en la versión base todos estos overlays aparecen en un solo frame; aquí entran con fade + escala y respetan `prefers-reduced-motion`.

---

## Entrada 003 — Selección de librería UI para la Homepage
**Tipo:** análisis + decisión

Auditoría de `src/routes/index.tsx` (landing tipo bento) y `package.json`. Ya presentes: Radix UI (vía shadcn), Embla Carousel, Sonner.

Decisiones:
- **Adoptado:** `motion` (Framer Motion) para scroll reveal y stagger del bento.
- **Considerado, no adoptado:** NumberFlow (contadores), torph (texto animado del hero), base-ui (se mantiene Radix para evitar churn de dependencias).
- Hovers simples y reveals menores permanecen en CSS plano.

---

## Entrada 004 — Scroll reveal con Motion en la Homepage
**Tipo:** cambio visual aplicado

### DEP
- Instalado `motion@12.43.0`.

### ROUTE — `src/routes/index.tsx`
- Eliminada la lógica manual de `IntersectionObserver` y el enfoque `data-reveal` / `.verbo-reveal`, reemplazados por variantes declarativas de Motion.
- `revealGroup`: `staggerChildren: 0.07`, `delayChildren: 0.05`.
- `revealItem`: de `opacity: 0, y: 24` a `opacity: 1, y: 0`.
- Contenedor bento convertido a `motion.div` con `whileInView="visible"` y `viewport={{ once: true, amount: 0.18 }}`.
- `BenefitCard` ahora acepta prop `variants` y usa `motion.div`; se eliminaron los `delay` hardcodeados en favor del stagger del padre.
- Sección CTA de cierre ("Your team is one conversation away"): titular, párrafo y botón entran en secuencia con las mismas variantes.
- Accesibilidad: `useReducedMotion()` de `motion/react` — con motion reducido se elimina el offset `y` y la duración baja a 200 ms (fade de opacidad puro).

**Verificación:** screenshot con Playwright (`/tmp/browser/home/bento.png`) tras 4000 ms de espera por el preloader; cascada del bento confirmada.

---

## Entrada 005 — Auditoría Apple Design del Student Panel
**Tipo:** análisis (sin cambios de código)

| Prioridad | Área | Hallazgo |
|---|---|---|
| 🔴 | Agencia | Entrada bloqueada por 3 modales apilados (badges + rating) |
| 🟠 | Jerarquía | Tres tarjetas hero (azul/naranja/verde) compiten por atención |
| 🟠 | Tipografía | Números display (`0%`, `92%`) sin ajuste óptico de tracking/leading |
| 🟡 | Materialidad | `TopNav` opaco; oportunidad de material translúcido (`backdrop-filter: blur`) |
| 🟡 | Feedback | Botones sin estado `:active` (`.verbo-press`) |
| 🟡 | Transiciones | Secciones del dashboard saltan en vez de hacer cross-fade |

Decisión del usuario: **no** tocar el punto 🔴 (los modales de entrada tienen una razón de ser), **no** quitar la ilustración del robot, y ejecutar únicamente colores de tarjetas + números display. El resto queda pendiente.

---

## Entrada 006 — Jerarquía de tarjetas hero y tipografía display
**Tipo:** cambio visual aplicado

### ROUTE — `src/routes/student.index.tsx`

Jerarquía cromática:
- Tarjeta **naranja** de "Level Progress" se mantiene como único elemento saturado (protagonista).
- Tarjeta de **Attendance**: de gradiente full-bleed a superficie tintada suave usando `color-mix` con los colores del tema (tinte 14–26 % sobre blanco). Mejora la legibilidad del robot y baja el ruido visual.
- Tarjeta **navy** de "Current Level" conservada como elemento oscuro estructural.

Tipografía:
- `tracking-[-0.03em]` y `leading-[1.05]` en los valores grandes de `AnimatedNumber`.
- `letter-spacing: -0.02em` en los títulos "Core Foundations" y "Current Level".
- Símbolos `%` atenuados a 70 % de opacidad y peso semibold, para que domine el número.
- Color del porcentaje de Attendance cambiado a una versión profunda de su color de tema, para contraste sobre el nuevo fondo claro.

**Preservado explícitamente:** ilustración del robot y toda la lógica de modales de entrada.
**Verificación:** screenshots en `/tmp/browser/sp/a.png`.

---

## Entrada 007 — Jerarquía de tarjetas y vitalidad del calendario en /student/sessions
**Tipo:** cambio visual aplicado
**Fecha:** 2026-08-01

### ROUTE — `src/routes/student.sessions.tsx`
- `SessionsRemainingCard` (antes `card-gradient-gold` saturado + `border-border` + `shadow-elevated`) ahora es superficie tintada:
  `linear-gradient(135deg, color-mix(in oklab, #fde68a 16%, #ffffff) 0%, color-mix(in oklab, #fbbf24 24%, #ffffff) 100%)`
  con `boxShadow: inset 0 0 0 1px color-mix(in oklab, #fbbf24 30%, transparent)` (sin borde ni sombra elevada).
- Número grande: `leading-[1.05] tracking-[-0.03em]` y color `color-mix(in oklab, #d97706 62%, #01304a)` (antes `#01304a` con `leading-none tracking-tight`).
- Texto secundario `dim` de `rgba(1,48,74,0.75)` → `rgba(1,48,74,0.62)`.
- Tarjeta Spotlight (antes `card-gradient-teal` saturada) ahora tintada:
  `linear-gradient(135deg, color-mix(in oklab, #b2ece3 20%, #ffffff) 0%, color-mix(in oklab, #7cd7cb 26%, #ffffff) 100%)`
  + `inset 0 0 0 1px color-mix(in oklab, #3ebbad 26%, transparent)`; se conserva `verbo-card-hover`.
- Chip de icono Spotlight: `bg-white/35` → `color-mix(in oklab, #3ebbad 22%, #ffffff)` con icono en `color-mix(in oklab, #3ebbad 55%, #01304a)`.
- Título "Spotlight Session": `tracking-tight` → `tracking-[-0.02em]`. Párrafo a 0.7 de opacidad.
- Botón "Request a Spotlight": hover `scale-[1.04]` → `scale-[1.02]` y anillo `inset 0 0 0 1px color-mix(in oklab, #3ebbad 30%, transparent)`.

### COMP — `src/components/verbo/NextEventCard.tsx` (tarjeta verde = protagonista)
- Capa de gradiente `shadow-elevated` → `shadow-floating`.
- Titular: `leading-tight tracking-tight` → `leading-[1.05] tracking-[-0.03em]`.

### COMP — `src/components/verbo/CalendarView.tsx`
- Chips de filtro: `transition-all` → `transition-all duration-200 hover:-translate-y-px active:scale-[0.96]`.
- Grid del mes: `key` por año-mes + clase `verbo-cal-in` + `shadow-elevated` (cross-fade/entrada al cambiar de mes).
- Celdas de día: `group/day`, `transition-[box-shadow,background-color,transform] duration-200 ease-out`; con eventos → `hover:-translate-y-0.5 hover:shadow-floating` (antes solo `hover:shadow-elevated`); sin eventos → `hover:bg-secondary/50`.
- Píldoras de evento (mes): `verbo-cal-pill` con `animationDelay: index * 40ms`, `transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.97]` (antes solo `transition-opacity hover:opacity-90`).
- Vista día: contenedor con `key` por día + `verbo-cal-in` + `shadow-elevated`; filas con `verbo-cal-pill`, `animationDelay: idx * 35ms`, `hover:translate-x-0.5 active:scale-[0.995]`.

### CSS — `src/styles.css`
- `@keyframes verbo-cal-in` (opacity 0→1, `translateY(6px) scale(0.995)`→0) y `@keyframes verbo-cal-pill-in` (opacity + `translateY(4px)`).
- `@utility verbo-cal-in` → `320ms cubic-bezier(0.23, 1, 0.32, 1) both`.
- `@utility verbo-cal-pill` → `260ms cubic-bezier(0.23, 1, 0.32, 1) both`.
- Bloque `prefers-reduced-motion: reduce` que anula ambas animaciones y los `transform` de hover.

**Preservado:** toda la lógica de datos, rutas, stores, estados del calendario, leyenda de estados y anillos/ilustraciones existentes. Cero cambios en `src/lib/*`.
**Verificación:** login de prueba + screenshot `/tmp/browser/ss/b.png`; `tsgo --noEmit` sin errores.

---

## Pendientes identificados y no ejecutados
- `TopNav` translúcido con `backdrop-filter: blur`.
- `.verbo-press` global en botones del panel de estudiante.
- Cross-fade entre secciones del dashboard.
- NumberFlow para contadores de la homepage; torph para el hero.

---

## Cómo registrar una nueva entrada
```md
## Entrada NNN — <título corto>
**Tipo:** cambio visual aplicado | análisis
**Fecha:** YYYY-MM-DD

### CSS / COMP / ROUTE / DEP — `<ruta del archivo>`
- <qué se cambió, con valores concretos: tokens, duraciones, easings, clases>

**Preservado:** <lo que explícitamente no se tocó>
**Verificación:** <screenshot / método>
```

---

## Entrada 008 — Recolor de "Sessions remaining" y reordenamiento de las tarjetas hero
**Tipo:** cambio visual aplicado
**Fecha:** 2026-08-01

### ROUTE — `src/routes/student.sessions.tsx`
- Orden del grid hero cambiado a: **Next up → Spotlight Session → Sessions remaining** (antes: Sessions remaining → Next up → Spotlight).
- `SessionsRemainingCard` pasa de superficie tintada clara a gradiente saturado amarillo→naranja oscuro→negro:
  `linear-gradient(135deg, #fbd24a 0%, #f5a623 46%, #a04a12 78%, #2a1405 100%)`
  con `boxShadow: inset 0 0 0 1px color-mix(in oklab, #a04a12 26%, transparent)`.
- Tipografía en tinta negra: número grande `#111111` (antes `color-mix(#d97706 62%, #01304a)`), textos secundarios `rgba(17,17,17,0.62)` (antes `rgba(1,48,74,0.62)`).
- `RemainingRing`: pista `rgba(255,255,255,0.5)` → `rgba(17,17,17,0.18)`; arco de progreso `#01304a` → `#111111`.

**Preservado:** lógica de `effectiveSessionCounts`, `sessionProgressFor`, condicional de producto, animación de la barra y todo `src/lib/*`.
**Verificación:** `tsgo --noEmit` sin errores.

---

## 009 — Rediseño del AnnouncementBanner
**Archivo:** `src/components/verbo/AnnouncementBanner.tsx` (solo presentación)

- Contenedor: de bloque plano `bg-[#f38934]/10` a tarjeta `bg-card` con `rounded-2xl`, borde `#f38934/20`, `shadow-soft` → `hover:shadow-card` (200ms ease-out).
- Riel de acento izquierdo de 4px con gradiente `#f9b233 → #f38934`.
- Halo decorativo: círculo blur-2xl con `radial-gradient(rgba(243,137,52,0.22))` sangrando por la izquierda.
- Icono `Megaphone` en chip 36px `rounded-xl` con fondo `#f38934/12` y `ring-inset #f38934/25`.
- Eyebrow "Announcement" en 10px, uppercase, `tracking-[0.18em]`, color `#f38934`.
- Mensaje con `leading-snug` y `tracking-[-0.01em]`.
- Botón cerrar: opacidad 60% → 100% en `group-hover`/focus, hover tint `#f38934/10`, mantiene `.verbo-press`.
- Sin cambios en lógica, store, animaciones de entrada/salida ni rutas.

## 010 — Icono del Announcement Banner
- **Archivo:** `src/components/verbo/AnnouncementBanner.tsx`
- Se sustituyó el icono `Megaphone` (lucide) por el SVG animado subido por el usuario (`src/assets/red_megaphone.svg.asset.json`, servido por CDN), renderizado como `<img>` de 28x28px.
- Se mantuvo intacto el chip naranja contenedor (36x36px, `rounded-xl`, `bg-[#f38934]/12`, ring inset `#f38934/25`).
- Sin cambios de lógica, rutas ni datos.

## 011 — Fondos de tarjetas del Contact VERBOT Modal
- **Archivo:** `src/components/verbo/ContactVerbotModal.tsx`
- Se cambió el fondo saturado de cada tarjeta (`style={{ backgroundColor: o.color }}`) por una superficie clara `bg-white/95` con borde `border-white/60` y sombra `shadow-soft` → `hover:shadow-card`.
- Se añadió un riel de acento izquierdo de 4px (`w-1`) en el color de marca original para mantener la identidad cromática sin competir con los SVG animados.
- Tipografía: etiqueta en color de marca, descripción en `#111111`/70; se eliminó el texto blanco sobre fondo saturado.
- Se aplicó `.verbo-press` para feedback de presión.
- Sin cambios de lógica, rutas, URLs ni datos.

## 012 — Aumento de iconos de macros en Student Dashboard
- **Archivo:** `src/routes/student.index.tsx` (línea 683)
- Se aumentó el tamaño de los iconos de asset de las tarjetas de macro-skills (Listening, Reading, Writing, Speaking).
- Cambio: `className="h-16 w-16 object-contain"` → `className="h-20 w-20 object-contain"` (de 64 px a 80 px, ~25 % más grande).
- Sin cambios de lógica, datos, rutas ni comportamiento del grid.

---

## Entrada 013 — Portadas Enterprise + tarjetas de nivel premium
**Tipo:** ASSET + ROUTE
**Dónde:** `src/routes/student.courses.tsx` (`LevelCard`), `src/assets/{corefoundations,strategicfluency,executivepresence,Globalleadership}.png.asset.json`

- Nuevos assets CDN con las 4 portadas del producto **Enterprise** y mapa `LEVEL_COVERS`
  (`ENTERPRISE-L1..L4` → Core Foundations / Strategic Fluency / Executive Presence / Global Leadership).
  Fallback previo (mountains / airport) intacto para GO e International.
- Portada ahora **full-bleed**: se eliminó la máscara de degradado izquierda→derecha.
- Push-in sutil al hover: `scale(1.04)` en 700 ms con `verbo-ease-out-expo`.
- Scrim inferior nuevo: `linear-gradient(to top, rgba(1,20,32,.88) → 0)` en lugar de `from-black/60`.
- Hairline luminoso de 1px en el borde superior (blanco 55 % al centro).
- Tipografía: eyebrow `10px / tracking .22em / white-60`; nombre de nivel `19px / leading 1.1 / tracking -0.02em`.
- Se retiró la capa de destellos radiales blancos (ruido visual).
- Sin cambios de lógica, rutas ni stores.

---

## Entrada 014 — Rediseño premium de los roadmaps de Misiones (Apple Design)
**Tipo:** ROUTE (solo estética)
**Dónde:** `src/routes/student.courses.tsx` (`LevelRoadmap` + `UnitStone`)

**Tarjeta de Misión (contenedor):**
- Radio `rounded-3xl` → `rounded-[28px]`; superficie plana blanca / tinte suave por estado
  (completa: `color-mix(success 7%, white)`; bloqueada: `color-mix(muted-foreground 5%, white)`; activa: blanco puro)
  en lugar de degradados diagonales.
- Sombra propia por estado en lugar de `shadow-elevated`:
  activa `0 18px 44px -26px rgba(1,48,74,.45)` + inset highlight blanco; inactiva más plana.
- Hairline luminoso superior de 1px teñido con el acento de la misión (transparente → acento → transparente).
- Glow ambiental: círculo blur-3xl con el color de acento en la esquina superior izquierda (opacidad .16), solo en misión activa.

**Cabecera:**
- Número: `rounded-2xl` → `rounded-[18px]`, tipografía `26px / tracking -0.03em`, con inset highlight y sombra de color proyectada.
- Nueva línea eyebrow `10px / uppercase / tracking .24em`: "In progress" / "Cleared" / "Sealed".
- Título "Mission N": de `uppercase 16px tracking .14em bold` → `19px / semibold / tracking -0.015em / leading 1.1` (display typography).
- Barra de progreso: altura 1.5 → 7px, track `color-mix(foreground 8%, white)`, transición `width` 700 ms.
- Contador `4/10` con el denominador al 50 % de opacidad.
- Chevron dentro de un chip circular de 36 px con borde y fondo `white/80`, rotación 90° en 500 ms.
- `.verbo-press` en el botón de cabecera.

**Zona de unidades:**
- Separador hairline degradado entre cabecera y grid.
- Línea de "sendero" horizontal a la altura de las piedras (solo `lg`), degradada en los extremos.
- Grid: `gap-3` → `gap-x-3 gap-y-6`, padding lateral 8/10 → 6/8.

**UnitStone:**
- Sombra por estado (verde / ámbar / dorado proyectan color; bloqueada casi plana con hairline interior).
- Highlight especular superior dentro del círculo (degradado blanco → transparente).
- Estado bloqueado: gradiente gris oscuro → gris claro perlado `#f2f4f6 → #c7ced4`; candado ahora `rgba(1,48,74,.45)` a 20 px (antes blanco 24 px).
- Hover `scale(1.10)` → `scale(1.09)` en 500 ms + `active:scale(0.97)`.
- Texto: status `9px uppercase tracking .14em`; título `11px bold` → `11.5px semibold / tracking -0.01em / leading 1.25`.

- Sin cambios de lógica, estados, rutas ni stores.

---

## Entrada 015 — Logo del robot en el header del Contact VERBOT Modal
**Tipo:** cambio visual aplicado
**Fecha:** 2026-08-01

### COMP — `src/components/verbo/ui.tsx`
- `AccentModalHeader` ahora acepta prop opcional `logoSrc?: string`.
- Si `logoSrc` está presente, se renderiza una `<img>` (sin fondo blanco) en lugar del cuadrado `vc-logo` + icono Lucide.
- `AccentModal` expone y reenvía `logoSrc` a `AccentModalHeader`.
- `icon` pasó a opcional en ambos componentes; los usos existentes sin `logoSrc` conservan el cuadrado blanco con icono.

### COMP — `src/components/verbo/ContactVerbotModal.tsx`
- Se eliminó el icono `MessageCircle` del header.
- Se generó una versión transparente del robot a partir de `contact.svg`:
  - Se extrajo el PNG embebido del SVG original.
  - Se eliminó el fondo negro, conservando únicamente la cara/visor del robot en blanco.
  - Se subió como asset `src/assets/contact-robot.png.asset.json`.
- Se pasó `logoSrc={contactRobotIcon.url}` en el `AccentModal`.
- Resultado: en el header del modal aparece solo la cara del robot, sin fondo blanco ni negro, a 40×40 px (`h-10 w-10 object-contain`).

**Preservado:** toda la lógica de apertura/cierre del modal, URLs de contacto, URLs de los iconos animados y el resto de modales que usan `AccentModal`. El botón que abre el modal sigue usando `contactIcon`.
**Verificación:** `bunx tsgo --noEmit` sin errores; captura de prueba en fondo azul gradiente confirma fondo transparente.


---

## Entrada 016 — Portadas de nivel del producto GO

### ASSETS — `src/assets/`
- Subidas 4 imágenes de portada (Lovable Assets):
  - `kickstart.png.asset.json`
  - `everydayflow.png.asset.json`
  - `confidenvoice.png.asset.json`
  - `culturemaster.png.asset.json`

### ROUTE — `src/routes/student.courses.tsx`
- Se importaron los 4 nuevos punteros de asset.
- Se ampliaron las entradas de `LEVEL_COVERS`:
  - `GO-L1` → Kickstart
  - `GO-L2` → Everyday Flow
  - `GO-L3` → Confident Voice
  - `GO-L4` → Culture Master
- Las tarjetas GO heredan el mismo tratamiento premium ya aplicado a Enterprise (cover a sangre, scrim inferior, hairline superior, push-in al hover).

**Preservado:** ninguna lógica, ruta, store ni dato modificado; solo mapeo visual de portadas.

## Entrada 017 — Portadas de nivel del producto INTERNATIONAL

### ASSETS — `src/assets/`
- Subidas 4 imágenes de portada (Lovable Assets):
  - `survival_basics_2.png.asset.json`
  - `travelready.png.asset.json`
  - `global_connector.png.asset.json`
  - `worldfluency.png.asset.json`

### ROUTE — `src/routes/student.courses.tsx`
- Se importaron los 4 nuevos punteros de asset.
- Se ampliaron las entradas de `LEVEL_COVERS`:
  - `INTERNATIONAL-L1` → Survival Basics
  - `INTERNATIONAL-L2` → Travel Ready
  - `INTERNATIONAL-L3` → Global Connector
  - `INTERNATIONAL-L4` → World Fluency
- Mismo tratamiento premium que Enterprise y GO (cover a sangre, scrim inferior, hairline superior, push-in al hover).

**Preservado:** ninguna lógica, ruta, store ni dato modificado; solo mapeo visual de portadas.

## Entrada 018 — Rediseño completo del roadmap de misiones (`/student/courses`)

### ROUTE — `src/routes/student.courses.tsx`

**Cabecera de misión (`UnitsView`)**
- Eliminada por completo la paleta morada (`#cb6ce6` y su gradiente). Nueva paleta de tinta: `#01304a` base, ámbar `#c8801a` solo para la misión activa y verde `#3f9142` para completada.
- Sustituido el bloque numerado de 56px con gradiente por un **numeral fantasma** tipográfico (34px, `tracking-[-0.05em]`, tabular) + separador hairline vertical.
- Card: de `rounded-[28px]` con glow ambiental y hairline luminoso a `rounded-[20px]`, borde de 1px casi invisible, blanco puro para la activa y superficie casi plana para las inactivas (sin sombra).
- Progreso: la barra de 7px se reemplaza por una **línea hairline de 1px** con relleno luminoso y un punto guía de 5px que se desplaza con el porcentaje.
- Estado en eyebrow de 9.5px con `tracking-[0.26em]`; título "Mission N" a 17px `tracking-[-0.02em]`.
- Chevron: círculo de 32px con borde 1px (antes 36px con fondo).

**Nodos de unidad (`UnitStone`)**
- De "piedras" de 64px con gradientes, especular y sombras de color a **nodos minimalistas de 44px**: relleno sólido verde (completada), ámbar con halo suave (actual/milestone) o blanco con borde hairline y número tabular (bloqueada).
- Iconografía reducida a 16px; las unidades bloqueadas ahora muestran su número en vez de candado.
- El difuminado progresivo de las unidades futuras pasa de `blur` a **atenuación por opacidad** (más limpio y legible).
- Hover: `-translate-y-1` en lugar de `scale-[1.09]`; press `scale-[0.97]`.
- Etiquetas: eyebrow 8.5px `tracking-[0.2em]` coloreado por estado + título 11px en tinta.
- Riel del roadmap: línea punteada de 1px (`repeating-linear-gradient`) en lugar de degradado sólido.

**Preservado:** ninguna lógica, ruta, store, estado ni prop modificada — solo estilos, tipografía y estructura visual.

## Entrada 019 — Unificación del estilo de tarjetas de nivel para GO e INTERNATIONAL

### ROUTE — `src/routes/student.courses.tsx`

- **Antes:** solo el producto `enterprise` renderizaba `LevelsBento` (tarjetas premium con portada full-bleed, scrim, hairline luminoso, push-in en hover). `go` e `international` caían en `LevelsPath`, una fila de nodos + mini-tarjetas de texto sin portada.
- **Ahora:** los tres productos renderizan `LevelsBento`. GO e INTERNATIONAL heredan exactamente el mismo componente `LevelCard`: portada full-bleed desde `LEVEL_COVERS`, `scale-[1.04]` a 700 ms en hover, scrim `rgba(1,20,32,0.88)→0`, hairline superior de 1px, eyebrow `tracking-[0.22em]`, título 19px `tracking-[-0.02em]`, barra de progreso y pills de estado idénticas, grid responsive `md:grid-cols-2`.
- Eliminado el componente `LevelsPath` (ya sin uso) y el condicional por producto en el shell de niveles.
- **Roadmap:** `UnitsView` / `UnitStone` ya eran compartidos por todos los productos, así que GO e INTERNATIONAL usan el mismo roadmap minimalista tinta+ámbar de la Entrada 018 sin cambios adicionales.

**Preservado:** ninguna lógica, ruta, store, estado ni cálculo modificado — solo el componente de presentación elegido.

## Entrada 020 — Animaciones de entrada y pulido premium en `/student/courses`

### ROUTE — `src/routes/student.courses.tsx`

**Animaciones (6)**
1. **Cabecera de niveles (`LevelsView`)**: entra con `.verbo-stagger-in` (320 ms, `cubic-bezier(.23,1,.32,1)`, opacity + translateY).
2. **Banner de milestone**: entra con `.verbo-stagger-in` y `animationDelay: 80ms`.
3. **Tarjetas de nivel (`LevelsBento`)**: cada `LevelCard` envuelta en `.verbo-stagger-in` con `animationDelay: idx * 60ms` (cascada de 4 tarjetas).
4. **Press feedback en `LevelCard`**: `active:scale-[0.985]` + `hover:-translate-y-1` (se retira `hover:shadow-elevated` duplicado) y anillo de foco `focus-visible:ring-[#c8801a]/45`.
5. **Cabecera y botón "All levels" de `UnitsView`**: entrada escalonada (0 ms / 60 ms); el botón gana `hover:-translate-y-px`, `active:scale-[0.97]` y flecha que se desplaza `-translate-x-0.5` en hover.
6. **Secciones de misión (`UnitsView`)**: `.verbo-stagger-in` con `animationDelay: 120 + bi * 70ms`.

**Mejoras de diseño (5)**
1. **Cabecera de niveles**: eyebrow ámbar `#c8801a` con el nombre del producto, título 28px `tracking-[-0.03em] leading-[1.05]` en tinta `#01304a`, subtítulo `max-w-2xl leading-relaxed`.
2. **Banner de milestone**: se abandona la paleta `amber-*` de Tailwind y se adopta la del roadmap — rail vertical de 3px, degradado `rgba(200,128,26,0.10)→0.03`, texto en tinta.
3. **Pastilla de bloqueo en `LevelCard`**: el icono suelto `Lock` se sustituye por una pastilla de vidrio (`bg-white/10`, `backdrop-blur-md`, `tracking-[0.2em]`) con icono + "Locked".
4. **Tipografía de métricas de `LevelCard`**: "N units" como eyebrow 10px `tracking-[0.2em]`; el contador pasa a 13px tabular `tracking-[-0.02em]` con denominador y porcentaje atenuados; CTA "Continue" en ámbar con chevron que se desplaza en hover; barra de progreso con transición `width` de 700 ms.
5. **Nodos de unidad (`UnitStone`)**: en hover el nodo escala a `1.06` y gana sombra proyectada suave (solo estados no bloqueados); bordes de misión activa viran a ámbar en hover.

**Preservado:** ninguna lógica, ruta, store, cálculo ni prop modificada. La tarjeta de **Overall score** de las unidades (`UnitDetail`) y la de **Overall progress** quedaron intactas por petición explícita.

## Entrada 021 — Transición de vista y feedback táctil en `/student/resources`

### COMPONENT — `src/components/verbo/MaterialLibrary.tsx`

1. **Crossfade entre vistas (oportunidad #1)**: las dos ramas del render (`grid de categorías` ↔ `vista de categoría`) pasan de fragmentos `<>` a `<div>` con `key="cat-root"` / `key={`cat-${category}`}` y clase `.verbo-crossfade` (180 ms `ease-out`, solo `opacity`). Al cambiar la key el nodo se re-monta y la animación reproduce, eliminando el salto seco al abrir o cerrar una categoría. `space-y-8` se traslada al nuevo wrapper para conservar el ritmo vertical.
2. **Feedback de pulsación en `SpotlightCategoryCard` (oportunidad #3)**: el shell recibe la utilidad `.verbo-tile` (lift en hover + press). El CTA "Browse Material" gana `.verbo-press` (`active:scale(0.97)`, 160 ms) y anillo de foco teñido con el `accent` de la categoría; la flecha pasa a `verbo-ease-out-expo duration-300`. No se añadió `cursor-pointer` al shell porque el área clicable sigue siendo únicamente el botón.

### STYLES — `src/styles.css`

3. Nueva utilidad `.verbo-tile`: `transition` de 200 ms `cubic-bezier(0.23,1,0.32,1)` sobre `transform`, `box-shadow` y `border-color`; `:hover` con `translateY(-4px)` + sombra proyectada, **gated** con `@media (hover:hover) and (pointer:fine)`; `:active` con `translateY(-1px) scale(0.985)`. Bloque `prefers-reduced-motion` que anula los `transform` y conserva solo el cambio de sombra.

**Preservado:** ninguna lógica, ruta, store, handler ni prop modificada — `openCategory`, `setCategory`, filtros, índice A–Z y modales quedan idénticos.

## Entrada 022 — Jerarquía tipográfica y densidad de tarjetas en `/student/resources`

### COMPONENT — `src/components/verbo/MaterialLibrary.tsx`

**Cabeceras (peso y escala)**
1. **Cabecera raíz**: se añade eyebrow "Library" (10px, `tracking-[0.26em]`, ámbar `#c8801a`); el `h1` pasa de `text-2xl tracking-tight` a **34px `leading-[1.05] tracking-[-0.03em]`** (tracking negativo en display, principio de tracking dependiente del tamaño); el subtítulo pasa de `text-sm` a **15px `leading-[1.6]`** y de `max-w-md` a `max-w-xl`.
2. **Cabecera de categoría**: misma escala 34px, con eyebrow que muestra el nombre de la librería y el `PremiumBadge` alineado al baseline del título. El contenedor pasa a `items-end justify-between gap-4`.

**Tarjetas de categoría (`SpotlightCategoryCard`)**
3. **Distribución**: el contenido pasa de apilado vertical a **fila `flex items-start gap-4`** — icono a la izquierda, título y subtítulo a la derecha. Elimina el hueco muerto que hacía la tarjeta alta y el título pequeño.
4. **Altura**: `min-h` baja de `200px → 168px` (y de `140px → 132px` en `compact`); el CTA sube de `mt-5` a `mt-4`.
5. **Iconos**: la ilustración crece de `h-14 w-14` a **`h-[72px] w-[72px]`** (+29%); el chip de icono de respaldo de `h-12 w-12` a `h-16 w-16` con glifo `h-8 w-8`. Ambos escalan a `1.06` en hover con `verbo-ease-out-expo` 500 ms.
6. **Título**: de `text-base` a **19px `leading-[1.15] tracking-[-0.02em]`**; subtítulo de `text-xs` a **13px `leading-[1.5]`**.
7. **CTA "Browse Material"**: pasa a 11px `uppercase tracking-[0.14em]`, coherente con los CTA del roadmap de cursos.

**Preservado:** ninguna lógica, ruta, store, handler ni prop modificada — `openCategory`, `mainCards`, filtros e índice A–Z intactos.

---

## Entrada 023 — Rediseño del Player Card y de las tarjetas de dificultad (`/student/challenges`)
**Archivo:** `src/routes/student.challenges.tsx` — solo estética, sin tocar lógica, handlers ni rutas.

**Tarjetas de dificultad (Essential / Intermediate / Advanced / Expert)**
- Nuevo componente presentacional `TierTile` (sustituye el uso de `ChallengeSurface` en ese grid).
- Se eliminan los gradientes multicolor saturados; ahora slab grafito `linear-gradient(155deg,#0d1420,#111a26,#0a1017)` con **un solo acento por tier**: Essential `#10b981`, Intermediate `#38bdf8`, Advanced `#f59e0b`, Expert `#fb7185` (sin morado).
- Hairline superior con degradado de acento, halo radial difuso en la esquina superior derecha y numeral fantasma 01–04 (86px, `text-white/[0.055]`).
- Icono de tier en chip 44px, dots de dificultad al 70% de opacidad.
- Tipografía: título 20px `tracking-[-0.03em] leading-[1.1]`; subtexto "N of M challenges" 12px al 45%.
- Track de progreso hairline (1px) con relleno de acento y transición `width 700ms cubic-bezier(0.23,1,0.32,1)`.
- Feedback: `hover:-translate-y-1` + sombra de acento, `active:scale-[0.985]` (100ms), focus ring de acento, entrada `verbo-stagger-in`. Estado vacío: opacidad 45% + `saturate-0` y label "Empty".

**Player card**
- Encabezado de sección: eyebrow ámbar "Identity", título 22px `tracking-[-0.03em]`, subtítulo 13px.
- Se elimina la banda azul + tarjeta clara; ahora superficie única grafito `rounded-[28px]` con hairline ámbar superior, halo ámbar y textura de puntos al 7%.
- Avatar 84px con anillo cónico ámbar difuso; botón de cámara con `active:scale-[0.94]`.
- Nombre a 24px `tracking-[-0.035em]`; contador de retos convertido en pill de vidrio (número 15px + label 11px `tracking-[0.14em]`).
- Panel de edición de nombre en vidrio oscuro con `verbo-fade-up`; inputs con borde focus ámbar.
- Divisor hairline y sección "Showcase badge" con botones de vidrio: `hover:-translate-y-0.5` + borde ámbar, `active:scale-[0.98]`.

### Entrada 023b — Revisión de color (mismo diseño y animaciones)
**Archivo:** `src/routes/student.challenges.tsx`
- Las 4 tarjetas de dificultad dejan el slab grafito y pasan a **superficie propia por nivel** (medio-claras, `linear-gradient(155deg…)`): Essential teal `#17b8a0→#0b7f78`, Intermediate azul `#3fa9f5→#1668b8`, Advanced ámbar `#f9a23a→#d9631b`, Expert coral `#f2698a→#bf3a68`. Sombra tintada por nivel.
- Se mantiene íntegro el layout, el numeral fantasma (ahora `white/13`), el track hairline (relleno blanco), el hover `-translate-y-1`, el `active:scale-[0.985]`, el focus ring y `verbo-stagger-in`.
- Contraste ajustado a superficie clara: bordes `white/20`, chip de icono `white/20`, subtexto `white/75`, label "Explore" `white/90`.
- **Player card**: superficie grafito → azul de marca más claro `linear-gradient(158deg,#0a5e88,#0f7ba8,#118fbd)` con sombra tintada; halo y hairline ámbar sin cambios.

---

## Entry 024 — Leaderboard: podio y fondo del área
**Archivo:** `src/routes/student.challenges.tsx` (`PODIUM_STYLES`, `LeaderboardSection`)

- **Fondo del área:** la `Card` del leaderboard pasa a superficie propia con degradado claro (#fbfdff → #eef4fa), dos blobs difuminados animados (`verbo-board-drift`, ámbar y celeste) y un velo verde marca en la base. Sin fondos oscuros.
- **Tarjetas del podio:** cada puesto tiene identidad propia — 1º dorado (#fffaf0→#ffe3a6, sombra ámbar, sheen animado, escala 1.03 y crown flotante), 2º plata fría (#ffffff→#dfe7f1), 3º bronce cálido (#fffaf6→#f3d6c2). Añadido numeral fantasma grande por puesto, píldora de rango en la esquina y radios `1.5rem`.
- **Animaciones más marcadas:** entrada con rebote `cubic-bezier(0.34,1.56,0.44,1)` (820 ms), hover lift −8px/scale 1.025, press 0.985, corona con `float` continuo y barrido de brillo en el 1er puesto.
- **Tipografía:** nombre del líder a 17px y contadores en black tabular con tracking −0.03em.
- Sin cambios de lógica, rutas ni datos. Corona/medallas y sus posiciones intactas.

---

## Entry 025 — Challenge cards + filtros de categoría
**Archivo:** `src/routes/student.challenges.tsx` (`ChallengeCard`, fila de filtros)

- **Tarjetas rediseñadas (premium/minimal):** superficie blanca `bg-card`, radio 1.5rem, borde hairline y sombra sutil que se profundiza en hover (−1px lift, `cubic-bezier(0.23,1,0.32,1)`, press 0.99). Se eliminó el halo radial difuso y la caja gris interna.
- **Distinción por categoría:** barra de 3px del color de categoría en el borde superior + degradado tintado que se desvanece hacia abajo; icono en chip tintado y eyebrow en mayúsculas con tracking 0.16em en el mismo color.
- **Jerarquía tipográfica:** eyebrow 10px uppercase → título 17/18px bold tracking −0.02em → descripción 13px/1.55 muted → pie con skill chips y CTA "See details" (flecha con micro-desplazamiento en hover).
- **Distribución:** estados (Premium / Completed / In progress) alineados a la derecha del eyebrow; footer separado por hairline; acción "Share result" como fila propia al pie.
- **Responsive:** `min-w-0`, truncado del eyebrow, `line-clamp` en título/descripción y escala tipográfica `sm:`.
- **Filtros:** píldoras rediseñadas — "All" en negativo (foreground/background) y cada categoría con su color (fondo 6%, borde 20%, activo sólido con sombra tintada), press 0.97 y scroll horizontal con snap en móvil.
- Sin cambios de lógica, rutas ni datos.

---

## Entry 026 — Leaderboard: alineación y tamaño de título con player card
**Archivo:** `src/routes/student.challenges.tsx` (`LeaderboardSection`)

- **Título "Leaderboard":** aumentado de `text-base` a `text-[22px]`, con `leading-[1.1]` y `tracking-[-0.03em]`, igual que el título "Your player card" de la sección adyacente.
- **Subtítulo:** escalado de `text-xs` a `text-[13px]` para emparejar la jerarquía con la player card.
- **Alineación de tarjeta:** la `Card` del leaderboard ahora usa `rounded-[28px]` (igual que la player card) y el padding interno pasó de `p-5` a `p-6` para que sus bordes y contenido queden alineados con el elemento de la izquierda.
- Sin cambios de lógica, rutas ni datos.

---

## Entry 027 — Modales de retos: header compacto e instrucciones protagonistas
**Archivo:** `src/routes/student.challenges.tsx` (`SubmissionInstructions`, `ChallengeDetail`, Mystery Box, Season/Verbo Flash)

- **Header reducido:** padding `p-4/p-6` → `px-5 pb-4 pt-3.5`; blobs decorativos de `h-64 w-64` → `h-40 w-40`; marca de agua de `92px` → `54px`. El header ya no domina el modal.
- **Título:** `text-3xl/4xl font-extrabold` → `text-[22px] font-bold leading-[1.15] tracking-[-0.02em]` (en `ChallengeDetail`, `text-[20px]`). Icono de categoría reducido a 8×8 y colocado en línea con el eyebrow (una sola fila superior en vez de dos bloques).
- **Descripción:** de `text-sm leading-relaxed` a `text-[17px] leading-[1.55] tracking-[-0.01em]` en los 4 modales.
- **Instrucciones ("How to submit") rediseñadas:** tarjeta `rounded-2xl` con rail de 3px del color de acento, chip circular con icono, eyebrow 11px uppercase tracking 0.18em y **texto a 16px/1.6 medium** (antes 14px dentro de una caja pequeña). Recibe `accent` para heredar el color de la categoría/temporada.
- **Feedback:** botón de cierre con `active:scale-[0.94]` y transición de 150ms.
- Sin cambios de lógica, rutas ni datos.

---

## Entry 028 — Transiciones de página (paneles Student, Teacher, Admin)

**Dónde:** `src/components/verbo/PageTransition.tsx` (nuevo), `src/styles.css`, `src/routes/student.tsx`, `src/routes/teacher.tsx`, `src/routes/admin.tsx`, `src/components/verbo/TopNav.tsx`

**Qué se hizo:**

1. **Entrada de ruta (`.verbo-route-in`)** — nuevo keyframe `verbo-route-in`: `opacity 0 → 1` + `translateY(6px) → 0`, `220ms cubic-bezier(0.23, 1, 0.32, 1)`. Solo `transform` y `opacity`.
2. **Componente `PageTransition`** — envuelve el `<Outlet />` y se re-monta con `key={pathname}`. Sin animación de salida, deliberadamente: esperar a una transición de salida hace que la navegación por tabs se sienta lenta.
3. **Aplicado a los 3 paneles** — el `<Outlet />` de `student.tsx`, `teacher.tsx` y `admin.tsx` ahora va dentro de `<PageTransition>`.
4. **Indicador del TopNav** — la píldora activa pasó de `transition-all duration-300 ease-out` a `transition-[transform,width,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]`: más rápida, con curva premium y sin animar propiedades no relacionadas.
5. **Reduced motion** — `@media (prefers-reduced-motion: reduce)` sustituye la entrada por un fade puro de 140ms (`verbo-route-fade`), sin desplazamiento.

**Lógica / rutas tocadas:** ninguna. Cambio meramente estético.

---

## Entry 029 — Banners de dificultad (pantalla de retos por nivel)

**Dónde:** `src/routes/student.challenges.tsx` (nuevo `TIER_BANNER` + componente `TierBanner`, reemplaza el header plano de la pantalla 2)

**Qué se hizo:**

1. **Fin del banner azul único** — antes las 4 dificultades usaban el mismo `PRODUCT_GRADIENTS` azul sólido con texto blanco. Ahora cada dificultad tiene su propio material.
2. **Alusión, no color literal** — el fondo es un papel casi blanco teñido con la temperatura del nivel (`#f4fbf9` menta / `#f5faff` cielo / `#fffaf2` ámbar / `#fff7f9` rosa) y un *bloom* radial del color del tier al 28-30% en la esquina superior derecha. El color del nivel se insinúa; no inunda la superficie.
3. **Rail de acento** — barra de 3px a la izquierda con el gradiente del tier, que reconecta el banner con su `TierTile` de origen (consistencia espacial).
4. **Motivo fantasma** — el icono del nivel (`DIFFICULTY_MOTIF`) a 112px con `opacity 0.10` detrás del texto, en el tono del acento.
5. **Tipografía y jerarquía** — título subido a `26/30px` con `tracking -0.03em` y `leading 1.08` (tracking negativo para texto grande); eyebrow en `11px` `tracking 0.18em` con el color del acento; subtítulo en tinta al 62% vía `color-mix`. Texto en tinta oscura del propio matiz en lugar de blanco sobre azul.
6. **Materialidad** — hairline teñido, `inset 0 1px 0 rgba(255,255,255,0.85)` como brillo superior y sombra difusa tintada del tier.
7. **Entrada** — reutiliza `verbo-stagger-in` (ya con soporte de reduced motion).

**Lógica / rutas tocadas:** ninguna. Mismos datos (`DIFFICULTY_META`, `list.length`) y mismo comportamiento.

---

## Entry 030 — Player card: fondo púrpura-ámbar sutil
**Archivo:** `src/routes/student.challenges.tsx` (componente Player Card, ~línea 3059)

- Fondo: reemplazado el azul sólido `linear-gradient(158deg,#0a5e88…#118fbd)` por un degradado sutil púrpura→ámbar `linear-gradient(152deg,#2b2140,#3a2a55,#5b3f56,#7a5442)`; sombra ahora tintada en violeta.
- Añadido segundo bloom radial: violeta arriba-izquierda (`rgba(168,126,224,0.35)`) y ámbar abajo-derecha (`rgba(243,181,102,0.30)`), ambos `blur-3xl`.
- Hairline superior: de naranja a ámbar suave `rgba(240,183,110,0.6)`.
- Anillo cónico del avatar: ahora alterna ámbar/violeta.
- Botón de cambiar foto: degradado `#8b63c9 → #e8a35c` con sombra violeta.
- Hover/focus de badges e input: acento `#e8a35c` en lugar de `#f38934`.

Sin cambios de lógica ni rutas.

---

## Entry 031 — Jerarquía tipográfica del título en modales de reto
**Archivo:** `src/routes/student.challenges.tsx` (componente `ChallengeInfoModal`, ~línea 1934)

- Título del reto: subido de `text-[20px]` a `text-[28px]`, con `leading-[1.1]` y `tracking-[-0.03em]` para que actúe como protagonista visual del modal.
- Las instrucciones de envío (`SubmissionInstructions`) se mantienen en `text-[16px]`, generando ahora un salto claro de 12 px entre título e instrucciones.
- Sin cambios de lógica ni rutas.

---

## Entry 032 — Rediseño premium de la tarjeta "Sessions remaining"
**Archivo:** `src/routes/student.sessions.tsx` (componentes `RemainingRing` y `SessionsRemainingCard`, ~líneas 945-1013)

- **Paleta:** se abandonó el degradado amarillo→marrón/negro (`#fbd24a → #2a1405`) por un tono champagne cálido (`#FFFBEB → #FEF3C7 → #FDE68A`) que no compite con la tarjeta verde "Next up" pero sigue sintiéndose viva y premium.
- **Superficie:** fondo con brillo superior interno (`inset 0 1px 0 rgba(255,255,255,0.7)`), borde sutil teñido en naranja marca (`rgba(243,137,52,0.18)`) y sombra elevada difusa en azul marino muy tenue.
- **Decorativos:** añadidos dos *blooms* radiales (naranja arriba-derecha, ámbar abajo-izquierda) con `blur-3xl` e intensidad que crece levemente en hover.
- **Tipografía:** etiqueta en `11px` con `tracking-[0.14em]` y tinta navy al 70%; contador principal en navy `#01304a` con `tracking-[-0.03em]`; metadatos en navy al 60% con peso medio.
- **Anillo:** track ahora usa `rgba(1,48,74,0.10)` y el relleno un degradado SVG `url(#sessionsRingFill)` de naranja marca (`#f38934`) a ámbar (`#f59e0b`), con transición más larga (`900ms`) y curva `cubic-bezier(0.23, 1, 0.32, 1)`.
- **Estado compartido:** cuando el alumno pertenece a un grupo, el texto "Shared with your group" se convierte en un *pill* con icono `UsersIcon`, fondo blanco translúcido y `backdrop-blur-sm`.
- **Interacción:** transición suave de sombra en hover (`hover:shadow-floating`) y clase utilitaria `verbo-sessions-remaining` para futuras animaciones.
- Se eliminó la línea `void UsersIcon;` porque el icono ahora se usa en el pill de grupo.

Sin cambios de lógica ni rutas.

---

## Entry 033 — Fix de modales: backdrop claro y centrado real en el viewport
**Archivos:** `src/styles.css`, `src/components/verbo/PageTransition.tsx` y 38 archivos con overlays (`src/routes/*.tsx`, `src/components/verbo/*.tsx`)

**Bug raíz:** el wrapper `.verbo-route-in` (transición de página de los 3 paneles) conservaba un `transform` y `will-change: transform` después de animar. Un transform activo convierte al elemento en *containing block* de sus descendientes `position: fixed`, así que todos los modales quedaban:
- recortados al área del contenido (cuadro gris que no cubría toda la pantalla),
- centrados respecto al documento y no al viewport (había que hacer scroll hasta el centro de la página),
- con repintados/glitch al mover el mouse (por `will-change` permanente + blur),
- y en admin, estirados/cortados por el alto total de la página.

**Cambios:**
- `PageTransition.tsx`: la clase de animación se aplica sólo durante la entrada (320 ms) y luego se retira, de modo que el wrapper nunca conserva transform.
- `src/styles.css`: `.verbo-route-in` pasa de `animation-fill-mode: both` a `backwards` y se elimina `will-change: opacity, transform`.
- Nueva utilidad `.verbo-backdrop`: scrim claro `color-mix(in oklab, var(--foreground) 14%, transparent)` con `backdrop-filter: blur(18px) saturate(140%)` — mucho más vidrio y menos negro sólido.
- Se sustituyó `bg-black/40|50|60|70` y `bg-foreground/40` + `backdrop-blur-sm` por `verbo-backdrop` en los 38 archivos con overlays de modal.
- `.verbo-backdrop` recibe `overflow-y: auto; overscroll-behavior: contain;` y los paneles hijos que no declaran su propio `max-h-*` obtienen `max-height: 90vh; overflow-y: auto;` para que los formularios largos (panel admin) hagan scroll dentro de la pantalla en vez de recortarse.

Sin cambios de lógica ni rutas.

---

## Entry 034 — Sign in: micro-motion premium en el formulario, ojo animado y panel azul vivo
**Archivos:** `src/routes/login.tsx`, `src/styles.css`

**Animaciones nuevas (`src/styles.css`):**
- `@keyframes verbo-signin-rise` + `.verbo-signin-rise`: entrada escalonada (opacity + translateY 14px + blur 3px → 0) con `cubic-bezier(0.16,1,0.3,1)`, 620 ms. Aplicada al logo (0 ms), título (70 ms), subtítulo (130 ms), campo email (200 ms), campo password (260 ms) y fila remember/forgot (320 ms).
- `.verbo-field`: el bloque completo se eleva `translateY(-2px)` en `:focus-within` y su label pasa a naranja `#f38934` con `letter-spacing` 0.14em (260 ms).
- `.verbo-login-input:focus`: halo naranja más presente (`0 0 0 3px rgba(243,137,52,0.14)`) + sombra de profundidad; hover sin foco oscurece el borde.
- `.verbo-error-slot`: el error de credenciales ya no aparece de golpe — se revela con `grid-template-rows: 0fr → 1fr` + opacity + translateY (320 ms) y el contenido hace `verbo-error-nudge` (260 ms). Se añadió un icono `X` dentro del mensaje. El layout ya no salta al aparecer/desaparecer.
- Eye toggle: nuevo componente `EyeToggle` (SVG inline) en `login.tsx` que reemplaza a `Eye`/`EyeOff` de lucide. El párpado morfea vía transición de `d` (arco abierto ↔ línea cerrada), la pupila se contrae a `scale(0.1)` + fade, y aparecen 3 pestañas (`.verbo-eye-lash`) al cerrar. El botón hace `scale(0.88)` al presionar y pasa a naranja en hover.
- Panel azul: `verbo-aurora-a` (16 s) y `verbo-aurora-b` (22 s) para deriva lenta de los orbes; nuevo contra-glow frío `#2f7fa8` a la izquierda; capa de brillo hairline (`linear-gradient` 120° + viñeta inferior); parallax de puntero (`.verbo-panel-parallax`, 900 ms) que desplaza el glow naranja (−22/−18 px) y el bloque de la cita (+10/+8 px) en dirección contraria.
- Botón de éxito: se conserva la animación de logo + overlay circular; sólo se refinó — `width` con `cubic-bezier(0.16,1,0.3,1)`, halo `box-shadow` al entrar en estado `success`, y el `clip-path` del overlay pasa a 560 ms `cubic-bezier(0.65,0,0.35,1)`.
- Todo el kit tiene su bloque `prefers-reduced-motion: reduce`.

Sin cambios de lógica, rutas ni del flujo de autenticación.

---

## Entry 035 — Rediseño premium/minimalista de las tarjetas `StatPill`
**Archivo:** `src/routes/student.sessions.tsx` (componente `StatPill`, ~líneas 343-446)

- **Superficie:** se abandona el fondo de color sólido por `bg-card` con un degradado sutil del acente (`135deg`, 6% opacidad) que aporta identidad sin ruido.
- **Acento estructural:** línea vertical de 3 px a la izquierda en el color de cada tono (violeta, rojo, ámbar, verde, navy).
- **Iconografía:** iconos Lucide sin círculo de fondo, a 20 px (`[&>svg]:h-5 [&>svg]:w-5`), coloreados con el acento correspondiente.
- **Tipografía:** etiqueta en `text-[10px]`, semibold, uppercase, `tracking-[0.14em]` y `text-muted-foreground`; valor en `text-sm`, semibold, `leading-snug` y `tracking-[-0.01em]`.
- **Progreso:** barra reducida a `h-1`, track `bg-secondary`, relleno en color de acento con transición de ancho de 700 ms `ease-out`.
- **Interacción:** hover eleva la tarjeta 0.5 px (`-translate-y-0.5`) y cambia a `shadow-elevated` con transición de 200 ms `ease-out`.
- **Tono `dark`:** conserva el navy `#01304a` para la tarjeta de "Reschedule Policy".

Sin cambios de lógica ni rutas.

---

## Entry 036 — Rediseño del footer (fade navy + wordmark VERBO)
**Archivos:** `src/components/verbo/Footer.tsx`, `src/lib/footer-links.ts` (nuevo), `src/routes/student.tsx`, `src/routes/teacher.tsx`, `src/routes/admin.tsx`

- **Altura:** el footer pasa de una barra compacta a un bloque alto (~2x, `pt-28 pb-36`), proporcional al navbar.
- **Fondo:** degradado vertical del navy de marca (`--navy-700`) que se desvanece hacia arriba hasta transparencia total, en lugar del bloque sólido con borde superior.
- **Watermark:** palabra `VERBO` sobredimensionada (`clamp(6rem, 20vw, 19rem)`), `tracking-[-0.05em]`, al 5.5% de blanco, anclada al borde inferior y recortada por el propio footer.
- **Tipografía:** todos los enlaces en light, uppercase, `tracking-[0.16em]`, 11 px; títulos de columna a 10 px con `tracking-[0.22em]` y 35% de blanco. Hover en naranja `--orange-500`.
- **Estructura:** tagline corta a la izquierda, columnas de navegación específicas de cada panel (nunca mezcladas), columna "Company" (Official Website + FAQs placeholder) y columna "Connect" con enlaces de contacto sólo texto (WhatsApp, Instagram, Facebook, LinkedIn) — sin iconos.
- **WhatsApp:** enlace del footer apunta a `https://wa.link/p2s15z`.
- **Fila base:** logo, copyright y enlaces legales — "Terms & Conditions" como placeholder deshabilitado y "Privacy Policy" enlazando a `/privacy`.
- **Homepage:** sólo enlaces públicos (T&C, Privacy Policy, Official Website, FAQs) y medios de contacto; ninguna ruta interna de paneles.
- **Sign in:** sin footer, sin top bar.

Sin cambios de lógica ni rutas.

---

## Entry 037 — Ajustes del footer: fade sin bandas, títulos legibles y separación superior
**Archivo:** `src/components/verbo/Footer.tsx`

- **Degradado:** el fade de 4 paradas se sustituye por una rampa de 14 paradas con curva suavizada (`FADE_STOPS`), eliminando las rayas horizontales visibles.
- **Velo de blur:** capa adicional `backdrop-blur-[2px]` en el tercio superior con `mask-image` vertical, para que ningún borde de parada pueda leerse como línea.
- **Títulos de columna:** pasan de `text-white/35` a navy de marca (`color-mix(in oklab, var(--navy-700) 78%, transparent)`) para no perderse en la zona clara del degradado. Los enlaces se mantienen igual.
- **Tagline:** mismo tratamiento navy al 70% por la misma razón de contraste.
- **Separación:** `mt-20 md:mt-28` en el `<footer>` para que no se funda con la última sección de la página (especialmente en los paneles).

Sin cambios de lógica ni rutas.

---

## Entry 038 — Refinamiento de tarjetas de próximas sesiones (`/student/index`)
**Archivo:** `src/routes/student.index.tsx`

- **Ancho:** el contenedor de la lista pasa de `max-w-xl` a `max-w-lg`, reduciendo ligeramente el ancho de cada tarjeta.
- **Borde:** cambio de `border-[var(--navy-100)]` a `border-[var(--navy-200)]/40` — mantiene el borde fino pero añade una definición sutil para que la tarjeta se distinga del fondo.
- **Watermark:** logo de Microsoft Teams (`teams-logo.webp`) posicionado como marca de agua a la derecha de cada tarjeta, al 5% de opacidad, centrado verticalmente y recortado por el `overflow-hidden` del contenedor. No interfiere con el contenido gracias a `z-0` y al bajo contraste.
- **Jerarquía de capas:** el contenido interno envuelto en `relative z-10` para quedar por encima del watermark.
- **Aplicación:** mismo tratamiento en tarjetas de sesión (`kind === "session"`) y tarjetas de club (`kind === "club"`) para mantener coherencia visual en la lista.

Sin cambios de lógica ni rutas.

---

## Entry 039 — Tarjeta de bienvenida para alumnos nuevos (`/student/index`)
**Archivo:** `src/routes/student.index.tsx`

- **Condición:** cuando el alumno aún no tiene ninguna sesión contabilizada (`gradeable.length === 0`), la tarjeta de *Overall Attendance* se sustituye por una tarjeta de bienvenida. En cuanto se registra la primera sesión, vuelve la tarjeta de asistencia con su lógica y bandas de color existentes.
- **Estilo:** mismo formato `HeroStatCard`, con fondo navy (`linear-gradient(135deg, #01304a, #002233)`) y borde interior blanco al 8%.
- **Contenido:** en lugar del número y el `%`, el mensaje "Ready to get the ball rolling?" en blanco, con subtítulo "starts with your first session". Se conserva la etiqueta "Overall Attendance".
- **Ilustración:** nuevo Verbot de etapa 0 (`stage_0_verbot.svg`, subido como asset CDN) anclado arriba a la derecha con el mismo encuadre que los Verbots de las bandas de asistencia.

Sin cambios de lógica ni rutas.

---

## Entry 040 — Ajuste de opacidad del watermark en tarjeta de bienvenida
**Archivo:** `src/routes/student.index.tsx`

- **Watermark:** la ilustración `stage_0_verbot.svg` de la tarjeta de bienvenida pasa de opacidad implícita 100% a `opacity-[0.08]` (8%), con un tope máximo de 10% para mantener el concepto sin competir con el texto.
- **Posición y encuadre:** sin cambios; solo se redujo la opacidad para que el Verbot actúe como marca de agua casi imperceptible.

Sin cambios de lógica ni rutas.

---

## Entry 041 — Motion y responsiveness del panel de notificaciones
**Archivos:** `src/components/verbo/NotificationsBell.tsx`, `src/styles.css`

- **Apertura del panel:** entra desde la campana con `transform-origin: top right`, `scale(.96) translateY(-4px)` → estado final, 180ms `cubic-bezier(0.23,1,0.32,1)` (`.verbo-notif-panel`). Sin animación de salida para no introducir estado nuevo.
- **Badge de no leídos:** aparece y se re-anima en cada cambio de conteo con `scale(.6)` → `1` en 200ms (`.verbo-notif-badge`).
- **Punto de no leído / fondo de fila:** en vez de desaparecer de golpe al auto-marcar como leído, se desvanecen con `opacity`+`scale` y `background-color` en 260ms con 600ms de retardo (`.verbo-notif-dot`, `.verbo-notif-item`).
- **Entrada de la lista:** stagger de 30ms tope 6 filas, `translateY(4px)` + fade, 200ms (`.verbo-notif-row`).
- **Feedback táctil:** `:active { scale(0.985) }` a 140ms en campana, filas y "Mark all as read" (`.verbo-notif-press`); el tinte de hover se limita a `@media (hover:hover) and (pointer:fine)`.
- **Responsiveness:** ancho del panel `w-[min(20rem,calc(100vw-2rem))]` y lista `max-h-[min(24rem,60vh)]` para evitar desbordes en móvil.
- **Modal de resultado compartido:** la tarjeta ahora entra con `opacity 0 + scale(.97)` en 220ms (`.verbo-modal-card-in`), centrada.
- **Reduced motion:** todas las animaciones caen a un fade de 120ms y se anula el press.

Sin cambios de lógica ni rutas.

---

## Entry 042 — Rediseño del modal de perfil (`StaffProfileModal`)
**Archivos:** `src/components/verbo/StaffProfileModal.tsx`, `src/styles.css`

- **Proporción superior:** banner pasa de `h-24` a `h-36`, avatar de `h-24` a `h-20` y su desplazamiento de `-bottom-12` a `-bottom-10`, dejando más aire en la cabecera y evitando que el avatar se sienta gigante.
- **Gradiente:** reemplazo de cuatro radiales superpuestos por un degradado lineal limpio (`navy-700 → navy-600 → navy-500`) con un solo acento naranja sutil en la esquina superior derecha.
- **Redondeo:** el modal pasa de `rounded-[28px]` a `rounded-[32px]` y conserva un borde fino `border-border/40` para definirlo sin pesadez.
- **Jerarquía visual:** cada sección principal (stats, tags, badges, leaderboard, about me, security) ahora vive dentro de una tarjeta `rounded-2xl bg-card border border-border/60 p-4 shadow-soft`, separando claramente los bloques.
- **Títulos de sección:** pasan a `text-navy-700` con `tracking-[0.14em]` para darles peso y no perderse en el fondo claro.
- **Stats:** reorganizados como icono → valor → etiqueta, con divisores verticales sutiles y valores en navy para jerarquía.
- **Tags:** contador alineado a la derecha del título; chips inactivos con borde y fondo secundario, activos en navy sólido.
- **Badges equipados:** grid más compacto, slots vacíos con borde punteado y hover naranja sutil, badge con fondo secundario y hover.
- **Leaderboard:** radios envueltos en celdas con borde y fondo secundario, hover sutil, input con animación de foco.
- **About me / Security:** mismas tarjetas limpias; inputs con borde y fondo de superficie, no solo fondo gris.
- **Tokens de color:** se reemplazan hardcodes `#01304a`, `#0a4a6e`, `#f38934` por `navy-700`, `navy-600`, `navy-500`, `orange-500`, `orange-600` en las líneas tocadas.
- **Motion:** nueva familia `.verbo-profile-*` en `src/styles.css`:
  - `.verbo-profile-section`: entrada escalonada `translateY(8px) + opacity`, 280ms, delay 40ms por índice.
  - `.verbo-profile-press`: feedback `:active scale(0.97)` a 160ms.
  - `.verbo-profile-chip` y `.verbo-profile-input`: transiciones de estado suaves; el input levanta 1px y proyecta sombra sutil al enfocarse.
  - `prefers-reduced-motion`: se elimina movimiento y press.

Sin cambios de lógica ni rutas.

---

## Entry 043 — Ajustes finos: scrollbar global, avatar en scroll, galería de badges y proporciones del modal de perfil

**Archivos:** `src/styles.css`, `src/components/verbo/StaffProfileModal.tsx`, `src/components/verbo/ProfileModal.tsx`

- **Scrollbar global ultra-minimalista:** `scrollbar-width: thin` + thumb `color-mix(navy-700 14%)` sobre track transparente, 6px, radio completo y hover al 30%. Casi invisible en reposo y sin romper la composición.
- **Foto de perfil al hacer scroll:** el hero (banner + avatar) pasó a vivir **dentro** del contenedor con scroll, así el avatar se desplaza completo en vez de quedar cortado a la mitad contra el header.
- **Galería "View all" de badges:** `max-h-[82vh]`, `w-[calc(100vw-2rem)]`, scroll interno y `rounded-[32px]`; ya no ocupa el 100% de la pantalla y siempre se puede cerrar.
- **Valores de stats centrados:** `text-center` + `leading-tight` en el valor (p. ej. "Core Foundations"), alineado con su etiqueta.
- **Proporciones del modal de perfil:** ancho `max-w-xl → max-w-2xl`, altura de scroll `78vh → 66vh` (−15%) y esquinas `rounded-[32px] → rounded-[40px]`.

Sin cambios de lógica ni rutas. `DATA_MODEL.md` sigue sincronizado.

## Entry 044 — Profile modal: rounder shell, larger avatar, hidden scrollbar
- `DialogContent` rounding increased to `52px`; the scroll container inherits the radius so the hero banner no longer renders square corners.
- Hero banner grew to `h-40`; avatar enlarged from `h-20 w-20` to `h-28 w-28`, with the edit button and presence dot rescaled and repositioned; content top padding to `pt-16`.
- Added `.verbo-scroll-hidden` in `src/styles.css` and applied it to the modal scroll area so the scrollbar is fully invisible while scrolling still works.
- No logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 045 — Current Course card: icon treatment
- Replaced the grey `bg-primary/10` rounded-square icon tile with a 48px circular chip on the card background, a hairline navy border and a 1px soft shadow.
- Icon reduced to `h-5 w-5` with `strokeWidth 1.5`; hover scale softened to `1.03` at 200ms ease-out.
- Purely presentational; no logic, data or route changes. `DATA_MODEL.md` remains synchronized.

## Entry 046 — Admin overview: minimal, functional redesign + motion pass
- Header restructured: eyebrow + `Admin` title over a hairline divider, with the five quick actions turned into compact pill buttons (icon tinted with each identity color) instead of five loud filled buttons.
- Priority cards: the crimson gradient hero and the amber glow card are now two equal, quiet `bg-card` cards with a 3px accent rule, a tinted icon chip, and a large right-aligned count; accent goes neutral grey when the count is 0.
- Summary strip: flat bordered cards, small tracked labels, 4xl tabular numbers, hairline icons; removed colored glow shadows. Avg composite folded into the same strip with a "Below target" note instead of a pulsing card.
- Announcements: replaced the gradient/blob/watermark banner with a plain divider header (icon chip, eyebrow, title, active count).
- Motion: `.verbo-admin-section` staggered 320ms ease-out entrance (60ms steps), `.verbo-admin-press` 0.985 press feedback, `.verbo-admin-lift` hover lift gated behind `hover:hover`/`pointer:fine`; all reduced to a 120ms fade under `prefers-reduced-motion`.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 047 — The Money Lab: minimal functional redesign + motion pass
- Header restructured: `Financial` eyebrow + `The Money Lab` title over a hairline divider; the month selector became a rounded pill control with press feedback.
- Summary strip: the five `HeroStatCard`s with colored glow shadows were replaced by flat bordered `bg-card` cards with a 3px colored top rule, tracked micro-labels, hairline icons and tabular numbers; the Net warning is now inline text instead of an amber box.
- Chart: removed the red expense bars (the "red rectangle") — expenses now read as a dashed amber line and Net as a solid navy line over green income bars (rounded `8px`, `maxBarSize 34`, 0.35 opacity for unselected months). Softer dotted grid, wider tooltip radius/shadow, responsive height (`240px` → `280px`), plus a "Tap a bar to jump to that month" hint.
- Income vs Expenses tables are now visually distinct: each is a section card with its own left accent rule (green / amber), a tinted header band with an icon chip, row count and a right-aligned running total. Solid status pills were left untouched as requested.
- Tables: taller rows, tabular numbers, light-weight secondary text, `Type` rendered as an outline chip, `min-w-[720px]` with hidden-scrollbar horizontal scroll for small viewports.
- Motion: reused `.verbo-admin-section` staggered entrance, `.verbo-admin-press` on buttons, `.verbo-admin-lift` on summary cards, and added `.verbo-money-row` (280ms staggered row entrance at 26ms steps + hover tint gated behind `hover:hover`/`pointer:fine`), all neutralized under `prefers-reduced-motion`.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 048 — Admin quick actions: identity chips + hover glow
- Each quick action now carries its own identity: a 28px circular icon chip tinted with the action color (teal / orchid / navy / gold / green), a border tinted at 22% of that same color, and tighter pill geometry (`pl-1.5 pr-4`).
- New `.verbo-quick-action` motion family in `src/styles.css`: hover scales the pill to `1.035`, lifts the border to 48% of the action color and adds a two-layer colored glow (`0 0 0 3px` halo + `0 10px 26px -12px` drop); the icon chip deepens to 20% tint and scales `1.06`.
- Press feedback `scale(0.97)` at 180ms `cubic-bezier(0.23, 1, 0.32, 1)`; hover effects gated behind `hover:hover`/`pointer:fine` and all transforms neutralized under `prefers-reduced-motion`.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 049 — Admin students: tier/group card redesign + motion pass
- Cards rebuilt around a single identity signal: a 3px left tier rail colored by access plan (Core orange, Advance navy, Elite/Signature gold), with the solid plan pill moved to the top-right so tiers align across the grid.
- Elite/Signature cards get a quiet diagonal gold wash (`sheen`) instead of a louder border; non-performance cards (Workshops/Insights) reuse the same shell with the primary accent and a leading type icon.
- Group vs individual is now explicit in two places: a blue badge on the avatar and a dedicated line (`Users` chip with the group name, or a muted "Individual" chip); group cards also carry a faint blue field and blue-tinted border so members read as a set.
- Sessions promoted into its own bordered panel: tracked micro-label, tabular `remaining/hired` in display type, 1px progress bar tinted with the tier color, and the roadmap level as a light caption underneath.
- Identity row now shows product (and company for Enterprise) as a light subtitle; the status strip keeps status, Insights and Book Club strike tags.
- Motion (`.verbo-student-card` family in `src/styles.css`): 300ms `cubic-bezier(0.23, 1, 0.32, 1)` entrance staggered 34ms (capped at 12 cards), hover lift `-3px` with a tier-colored halo + drop glow, rail thickening to 4px, avatar `1.04` / group dot `1.10` scale, `0.985` press feedback and a 420ms progress-bar width transition. Hover gated behind `hover:hover`/`pointer:fine`; all transforms neutralized under `prefers-reduced-motion`.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 050 — Money Lab chart: one visual language (grouped bars)
- The chart mixed two encodings at once (green bars for income + two monotone lines for expenses and Net), which made small values collapse onto the baseline and read as noise. Replaced the `ComposedChart` with a single `BarChart`.
- Received / Expenses / Net are now three grouped bars per month (green / amber / navy, `maxBarSize 22`, `radius 6`, `barGap 4`, `barCategoryGap 22%`), with unselected months at 0.4 opacity and the selected month at full.
- Added a zero `ReferenceLine` so a negative Net reads correctly, and switched the legend line swatches to dots to match the bar encoding.
- Click-to-jump behaviour, data shape, tooltips and routes untouched — visual encoding only; `DATA_MODEL.md` remains synchronized.

## Entry 051 — Student detail modal: visual hierarchy + motion pass
- The Overview tab was one long flat list of label/value pairs. It is now split into six titled sections (Contract, Entitlements, Learning path, Logistics, Billing, Team), each introduced by a bold 13px uppercase heading followed by a hairline rule that runs to the edge, so section boundaries are unmistakable.
- Typography weight ladder restored: micro-labels are 10px `font-semibold` uppercase at `0.14em` tracking in muted 80%, values are regular `text-foreground/90`, and key figures (Sessions, Next payment, payment amounts) are `15px font-semibold` with tabular numbers. Section headings sit above both.
- Header rebalanced: 56px avatar with a 2px white ring, larger name, and a single uppercase meta line (product · plan · company) instead of the low-contrast run-on caption.
- Shell: rounding raised to 28px, height to `90vh`, padding to `px-5 sm:px-7`; tabs scroll horizontally with hidden scrollbars on narrow viewports and gain a hover tint; body and tab strip use the invisible-scrollbar treatment.
- Rows (learning path, video link, payment history) upgraded to 12px-rounded panels with hover border/background feedback.
- Motion (`.verbo-sdm*` in `src/styles.css`): modal enters at 240ms `cubic-bezier(0.23, 1, 0.32, 1)` from `scale(0.985)` + 8px, sections stagger in at 45ms steps (capped), all buttons carry `scale(0.97)` press feedback with a `-1px` hover lift and soft navy shadow gated behind `hover:hover`/`pointer:fine`; everything neutralized under `prefers-reduced-motion`.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 052 — Admin priority cards: accent glow + live pulse
- The two priority cards (Action required / Worth a look) now carry their own accent color as `--pa` (crimson / gold) and, when they hold items (`data-live="true"`), a resting accent glow: a `0 0 0 3px` halo at 7% plus a `0 14px 30px -22px` drop at 80%, with the border tinted 26% toward the accent.
- Added a slow 2600ms `ease-in-out` breathing pulse on live cards (halo 3px→6px, 6%→12%) so a card with pending work reads as still waiting on the admin; empty cards stay completely still.
- Hover deepens the glow (4px halo at 12%, stronger drop), lifts the card `-2px`, thickens the accent rail to 4px, scales the icon chip to `1.06` and pauses the pulse so hover feedback stays legible. Gated behind `hover:hover`/`pointer:fine`.
- Pulse and transforms fully neutralized under `prefers-reduced-motion`.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 053 — Student detail modal: tabs stay pinned on tall tabs
- Con los tabs Badges y Course Progress, el contenido crecía por encima del alto del modal y empujaba el header y la barra de tabs fuera de vista.
- Causa: el contenedor scrollable era `flex-1` sin `min-h-0`, así que el flex item no podía encogerse por debajo de su contenido.
- Corregido: el cuerpo ahora es `min-h-0 flex-1 overflow-y-auto`, y el header y la barra de tabs llevan `shrink-0`, de modo que siempre quedan fijos y solo el contenido hace scroll.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 054 — Admin teacher cards: status identity, tighter layout, frozen ice
- Cada tarjeta ahora lleva su estatus como identidad visual (`--st`): riel de 3px a la izquierda, anillo del avatar, pastilla de estatus en mayúsculas y glow del mismo color en hover — Active teal `#0f766e`, Frozen ice `#38bdf8`, Removed gris `#94a3b8` con `grayscale(0.4)`.
- Layout reorganizado: identidad (avatar 56px + nombre + email + pastilla de estatus + tags de producto) arriba, fila única de 4 métricas con divisores y números tabulares (Rating, Planning, Students, This month) en lugar del grid 2×2 de chips, y medidor de strikes de 3 segmentos con contador `n/3` abajo.
- Frozen: la carta completa queda encerrada en hielo — capa `.verbo-ice` con `backdrop-filter: blur(1.6px)`, gradientes cruzados de escarcha/facetas, borde interior cian y etiqueta "FROZEN"; en hover el hielo se aclara ligeramente (0.92 → 0.72) para poder leer la carta.
- Motion: entrada `translateY(8px) scale(0.985)` a 300ms `cubic-bezier(0.23, 1, 0.32, 1)` con stagger de 34ms (tope 11), hover `-3px` + zoom del avatar 1.04 gated por `hover:hover`/`pointer:fine`, press `scale(0.985)`; todo neutralizado bajo `prefers-reduced-motion`.
- El glow rojo de "Needs review" (`.verbo-review-glow`) se mantiene intacto.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 055 — Admin teacher detail modal: hierarchy + section grouping
- Header rediseñado: avatar 64px con anillo `ring-white/25`, nombre a 22px semibold y email en 12px al 60% — la tarifa y el tier salen del subtítulo y pasan a una tira de datos rápidos.
- Nueva tira de 4 celdas bajo el header (Tier · Rate · Students activos/total · Rating) con micro-labels de 9.5px uppercase `tracking-[0.14em]` y valores semibold tabulares, separadas por hairlines de 1px.
- Overview reorganizado en tres secciones tituladas (`Compensation`, `Qualified products`, `Assigned students`) con encabezado 13px bold + hint contextual + regla hairline, en vez de una lista plana de labels iguales.
- Chips de producto en pastilla completa (activo sólido / inactivo con borde hairline), filas de alumno con nombre semibold, tag de producto debajo y botón Reassign redondeado.
- Modal a `rounded-[28px]`, header y tabs `shrink-0`, cuerpo `min-h-0 overflow-y-auto`, tabs con scroll horizontal sin scrollbar; footer separa acciones neutras (izquierda) de estatus/destructivas (derecha).
- Motion: entrada del modal `verbo-sdm-in` (240ms, `cubic-bezier(0.23, 1, 0.32, 1)`), secciones escalonadas cada 45ms, press `scale(0.97)` y hover lift en acciones; todo neutralizado bajo `prefers-reduced-motion`.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 056 — Admin teacher cards: status glow replaces the "Needs review" pill
- Eliminada la pastilla flotante "Needs review (n)" que se encimaba con el email y los tags; el estado ahora se comunica solo con el glow rojo de la tarjeta (el conteo queda en el `title` para hover/lectores).
- Needs review: pulso rojo exagerado `verbo-review-glow-strong` (1.5s `ease-in-out`, halo 1px→4px y drop 10px→34px) con borde tintado al 45%; se pausa en hover para poder leer la tarjeta.
- Active: glow verde en reposo, sutil — hairline teal al 12% + `0 10px 26px -22px` del mismo teal.
- Removed: se lee como deshabilitada (`grayscale(1)`, opacidad 0.55, fondo mezclado con `--muted`) pero sigue siendo clickeable; en hover recupera color (grayscale 0.7 / opacidad 0.78) para indicar que se puede abrir.
- Pulso neutralizado bajo `prefers-reduced-motion` (glow fijo en su lugar).
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 057 — Student cards: status glows + frozen ice
- Reutiliza el vocabulario visual de las tarjetas de teacher, sin componentes nuevos.
- Frozen: capa de hielo `.verbo-ice` + etiqueta `FROZEN` sobre toda la tarjeta; se aclara en hover.
- Active: glow verde ahora sí visible (hairline #16a34a 30% + halo `0 0 18px -2px` al 42%).
- Crítico (suspendido, Insights/Book Clubs bloqueado, pago vencido): pulso rojo exagerado `verbo-review-glow-strong`, pausado en hover.
- Pago próximo (≤3 días): pulso ámbar exagerado `verbo-warn-glow-strong` (1.6s), pausado en hover.
- `prefers-reduced-motion`: pulsos sustituidos por glow fijo.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 058 — /admin/kpis: rediseño completo (hairlines en vez de bloques sólidos)
- Header + controles en una sola fila responsive: toggle "Needs review only" y "Bonus threshold" como píldoras con hairline (fuera la caja al 30%).
- Summary strip: tarjetas con riel de acento 3px + chip de icono tintado (`color-mix` 10%) en lugar de glows sólidos; label 10px uppercase / valor 30px `font-display` tabular / hint 11px light.
- Tarjeta de teacher: eliminado el header de color sólido; ahora riel de acento por tier + chip de tier tintado, nombre 19px semibold y email 11.5px light.
- Rating pill tintada (no fondo sólido blanco sobre color); composite como número 34px en color de banda; bloque "Signals" con etiqueta de sección.
- KpiTile: fuera el chip sólido blanco → número tabular + barra de 1px de progreso en color de umbral, con `sub` en 10.5px light.
- Needs review reutiliza el pulso rojo exagerado `verbo-review-glow-strong` (pausa en hover) + línea de resumen "N sessions needing review".
- Movimiento: entrada `verbo-kpi-in` escalonada 34ms, hover lift −3px con glow del acento, press `scale(0.99)`; todo bajo `prefers-reduced-motion`.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 059 — /admin/kpis: tarjetas por secciones + rating pill sólido
- La tarjeta deja de ser un lienzo blanco: ahora tres zonas con superficie propia — header tintado con el color del tier (gradiente 9%→4% + hairline del acento), bloque de composite sobre navy 4% con inset ring, y bloque "Signals" sobre navy 2.5% separado por hairline.
- Título "Signals" con regla horizontal y peso más alto (`text-foreground/70`, tracking 0.16em) para marcar el corte de sección.
- `KpiTile` con superficie card + inset ring del color del umbral; en hover de la tarjeta se tiñe 5%.
- Rating pill: fondo sólido en el color de banda con texto blanco y sombra de color (antes tinte 10% con texto de color); hover oscurece 12%.
- Barra de "needs review" ahora full-bleed con fondo destructive 6%.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 060 — /admin/kpis: color dinámico en Avg rating y Avg composite
- Nuevo helper `scoreScaleColor(0-100)`: rampa continua rojo (#dc2626) → naranja (#ea580c) → ámbar (#f59e0b) → amarillo-verde (#a3bf18) → verde (#3f8f10), interpolada en RGB.
- "Avg rating" (normalizado /5) y "Avg composite" ahora pintan el número, el icono, el chip y el riel con el color de su propio valor; "Sessions tracked" y "Teachers" siguen con su acento fijo (no son métricas de desempeño).
- Transición de color de 260ms para que el cambio de valor no salte.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 061 — /admin/kpis: rating pill usa la misma rampa de color que composite
- El helper `ratingColor` dejó de devolver colores discretos (verde/café/rojo) y ahora normaliza el rating a 0-100 y reutiliza `scoreScaleColor`.
- Resultado: un rating de 3.2/5 (64%) pinta el mismo ámbar/naranja que un composite del 64%, en lugar del café oscuro anterior.
- El pill mantiene fondo sólido + texto blanco; solo cambia la tonalidad para alinearse visualmente con el score del card.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 062 — Login eye button: fix slow-click + micro-animation refinement
- `src/routes/login.tsx`: botón del ojo ahora usa `onMouseDown={(e) => e.preventDefault()}` para evitar que el input pierda foco durante el clic; hit-area ampliada a `p-1.5`; `z-10` para asegurar que nada lo bloquee; `aria-pressed` añadido para accesibilidad.
- `src/styles.css`: eliminado el `:active` que escalaba todo el botón (`transform: translateY(-50%) scale(0.88)`), porque el escalado combinado con `translateY(-50%)` desplazaba el botón hacia arriba ~13px y hacía que el cursor quedara fuera del área clickable en clics lentos.
- Ahora la animación de press aplica solo al icono interno `.verbo-eye` (`scale(0.88)` con `transform-origin: center`), manteniendo el feedback visual sin mover el botón.
- Resultado: el ojo responde correctamente tanto en clics rápidos como en clics sostenidos, y alterna entre mostrar/ocultar la contraseña de forma confiable.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 063 — /teacher: rediseño completo del dashboard (Apple-design + animaciones)
- Header: eyebrow "Good day," + nombre en 40px semibold con tracking -0.02em, grid `minmax(0,1fr)_auto` con pills de rango/sesiones a la derecha y hairline inferior en lugar del bloque anterior.
- Stat cards: superficie `bg-card` con borde hairline (se eliminó el look de bloque sólido), eyebrow uppercase 10px, cifra 48px tabular, subtítulo contextual ("active roster", "next 7 days", "last 30 days · view trend"). Performance añade barra de progreso fina con el color del score. Entrada escalonada `verbo-td-in` (0/45/90/135ms) y press feedback `verbo-td-press`.
- Action cards (Attention / Planning / Completion): generadas desde un array, altura reducida a 104px, conteo grande + título en la misma línea y pulse rojo solo cuando hay items pendientes.
- Recent Activity: la tabla pasó a un "ledger" con cabecera de columnas 10px uppercase, filas con riel de color según estado (verde/rojo/ámbar/violeta), origen como chip y entrada escalonada de 34ms por fila; en pantallas medianas colapsa a una sola columna apilada.
- My Recent Feedback: dejó de ser una tabla idéntica a Recent Activity — ahora es un grid de tarjetas tipo testimonial con comilla de fondo, avatar con iniciales coloreado por rating, estrellas, cita en 15px y footer con rating + estado de revisión.
- Quick Actions: padding e iconos responsivos (10→12) y entrada escalonada por tarjeta.
- `src/styles.css`: nuevas utilidades `verbo-td-in` (spring 320ms), `verbo-td-press`, `verbo-act-row` / `verbo-act-rail` y `verbo-fb-card`.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 064 — /teacher/financial: rediseño completo con sistema de color por "bucket"
- Paleta dedicada `FIN`: violeta (Sessions Taught), rosa (Adjustments), ámbar (Bonus) y verde-teal (Total Earned), aplicada de forma consistente a iconos, rieles, barras y montos para que cada bloque sea identificable de un vistazo.
- Iconografía renovada: `Wallet`/`GraduationCap`/`Scale`/`Medal`/`TrendingUp` en las secciones y iconos específicos por KPI (`Wifi`, `CalendarCheck2`, `ClipboardCheck`, `Smile`, `CalendarX2`, `RefreshCcwDot`).
- Header: eyebrow "PAYMENTS · TEACHER PANEL", título 40px, pill de tier y selector de mes con press feedback; debajo, fila de señales (streak, KPIs bajo objetivo) sobre hairline.
- Hero "Total Earned": cifra grande tabular + barra de distribución multicolor con leyenda de porcentaje por bucket.
- Tarjetas de métrica: superficie hairline con riel superior de color, chip de icono tintado, chevron de estado y anillo de acento al estar expandidas (se eliminaron los gradientes sólidos).
- Paneles de detalle unificados (`PanelShell`): cabecera tintada con icono, filas con entrada escalonada (26ms), colapso a una columna en móvil y estados vacíos consistentes.
- Performance: gauge circular SVG (`CompositeGauge`) con animación de trazo y color según score, junto a un grid responsive de KPI tiles con barras animadas.
- `src/styles.css`: nuevas utilidades `verbo-fin-panel` (entrada del acordeón), `verbo-kpi-tile` (hover elevado con gating `hover:hover`) y `verbo-bonus-glow` global, todas con soporte `prefers-reduced-motion`.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 065 — /teacher: jerarquía de los chips de tier y sesiones en el header
- Los dos `Pill` genéricos del header (mismo gris, misma tipografía) no comunicaban su importancia; se sustituyeron por dos chips con peso visual propio, sin tocar la fuente de datos ni el componente `Pill` compartido.
- Tier: badge sólido navy (`bg-primary`) con icono `Trophy` en un círculo translúcido, nombre del rango en 12px bold y sufijo "TIER" en 10px uppercase al 60% de opacidad, con sombra suave para elevarlo del fondo.
- Sesiones impartidas: chip number-forward sobre `bg-card` con borde hairline — la cifra en 15px bold tabular y la etiqueta "SESSIONS TAUGHT" en 11px uppercase tracking amplio, para que el dato se lea antes que el texto.
- `src/styles.css`: utilidad `.verbo-hdr-chip` con hover de 1px (gated a `hover:hover`) y respeto a `prefers-reduced-motion`.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 066 — /teacher: rediseño de la sección Quick Actions
- La sección no destacaba: cuatro tarjetas blancas sueltas con sombra tenue que se leían como relleno. Se sustituyeron por un único panel unificado (`rounded-3xl`, hairline, sombra baja) que agrupa las acciones como una sola pieza.
- Cabecera del panel en navy sólido (`bg-primary`) con punto de acento, título "QUICK ACTIONS" en 11px bold uppercase tracking amplio y microcopy "Jump straight in" al 60% — el bloque de color da el contraste que antes faltaba.
- Acciones convertidas en filas/columnas divididas por hairlines (1 col en móvil, 2 en sm, 4 en lg) en vez de tarjetas independientes: icono, etiqueta en 14px bold y descripción secundaria de 11px ("Set your weekly slots", "Claim open sessions", "Earnings & payouts", "Design VIP tracks") para que se entienda cada destino.
- Hover: relleno sutil `bg-muted/50`, barra de acento inferior que crece desde la izquierda (`scale-x` 200ms ease-out), icono +5% y chevron desplazado 4px; se conserva la entrada escalonada y el press feedback existentes.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 067 — /teacher: legibilidad del ledger "Recent Activity"
- La tabla se veía incompleta por el lado izquierdo: el riel de color estaba al 55% de opacidad y comprimido a `scaleY(0.35)`, así que aparecía como un guion suelto en vez de un indicador de fila.
- El riel ahora ocupa la altura completa de la fila (`inset-y-1`), se muestra siempre al 75% de opacidad y en hover se engrosa (`scaleX(1.6)`) hasta opacidad total, con origen a la izquierda.
- Se alineó el padding izquierdo de la cabecera y de todas las filas a `pl-6` (antes `px-5`/`pl-5`), de modo que el riel ya no compite con el nombre del alumno/grupo y las columnas quedan a plomo con sus encabezados.
- Estado vacío alineado al mismo padding; `prefers-reduced-motion` conserva el riel visible sin transformación.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 068 — /teacher: contadores de las tarjetas de foco como watermark gigante
- Los números (5 / 3 / 2) vivían inline junto al título en 30px, compitiendo con el texto y sin jerarquía propia.
- Ahora se renderizan como watermark: cifra en 104px bold tabular, blanca al 8% de opacidad, anclada a la derecha (`right-3`) y ocupando el 100% de la altura de la tarjeta (`-inset-y-4` para compensar el `py-4`), con `overflow-hidden` en la tarjeta y `pointer-events-none`.
- El título pasa a ocupar la primera línea sin el número delante; el icono se mantiene por encima del watermark.
- El valor sigue siendo dinámico (`p.count`) — visual only, no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 069 — /teacher: Avg Rating con rampa continua de color
- El número de "Avg Rating" usaba cuatro cortes fijos (verde/amarillo/naranja/carmesí), así que 3.4 y 2.6 se veían idénticos.
- Ahora usa la misma rampa continua rojo → naranja → ámbar → verde del panel de KPIs (`scoreScaleColor`), mapeando el rating 0-5 a 0-100; sin rating, gris neutro `#94a3b8`.
- El color alimenta a la vez la cifra y el `--verbo-focus-pulse-color` de la tarjeta, por lo que el glow acompaña al valor real.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.

## Entry 070 — /teacher: nueva acción rápida "Tailored Content"
- Se añadió una cuarta acción en el panel Quick Actions con ruta a `/teacher/tailored-content`, etiqueta "Tailored Content" y descripción "Prepare your personalized sessions".
- Su icono usa el SVG animado aportado por el usuario, servido como asset (`src/assets/vip-tailored.svg.asset.json`), en la misma posición que los iconos de las otras acciones.
- La entrada escalonada se recalibró: Tailored Content a 135ms y Course Builder VIP (condicional) a 180ms.
- Visual/content only — no logic, data or route logic changes; `DATA_MODEL.md` remains synchronized.

## Entry 071 — /teacher: alineación de cabeceras y columnas del ledger
- La cabecera y cada fila eran grids independientes con columnas `auto`, así que los anchos se calculaban por separado y "Date", "Origin" y "Status" no coincidían con su contenido.
- Se fijó una plantilla de columnas idéntica en cabecera y filas (`minmax(0,1.5fr) 150px 170px 110px`), de modo que cada título empieza exactamente donde empieza su contenido.
- "Status" pasa a alinearse a la izquierda como el resto (antes `justify-self-end`), y la columna Date se estrechó para pegarse a su dato.
- Visual only — no logic, data or route changes; `DATA_MODEL.md` remains synchronized.
