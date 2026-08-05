# DATA_MODEL.md — Verbo Academy

**Generado:** 2026-07-11, leyendo el código real del repo `verbodev26/verbo-academy-development` (rama `main`) vía `raw.githubusercontent.com` (único método de acceso de solo-lectura disponible en este entorno; `git clone`/`api.github.com` están bloqueados aquí).

**Alcance de esta versión:** se leyeron los ~45 archivos de `src/lib/*.ts` (stores + modelos + utilidades de datos), `src/lib/mock-data.ts` (fuente de `User`, `Session`, `ASSIGNMENTS`, `LEVELS`, `MATERIALS`), `src/components/verbo/RoleGuard.tsx` y `TopNav.tsx`, los tres layouts de rol (`admin.tsx`, `teacher.tsx`, `student.tsx`), y una muestra de 17 componentes/rutas para la sección de Deuda de Datos. **No se leyeron línea por línea** todas las ~40 rutas ni los ~50 componentes de UI genéricos (`src/components/ui/`) — donde algo depende de un archivo no leído, se marca explícitamente con ⚠️ en vez de asumirlo.

**Regla seguida:** ningún campo, entidad o enum de este documento fue inventado — todo proviene de código fuente citado. Donde algo es ambiguo o no se pudo verificar, se marca con ⚠️ en vez de resolverlo.

---

## Índice

1. Núcleo — Usuarios y Roles
2. Sesiones y Calendario
3. Cursos y Contenido Académico
4. Retos y Gamificación (Challenges / Verbo Flash)
5. Clubs y Workshops
6. Grupos, Asistencia y Disciplina
7. Comunicación (anuncios, notificaciones, reportes, log de actividad)
8. Financiero (solo tracking, nunca cobro real)
9. Performance / KPIs
10. Configuración y Taxonomías
11. Matriz de permisos por rol
12. Enums y estados (consolidado)
13. Deuda de datos (consolidado)

---

## 1. Núcleo — Usuarios y Roles

### `User` (`src/lib/mock-data.ts`)

**Propósito:** entidad maestra única para Admin, Teacher y Student (discriminada por `role`) — combina perfil del alumno, modelo comercial, perfil de maestro y datos de nómina en una sola interfaz plana ("god object").

| campo | tipo | requerido/opcional | notas |
|---|---|---|---|
| id | string | requerido | |
| name | string | requerido | |
| email | string | requerido | |
| password | string | requerido | ⚠️ texto plano en seed data |
| role | `"student" \| "teacher" \| "admin"` | requerido | |
| must_change_password | boolean | opcional | `true` cuando un admin registra un alumno nuevo; obliga a cambio de contraseña en el próximo login y bloquea navegación hasta `/change-password`. Se limpia a `false` al completar el cambio. Ausente/`false` para usuarios ya existentes (no aplica retroactivo). |
| current_level | string | opcional | Nivel CEFR de **diagnóstico inicial**, asignado por Admin al dar de alta (Admin > Students, campos "Initial English Level" / "CEFR Level"). ⚠️ **NO es el "nivel actual" del alumno en su currículo contratado** — ese se calcula en tiempo real con `computeCurrentProgress(...)` en `src/lib/product-courses-store.ts` (recorre los `contracted_levels` y `unitPassed()` para devolver el nivel comercial en curso). Toda UI que diga "Current Level" debe usar el helper; `current_level` sigue existiendo solo para el diagnóstico inicial. |
| admin_type | `"super_admin" \| "coordinator_ops" \| "coordinator_fin"` | opcional | solo relevante si `role === "admin"` |
| attendance_percentage | number | opcional | |
| avatar | string | opcional | (ver también `avatar-store.ts`, que guarda avatares por separado, ver §10) |
| company | string | opcional | perfil corporativo del alumno |
| hired_plan | string | opcional | ⚠️ alias legacy de `access_plan`, documentado como tal en el propio código |
| member_since | string (ISO date) | opcional | |
| hired_sessions | number | opcional | |
| remaining_sessions | number | opcional | decrementa en `submitSessionReport` para 1:1 (no origin, no group_id, no workshop_*) cuando la clase ocurrió (no aplica si `absent` con `absentCause === "teacher"`). Ajustes vía `adjustRemainingSessions(studentId, delta)` en `students-store.ts`, siempre clamped a `[0, hired_sessions]`. |
| product | `"enterprise" \| "go" \| "international" \| "vip"` | opcional | |
| focus | string | opcional | nombre de "Enfoque" (solo GO/International) |
| access_plan | `"Core" \| "Advance" \| "Elite" \| "Signature"` | opcional | |
| contracted_levels | string[] | opcional | nombres comerciales de nivel del roadmap |
| current_roadmap_level | string | opcional | |
| reopened_levels | string[] | opcional | niveles reabiertos por admin, modo solo-lectura |
| sessions_per_week | number | opcional | |
| session_duration | number | opcional | minutos |
| reschedule_policy | string | opcional | preset o "Custom" |
| reschedule_custom_hours | number | opcional | |
| reschedule_custom_pct | number | opcional | |
| payment_day | number | opcional | 1–31 |
| cycle_start | string (ISO date) | opcional | |
| next_payment | string (ISO date) | opcional | |
| video_call_link | string | opcional | ⚠️ también existe en `Group`, sincronizado manualmente (ver §6) |
| status | `"active" \| "suspended" \| "frozen"` | opcional | estado del alumno |
| insights_strikes | number | opcional | |
| bookclub_strikes | number | opcional | |
| sessions_auto | boolean | opcional | |
| admin_notes | string | opcional | |
| freeze_start / freeze_end | string | opcional | |
| product_type | `"performance" \| "workshops" \| "insights"` | opcional | legacy default a "performance" si falta |
| addon_insights_per_month | number | opcional | |
| addon_bookclubs_per_month | number | opcional | |
| addon_spotlight_per_month | number | opcional | |
| addon_workshops_enabled | boolean | opcional | solo toggle; membresías de cohorte viven en `workshops-store.ts` |
| qualified_products | (`"enterprise"\|"go"\|"international"\|"vip"`)[] | opcional | perfil de maestro |
| hourly_rate | number | opcional | MXN/hora |
| teacher_status | `"active" \| "frozen" \| "removed"` | opcional | |
| rating | number | opcional | 0–5 |
| plan_punctuality / report_punctuality | number | opcional | % |
| hours_month / hours_cycle | number | opcional | |
| availability | `{ day: string; slots: string[] }[]` | opcional | |
| availability_request | `{ note: string; requested_on: string } \| null` | opcional | |
| payment_frequency | `"weekly" \| "biweekly" \| "monthly"` | opcional | |
| payment_records | `{ id; date; status: "pending"\|"paid" }[]` | opcional | `pending → paid` al cerrar ciclo (Generate PDF report). Reversible: en Admin > Teachers > Financial, un registro `paid` ofrece "Revert to Pending" con confirmación (`paid → pending`); no restaura horas ni adjustments ya reseteados |
| adjustments | `{ id; date; amount: number; reason: string }[]` | opcional | |

**Relaciones:** casi todas las demás entidades del sistema referencian `User.id` vía `student_id`/`teacher_id`/`actorId`/etc. Ver `ASSIGNMENTS` abajo para la relación maestro↔alumno.

---

### `AdminType` / `CoordinatorType` (`src/lib/admin-roles.ts`)

- `AdminType`: `"super_admin" | "coordinator_ops" | "coordinator_fin"`
- `CoordinatorType` (etiqueta derivada): `"operations" | "financial"` — se deriva de `admin_type` vía `coordinatorTypeOf()`.

### `UserStatusOverride` (`src/lib/admin-roles.ts`)
Override de activo/desactivado para usuarios internos (admins), persistido aparte de `User`.

| campo | tipo | notas |
|---|---|---|
| status | `"active" \| "deactivated"` | clave del mapa = `User.id` |

### `CreateInternalUserInput` (`src/lib/admin-roles.ts`)
Payload de creación de usuario interno (no persistido como tal, produce un `User`).

| campo | tipo | requerido | notas |
|---|---|---|---|
| name | string | sí | |
| email | string | sí | único, case-insensitive |
| password | string | sí | mínimo 4 caracteres |
| role | Role | sí | |
| admin_type | AdminType | condicional | obligatorio si `role === "admin"` |

### `ASSIGNMENTS` (`src/lib/mock-data.ts`)
**Propósito:** tabla puente maestro↔alumno — **la única fuente de verdad** de esta relación referenciada por `teacher-model.ts`, `groups-store.ts`, `teacher.tsx`, `substitute-engine.ts`.

```ts
{ teacher_id: string; student_id: string }[]
```
Tipo anónimo, sin `id` propio, sin `interface` exportada, sin timestamps de auditoría.

### `Avatar` (`src/lib/avatar-store.ts`)
Mapa `userId → dataUrl` (base64 completa). Sin interfaz formal (`Record<string,string>`).

---

## 2. Sesiones y Calendario

### `Session` (base, `src/lib/mock-data.ts`)

| campo | tipo | requerido/opcional | notas |
|---|---|---|---|
| id | string | requerido | |
| student_id | string | requerido | ⚠️ para sesiones de workshop, guarda el `cohort_id`, no un alumno real |
| teacher_id | string | requerido | |
| date_time | string (ISO) | requerido | |
| duration_minutes | number | requerido | |
| teams_link | string | requerido | |
| status | `SessionStatus` | requerido | |
| absent_cause | `"student" \| "teacher"` | opcional | |
| report_pdf_url | string | opcional | |
| student_rating | number | opcional | |
| student_comment | string | opcional | |
| review_status | `"pending" \| "reviewed"` | opcional | |
| review_note | string | opcional | |
| notes | string | opcional | |
| attendance_delayed | boolean | opcional | ver ⚠️ en §12 sobre `"delayed"` |
| report_submitted_at | string | opcional | alimenta KPI `report_punctuality` |
| origin | `"course" \| "workshop" \| "spotlight"` | opcional | `"spotlight"` marca la sesión como Spotlight Session (creada vía `student-requests-store.addClaimedSession` o `convertSessionToSpotlight`). Sin origin = clase 1:1 regular. |
| workshop_cohort_id / workshop_template_id / workshop_topic | string | opcional | |

### `ExtSession` (`src/lib/sessions-store.ts`)
Extiende `Session` (con `Omit<Session,"status">`), agregando el ciclo de vida real de la sesión:

| campo | tipo | requerido/opcional | notas |
|---|---|---|---|
| status | `ExtSessionStatus` (11 valores, ver §12) | requerido | sobrescribe `Session.status` |
| group_id | string | opcional | agrupa sesiones de un mismo grupo |
| member_statuses | `Record<string, ExtSessionStatus>` | opcional | key = studentId implícito |
| member_absent_cause | `Record<string, "student"\|"teacher">` | opcional | |
| attendance_sub_status | `AttendanceSubStatus` | opcional | |
| member_sub_statuses | `Record<string, AttendanceSubStatus>` | opcional | |
| report_locked | boolean | opcional | |
| report_admin_edits | `ReportAdminEdit[]` | opcional | auditoría |
| cancellation_reason | `"illness"\|"personal"\|"major_issue"\|"other"` | opcional | |
| cancellation_note | string | opcional | |
| needs_substitute | boolean | opcional | |
| covered_by_substitute | boolean | opcional | true al asignar sustituto desde `CandidatesModal`; alimenta el color "Substitution" en calendarios de staff |
| report_comments | string | opcional | |
| holiday_makeup | boolean | opcional | `true` solo en sesiones auto-generadas por el Bulk Scheduler de Admin > Sessions como reposición de una fecha que cayó en un `Holiday` (§10). Las fechas holiday-hit se crean con `status: "cancelled"` + `attendance_sub_status: "cancelled_holiday"`; las de reposición se crean con `status: "scheduled"` + `holiday_makeup: true`. |

**Creación de sesiones de grupo (`addGroupSession`)**: crea una `ExtSession` con `group_id` real, `student_id = roster[0]` (sentinel — mismo patrón que `addWorkshopSession` con `student_id = cohortId`), y `member_statuses` inicializado con TODOS los miembros activos del roster en `"scheduled"`. Esto último es necesario porque `studentCalendarEvents` (en `calendar-events.ts`) filtra la sesión por `s.student_id === studentId || Object.keys(member_statuses).includes(studentId)` — sin poblar `member_statuses` desde la creación, solo el miembro sentinel vería la clase en su calendario hasta que se sometiera el Session Report.

**Contador compartido del grupo**: `decrementGroupRemaining(groupId)` (al reportarse la sesión, si al menos alguien asistió o si algún ausente fue por causa `"student"`) y `incrementGroupRemaining(groupId)` (refund simétrico, usado por ejemplo al convertir una sesión a Spotlight desde un alumno de grupo). El increment se cappea en `hired_sessions`.



### `ReportAdminEdit` (`src/lib/sessions-store.ts`)
| campo | tipo | requerido/opcional |
|---|---|---|
| at | string | requerido |
| actorId | string | requerido |
| actorName | string | opcional |
| studentId | string | opcional |
| field | `"status"\|"sub_status"\|"member_status"\|"member_sub_status"` | requerido |
| from / to | string | requerido |
| note | string | opcional |

### `LessonPlan` (`src/lib/lesson-plans-store.ts`)
**Propósito:** plan de clase que el maestro llena por sesión.

| campo | tipo | requerido/opcional | notas |
|---|---|---|---|
| session_id | string | requerido | PK/clave del store, 1 plan por sesión |
| title | string | requerido | |
| type | `"Syllabus content"\|"Additional Content"\|"Review Session"\|"Casual Topic"\|"Evaluation"` | requerido | |
| level_id / unit_id | string | opcional | |
| vip_unit_id | string | opcional | solo si el alumno es producto `vip` — completar la sesión marca la unidad VIP como hecha |
| comments | string | requerido | |
| planning_status | `"on-time" \| "late"` | requerido | |
| saved_at | string (ISO) | requerido | |

**Relación confirmada:** este es el campo que resuelve el vínculo "sesión completada ↔ unidad VIP" mencionado (sin definirse) en `vip-courses-store.ts` — `LessonPlan.vip_unit_id` es la clave real.

**Auto-unlock de unidad (efecto secundario de `saveLessonPlan`):** cuando el plan trae `unit_id` (Syllabus content / Evaluation), al guardar se registra `setUnitAccess(studentId, unit_id, "unlocked", session.teacher_id, "teacher")` en el log `verbo:unit-access-log` (`activities-store.ts`) para el alumno de la sesión, o para cada `activeMembersOf(session.group_id)` si es sesión de grupo. Es idempotente y **no** hace cascada a prerequisitos.

### `CalendarEvent` (`src/lib/calendar-events.ts`) — **derivado, no persistido**
Proyección unificada de `Session`/`Club` para pintar el calendario. No se guarda en ningún lado — se recalcula on-demand. `studentCalendarEvents(studentId)` incluye 1:1 sessions del alumno **y** todos los `Club` (`insight`+`book`) no cancelados, para que el alumno pueda navegar/reservar directamente desde el calendario (la gating de cupo por plan ocurre al reservar, no al listar). En `student.sessions.tsx`, `availableKinds` se calcula dinámicamente según `resolvedRemainingSeats`/`resolvedMonthlyCap` — Advance/Elite/Signature solo ven las kinds a las que su plan da acceso; Core mantiene visibilidad completa por ahora.


| campo | tipo | notas |
|---|---|---|
| id, kind, date, duration_minutes, title | — | ver detalle completo en el archivo fuente |
| kind | `"class"\|"workshop"\|"insight"\|"book_club"\|"spotlight"` | |
| status | `ExtSessionStatus \| TimeStatus` | |
| is_group / group_id / spots_taken / spots_total / enrolled_names | — | solo aplican según el tipo de evento |
| covered_by_substitute | boolean | proyectado desde `ExtSession`; solo se pinta si `substitutionAware` |

**Color de estados/eventos — fuente única (`src/lib/status-palette.ts`)**: `STATUS_PALETTE` define label + color (+ `borderColor` solo para `scheduled`, que es blanco `#ffffff` con borde `#cbd5e1`) de los 11 `ExtSessionStatus`. De ahí derivan `CALENDAR_STATUS_META` (`calendar-events.ts`), `WORKSHOP_STATUS_META` (`sessions-store.ts`), el `STATUS_META` de `admin.sessions.tsx` y el pill de estado del Dashboard (`student.index.tsx`). Colores: scheduled `#ffffff`, ready `#8b5cf6`, completed `#3cce10`, absent `#dc0000`, cancelled `#94a3b8`, pending_reschedule `#b45309`, no_show `#1d1d1d`, rescheduled/rearranged `#f97316`, delayed `#ffa800`, converted_to_spotlight `#2dd4bf`. `rearranged` sigue existiendo en el tipo por compatibilidad de datos, pero **nunca** se ve distinto de `rescheduled` (mismo color, mismo label, mismo tone); la reprogramación en `admin.sessions.tsx` siempre resuelve a `rescheduled`.

`EVENT_KIND_META`: `class` no tiene color propio (usa el status; el valor guardado es solo fallback neutro), workshop `#3300ff`, insight `#01304a`, book_club `#c2410c`, spotlight `#2dd4bf`.

`eventPillDisplay(ev, { substitutionAware })` y `calendarEventTheme(ev, { substitutionAware })` comparten la misma prioridad: (1) Substitution — `covered_by_substitute` + `isPendingStatus(status)` → `#b5ff56` / "SUB"; (2) `sub_status` (`SUB_STATUS_META`), donde `absent_work|absent_illness|absent_vacation` devuelven el degradado `linear-gradient(135deg, #dc0000 0%, #313131 100%)`; (3) `kind === "class"` con status → color de `CALENDAR_STATUS_META`; (4) color fijo del kind. `calendarEventTheme` además devuelve `textTone` (`"dark"` solo cuando el fondo resuelto es el blanco de `scheduled`) y usa degradados en headers de modal: insight navy→negro, book_club `#c2410c`→negro, rescheduled naranja→ámbar, absent rojo→gris. El flag `substitutionAware` solo se activa en calendarios de staff (`teacher.calendar.tsx`, `admin.calendar.tsx`); el alumno nunca ve el color ni el label de Substitution.


### `AvailabilityChangeRequest`, `TeacherAvailability`, `TimeBlock` — ver §6.

---

## 3. Cursos y Contenido Académico

### `Level` / `Unit` (`src/lib/mock-data.ts`) — catálogo genérico CEFR (A1–B2)

**`Level`**: `id` (ej. "A1"), `title` (ej. "A1 — Beginner"), `units: Unit[]`.
**`Unit`**: `id` (ej. "A1-U1"), `title`, `video_url` (requerido, vacío en seed), `pdf_url` (requerido, vacío en seed).

⚠️ Ver §13 — este catálogo (`courses-store.ts`) coexiste sin relación de código con el catálogo por producto (`product-courses-store.ts`) y con `VipUnit` — tres representaciones distintas de "unidad".

### `ProductCourse` / `CourseLevel` / `CourseUnit` (`src/lib/product-courses-store.ts`)

**Propósito:** catálogo de cursos por producto comercial (GO/Enterprise/International), 3 niveles: Producto → Nivel comercial → Unidades.

```ts
ProductId = "go" | "enterprise" | "international"
ProductCourse { product: ProductId; levels: CourseLevel[] }
CourseLevel { id: string; name: string; units: CourseUnit[] }
CourseUnit {
  id: string; title: string; video_url: string; pdf_url: string;
  block?: string; vocabulary?: string[]; grammar_point?: string;
  teaser?: string;
}
```

**`teaser`** (opcional): texto corto (máx. 160 caracteres) editable por Admin en el modal de unidad (Admin > Courses > unidad, campo "Student Teaser"). Es lo único de contenido pedagógico que ve el alumno en la vista de unidad: reemplaza por completo la tarjeta "What you'll learn" que antes exponía `vocabulary` y `grammar_point`. `vocabulary`, `grammar_point` y `block` siguen existiendo pero son de uso interno (syllabus/Admin) y **nunca** se renderizan al alumno. Si `teaser` está vacío, la tarjeta simplemente no se renderiza.


Nombres de nivel confirmados por producto:
- **go:** Kickstart, Everyday Flow, Confident Voice, Culture Master
- **enterprise:** Core Foundations, Strategic Fluency, Executive Presence, Global Leadership (migración automática desde el nombre legacy "Global Mastery")
- **international:** Survival Basics, Travel Ready, Social Fluency, Full Command

**Syllabus real (`src/lib/syllabus-data.json`):** archivo shippeado con el catálogo real de 360 unidades (12 niveles × 30 unidades) — `title`, `block`, `vocabulary[]`, `grammar_point`. `loadCourses()` ejecuta `applySyllabus()` como migración idempotente: para cada unidad del JSON que exista con id igual en el estado local, reemplaza el `title` solo si su valor actual coincide con el patrón placeholder `/^(Unit|Review) \d+$/` (nunca pisa títulos editados a mano), y siempre actualiza `block`/`vocabulary`/`grammar_point`; `video_url` y `pdf_url` de unidades existentes se preservan intactos. Las unidades del JSON que aún no existen se crean con `video_url: ""` y `pdf_url: ""`. La migración corre tanto sobre el estado hidratado desde `localStorage` como sobre el `seed()` inicial.

⚠️ **No existe ningún campo de gating/progreso** (`Completed`/`Current`/`Locked`, "Contracted Levels") en este archivo — se buscó explícitamente y no aparece. Si esa lógica existe en producción, vive en otro archivo (componente de UI o store de inscripciones) no cubierto en esta lectura.

### `CustomUnit` (`src/lib/custom-units-store.ts`)

Tipo unificado que almacena **todas** las unidades "a medida" creadas por el maestro para un alumno, sin importar su origen. Persistido bajo la key `verbo:custom-units`.

| campo | tipo | requerido/opcional | notas |
|---|---|---|---|
| id | string | requerido | patrón `VIP-<studentId>-<timestamp>` o `TC-<studentId>-<timestamp>` |
| student_id | string | requerido | FK → estudiante |
| title | string | requerido | |
| file_url | string | requerido | material descargable |
| file_name | string | opcional | |
| created_at | string | requerido | |
| kind | `"vip" \| "tailored"` | requerido | discrimina el origen (VIP Course Builder vs Tailored Content) |

**Migración de una sola corrida (idempotente)**: al primer `safeRead()` se leen las keys viejas `verbo:vip-courses` y `verbo:tailored-content`, se les asigna `kind: "vip"` / `kind: "tailored"` y se mezclan en `verbo:custom-units` omitiendo ids ya presentes. Las keys viejas **no se borran**. Usa un flag de módulo (`migrated`), mismo patrón que `cleanupStoredActivities` en `activities-store.ts`.

Las completions siguen en keys separadas por origen (`verbo:vip-unit-completion`, `verbo:tailored-content-completion`) con helpers compartidos en este mismo archivo.

### `VipUnit` / `VipUnitCompletion` (`src/lib/vip-courses-store.ts`)

⚠️ **Ahora son alias/wrappers**: `VipUnit = CustomUnit` y `VipUnitCompletion = CustomUnitCompletion`. Todas las funciones exportadas (`loadVipUnits`, `unitsForStudent`, `addVipUnit`, `updateVipUnit`, `removeVipUnit`, `subscribeVipUnits`, `completedSessionCount`, `vipUnitDoneMap`, `isVipUnitDone`, `markVipUnitDone`, `clearVipUnitDoneForSession`, `subscribeVipUnitCompletion`) conservan nombre y firma, pero delegan al store unificado filtrando por `kind: "vip"`. `subscribeVipUnits` sigue escuchando el evento legacy `verbo:vip-courses-updated` además del nuevo `verbo:custom-units-updated`.

**`VipUnitCompletion`**: `{ session_id: string; completed_at: string }`, clave = `unitId`. Se vincula a `LessonPlan.vip_unit_id` (ver §2).

### `TailoredUnit` / `TailoredUnitCompletion` (`src/lib/tailored-content-store.ts`)

⚠️ **Ahora son alias/wrappers**: `TailoredUnit = CustomUnit` y `TailoredUnitCompletion = CustomUnitCompletion`. Todas las funciones exportadas (`loadTailoredUnits`, `tailoredUnitsForStudent`, `addTailoredUnit`, `updateTailoredUnit`, `removeTailoredUnit`, `subscribeTailoredUnits`, `tailoredUnitDoneMap`, `isTailoredUnitDone`, `markTailoredUnitDone`, `clearTailoredUnitDoneForSession`, `subscribeTailoredUnitCompletion`) conservan nombre y firma, pero delegan al store unificado filtrando por `kind: "tailored"`. Sigue aplicando a alumnos con `access_plan === "Elite"`.

**`TailoredUnitCompletion`**: `{ session_id: string; completed_at: string }`, clave = `unitId`. Se vincula a `LessonPlan.tailored_unit_id`. Al marcar Completed el Session Report de la sesión vinculada, la unidad queda done y la siguiente (por `created_at`) se desbloquea automáticamente.


### `Activity` (`src/lib/activities-store.ts`)

| campo | tipo | requerido/opcional | notas |
|---|---|---|---|
| id | string | requerido | |
| unit_id | string | requerido | patrón `"A1-U1"` |
| name | string | requerido | |
| type | `ExerciseType` | requerido | ver §12 |
| category | string | opcional | libre, admin-extensible |
| session_phase | `"pre"\|"post"` | opcional | default "pre" |
| paragraph / answer / items / prompt / question / options / correctIndex | — | opcional | según `type` |
| audioName | string | opcional | `listen_select` únicamente |
| audioDurationSec | number | opcional | `listen_select` únicamente |
| feedback | string | opcional | shown to the student when the answer is incorrect; explains WHY, not just that it's wrong |

**Edición:** `updateActivity(id, patch)` (activities-store) actualiza una actividad existente sin tocar `id` ni `unit_id`. En el modal "Activities" cada item de la lista tiene acción de editar (lápiz) que recarga la actividad en el formulario — así una `listen_select` importada por Bulk Upload (que nunca trae audio) puede recibir su archivo sin recrearse; los items sin `audioName` se marcan "No audio".

⚠️ **`audioName` es metadata interna de Admin y NUNCA debe renderizarse en ninguna vista de alumno.** Contiene el nombre real del archivo subido (incluye referencias a nuestro proveedor de voz). Se muestra solo en el modal de Admin al cargar el archivo; el reproductor del alumno (`VerboAudioPlayer`) rotula siempre con el texto fijo "Audio · Verbo Academy".

**`audioDurationSec`**: duración del clip en segundos, **auto-detectada** al subir el archivo en Admin (elemento `Audio` temporal + `loadedmetadata`, redondeada al segundo). El admin nunca la escribe a mano. Se usa para mostrar `mm:ss` en el reproductor del alumno; si falta, el reproductor muestra `--:--`.


**`MatchItem`**: `{ text: string; key: string }`.
**`ActivityScore`**: `{ best: number; attempts: number; lastAt: string; attempted: boolean }`, clave = `` `${studentId}::${activityId}` `` — ✅ scoped por alumno desde 2026-07-11 (fix bug de progreso compartido). `attempted` (2026-08-05) se pone en `true` en cada `recordActivityScore` sin importar si la respuesta fue correcta, para distinguir "contestada y fallada (best = 0)" de "nunca intentada"; registros legacy sin el campo caen a `attempts > 0` vía `wasAttempted`. `resetUnitActivityAttempts(studentId, unitId)` reusa `resetAttempts` y limpia `attempted` en todas las actividades de la unidad (conserva `best`).
Mapas relacionados sin interfaz formal, todos con clave compuesta `` `${studentId}::${unitId}` ``: `Completion` (→ `boolean`), `Attempts` (→ `number`).

**`UnitAccessEvent`** (`src/lib/activities-store.ts`, key `verbo:unit-access-log`): historial append-only de overrides de acceso por unidad, aplica a **cualquier** unitId (no solo milestones 10/20/30).

| campo | tipo | notas |
|---|---|---|
| id | string | único |
| studentId | string | |
| unitId | string | |
| action | `"unlocked" \| "locked"` | |
| actorId | string | admin o teacher que ejecuta |
| actorRole | `"admin" \| "teacher"` | |
| at | string ISO | |

Reglas de gating (student.courses.tsx): el override MÁS RECIENTE por `(studentId, unitId)` gana. `getUnitAccessOverride` = null → comportamiento por defecto (milestones bloqueadas, no-milestones secuenciales). `"locked"` → siempre bloqueada. `"unlocked"` → siempre accesible (permite adelantar no-milestones o abrir un milestone). Además, unidades milestone tienen límite de **1 intento por actividad**: al segundo submit dentro del runner, el sistema bloquea y pide desbloqueo. Cada evento genera un `ActivityEntry` (`unit_unlocked` / `unit_locked`) derivado en `activity-logs-store.ts`. `isMilestoneUnlocked` se conserva como wrapper de `getUnitAccessOverride === "unlocked"`.

### `StoredMaterial` (`src/lib/materials-store.ts`)

| campo | tipo | requerido/opcional | notas |
|---|---|---|---|
| id | string | requerido | |
| title | string | requerido | |
| material_type | `MaterialType` | requerido | |
| category | string | requerido | libre, catálogo dinámico. `SEED_CATEGORIES` = Grammar, Vocabulary, Business, Speaking, Listening, Troubleshooting, Getting Started, Study Tips (las 4 últimas nacen vacías, sin materiales). `loadCategories()` devuelve la unión sin duplicados de `SEED_CATEGORIES` + lo guardado en localStorage (seeds primero), para que nuevas categorías semilla aparezcan en navegadores con datos previos |
| upload_url | string | requerido | dataURL del archivo real subido por el admin (PDF/video/imagen según `material_type`, máx. 8MB vía `MAX_MATERIAL_FILE_BYTES` / `isFileTooLarge`). `"#"` o `""` = archivo pendiente: `hasUploadedFile()` es `false` y `MaterialLibrary` deshabilita Preview/Download mostrando "Coming soon — file pending upload". Al editar sin subir archivo nuevo se conserva el valor previo. |
| cover_image | string | opcional | dataURL de portada (misma validación de tamaño) |
| restrict_product | `"go"\|"enterprise"\|"international"` | opcional | filtro de visibilidad |
| restrict_level | string | opcional | debe coincidir con un nombre en `RESTRICT_PRODUCTS`, sin validación tipada |
| premium | boolean | opcional | cuando `true`, el material **sale de su `category` original** y se agrupa en la categoría virtual dedicada "Premium" (`__premium__`) de `MaterialLibrary`. Con acceso (`access_plan ∈ {"Advance","Elite"}`, o Teacher con `hasPremiumAccess` default `true`) la categoría funciona como cualquier otra; sin acceso, el click abre un modal de upsell (mismo criterio grupo vs. individual que `AccessGateNotice`, copy comercial propio) y nunca muestra el listado. La tarjeta "Premium" se muestra siempre, aunque no haya materiales premium (estado vacío "Premium resources are on their way"). |

⚠️ Coexiste con `Material`/`MATERIALS` de `mock-data.ts` (campos: `id, title, material_type, upload_url, category`, sin `restrict_product`/`restrict_level`) — dos catálogos de materiales paralelos, ver §13.

### `LearningPathEvent` (`src/lib/learning-path-events.ts`)
| campo | tipo | notas |
|---|---|---|
| ts | string (ISO) | |
| kind | `"unit_unlocked"\|"unit_completed"\|"level_completed"` | |
| ref | string | id de nivel o unidad |
| label | string | opcional |

Persistencia: `Record<studentId, LearningPathEvent[]>`, dedupe 60s, máx. 100 eventos/alumno.

---

## 4. Retos y Gamificación (Challenges / Verbo Flash)

### `Challenge` (`src/lib/challenges-store.ts`)

| campo | tipo | requerido/opcional | notas |
|---|---|---|---|
| id | string | requerido | patrón `PRODUCTO-DIFICULTAD-C<n>` |
| product | `"go"\|"enterprise"\|"international"\|"vip"` | requerido | |
| difficulty | `DifficultyId = "esencial"\|"intermedio"\|"avanzado"\|"experto"` | requerido | |
| premium | boolean | opcional | exclusivo de planes Advance/Elite |
| skill_tags | string[] | opcional | tags informativos: Speaking/Writing/Reading/Listening |
| category | string | requerido | libre |
| title / description | string | requerido | |
| video_url | string | requerido | vacío = sin adjunto |
| submission_instructions | string | opcional | texto libre del admin con el formato de entrega esperado; vacío = no se muestra nada al alumno |

✅ Verificado 2026-07-11 contra el código real: `DifficultyId` sí incluye `'experto'` y `Challenge` sí declara `premium`/`skill_tags`. No había ninguna inconsistencia real.

### `ChallengeSubmission` (`src/lib/mock-data.ts` + lógica en `src/lib/students-store.ts`)

Entrega obligatoria de un reto. El alumno **ya no marca "Completed"**: envía y el profesor revisa. Vive en `User.challenge_submissions?: ChallengeSubmission[]` (una entrada por `challenge_id`).

| campo | tipo | requerido/opcional | notas |
|---|---|---|---|
| challenge_id | string | requerido | reto normal, mystery box, lightning o season |
| challenge_format | `"normal"\|"mystery_box"\|"lightning"\|"season"` | requerido | determina qué contadores/streak toca al aprobar |
| status | `"pending_review"\|"approved"\|"needs_resubmission"\|"rejected"` | requerido | estado del ciclo de revisión |
| link | string | requerido | URL entregada (uploads de archivo: pendiente) |
| note | string | opcional | nota del alumno para el profesor |
| submitted_at | string ISO | requerido | fecha del envío vigente |
| reviewed_at | string ISO | opcional | fecha de la última revisión del profesor |
| reviewed_by | string | opcional | id del profesor que revisó |
| teacher_feedback | string | opcional | se muestra al alumno en `needs_resubmission` / `rejected` |
| history | `{ link, note?, submitted_at, status, teacher_feedback? }[]` | opcional | intentos previos archivados al reenviar |

Reglas de datos (todas en `students-store.ts`):
- `getSubmission(studentId, challengeId)` — lectura única para la UI.
- `submitChallenge(studentId, challengeId, format, link, note?)` — crea la entrega en `pending_review`; falla si ya existe una. Para `normal` y `mystery_box` aplica el mismo cooldown de 24h que `completeCooldownRemaining` y avanza `current_streak`/`longest_streak` con la regla de "≤14 días mantiene el streak".
- `resubmitChallenge(studentId, challengeId, link, note?)` — solo válido si el estado es `needs_resubmission`; archiva el intento anterior en `history` y vuelve a `pending_review`.
- `completeChallenge` / `completeLightningChallenge` / `completeSeasonChallenge` siguen existiendo y **solo se invocan desde la aprobación del profesor** (nunca desde el flujo del alumno).
- `approveSubmission(studentId, challengeId, teacherId)` — estado → `approved` + `reviewer_id`/`reviewed_at`, y delega los efectos de completado según `challenge_format`: `lightning` → `completeLightningChallenge`, `season` → `completeSeasonChallenge` (el `season_id` se resuelve desde `loadFlashChallenges()`), `normal`/`mystery_box` → `completeChallenge` (se limpia `last_completed_at` solo para que el cooldown de 24h no bloquee el premio y, al terminar, se restauran `last_completed_at`, `current_streak` y `longest_streak` a los valores previos a la aprobación — los que `submitChallenge` calculó en el momento de la entrega; lo único que persiste de `completeChallenge` es la nueva entrada en `completed_challenges`, de modo que la racha se mide desde la entrega y no desde la revisión).
- `requestResubmission(studentId, challengeId, teacherId, feedback)` — estado → `needs_resubmission` + `teacher_feedback`/`reviewer_id`/`reviewed_at`. No toca streak ni contadores.
- `rejectSubmission(studentId, challengeId, teacherId, feedback)` — estado → `rejected` + `teacher_feedback`/`reviewer_id`/`reviewed_at`; para `normal`/`mystery_box` restaura `current_streak` a `streak_before`; además registra un `addStudentReport` con texto `"Challenge submission not approved — <título>: <feedback>"`.
- `pendingSubmissionsForTeacher(teacherId)` → `PendingSubmissionRow[]` (`studentId`, `studentName`, `submission`) con las entregas en `pending_review` o `needs_resubmission` del roster del profesor; el roster se toma de `ASSIGNMENTS` (misma fuente que `teacherNotifications`).

En `student.challenges.tsx` los 4 modales de reto comparten `ChallengeModalFooter`, que lee la entrega y muestra "⏳ Pending review", "Resubmit" (con el feedback del profesor) o "Not approved"; el envío se hace siempre por `SubmitChallengeModal` (link obligatorio + nota opcional).

En `teacher.challenges.tsx` hay un selector de vistas "Catalog" / "Pending Reviews" (badge de conteo); la vista de revisión solo lee `pendingSubmissionsForTeacher` y dispara `approveSubmission` / `requestResubmission` / `rejectSubmission` (estas dos últimas exigen feedback no vacío).



### `BadgeDef` (`src/lib/badges-store.ts`)

Catálogo editable por Admin de los badges de Challenges mostrados al estudiante (los 8 core: First Challenge, Challenge Explorer, Challenge Master, On a Roll, Challenge Streak, Unstoppable, Well-Rounded, Elite Challenger). NO incluye Lightning Bolt (Verbo Flash, vive aparte) ni Season badges dinámicos (owned by `flash-challenges-store.ts`). Persistido en `localStorage` bajo `verbo:challenge-badges`; broadcast por `verbo:challenge-badges-updated`.

| campo | tipo | notas |
|---|---|---|
| id | string | ej. `badge-1` |
| name / description | string | libres |
| image | string | data URL (`data:image/gif;base64,...` etc.). `""` = no configurada aún → UI muestra placeholder. Acepta GIF/PNG/JPG/WebP; máx. 1 MB por badge para no reventar el cupo de `localStorage`. Los GIFs se animan solos vía `<img>` |
| rule.metric | `BadgeMetric = "completedCount"\|"longestStreak"\|"distinctCategories"\|"hasCompletedPremium"` | única métrica |
| rule.threshold | number \| undefined | requerido para métricas numéricas; ignorado para `hasCompletedPremium` (boolean on/off) |

Evaluación pura: `isBadgeEarned(badge, ctx)` — sin funciones arbitrarias, todo declarativo. Al cargar, cualquier registro con shape legacy (p. ej. el antiguo `icon: BadgeIconId`) se descarta silenciosamente y se vuelve al seed nuevo.

### `LeaderboardIdentity` (`src/lib/leaderboard-identity-store.ts`)

Preferencia por estudiante para el Leaderboard de Challenges (Student > Challenges). Persistido en `localStorage` bajo `verbo:leaderboard-identity` como `Record<userId, LeaderboardIdentity>`; broadcast por `verbo:leaderboard-identity-updated`.

| campo | tipo | notas |
|---|---|---|
| mode | `"real" \| "nickname"` | default `"real"` — muestra `User.name` + avatar real (`avatar-store`) |
| nickname | string | usado solo cuando `mode === "nickname"`; si está vacío se cae a nombre real. La UI renderiza avatar genérico con iniciales + color HSL determinístico derivado del nickname (nunca sube imagen) |

Ranking del leaderboard: **global** — `USERS` filtrados solo por `role === "student"` (sin segmentar por `product`), ordenados desc por el **total combinado** `completed_challenges.length + lightning_completions + sum(season_completions)` (challenges regulares + Verbo Flash Lightning + todas las temporadas Flash). Sin reset periódico — acumulado histórico. Pluralización correcta en la UI ("1 Challenge completed" vs "N Challenges completed"). Toda la lógica (filtro, orden, resolución de identidad, iniciales/color) vive en el store + el componente `LeaderboardSection` de `student.challenges.tsx`. El total combinado se calcula con el helper `totalCompletedChallenges(student)` de `src/lib/student-model.ts`, usado también por el hero y la Player Card de `student.challenges.tsx` (criterio único de "Completed" en toda la pantalla).



### `FlashChallenge`, `LightningState`, `FlashSeason`, `FlashConfig` (`src/lib/flash-challenges-store.ts`)

**`FlashChallenge`**: `id, format: FlashFormat, product: FlashProductId, category, title, description, video_url?, premium?, submission_instructions?, skill_tags?, season_id?, icon_image_url?, synced_group_id?`. `submission_instructions` es texto libre opcional (formato de entrega esperado); si está vacío no se renderiza en los modales del alumno.

- `synced_group_id?`: id compartido (`newSyncedGroupId()` → `sync-<ts>-<rand>`) que enlaza las copias por producto de un mismo reto autorado. En Admin > Flash, el checkbox "Apply to all 3 products" (solo al crear) genera un registro independiente por cada producto de `FLASH_PRODUCT_ORDER` con id propio y el mismo `synced_group_id`. Al editar cualquier copia, los campos de contenido (category, title, description, submission_instructions, video_url, premium, skill_tags, icon_image_url) se propagan a las hermanas del mismo grupo y formato; `id`, `product` y `season_id` de cada una nunca se tocan. La activación de Lightning y el filtrado por producto en student/teacher no cambian: cada producto sigue siendo un registro independiente. **Al borrar una copia** se usa `removeChallengeAndUnsync(list, id)`: si el grupo queda con una sola copia (o ninguna), se elimina `synced_group_id` de las restantes para que no sigan marcadas como "Synced".
- `icon_image_url?`: imagen circular opcional del reto (data URL subida desde Admin > Flash, o URL remota). Se muestra como preview circular en el formulario.

- `season_id?`: solo para `format === "season"`. FK → `FlashSeason.id`. Cada Season tiene su propia bolsa de retos (Admin > Flash > Season > "Challenges"), independiente de la de Mystery Box.
- Selector: `seasonChallengesFor(list, seasonId, product)` filtra `format === "season" && season_id === seasonId && product === product` (ordenado por el número final del id). Si devuelve vacío, el banner de esa Season se muestra deshabilitado ("Coming soon") en el panel del estudiante.

**`LightningState`** (singleton global):
| campo | tipo | notas |
|---|---|---|
| status | `"inactive"\|"live"\|"expired"` | |
| challenge_id | string \| null | FK → `FlashChallenge.id` |
| product | FlashProductId \| null | |
| activated_at / expires_at | string \| null (ISO) | |
| duration_hours | number | |
| accepted_student_ids | string[] | N:M embebido como array |

**`FlashSeason`**: `id, display_name, theme_image_url?, watermark_image_url?, accent_color?, accent_color_to?, fill_mode?: "solid" | "gradient", gradient_stops?: GradientStop[], font_preset, custom_font_name?, active, badge_name, created_at`. `watermark_image_url` es una imagen decorativa opcional (se edita en Admin > Flash > Season) que reemplaza el watermark de texto del banner del estudiante; si está vacía se usa `display_name` como texto de fondo. 13 temporadas semilla. **Regla:** solo puede haber UNA Season con `active: true` a la vez — `conflictingActiveSeason(id)` bloquea guardar una Season activa mientras otra siga activa (el alumno vería dos banners). El gradiente de cada Season se construye SIEMPRE con `seasonGradientCss(season, angle = 135)` (única fuente):

- Si `fill_mode === "gradient"` y `gradient_stops` tiene 2+ paradas → `linear-gradient(angle, color pos%, …)` con las paradas ordenadas por `position` (0-100, clamp).
- Si no (o `fill_mode === "solid"`) → fallback de compatibilidad: `accent_color → accent_color_to` cuando el segundo color existe, si no `accent_color → #111827`.
- **`GradientStop`**: `{ color: string; position: number /* 0-100 */ }`. Mínimo 2 paradas; el editor de Admin no permite bajar de 2.

**`FlashConfig`** (key `verbo:flash-config`, evento `verbo:flash-config-updated`): `{ box_art_url?: string; theme_image_url?: string; watermark_image_url?: string; accent_color?: string; accent_color_to?: string; fill_mode?: SeasonFillMode; gradient_stops?: GradientStop[] }`. Los campos de tema son el tema visual del banner compacto de Mystery Box y se pintan con la misma `seasonGradientCss()`.

**`LightningTheme`** (key `verbo:flash-lightning-theme`, evento `verbo:flash-lightning-theme-updated`; `loadLightningTheme` / `persistLightningTheme` / `subscribeLightningTheme`): `{ theme_image_url?, watermark_image_url?, accent_color?, accent_color_to?, fill_mode?, gradient_stops? }`. Tema **estático** del banner de Lightning, persistido aparte de `LightningState` (estado runtime de activación) para que sobreviva a activaciones/expiraciones. Devuelve `{}` cuando no hay nada guardado.

**Mystery Box — pick activo (`User`)**: `last_mystery_box_opened_at?: string | null` (sello del último sorteo, base del cooldown de 24h vía `mysteryBoxCooldownRemaining` / `openMysteryBox`) y `mystery_box_pick_id?: string | null` (id del reto ya revelado y **no** completado). `activeMysteryBoxPick(studentId)` devuelve ese id solo si `hasCompletedChallenge` es `false`; `setMysteryBoxPick(studentId, challengeId)` lo persiste al sortear. Regla: el cooldown de 24h solo aplica para sortear un reto **nuevo**; mientras haya pick activo el alumno puede reabrir la caja sin límite. El pick se limpia implícitamente al completarse el reto.



⚠️ `FlashProductId` (`"enterprise"|"go"|"international"`, **sin `"vip"`**) es inconsistente con `ChallengeProductId` de `challenges-store.ts` (sí incluye `"vip"`).

---

## 5. Clubs y Workshops

### `Club` / `ClubReleaseRequest` (`src/lib/clubs-store.ts`)

**`Club`**: `id, type: ClubType, title, description, link, material?, cover_image?, teacher_id? , date, duration_minutes, spots_taken, spots_total, status: TimeStatus, teacher_payment?, claimed_at?`.
**`ClubReleaseRequest`**: `id, club_id, teacher_id, reason, requested_at`.

`ClubType = "insight" | "book"` — ⚠️ **no incluye `"spotlight"`**, aunque `ClubReportEventType` sí lo tiene (ver abajo).

### `ClubBooking` (`src/lib/club-bookings-store.ts`)
`id, student_id, club_id, club_type, booked_at`. El cupo mensual efectivo se resuelve por `resolvedMonthlyCap(studentId, kind)` con la tabla **`PLAN_DEFAULTS`** (fuente única de verdad por `AccessPlanId`): Core `0/0/0` (freemium aparte, ver abajo), Advance `2/2/1`, Elite `4/4/4` (**acumulable**: `resolvedRemainingSeats` calcula `cap × meses_desde_cycle_start − total_reservas_historicas`), Signature `∞/∞/∞`. Los add-ons manuales `addon_insights_per_month`/`addon_bookclubs_per_month`/`addon_spotlight_per_month` en `User` o `Group` (incluyendo `0`) siempre ganan al default de plan — control absoluto del admin. Constante: `RESERVATION_CUTOFF_HOURS = 24`. UI muestra `∞` para Signature en "seats used" y "spotlight cap". Consumo mensual por kind: `insight`/`book` restan `bookingsThisMonth()` (reservas confirmadas); `spotlight` resta `spotlightRequestsThisMonth()` (definida en `student-requests-store.ts`, cuenta `StudentRequest` con `kind="spotlight"` y `status !== "cancelled"` del mes calendario actual, incluyendo los registros `status="assigned"` generados por `recordSpotlightConversion`) — así, publicar la solicitud ya consume cupo aunque el teacher aún no la haya reclamado, y una conversión a Spotlight también decrementa el cupo.

### `FreemiumState` (`src/lib/core-freemium-store.ts`) — freemium de cortesía Core
Un solo uso por tipo (`insight`/`book`/`spotlight`), válido durante todo el periodo contratado, **nunca se resetea**, independiente del cupo mensual (que para Core es 0). Persistencia: `localStorage` key `verbo:core-freemium` + evento `verbo:core-freemium-updated`. Forma: `Record<student_id, { used?: { insight?, book?, spotlight? }, silenced?: { ... } }>` con timestamps ISO. Flags: `used[kind]` marca crédito consumido; `silenced[kind]` marca "no mostrar de nuevo" y **oculta ese tipo** en `student.sessions.tsx` (STUDENT_KINDS + botón Spotlight desaparecen). Flujo de UI en `CoreFreemiumFlow.tsx`: Modal 1 (welcome + confetti + "Claim it" → `markCreditUsed`), Modal 2 (upgrade CTA con números reales de `PLAN_DEFAULTS.Advance`/`Elite` + checkbox), Modal 3 (farewell tras silenciar → `markSilenced`). Solo se activa si `user.access_plan === "Core"`; para otros planes `tryOpen` invoca directamente el callback sin interponer nada.



### `ClubReport` (`src/lib/club-reports-store.ts`)
`event_id` (PK lógica), `event_type: "insight"|"book"|"spotlight"`, `teacher_id`, `attendance: Record<student_id, "present"|"absent">`, `comments`, `submitted_at`.

⚠️ `event_id` puede apuntar a un `Club.id` (para `insight`/`book`, cerrado vía `updateClub(..., completed)`) o a un `Session.id` con `origin: "spotlight"` (cerrado vía `updateSession(..., completed)`). `ClubReportModal` despacha al store correcto según `event_type`.

**Cancelación de Spotlight por el alumno** (`student.sessions.tsx > CancelSpotlightModal`): el alumno siempre pierde el crédito (sin reschedule, sin makeup, sin refund a `remaining_sessions` ni a `incrementGroupRemaining`). Único efecto financiero: si `hoursUntil(session.date_time) < 24`, se agrega un `TeacherAdjustment` de `Math.round(effectiveHourlyRate(teacher))` MXN con motivo "Spotlight Session — late cancellation (paid, <24h notice)" vía `appendTeacherAdjustment` (centralizada en `src/lib/teacher-tiers.ts`). El teacher recibe además notificación `spotlight_cancelled` derivada en `teacherNotifications` sobre sesiones `origin === "spotlight" && status === "cancelled"`.

### `WorkshopTemplate` / `WorkshopUnit` / `WorkshopCohort` / `WorkshopParticipant` (`src/lib/workshops-store.ts`)

**`WorkshopTemplate`**: `id, name, description, cover_url, units: WorkshopUnit[], cohorts: WorkshopCohort[]`.
**`WorkshopUnit`**: `id, title, video_url, pdf_url`.
**`WorkshopCohort`**: `id, name, participants: WorkshopParticipant[]` (máx. 4, forzado en código), `teacher_id, video_call_link, cohort_open: Record<unitId,boolean>, per_participant_open: Record<participantId, Record<unitId,boolean>>, sessions?` (⚠️ **@deprecated**, ver nota).
**`WorkshopParticipant`**: `id, name, kind: "student"|"standalone"`.
**`WorkshopSessionEntry`** — marcado **@deprecated** en el propio código: "Live sessions now live in the shared sessions store... kept so older persisted cohorts don't crash on load."

---

## 6. Grupos, Asistencia y Disciplina

### `Group` / `GroupMember` (`src/lib/groups-store.ts`)

**`GroupMember`** (tabla de unión): `student_id, group_id, status: GroupMemberStatus, joined_at, removal_started_at?, archived_at?, prior_group_id?`.
`GroupMemberStatus = "active" | "pending_removal" | "archived"` (ventana de gracia de 30 días antes de archivar).

**`Group`**: `id, name, company_client, max_capacity, product_type: "performance", product?, focus?, access_plan?, contracted_levels?, current_roadmap_level?, hired_sessions, remaining_sessions, sessions_per_week?, session_duration?, reschedule_policy?, reschedule_custom_hours?, reschedule_custom_pct?, payment_day?, cycle_start?, next_payment?, video_call_link?, teacher_id?, addon_insights_per_month?, addon_bookclubs_per_month?, addon_spotlight_per_month?, addon_workshops_enabled?, created_at`.

⚠️⚠️ **Duplicación masiva `Group` ↔ `User`**: `Group` replica ~15 campos que también existen en `User` individual (product, focus, access_plan, contracted_levels, video_call_link, addons, política de reagendamiento). `propagateGroupToMembers()` **copia explícitamente** estos valores hacia cada `User` miembro cada vez que se edita el grupo — dos fuentes de verdad sincronizadas a mano. Ver §13.

### `StudentAttendanceSummary` (`src/lib/sessions-store.ts`)
`{ completed: number; absent: number; pct: number }`. Helper compartido `studentAttendance(sessions, student)` — solo cuenta sesiones dentro de los últimos `ATTENDANCE_WINDOW_DAYS = 90` días (ventana móvil desde hoy; se descartan sesiones futuras o sin `date_time` válido) — única fuente de verdad para el % de asistencia en Admin > Students (PerformanceTab), Student Dashboard y Teacher > My Students. Regla: `pct = student.attendance_percentage` si existe; si no, `round(completed / (completed + absent) * 100)`; `0` si no hay sesiones contabilizadas. El antiguo `src/lib/attendance-store.ts` (100% sintético a partir de un hash del `studentId`) fue eliminado.

### `Strike` (`src/lib/strikes-store.ts`)
`id, teacher_id, session_id, reason: CancelReason, note?, medical_note_name?, created_at, needs_substitute?, substitute_found?, justified?, justification_cause?: JustificationCause, justified_at?`.

Efecto lateral: al llegar a 3 strikes activos, muta `User.teacher_status = "frozen"` vía un mapa de overrides separado (`verbo:teacher-profile-overrides`).

### `TeacherAvailability` / `TimeBlock` / `AvailabilityChangeRequest` (`src/lib/availability-store.ts`)

**`TeacherAvailability`**: `teacherId, weekly: Record<DayKey, TimeBlock[]>, confirmedAt?`.
**`TimeBlock`**: `{ startMin: number; endMin: number }`.
**`AvailabilityChangeRequest`**: `id, teacherId, reason?, proposed: Weekly, status: "pending"|"approved"|"rejected", createdAt, resolvedAt?`.

`DayKey = "mon"|"tue"|"wed"|"thu"|"fri"|"sat"` — ⚠️ **excluye domingo por completo** (regla de negocio hardcodeada, no data-driven).

### Nota de cobertura (`src/lib/coverage-notes-store.ts`) — sin interfaz formal
Mapa `` `${teacherId}:${studentId}` → note: string ``. ⚠️ `teacherIsTitularOf()` es un **stub incompleto**: solo verifica que el usuario exista y sea teacher, no la titularidad real (que supuestamente vive en `ASSIGNMENTS`).

### `Holiday` (`src/lib/holidays-store.ts`)
`id, date, label, created_at`. Puramente informativo — nada en el sistema bloquea/cancela automáticamente con base en esta lista.

---

## 7. Comunicación

### `Announcement` (`src/lib/announcements-store.ts`)
`id, message` (máx. 280 chars), `audience: "all"|"students"|"teachers", published_at, expires_at?`.
⚠️ Los "dismissals" (cierre del banner) **no están asociados a `userId`** — array global por navegador. Contraste con `notifications-store.ts` (ver abajo), que sí scoped por usuario.

### `Notification` (`src/lib/notifications-store.ts`) — **derivado, no persistido**
Solo se persiste el estado de lectura (`ReadMap: Record<userId, Record<notificationId, true>>`). La lista de notificaciones se recalcula on-demand a partir de Sessions, Clubs, AvailabilityChangeRequests, Strikes, KPIs, Announcements, FinancialIssues, StudentReports y Badges (earned vs. seen).
`NotificationKind` — ver §12. Incluye `badge_unlocked` (student-facing): se deriva comparando `computeAllEarnedBadges(student)` (`src/lib/badge-unlock.ts`) contra `badge-unlock-seen-store.ts`; su payload es `data.badgeStorageId` y al hacer clic abre `BadgeUnlockModal` y marca el badge como visto (evento `BADGE_UNLOCK_SEEN_EVENT`). Campo `data?: { studentId?, challengeId?, badgeStorageId? }`.

Derivaciones de `ChallengeSubmission` (todas leen `User.challenge_submissions`, mismo mecanismo de visto/no-visto por `ReadMap`):
- `challenge_pending_review` (profesor) — una por cada entrega en `pending_review` de su roster (`ASSIGNMENTS`); `data.studentId`/`data.challengeId`, navega a `/teacher/challenges`.
- `challenge_needs_resubmission` / `challenge_submission_approved` / `challenge_submission_rejected` (alumno) — según el `status` de su propia entrega; incluyen `teacher_feedback` en el body cuando existe.
- `challenge_flagged` (admin) — una por cada entrega `rejected`, con `data.studentId`/`data.challengeId` para abrir el modal de detalle desde la campana (mismo handler que `student_shared_challenge_result`).


### `ActivityEntry` (`src/lib/activity-logs-store.ts`) — **derivado, no persistido**
Log de actividad administrativa (Super Admin), recomputado on-demand. `id, kind: ActivityKind, action, detail, timestamp, actorId, actorName, actorRole, personId?`.
⚠️ `personId` es un único campo que apunta indistintamente a `student_id` o `teacher_id` sin discriminador explícito en el objeto (solo se infiere por `kind`).

### `StudentReport` (`src/lib/student-reports-store.ts`)
`id, student_id, teacher_id, created_at, text`. ⚠️ TODO explícito en el código: no hay canal de entrega implementado (chat interno o WhatsApp, decisión pendiente) — el reporte se persiste pero no se notifica a nadie todavía.

### `ConductReport` (`src/lib/conduct-reports-store.ts`)
Dirección **STUDENT → TEACHER o STUDENT** (opuesto e independiente de `StudentReport`). `id, reporter_id` (alumno real, siempre visible a Admin), `target_type: "teacher"|"student", target_id, category: "Inappropriate behavior"|"Harassment"|"Academic non-compliance"|"Other", text, created_at, status: "pending"|"reviewed"|"dismissed" (default "pending"), reviewed_at?`. Persistido en `localStorage` (`verbo:conduct-reports`) + `CustomEvent verbo:conduct-reports-updated`. Anónimo únicamente frente a la persona reportada — Admin ve al reporter. Admin puede marcar cada reporte como Reviewed o Dismissed desde `/admin/conduct-reports` (`updateConductReport`), lo que dispara la notificación `conduct_report_reviewed` al alumno reportero. La creación dispara `conduct_report_filed` (→ `/admin/conduct-reports`).


### `StudentRequest` (`src/lib/student-requests-store.ts`)
`id, kind: "reschedule"|"spotlight", student_id, assigned_teacher_id?, origin_session_id?, proposed_datetime, duration_minutes, spotlight_context?, last_report_summary?, requested_at, status: "open"|"claimed"|"escalated"|"assigned"|"cancelled", claimed_by?, claimed_at?`.

Al reclamarse, crea una **nueva sesión** en `sessions-store` (`rs-${req.id}`/`sp-${req.id}`), copiando datos — vínculo solo por convención de ID, no FK explícita.

**Conversión a Spotlight (`convertSessionToSpotlight`)**: cuando un alumno convierte una clase 1:1 traslapada a Spotlight, la sesión ya se crea directamente en `sessions-store` (con `origin: "spotlight"`). Para que el consumo mensual se contabilice correctamente, `convertSessionToSpotlight` llama a `recordSpotlightConversion`, que escribe un `StudentRequest` adicional con `kind: "spotlight"` y `status: "assigned"`. Este registro no aparece en las colas de profesor/Admin (porque su status no es `"open"` ni `"escalated"`), pero sí se cuenta en `spotlightRequestsThisMonth()`.

---

## 8. Financiero (solo tracking — nunca transacciones reales)

### `FinancialIssue` (`src/lib/financial-issues-store.ts`)
`id, teacher_id, text, created_at`. Reporte de texto libre del maestro, sin montos — correctamente modelado como no-transaccional.

### `PaymentLogEntry` (`src/lib/payments-log.ts`)
`id, entity_type: "individual"|"group", entity_id` (**FK polimórfica** → `User.id` o `Group.id`), `name, company?, amount, paid_at, month` (`YYYY-MM`).

**Estado de pago (derivado, no persistido):** `paymentUrgency(nextPay)` en `src/lib/student-model.ts` deriva `"overdue"` (la fecha ya pasó sin marcarse pagado), `"due_soon"` (≤3 días) o `null`. Se usa igual en las tarjetas de alumno y de grupo; el dato guardado sigue siendo solo `next_payment`.

**Marcar como pagado (unificado):** tanto el flujo individual (`StudentDetailModal.markPaid`) como el de grupo (`markGroupAsPaid`) avanzan `next_payment` con `nextPaymentDateAfterToday(payment_day)` — la siguiente ocurrencia real del día de pago, no "+1 mes".

El propio comentario del archivo aclara: **no es una tabla de pagos paralela**, es un log de eventos "se cobró"; la fuente de verdad de "próximo pago" sigue viviendo en `User.next_payment`/`Group.next_payment`.

⚠️ **Hallazgo más relevante de esta sección:** `amount` no se guarda por cliente — se deriva de una tabla de tarifas hardcodeada (`PLAN_RATE`: Core=4000, Advance=6000, Elite=9000, Signature=15000 MXN, ×1.6 si es grupo). No existe ningún campo `monthly_amount`/`price` explícito en `User` ni `Group` — un cliente con precio negociado no tiene dónde guardarse.

---

## 9. Performance / KPIs

### `PerformanceRating` / `PerformanceMap` (`src/lib/performance-store.ts`)
`{ fluency, vocabulary, confidence, grammar }` (escala 1–5, legacy) + `subskills?: Record<"Macro:Sub", number>` (escala 0–100). Clave del mapa = `sessionId` (sin campo `session_id` propio dentro del objeto).

`saveSubskillEvaluation()` recalcula las 4 claves legacy como promedio de los subskills, escalado 0-100→1-5, para mantener compatibilidad retro.

### `TeacherKpis` / `RatingBand` / `RatingPoint` (`src/lib/teacher-kpis.ts`)
`TeacherKpis`: `rating, ratingNormalized, connectionPunctuality, planningPunctuality, completionRate, teacherAbsenceRate, cancellationScore, activeStrikes, penaltyState, responsiveness, baseComposite, composite, onboarding, bonusEligible, bonusStatus`.

`RatingBand` asigna una etiqueta y paleta de chip a cada rango de `rating` (1-5 estrellas). La banda "Regular" (`rating >= 2.5`) usa fondo amarillo fuerte `#f59e0b` con texto blanco `#ffffff`; las demás bandas mantienen chips pastel con texto oscuro.

**Fórmula del composite (final)**:
1. `baseComposite` = promedio de 5 señales: `connectionPunctuality, planningPunctuality, completionRate, ratingNormalized, cancellationScore`.
2. `completionRate` fusiona la vieja "Report punctuality": por cada sesión en el denominador (mismo criterio de `sessionCompletionRate`), crédito = 1.0 si completed + reporte a tiempo, 0.7 si completed + reporte tarde, 0 si no completed. `report_punctuality` del profesor se usa como proxy de "share on-time" hasta que exista timestamp por sesión.
3. `composite = max(0, baseComposite − penaltyState)`. Durante el **mes de onboarding** (mes calendario de `hire_date`) `composite` queda fijo en **90** con etiqueta "Onboarding" y `penaltyState = 0`.
4. La fila informativa `responsiveness = 100 − penaltyState` (100 durante onboarding) se muestra en Admin > KPIs, Admin > Teachers Financial, Teacher > Financial y Teacher home.

**`penaltyState` (Reschedule/Substitute Responsiveness)** — estado acumulativo **secuencial** por profesor, recalculado mes a mes desde `trackingStartKey`:
- Mes con ≥3 negativas de reagendo/sustituto (`needs_substitute` en sesiones del mes, mock determinista para meses pasados): `penaltyState += 15`.
- Mes limpio (<3 negativas): `penaltyState = max(0, penaltyState − 5)`.
- El mes de onboarding no aplica penalización.

### `BonusStatus` (`src/lib/teacher-kpi-history-store.ts`)
`bonusEligible` requiere una **racha de 6 meses calendario consecutivos** con el composite FINAL (ya con penalty aplicado, y con onboarding contando como 90) ≥ umbral, incluyendo el mes en curso. Estados: `eligible | streak | not-tracking`.

**Ventana de tracking**: la racha empieza en el **primer mes calendario completo posterior** al mes de ingreso (`hire_date + 1 month`). El mes de ingreso NO cuenta (es "Onboarding").

**Historial mensual** (`monthlySnapshot`): el mes en curso usa `baseComposite` real y `penaltyState` calculado secuencialmente sobre negativas reales + mock. Meses pasados usan `mockCompositeFor()` (base, rango 65–99) y `mockRefusalsFor()` (negativas 0–4). En el histórico se guarda el composite **final** (con penalty y con override 90 en el mes de onboarding), no la base cruda. No hay persistencia real todavía.


### `User.hire_date` (`src/lib/mock-data.ts`)
Fecha ISO (YYYY-MM-DD) de ingreso del profesor. Editable desde Admin > Teachers (form de alta/edición). Es el input único de la ventana de tracking del bono.

### `KpiOverride` (`src/lib/teacher-kpi-overrides-store.ts`)
Corrección manual retroactiva a un KPI para arreglar la racha de bono cuando una señal real fue injusta. Solo `super_admin` y `coordinator_ops` pueden crearlas (coordinator_fin excluido por separación de responsabilidades).

Campos: `id, teacher_id, month_key ("YYYY-MM"), metric, previous_value, new_value, justification (obligatorio), evidence_name? (opcional, solo nombre del archivo por ahora), admin_id, admin_name (signature), admin_type? ("super_admin" | "coordinator_ops" | "coordinator_fin" — rol capturado al momento de guardar, para auditoría), created_at`.

`metric ∈ { connectionPunctuality | planningPunctuality | completionRate | ratingNormalized | cancellationScore | responsiveness | composite | bonusStreak }`.

**Permisos (doble capa)**: la UI oculta el botón por rol y `addKpiOverride()` re-valida vía `canAdminOverrideMetric(admin_type, metric)` — coordinator_fin nunca puede ajustar; `bonusStreak` solo super_admin. Si la validación falla, el guardado devuelve `{ ok: false, error }` y el modal muestra el mensaje "You don't have permission to make this adjustment." sin persistir nada.

**Aplicación**:
- Mes en curso, `metric` sub-métrica → `computeTeacherKpis` reemplaza el valor crudo antes de recalcular `baseComposite`.
- Cualquier mes, `metric = "composite"` → `monthlySnapshot` reemplaza el composite final del mes; `bonusStatus` lo lee así, permitiendo corregir la racha retroactivamente.
- `metric = "responsiveness"` en cualquier mes → reemplaza `responsiveness` del snapshot (informativo; no re-inyecta al composite del pasado).

**Log**: derivado on-demand como `ActivityKind = "kpi_manual_override"` desde este store (patrón derivado, no log paralelo).



---

## 10. Configuración y Taxonomías

### `MacroSkill` / `SubSkill` (`src/lib/skills-taxonomy.ts`)
`MacroKey = "Speaking"|"Writing"|"Listening"|"Reading"`, cada una con 4-6 sub-habilidades ligadas a un `BaseKey` (`fluency`|`vocabulary`|`confidence`|`grammar`). `skillKey(macro,sub)` genera la clave canónica usada en `PerformanceRating.subskills`.

### `Candidate` (`src/lib/substitute-engine.ts`) — no persistido
`{ teacher: User; score: number }`. `findCandidates(sessionId)` filtra maestros activos, excluye al original, ordena por `TeacherKpis.composite`. ⚠️ No verifica en código que quien invoca sea admin — el comentario "Admin always picks manually" es una nota de flujo UX, no un control de acceso real.

### Log retention (`src/lib/log-retention.ts`)
Config única `verbo:log-retention-months` (default 12, rango 1-120) editable solo por `super_admin` en Admin > Activity Logs. Aplica a los dos logs sin cota nativa: `verbo:kpi-overrides` (corta por `created_at`) y `verbo:payments-log` (corta por `paid_at`). El botón "Export & Clean up" descarga las entradas más viejas que el corte como JSON y luego las elimina vía `replaceKpiOverrides` / `replacePayments` (reemplazo total del array persistido, disparando `KPI_OVERRIDES_EVENT` / `PAYMENTS_EVENT`). Fuera de alcance: sessions, student-reports, club-reports, financial-issues, learning-path-events (este último ya se auto-limita a 100 por alumno).

---


## 11. Matriz de permisos por rol

### Capa 1 — `RoleGuard.tsx` (gate grueso, en los 3 layouts de ruta)
Compara `user.role` (3 valores) contra un `allow` fijo por layout. No conoce `admin_type`. Sin sesión → `/login`; rol incorrecto → home del rol propio.

### Capa 2 — `admin-roles.ts` → `canAccessAdminPath()` (gate fino dentro de `/admin`)

| Ruta / sección | super_admin | coordinator_ops | coordinator_fin |
|---|---|---|---|
| `/admin` (Dashboard) | ✅ | ✅ | ❌ |
| Students, Groups, Sessions | ✅ | ✅ | ❌ |
| Teachers | ✅ | ✅ | ❌ |
| KPIs | ✅ | ✅ | ✅ |
| Courses, Workshops, Challenges, Flash, Materials | ✅ | ✅ | ❌ |
| Clubs | ✅ | ✅ | ❌ |
| Holidays | ✅ | ✅ | ❌ |
| Financial / Money Lab | ✅ | ❌ | ✅ |
| Users | ✅ | ❌ | ❌ |
| Activity Logs | ✅ | ❌ | ❌ |

⚠️ **Modelo de seguridad inconsistente**: `coordinator_ops` es *permitir por defecto, denegar 3 excepciones*; `coordinator_fin` es *denegar por defecto, permitir 2 excepciones*. Una ruta nueva bajo `/admin` sin agregarse a ninguna lista queda **abierta automáticamente** para `coordinator_ops` y **cerrada automáticamente** para `coordinator_fin`.

⚠️ `admin.tsx` además duplica esta decisión con una regla hardcodeada por nombre de label (`if (g.label === "Users" || g.label === "Activity") return adminType === "super_admin"`), redundante con `canAccessAdminPath` — riesgo de que ambas reglas diverjan.

### Capa 3 — Teacher (`teacher.tsx`)
Sin sub-tipos de teacher, layout único. El nav filtra un ítem ("Course Builder VIP") por asignación propia vía `ASSIGNMENTS` — **filtro por propios registros a nivel de navegación**, no de datos. La separación real "un teacher solo ve sus alumnos/sesiones" vive en helpers de store (`assignedStudents()`, `activeStudents()`, `teacherCalendarEvents()`) — ⚠️ **no se verificó en esta lectura** que todas las páginas hijas (`/teacher/students`, `/teacher/calendar`, etc.) efectivamente usen esos helpers en vez de leer el store crudo.

### Capa 4 — Student (`student.tsx`)
Sin sub-tipos. Nav varía por `product_type` y por `product === "vip"`. No requiere filtro de "propios registros" porque el alumno solo ve su propio contexto (`useAuth().user`). Confirmado en `studentCalendarEvents()`: filtra por `student_id === studentId` o pertenencia a grupo.

### Resumen global

| Rol / sub-tipo | `/admin/*` | `/teacher/*` | `/student/*` |
|---|---|---|---|
| admin + super_admin | Total | ❌ | ❌ |
| admin + coordinator_ops | Todo excepto Financial/Users/Activity Logs | ❌ | ❌ |
| admin + coordinator_fin | Solo Financial + KPIs | ❌ | ❌ |
| teacher | ❌ | Total en su layout; datos limitados a `teacher_id` propio (parcialmente verificado) | ❌ |
| student | ❌ | ❌ | Total en su layout; datos limitados a `student_id` propio |

---

## 12. Enums y estados (consolidado)

| Enum | Valores exactos | Archivo |
|---|---|---|
| `Role` | `student \| teacher \| admin` | mock-data.ts |
| `AdminType` | `super_admin \| coordinator_ops \| coordinator_fin` | admin-roles.ts |
| `SessionStatus` (base) | `scheduled \| completed \| absent \| delayed` | mock-data.ts — ⚠️ ver contradicción abajo |
| `ExtSessionStatus` (real) | `scheduled \| rescheduled \| ready \| rearranged \| completed \| absent \| delayed \| cancelled \| pending_reschedule \| no_show \| converted_to_spotlight` | sessions-store.ts |
| `AttendanceSubStatus` | `absent_work \| absent_illness \| absent_vacation \| cancelled_illness \| cancelled_holiday \| cancelled_work` | sessions-store.ts |
| `cancellation_reason` | `illness \| personal \| major_issue \| other` | sessions-store.ts |
| `CancelReason` (Strike) | `illness \| personal \| major_issue \| other` | strikes-store.ts |
| `JustificationCause` | `evidence_provided \| force_majeure \| illness` | strikes-store.ts |
| `product` | `enterprise \| go \| international \| vip` | mock-data.ts |
| `access_plan` | `Core \| Advance \| Elite \| Signature` | mock-data.ts |
| `status` (student) | `active \| suspended \| frozen` | mock-data.ts |
| `teacher_status` | `active \| frozen \| removed` | mock-data.ts |
| `product_type` (User) | `performance \| workshops \| insights` | mock-data.ts |
| `payment_frequency` | `weekly \| biweekly \| monthly` | mock-data.ts |
| `GroupMemberStatus` | `active \| pending_removal \| archived` | groups-store.ts |
| `DayKey` | `mon \| tue \| wed \| thu \| fri \| sat` (⚠️ sin domingo) | availability-store.ts |
| `ClubType` | `insight \| book` (⚠️ sin "spotlight") | clubs-store.ts |
| `ClubReportEventType` | `insight \| book \| spotlight` | club-reports-store.ts |
| `TimeStatus` (Club) | `upcoming \| live \| completed \| cancelled` | clubs-store.ts |
| `ChallengeProductId` | `go \| enterprise \| international \| vip` | challenges-store.ts |
| `DifficultyId` (declarado) | `esencial \| intermedio \| avanzado \| experto` | challenges-store.ts |
| `FlashFormat` | `mystery_box \| lightning \| season` | flash-challenges-store.ts |
| `FlashProductId` | `enterprise \| go \| international` (⚠️ sin "vip") | flash-challenges-store.ts |
| `MaterialType` | `book \| pdf \| verb-list \| video \| image` | mock-data.ts |
| `ExerciseType` | `fill_gaps \| drag_drop \| listen_select \| read_select \| record \| read_complete \| match` | activities-store.ts |
| `ActivityKind` (log) | 20 valores (ver activity-logs-store.ts) | activity-logs-store.ts |
| `NotificationKind` | 15 valores (ver notifications-store.ts) | notifications-store.ts |
| `LessonSessionType` | `Syllabus content \| Additional Content \| Review Session \| Casual Topic \| Evaluation` | lesson-plans-store.ts |
| `StudentRequestKind` | `reschedule \| spotlight` | student-requests-store.ts |
| `StudentRequest.status` | `open \| claimed \| escalated \| assigned \| cancelled` | student-requests-store.ts |
| `PaidEntityType` | `individual \| group` | payments-log.ts |
| `Audience` (Announcement) | `all \| students \| teachers` | announcements-store.ts |

⚠️ **Contradicción documentada en el propio código**: `SessionStatus` declara `"delayed"` como valor válido, pero el comentario en `Session.attendance_delayed` dice explícitamente que "delayed" no es un status canónico (la sesión debe quedar en `"completed"` con `attendance_delayed: true`). Ninguna sesión del seed usa `status: "delayed"`, consistente con el comentario, no con el tipo.

---

## 13. Deuda de datos (consolidado, no corregido — solo documentado)

### Duplicación de entidades / conceptos

1. **"Unidad de curso" modelada 3 veces**: `Unit` (mock-data.ts, catálogo CEFR genérico), `CourseUnit` (product-courses-store.ts, catálogo por producto), `VipUnit` (vip-courses-store.ts, a medida por alumno) — mismos campos base (`id`, `title`, `video_url`/`file_url`, `pdf_url`) sin relación estructural entre sí.
2. **"Catálogo de materiales" duplicado**: `Material`/`MATERIALS` (mock-data.ts, simple) vs. `StoredMaterial` (materials-store.ts, con `restrict_product`/`restrict_level`) — dos fuentes para el mismo concepto.
3. **"Producto comercial" como dos tipos distintos con los mismos 3 valores**: `ProductId` (product-courses-store.ts) y `RestrictProduct` (materials-store.ts).
4. **`Challenge` vs `FlashChallenge`**: misma forma (id/product/category/title/description/video_url) con discriminador distinto — candidatos a unificarse con columna `kind`.
5. **Duplicación masiva `Group` ↔ `User`**: ~15 campos replicados y sincronizados a mano vía `propagateGroupToMembers()` (ver §6).
6. **Relación maestro-alumno en dos lugares**: `ASSIGNMENTS` (array plano) vs. `Group.teacher_id` + membresía de grupo — sincronizados manualmente en `groups-store.ts`.
7. **`hired_plan` vs `access_plan`** en `User` — alias legacy documentado como tal en el propio código, nunca limpiado.
8. **~~Cálculo de "% de progreso" duplicado~~ RESUELTO**: consolidado en `sessionProgressFor(hired, remaining) → { done, pct }` en `groups-store.ts`, consumido por `admin.students.tsx`, `admin.sessions.tsx`, `admin.groups.tsx` (GroupCard + GroupDetailModal) y `teacher.students.tsx`.
9. **Promedio de ratings de sesión calculado 3 veces** en 3 componentes distintos (`PerformanceAnalytics.tsx`, `RatingTrendModal.tsx`, `admin.students.tsx`), ninguna en un store.
10. **"Profesores calificados para un producto" implementado de 3 formas distintas**: helper correcto (`teachersForProduct()`), sin filtrar en absoluto, y un filtro manual reinventado — todo dentro de `admin.sessions.tsx` y `admin.students.tsx`.

### Naming inconsistente

11. **camelCase vs snake_case para el mismo concepto de ID**, mezclado dentro del mismo repo: `teacherId`/`studentId` (availability-store, coverage-notes-store, funciones de club-bookings-store) vs. `teacher_id`/`student_id` (la mayoría de los demás stores y los campos persistidos reales). Postgres/Supabase normalmente usa snake_case — habrá que homogeneizar antes de migrar.
12. **FK a "profesor" con 3 nombres distintos**: `teacher_id` (mayoría), `assigned_teacher_id` + `claimed_by` (student-requests-store.ts).
13. **"Fecha de creación" con 6 nombres distintos** a través del código: `created_at`, `createdAt`, `published_at`, `confirmedAt`, `lastAt`, `timestamp`.
14. **Claves compuestas con separadores distintos**: `` `${studentId}::${unitId}` `` (activities-store, doble `::`) vs. `` `${teacherId}:${studentId}` `` (coverage-notes-store, `:` simple).
15. **"¿Usuario ya vio/descartó X?" implementado de 2 formas incompatibles**: con scoping por `userId` en `notifications-store.ts`, sin scoping (global al navegador) en `announcements-store.ts`.

### Datos sintéticos / no persistidos que parecen reales

16. ~~`attendance-store.ts` es 100% sintético~~ — **eliminado**. El % de asistencia hoy se calcula con `studentAttendance()` en `sessions-store.ts` a partir de sesiones reales (completed vs absent), con fallback a `User.attendance_percentage`.
17. **`activity-logs-store.ts` y `notifications-store.ts` no son fuentes de verdad** — son vistas computadas on-demand desde otros stores. Necesitarán tablas reales o vistas materializadas en Supabase, no una migración 1:1.
18. **IDs generados como `prefijo-${Date.now()}-${random}`** en casi todos los stores — no son UUIDs reales, riesgo de colisión a escala; deben migrar a `uuid`/identity columns.

### Relaciones ambiguas o incompletas

19. **`ClubReport.event_id`** puede apuntar a un `Club.id` o a un evento "Spotlight" que no existe como `Club` (`ClubType` no incluye `"spotlight"`, `ClubReportEventType` sí).
20. **`teacherIsTitularOf()` (coverage-notes-store.ts) es un stub** — no valida la titularidad real, que supuestamente vive en `ASSIGNMENTS` pero el código lo admite como pendiente ("keep this here as a hook for future refinement").
21. **`Session.student_id` es polimórfico**: a veces `User.id` real, a veces un `cohort_id` cuando `origin === "workshop"` — sin discriminador tipado.
22. **`PaymentLogEntry.entity_id` es una FK polimórfica** (`User.id` o `Group.id` según `entity_type`) — no se puede expresar como FK simple en Postgres.
23. ~~**`ActivityScore`, `Completion`, `Attempts` (activities-store.ts) no tienen `studentId`**~~ — ✅ **Resuelto 2026-07-11**: los tres mapas ahora se indexan por clave compuesta `` `${studentId}::${unitId}` `` (o `` `::${activityId}` `` para scores), replicando el patrón de `MilestoneUnlocks`. Todas las funciones (`loadCompletion`, `setUnitCompleted`, `loadAttempts`, `incrementAttempts`, `resetAttempts`, `loadActivityScores`, `recordActivityScore`, `bestScoreFor`, `unitPassed`, `unitCategoryProgress`, `isUnitUnlocked`) requieren `studentId` como primer parámetro. `renameUnitReferences` migra las claves preservando el prefijo `studentId`.
24. **Ningún campo de precio/monto explícito por cliente** — `payments-log.ts` deriva `amount` de una tabla de tarifas hardcodeada (`PLAN_RATE`); un cliente con precio negociado no tiene dónde guardarse.
25. **Dos sistemas de nombres de "nivel" sin relación explícita**: `Level.id` estilo CEFR (A1, B1…) vs. nombres comerciales de roadmap en `User.contracted_levels` (Core Foundations, Strategic Fluency…).
26. **`Material`/`MATERIALS` no tiene FK a `Level`/`Unit`** pese a la relación conceptual esperada.
27. **`vip-courses-store.ts` referencia `LessonPlan.vip_unit_id`** — este vínculo SÍ existe (confirmado en `lesson-plans-store.ts`, §2), pero solo se documentó explorando un archivo aparte; ningún comentario cruzado lo señala directamente en `vip-courses-store.ts`.

### Lógica de datos viviendo en componentes en vez de stores (candidatos a mover, según la regla que se quiere adoptar)

28. **`teacher.tsx` — `hasVipStudent`**: join manual entre `USERS` y `ASSIGNMENTS` directamente en el layout de ruta.
29. **`PerformanceAnalytics.tsx` — `computeMacros()`/`baseAverage()`/`subAverage()`**: motor completo de cálculo de skills del alumno, reutilizado como si fuera un store (`useComputedMacros()`) pero viviendo en `components/verbo/`.
30. **`admin.students.tsx` — el peor caso encontrado**: implementa su propia capa de persistencia en localStorage (duplicando `students-store.ts`), y **muta directamente los arrays de módulo compartidos `USERS`/`ASSIGNMENTS`** desde el componente.
31. **`admin.sessions.tsx` — `BulkScheduler`**: algoritmo completo de generación de horarios recurrentes y detección de doble-reserva de profesor, hecho en el componente en vez de en `sessions-store.ts`.
32. **`student.courses.tsx` — el segundo peor caso**: la máquina de estados completa de progreso académico (`computeLevelStates()`, `computeUnitStates()`) y el motor de calificación de respuestas (`evaluate()`) viven enteramente en la ruta, no en `activities-store.ts`.
33. **`CantAttendModal.tsx` — `requireCoverage = hoursUntil >= 24`**: regla de negocio de umbral horario calculada en el componente en vez de en `strikes-store`/`coverage-notes-store`.
34. **`ClubReportModal.tsx`**: orquesta directamente entre dos stores (marca el club como `completed` en `clubs-store` al enviar un reporte de `club-reports-store`) en vez de que una función de store encapsule esa transición.
35. **Umbral "skill bajo = <70%"** repetido inline dos veces en `teacher.students.tsx`, sin vivir como constante compartida.

**Nota de alcance:** los hallazgos 28-35 vienen de una muestra de 17 archivos (12 componentes + 5 rutas), no de una auditoría exhaustiva de las ~40 rutas ni de los ~50 componentes de `src/components/ui/`. Es muy probable que existan más casos no cubiertos aquí.

---

## Preguntas abiertas — estado al 2026-07-11 (discutidas con Jaret)

- **`courses-store.ts` (`Level`/`Unit`, catálogo CEFR genérico) — ¿sigue en uso?** → Probable remanente del modelo anterior al catálogo por producto (los placeholders A1/A2/B1/B2 ya se reemplazaron según el historial del proyecto). **No se toca todavía** — candidato a borrar en la limpieza futura. Falta verificación 100% de que ningún archivo lo importe.
- **`Challenge.difficulty` le falta `"experto"`, y `Challenge` no declara `premium`/`skill_tags` pese a que el seed los usa al 100%.** → **Resuelta — falsa alarma.** Verificado 2026-07-11 contra el código real: `DifficultyId` ya incluye `experto` y `Challenge` ya declara `premium`/`skill_tags`. No se necesitó ningún cambio.
- **`ClubReport` con `event_type: "spotlight"` — ¿tabla propia o sigue compartiendo `event_id` con `Club`?** → **Pospuesto** al diseño de tablas de Supabase. Hipótesis a verificar en ese momento: las sesiones Spotlight probablemente nacen como `Session` (vía `student-requests-store.ts`, `kind: "spotlight"`), no como `Club` — lo cual explicaría la ambigüedad. No es un problema de la app actual, es una decisión de esquema futuro.
- **¿Unificar `Challenge`/`FlashChallenge` en una tabla con columna `kind`?** → **Pospuesto** al diseño de tablas de Supabase, misma razón que arriba. Recomendación cuando llegue el momento: sí conviene unificar. No tocar el código actual (entraría en el refactor pausado).
- **Hallazgo #23 — progreso de actividades sin `studentId`, ¿bug real hoy?** → **Acción inmediata pendiente de confirmar por Jaret**: probar con dos alumnos desde el mismo navegador (completar una actividad como alumno A, revisar si ya aparece completada para alumno B) para confirmar si esto explica parte de la confusión vista en preview. Si se confirma, es una excepción — arreglo quirúrgico y acotado (agregar `studentId` al mapa), no el barrido completo — que se autorizaría aparte, no como parte del refactor grande pausado.

---

## Teacher tiers y rate automático

**Fuente de verdad:** `src/lib/teacher-tiers.ts` (`TEACHER_TIERS`, `teacherTier`, `effectiveHourlyRate`, `teachersForProductSorted`).

Escalera fija: `Rising` $120 → `Established` $130 → `Distinguished` $140 → `Signature` $150 (MXN/h).

**Reloj del tier**: se ancla a `max(trackingStartKey(t), tier_reset_at)` — es decir, al **primer mes calendario completo después de la fecha de contratación**, coincidiendo con la ventana de tracking del bono. Cada **365 días activos** el docente sube un tier, tope en Signature.

**Días activos = días calendario desde el ancla − días pausados**.

**Pausa del reloj**: sólo cuenta el estado `frozen`. Al pasar a `frozen`, `admin.teachers.tsx` setea `tier_frozen_since` con `Date.now()`. Al reactivar (o cambiar a `removed`), se acumulan los días transcurridos a `tier_frozen_days` y se limpia `tier_frozen_since`. `removed` no pausa el reloj por sí mismo (se maneja como un estado terminal desde flujos de reasignación, no de pausa de tenure).

**Rate efectivo (`effectiveHourlyRate(t)`)**: si `User.hourly_rate` está definido, gana la anulación manual; si no, se usa el rate del tier calculado. Consumidores actualizados: `teacher-model.ts#financialSummary`, `teacher.financial.tsx`, header y form de `admin.teachers.tsx`.

**Selects de asignación**: `admin.students.tsx` reemplazó `teachersForProduct` por `teachersForProductSorted`, que ordena por `tier.id` ascendente y luego por nombre, mostrando el nombre del tier junto a cada docente para nudgear hacia profesores más nuevos/baratos.

**Nuevos campos en `User` (`src/lib/mock-data.ts`)**:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `tier_frozen_since` | `string \| null` (ISO) | Timestamp del inicio del período `frozen` actual; `null` si activo. |
| `tier_frozen_days` | `number` | Días acumulados de pausas anteriores. |
| `tier_reset_at` | `string \| null` (ISO) | Timestamp del último reset manual del reloj (reservado para futuros flujos). |

**Notificaciones**: `notifications-store.ts` deriva una notificación `tier_upgraded` (dedupe por `tier:{teacherId}:{tierId}`) cada vez que el docente cruza a un tier ≥ 2, con enlace a `/teacher/financial`.

## Profile Badges (nuevo)

Sistema paralelo al de Challenge Badges (`badges-store.ts`), separado por completo. Alimenta el ícono del header del Student Dashboard y la sección "My Profile → Equipped / Achievements Gallery".

**`src/lib/profile-badges-store.ts`**

- `BadgeMetric` = `"tenureMonths" | "attendancePercentage" | "unitsCompletedCount" | "levelsCompletedCount"`.
  - `tenureMonths`: meses transcurridos desde `user.member_since`.
  - `attendancePercentage`: `user.attendance_percentage ?? 0`.
  - `unitsCompletedCount`: unidades con `unitPassed(studentId, unitId) === true` en el `ProductCourse` del alumno (0 si VIP o si el producto no tiene Learning Path).
  - `levelsCompletedCount`: niveles de `user.contracted_levels` que cumplen `levelIsComplete()` (helper compartido en `activities-store.ts`).
- `BadgeDef` = `{ id, name, description, image (data URL), rule: { metric, threshold? } }`.
- `buildProfileBadgeContext(user)` centraliza el cálculo; Dashboard y ProfileModal comparten esta función.
- Persistencia: `localStorage["verbo:profile-badges"]`, evento `"verbo:profile-badges-updated"`.
- Seed inicial: Verbo Member, Verbo Veteran, Perfect Attendance, First Steps, Explorer, Unit Master, Level Conqueror, Level Legend.

**`src/lib/equipped-profile-badges-store.ts`**

Guarda hasta `EQUIPPED_MAX = 3` badge ids por alumno. `localStorage["verbo:equipped-profile-badges"]`, evento `"verbo:equipped-profile-badges-updated"`. API: `loadEquippedBadgeIds(studentId)`, `setEquippedBadgeIds(studentId, ids)`, `subscribeEquippedBadges(cb)`. Sólo pueden equiparse badges realmente ganados (la UI filtra por `isBadgeEarned` antes de mostrarlos en el picker).

**Admin**: `/admin/profile-badges` (grupo "Students" en `admin.tsx`) usa la misma mecánica que la pestaña "Badges" de Admin Challenges: subir imagen (GIF/PNG/JPG/WebP, máx 1 MB) como data URL, editar nombre/descripción/métrica/umbral, sin URLs externas.

**Consumo**:
- `student.index.tsx` → `<FeaturedProfileBadge />` en el header. Orden de prioridad: 1) Challenge Badge equipado **y** desbloqueado (`equipped-challenge-badges-store.ts` + `badges-store.ts`), 2) Profile Badge equipado, 3) Profile Badge earned con mayor threshold, 4) nada.
- `ProfileModal.tsx` → slots "Equipped Badges" reales con equip/unequip, y "Achievements Gallery" con estado earned/locked y hint de progreso numérico (p.ej. `8/10`).

**`src/lib/equipped-challenge-badges-store.ts`** (independiente del anterior)

Guarda hasta `EQUIPPED_MAX = 3` **Challenge Badge** ids por alumno (catálogo de `badges-store.ts`). `localStorage["verbo:equipped-challenge-badges"]`, evento `"verbo:equipped-challenge-badges-updated"`. API: `loadEquippedChallengeBadgeIds(studentId)`, `setEquippedChallengeBadgeIds(studentId, ids)`, `subscribeEquippedChallengeBadges(cb)`. Storage separado a propósito: los ids se repiten entre ambos catálogos (`first`, `explorer`, `master`).

Consumo: modal "Challenge badges" en `student.challenges.tsx` (abierto desde `PlayerProfileCard`) — sólo los 8 badges core son equipables (toggle); Lightning Bolt y los badges de Season se muestran earned/locked pero no son equipables.

**Regla compartida `levelIsComplete(level, studentId)`** vive ahora en `activities-store.ts` (antes duplicada en `student.courses.tsx`) e incluye el caso especial de unidades milestone con override `"unlocked"` / `"locked"`.

## Sesión de auth — persistencia con "Remember me" (`src/lib/auth.tsx`)

La sesión ya no se guarda como el `User` plano. Forma persistida bajo la key
`verbo.auth.user.v2`:

- `StoredSession = { user: User; expiresAt: number | null }`

Reglas:
- `login(email, password, remember)` — `remember: true` escribe en `localStorage`
  con `expiresAt = Date.now() + 30 días` y borra la key de `sessionStorage`;
  `remember: false` escribe en `sessionStorage` con `expiresAt = null` y borra la
  key de `localStorage`. La validación de credenciales (USERS, `isMemberBlocked`,
  `isUserDeactivated`) no cambió.
- Hidratación al montar: primero `localStorage` (si `expiresAt` está vencido se
  borra y no se restaura), luego `sessionStorage`. En ambos casos se re-hidrata
  contra `USERS` (canonical) preservando `password`.
- `logout()` limpia la key en ambos storages.
- `updateProfile()` escribe en el storage donde vive la sesión activa y preserva
  el `expiresAt` original (no lo recalcula).
- Se tolera la forma legacy (user plano) tratándola como `expiresAt: null`.
- `ready: boolean` en el contexto — `false` hasta que termina la hidratación del
  cliente. `RoleGuard` no juzga la sesión mientras `ready === false` (evita
  mostrar la pantalla de "sesión expirada" en el primer render).

### Pantallas de estado (`ErrorScreen`, solo UI — sin datos nuevos)
`src/components/verbo/error-screens.tsx` deriva estado existente, no lo crea:
- `isAccountFrozen(user)` — `teacher_status === "frozen"` para teachers,
  `status === "frozen"` para alumnos/admin. Solo lee el flag que Admin ya setea
  manualmente; no hay detección automática de freeze.
- `RoleGuard` muestra `SessionExpiredScreen` si no hay sesión y
  `FrozenAccountScreen` si `isAccountFrozen`. El root muestra `NotFoundScreen`
  (404), `GeneralErrorScreen` (error boundary global) y `UnsupportedDeviceScreen`
  (viewport < 768px).

## Profile Badges — nuevas métricas de racha y misiones (`src/lib/profile-badges-store.ts`)

**`src/lib/login-streak-store.ts`** (nuevo): `localStorage["verbo:login-streak"]`, evento `"verbo:login-streak-updated"`. Guarda por alumno `{ lastActiveDate: "YYYY-MM-DD", currentStreak: number }` en fecha local del navegador.

**`src/lib/unit-unlock-seen-store.ts`** (nuevo): `localStorage["verbo:unit-unlock-seen:{studentId}"]` = array de `unit id` cuya animación de desbloqueo ya se mostró al alumno. Solo UI (se usa para no repetir el flip de la unidad `current`); no afecta progreso ni estados.
- `touchLoginStreak(studentId)` — se llama una vez al montar el layout de alumno (`src/routes/student.tsx`, sólo rol `student`): ayer → +1, hoy → sin cambio, más antiguo/ausente → reset a 1. Devuelve el streak actualizado.
- `currentLoginStreak(studentId)` — lectura pura, sin mutar (la usa el badge context).
- `subscribeLoginStreak(cb)`.

**`unitPassedByActivities(studentId, unitId)`** en `activities-store.ts`: misma regla que `unitPassed`, pero si la unidad no tiene ninguna actividad mandatory configurada devuelve `false` (sin fallback al completion flag legacy). Es la única función válida para calcular medallas: un pase por override/seed nunca otorga medalla.

**Nuevas `BadgeMetric`** (todas `numeric: true`):
- `loginStreakDays` — días calendario consecutivos abriendo Verbo Academy.
- `level1MissionsCompleted` … `level4MissionsCompleted` — cuántos bloques de Misión (de 3) están 100% completos en el Level N del producto del alumno. Cada nivel se divide en 3 bloques de 10 unidades (`[0-9]`, `[10-19]`, `[20-29]`, mismo criterio que `UnitsView`); un bloque cuenta sólo si sus 10 unidades pasan `unitPassedByActivities`. Niveles no contratados o alumnos VIP → 0.

**Seed ampliada: 8 badges originales + 21 nuevos = 29.**
- Racha (5): `streak-3` 3-Day Flame (≥3), `streak-10` 10-Day Flame (≥10), `streak-30` 30-Day Flame (≥30), `streak-60` 60-Day Flame (≥60), `streak-100` 100-Day Flame (≥100).
- Medallas (16): 4 por nivel con metal por nivel (1=Bronze, 2=Silver, 3=Gold, 4=Onyx). Por nivel N con metric `levelNMissionsCompleted`: `l{N}-m1` "{Metal} — Mission 1" (≥1), `l{N}-m2` "{Metal} — Mission 2" (≥2), `l{N}-m3` "{Metal} — Mission 3" (≥3) y `l{N}-complete` "{Metal} — Level Complete" (≥3, coincide intencionalmente con Mission 3).
- Todas con `image: ""`; el Admin sube la imagen desde `/admin/profile-badges`, cuyo selector de métrica lee `BADGE_METRIC_META` dinámicamente (ya muestra las 5 opciones nuevas sin cambios de lógica).


## Reportes técnicos de contenido (`src/lib/content-issue-reports-store.ts`)

Store simple (mismo patrón que `student-reports-store.ts`): `localStorage["verbo:content-issue-reports"]`, evento `"verbo:content-issue-reports-updated"`.

`ContentIssueReport = { id, studentId, entityType, entityId, entityTitle, issueType, detail, createdAt, status, resolved_at? }`.

- `entityType: "unit" | "challenge"` — indica desde dónde se reportó. Los registros viejos (que tenían `unitId`/`unitTitle`) se normalizan al leer: `entityType = "unit"`, `entityId = unitId`, `entityTitle = unitTitle`.
- `issueType` ∈ `UNIT_ISSUE_TYPES` (antes `CONTENT_ISSUE_TYPES`): "PDF won't download" | "Video won't play" | "Audio won't record" | "Exercise won't load" | "Score not saving" | "Other"; o ∈ `CHALLENGE_ISSUE_TYPES`: "The challenge won't open" | "I can't upload my evidence (submission link)" | "My completed challenge wasn't counted" | "My streak didn't update" | "Other".
- `detail` es opcional (string vacío si no se completa).
- `status: ContentIssueReportStatus = "pending" | "resolved" | "dismissed"` (nace en `"pending"`; los registros previos al campo se backfillean a `"pending"` al leer). `resolved_at` (ISO) se setea al pasar a un status distinto de `"pending"`.
- `addContentIssueReport(input)` crea el reporte; `updateContentIssueReport(id, { status })` cambia el estado y setea `resolved_at`; `loadContentIssueReports()`, `contentIssuesForUnit(unitId)` (filtra `entityType === "unit"`) y `subscribeContentIssueReports(cb)` son lecturas ordenadas por fecha desc.
- Lo dispara el alumno desde `ReportContentIssueModal` (props: `entityType`, `entityId`, `entityTitle`), tanto en el detalle de unidad (`student.courses.tsx`) como en `ChallengeDetail` (`student.challenges.tsx`).
- Bandeja de Admin: ruta `/admin/content-issue-reports` ("Technical Issues"), con columnas Status y Actions (resolver / descartar). El dashboard admin (`admin.index.tsx`) solo cuenta como urgentes los reportes con `status === "pending"`.
- Notificaciones: cada reporte deriva una notificación admin `kind: "content_issue_reported"` ("New technical issue reported", body `alumno · entityType · issueType`, `to: "/admin/content-issue-reports"`).

---

## Staff Profile (`src/lib/staff-profile-store.ts`)

Datos de presentación editables para **teachers y admins** (el equivalente staff del `ProfileModal` de alumno). Se renderiza en `StaffProfileModal.tsx`, abierto desde la foto del navbar (`TopNav`) para **los 3 roles** (student incluido desde la unificación del modal "My Profile"; `ProfileModal.tsx` queda en el repo sin usar salvo por sus subcomponentes `BadgeVisual`, `AchievementsGallery` y `BadgePickerModal`, reutilizados desde `StaffProfileModal`). Reemplaza a `AdminProfileModal.tsx` (eliminado).

### `StaffProfile` — localStorage `verbo:staff-profiles` (mapa `userId → StaffProfile`)

| campo | tipo | notas |
|---|---|---|
| headline | string | frase de presentación visible para alumnos, máx. `MAX_HEADLINE_CHARS` = 200 |
| specializations | string[] | tags "Specializes in", máx. `MAX_SPECIALIZATIONS` = 6, deduplicados y trimmed |

### Presencia — localStorage `verbo:staff-presence` (mapa `userId → timestamp ms`)
- `touchPresence(userId)` late cada 60s mientras el modal está montado (`usePresence(userId, self=true)`).
- `isOnline(userId)`: heartbeat más reciente que `PRESENCE_TTL_MS` (5 min) → punto verde; si no, gris.

### Derivados (calculados solo en el store)
- `roleLabelFor(user)` → "Teacher" | "Admin" | "Student" (chip 1).
- `rankLabel(user)` → teacher: tier (`teacher-tiers.ts`); student: `hired_plan ?? access_plan ?? "Student"`; admin: tipo de admin (chip 2).
- `tenureLabel(user)` → "New" / "N mos tenure" / "N yrs tenure"; teachers usan `activeTenureDays()`, resto `member_since` (chip 3).
- `staffStats(user, rev)` → 3 columnas. Teacher: `avgRating()`, `assignedStudents().length`, `hours_month`. Student: Current Level (`computeCurrentProgress`), Attendance % (`attendance_percentage`), Challenges Completed (`completed_challenges.length`). Admin: nº de teachers, nº de alumnos, nivel de acceso. `rev` es el contador de revalidación para reaccionar a cambios de cursos.

### Contraseña
El cambio de contraseña usa `updateProfile({ currentPassword, newPassword })` de `auth.tsx` + `validatePasswordComplexity()` (misma regla que el alumno: ≥4 chars, 1 mayúscula, 1 número). Sin contraseña actual correcta no se aplica el cambio. "Forgot password" es solo UI por ahora (sin lógica).

## Student Profile (`src/lib/student-profile-store.ts`)

Equivalente al Staff Profile pero para **alumnos**, con la misma forma (read/write/subscribe sobre localStorage + hook `useStudentProfile`).

### `StudentProfile` — localStorage `verbo:student-profiles` (mapa `userId → StudentProfile`), evento `verbo:student-profiles-updated`

| campo | tipo | notas |
|---|---|---|
| headline | string | frase "About me", máx. `MAX_HEADLINE_CHARS` = 200 |
| personalityTags | string[] | adjetivos activos, solo valores de `PERSONALITY_TAG_OPTIONS`, máx. `MAX_PERSONALITY_TAGS` = 5 |

- `PERSONALITY_TAG_OPTIONS` (catálogo cerrado): Cheerful, Talkative, Curious, Creative, Energetic, Friendly, Funny, Adventurous, Calm, Thoughtful, Patient, Focused, Observant, Independent, Reserved, Practical, Confident, Easygoing.
- `togglePersonalityTag(userId, tag)`: activa/desactiva; al llegar al máximo, activar uno nuevo **reemplaza el más antiguo**.
- Las secciones "Equipped badges" y "Show on leaderboard as" del modal siguen viviendo en `equipped-profile-badges-store.ts`, `profile-badges-store.ts` y `leaderboard-identity-store.ts` (sin cambios).


## Overrides manuales de badges (`src/lib/badge-override-store.ts`)

Log append-only en localStorage (`verbo:badge-override-log`, evento `verbo:badge-override-updated`), mismo patrón que el log de unit access de `activities-store.ts`: el evento más reciente para cada terna `(studentId, badgeId, system)` gana.

**`BadgeOverrideEvent`**: `id, studentId, badgeId, system: BadgeSystem ("profile" | "challenge"), action: "granted" | "revoked", actorId, actorRole: "admin", at`.

- `setBadgeOverride(studentId, badgeId, system, action, actorId)` — hace push de un evento nuevo.
- `getBadgeOverride(studentId, badgeId, system)` — acción más reciente o `null` (sin override → aplica la regla automática del badge).
- `isBadgeManuallyGranted(studentId, badgeId, system)` — `=== "granted"`.

**Efecto en la evaluación de "earned"**: en todos los call sites de `isBadgeEarned` la condición pasa a ser `earned_por_regla || isBadgeManuallyGranted(studentId, badge.id, system)`. Call sites cubiertos: `badge-unlock.ts` (core challenge + profile), `ProfileModal.tsx` (lista de earned y galería), `student.index.tsx` (franja de badges equipados: challenge y profile), `student.challenges.tsx` (profile badges del PlayerProfileCard y tiles core del ChallengeBadgesModal). Un override nunca revoca un badge ya ganado por regla: `"revoked"` solo devuelve el badge a evaluación automática.

**Admin UI**: Admin > Students > modal de alumno > tab "Badges" (`BadgesOverridePanel` en `src/routes/admin.students.tsx`), con dos secciones (Profile Badges vía `profile-badges-store.loadBadges`, Challenge Badges vía `badges-store.loadBadges`) y toggle Grant/Auto por badge.
