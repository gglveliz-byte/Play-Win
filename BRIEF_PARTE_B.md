# 📦 BRIEF PARTE B — Motor de Competición y Frontend

> **Este documento es autocontenido.** No necesitas leer el resto del proyecto antes de empezar, pero **sí debes leer [PLAN_DIVISION_BUGS.md](PLAN_DIVISION_BUGS.md)** para conocer el contrato compartido y las advertencias.

---

## 🎯 Tu misión

Arreglar **8 bugs** del motor de competición (lo que hace que el producto sea un producto) y del frontend del Hub.

**Tus bugs:** BUG-019 · BUG-020 · BUG-007 · BUG-003 · BUG-008 · BUG-009 · BUG-011 · BUG-014

**Tus dos bugs más importantes son BUG-019 y BUG-020** — juntos significan que el sistema de ligas, que es el corazón de la plataforma, no funciona como se diseñó.

**NO toques** los archivos de la Parte A (infraestructura de pruebas y seguridad de API). Ver la lista en `PLAN_DIVISION_BUGS.md`.

---

## 📚 Contexto mínimo que necesitas

**Proyecto:** plataforma eSports con **micro-ligas semanales de 10 jugadores**, emparejadas por habilidad. El jugador compite, gana Season Points, y al cerrar la semana el TOP 3 cobra premios y **todos** ajustan su Skill Rating (MMR).

**Los dos motores desacoplados (concepto clave, no los mezcles):**

| | 🏆 Season Points | ⭐ Skill Rating (MMR) |
| :--- | :--- | :--- |
| Para qué | Quién gana la liga **esta semana** | Contra quién juegas la **próxima** |
| Persistencia | Se reinicia a 0 cada semana | Persiste |
| Cómo se mueve | +100 victoria / +20 derrota, por duelo | **Solo** al cerrar la semana, por posición final |

> 🔴 **Un duelo NUNCA mueve el MMR.** Solo `settle.ts` escribe `skill_rating`.

**Stack:**
- `apps/hub` — Next.js 16.3.6 (App Router). Base de datos Neon PostgreSQL.
- `packages/database` — esquema y servicios de BD compartidos.
- `apps/realtime-server` — servidor de duelos WebSocket.

**Reglas inviolables** (están en `AGENTS.md` y `playwin-code-governance`):
1. **Ningún archivo supera 350 líneas** (orquestadores hasta 800).
2. **Cero secretos en el código.** Usa `apps/hub/src/lib/config.ts`.
3. **Cero elipsis.** Prohibido `// TODO`, `// resto del código igual`, funciones vacías.
4. **Cero estilos inventados.** Solo tokens CSS: `var(--bg)`, `var(--card)`, `var(--ink)`, `var(--ink-soft)`, `var(--mute)`, `var(--line)`, `var(--orange)`, `var(--orange-2)`, `var(--pill-dark)`, `var(--pill-light)`, `var(--hero-bg-1)`, `var(--hero-bg-2)`.
5. **Cero código isla.** Antes de escribir una utilidad, búscala en `packages/` o `apps/hub/src/lib/`.

**Nombres de columna EXACTOS (no los inventes):**
- `league_groups.rank_tier` (NO `tier`) · `league_groups.is_locked` · `league_groups.prize_pool`
- `game_passports.rank_tier`, `.skill_rating`, `.season_points`, `.wins`, `.losses`
- `league_members.season_points`, `.position`
- `wallet_ledger.type` (NO `entry_type`)

**Valores reales del motor** (verificados en `settle.ts:54-69`):

| Posición | Premio | Δ MMR |
| :---: | :---: | :---: |
| 1º | $15.00 | +60 |
| 2º | $7.00 | +35 |
| 3º | $3.00 | +20 |
| 4º–7º | — | 0 |
| 8º–9º | — | −25 |
| 10º | — | −50 |

Bolsa por liga: **$25.00**. Puntuación por duelo: **+100 victoria / +20 derrota / 0 abandono**.

**Comandos útiles:**
```bash
npm run test:governance    # 9/9 obligatorio antes de dar nada por terminado
npm run test:db
npm run test:treasury      # valida el reparto de premios end-to-end
node scratch/check_bug_consistency.mjs
```

---

## 🔴 BUG-019 · El sharding por MMR no existe — TODOS son BRONCE

**Severidad:** 🟠 Alto · **Es el bug más importante de tu parte**

### Problema (verificado contra la base de datos real)

```
SELECT rank_tier, COUNT(*) FROM game_passports GROUP BY rank_tier;
→ 178 pasaportes · 178 en BRONCE · 0 en cualquier otra división
```

`assignPlayerToLeague(userId, gameId, rankTier = 'BRONZE')` en `apps/hub/src/lib/db/leagues.ts:34` recibe `rankTier` con valor por defecto `'BRONZE'`, y **ningún llamador lo calcula a partir del `skill_rating`**.

**No existe la función de mapeo MMR → división.** Los umbrales de división no están definidos en ninguna parte del código.

### Por qué es grave

Anula **el pilar del producto**. La propuesta de valor es *"emparejamos jugadores de habilidad similar para que la competición sea justa"*. Hoy un jugador con 3000 de MMR compite contra uno de 1200. Y las bolsas escaladas por división ($5 Bronce → $250 Elite) son inalcanzables.

### Qué hacer

1. **Implementa `resolveRankTier(skillRating)`** en `apps/hub/src/lib/db/leagues.ts`. Define umbrales explícitos y **documéntalos en comentario**. Referencia: el MMR parte en `1200` por defecto y la banda teórica es `1200–3000`. División: `BRONZE` → `SILVER` → `GOLD` → `PLATINUM` → `DIAMOND` → `ELITE`.
2. **Úsala en TODOS los llamadores** de `assignPlayerToLeague`. Búscalos:
   ```bash
   grep -rn "assignPlayerToLeague" apps/hub/src
   ```
   (hoy están en `api/auth/register/route.ts` y `api/leagues/route.ts`)
3. **Backfill de los 178 pasaportes existentes:** script de migración que recalcule `rank_tier` desde el `skill_rating` actual. Debe ser **idempotente** (ejecutarlo dos veces no cambia nada).
4. **Prueba:** un jugador con MMR alto debe entrar a una división alta, y uno con MMR bajo a una baja.

### Criterio de aceptación

```sql
SELECT rank_tier, COUNT(*) FROM game_passports GROUP BY rank_tier;
-- Debe mostrar MÁS DE UNA división, coherente con los skill_rating
```
Más una suite que verifique el mapeo en los límites de cada umbral.

---

## 🔴 BUG-020 · `is_locked` no se activa al llegar a 10 jugadores

**Severidad:** 🟠 Alto

### Problema (verificado)

```
is_locked = false → 21 ligas · is_locked = true → 8 ligas
Ocupación top: 5 ligas con 10 miembros y is_locked = FALSE
```

El diseño exige: *"tan pronto el jugador #10 entra, el grupo se sella con `is_locked = true`"*. Pero en el código `is_locked` **solo** se pone en `TRUE` al cerrar la temporada (`settle.ts:124`).

Hoy la exclusión del jugador #11 depende **únicamente** de `HAVING COUNT(m.user_id) < 10` en la consulta (`leagues.ts:12`).

### Por qué es grave

1. **Condición de carrera:** dos jugadores concurrentes pueden leer la misma liga con 9 miembros e insertarse ambos → **liga de 11**. El reparto de $25 se dividiría mal y la competición sería injusta.
2. `is_locked` deja de ser una fuente de verdad fiable.

### Qué hacer

1. **Sellar inmediatamente tras cada alta:**
   ```sql
   UPDATE league_groups SET is_locked = TRUE
   WHERE id = $1 AND (SELECT COUNT(*) FROM league_members WHERE league_id = $1) >= 10;
   ```
2. **Bloqueo pesimista:** dentro de la transacción de `assignPlayerToLeague`, haz `SELECT ... FOR UPDATE` sobre la liga para serializar las asignaciones concurrentes.
3. **Defensa en profundidad:** un trigger o constraint que **rechace** el miembro #11 a nivel de base de datos. No confíes solo en el código de aplicación.
4. **Backfill:** sella las 5 ligas que ya tienen 10 miembros y `is_locked = false`.

### Criterio de aceptación

- Ninguna liga con `COUNT(*) >= 10` puede tener `is_locked = false`.
- Una prueba de **concurrencia** que lance 12 asignaciones simultáneas a la misma liga y verifique que **entran exactamente 10**.

---

## 🐛 BUG-007 · `/api/games/lobby` devuelve datos fabricados

**Severidad:** 🟠 Alto

### Problema (verificado en vivo)

`apps/hub/src/app/api/games/lobby/route.ts` declara consultar los *"mejores pilotos reales de la base de datos"*, pero incluye datos **inventados** que se muestran al usuario como si fueran reales:

- `route.ts:107-110` — filas falsas con `rank_tier: 'ORO'`, `skillRating: 1850`, `seasonPoints: 240`
- `route.ts:121` — `totalActiveInDivision: Math.max(len, 6)` → si hay 1 jugador real, **reporta 6 activos**
- `route.ts:122` — `divisionTier: 'DIVISIÓN ORO #3'` → división fija inventada

**Comprobado en vivo:**
```
GET /api/games/lobby?gameId=carreras
→ divisionTier "DIVISIÓN ORO #3" hardcodeado  ✅ CONFIRMADO
```

Además `apps/hub/src/components/GameLauncherModal.tsx:106-107` quema `rank: 'ORO'` y `skillRating: 1820` **en el cliente**, y `:108` usa `ws://localhost:3001/ws` como default.

### Por qué es grave

Engaña al usuario sobre su división y sobre cuánta gente compite. Viola la Regla 2 de gobernanza y el principio de *"Cero Demos"* del proyecto.

### Qué hacer

1. **Elimina los datos fabricados.** Si no hay datos reales, devuelve **lista vacía** y que la UI muestre un estado *"aún no hay pilotos en tu división"*.
2. **La división y el MMR del usuario** deben salir de su **propio** `game_passports`, no de constantes.
3. **`totalActiveInDivision`** debe ser el conteo **real** (`COUNT(*)`, sin `Math.max`).
4. **`wsUrl`** en el launcher debe venir de `NEXT_PUBLIC_REALTIME_WS_URL` (ya está en `apps/hub/.env.local`), no hardcodeado.
5. `GameLauncherModal.tsx` debe leer `rank` y `skillRating` del usuario autenticado.

### Criterio de aceptación

```bash
curl "http://localhost:3000/api/games/lobby?gameId=carreras"
# No debe contener: "DIVISIÓN ORO #3", skillRating 1850, ni totalActiveInDivision fabricado
```

---

## 🐛 BUG-003 · Capa de datos duplicada Hub ↔ `packages/database`

**Severidad:** 🟠 Alto

### Problema (verificado)

Existen **dos implementaciones paralelas** de la misma lógica de negocio:

| Módulo | Copia del Hub | Paquete real |
| :--- | :--- | :--- |
| users | `apps/hub/src/lib/db/users.ts` (132L) | `packages/database/src/services/users.js` (143L) |
| passports | 82L | 96L |
| matches | 100L | 123L |
| leagues | 93L | 113L |
| ledger | 69L | 70L |

`apps/hub/package.json` declara `"@playwin/database": "file:../../packages/database"` pero **el Hub nunca lo importa** (0 referencias en `apps/hub/src`). El servidor de duelos **sí** usa el paquete real.

### Por qué es grave

Viola la Regla 4 de gobernanza (*"Cero Código Isla"*). Cualquier corrección aplicada a una copia **no se propaga** a la otra → divergencia silenciosa garantizada. Es la causa raíz de futuros bugs contables.

### Qué hacer

> ⚠️ **Coordina con la Parte A**: ellos también tocan `packages/database`. Tú eres el dueño de `packages/database/src/services/**`; ellos solo añaden constantes.

1. Elige **`packages/database` como única fuente de verdad**.
2. Migra las API routes del Hub a importar `@playwin/database` en lugar de `@/lib/db` para las entidades duplicadas.
3. Elimina los archivos duplicados del Hub cuando ya no tengan consumidores. **Conserva** `apps/hub/src/lib/db/settle.ts` (el cierre semanal solo existe ahí) e `index.ts` si hace falta el pool.
4. **Verifica con `grep` que no queda ningún import roto** antes de borrar nada.

> 📌 **Tus archivos de `apps/hub/src/lib/db/`:** eres dueño de `leagues.ts`, `settle.ts` y `users.ts`. `matches.ts`, `passports.ts` y `ledger.ts` los comparte la Parte A **solo para tipos de ledger** — si necesitas cambiarlos, avisa.

### Criterio de aceptación

Ningún módulo de negocio está implementado dos veces. `grep -rn "@/lib/db" apps/hub/src` solo devuelve lo justificado (settle y pool). Todas las suites siguen pasando.

---

## 🐛 BUG-008 · Constantes de dinero y puntos duplicadas (parte frontend)

**Severidad:** 🟡 Medio

### Problema

Los valores `$25/$15/$7/$3` y `+100/+20` están escritos literalmente en 6+ archivos, backend y frontend. Los 4 `game_id` y sus metadatos están duplicados en 5 lugares.

**Consecuencia:** cambiar el premio de una liga exige editar 6 sitios. Un olvido produce **inconsistencia contable entre lo mostrado y lo pagado**.

### Qué hacer

> 📌 **La Parte A crea `packages/database/src/constants.js`** con `LEDGER_TYPES`, `PRIZE_SPLIT`, `MMR_DELTAS`, `SEASON_POINTS` y `LEAGUE_PRIZE_POOL`. **Consúmelas, no las redefinas.** Ver el contrato en `PLAN_DIVISION_BUGS.md`.

1. **En el frontend** (`LeagueStandings.tsx`, `passport-types.ts`, `GameLauncherModal.tsx`, `page.tsx`): elimina los valores quemados y **recibe los datos del servidor** o impórtalos de las constantes.
2. **Regla 2 de gobernanza:** el frontend **no debe calcular premios**. Debe **mostrar** lo que el servidor diga. Si hoy calcula, cámbialo para que lo reciba.
3. **Catálogo de juegos:** unifica los 5 lugares en **una sola fuente**. Como el frontend y el backend lo necesitan, la opción limpia es `packages/types/` (declarado en `AGENTS.md` pero **aún no existe**) o un módulo compartido.

### Criterio de aceptación

`grep -rn "15.00\|25.00\|\"ORO\"" apps/hub/src/components` no devuelve valores de negocio quemados.

---

## 🐛 BUG-009 · Violaciones de los tokens de diseño (HEX directos)

**Severidad:** 🟡 Medio

### Problema

La Regla 3 prohíbe colores HEX arbitrarios, pero hay usos directos. Verificado:

| Archivo | Líneas | HEX |
| :--- | :--- | :--- |
| `AuthModal.tsx` | 105, 111, 133 | `#ef4444`, `#dc2626`, `#fff` |
| `WalletView.tsx` | 75, 127, 131 | `#22c55e`, `#16a34a`, `#dc2626` |
| `Navigation.tsx` | 126 | `#fff` |
| `PassportView.tsx` | 303 | `#059669` |
| `GameCard.tsx` | 83-84 | `#ffffff`, `rgba(210,105,26,.92)` |
| `LeagueStandings.tsx` | 105-119 | varios |
| `globals.css` | 223, 234-235 | `#000` |

Además **ningún componente usa CSS Modules** (la Regla 1.4 los pide): todo son objetos `style={{}}` en línea.

### Qué hacer

1. **Añade tokens semánticos de estado** a `apps/hub/src/app/globals.css`:
   ```css
   --success: …;  --success-soft: …;
   --danger: …;   --danger-soft: …;
   --warning: …;
   ```
   Elige los valores **coherentes con la paleta Warm Editorial Tangerine** (fondos apergaminados, tinta oscura, naranja terracota). No introduzcas azules ni verdes chillones: el sistema es cálido.
2. **Sustituye todos los HEX** por esos tokens.
3. **Migra al menos un componente a CSS Modules** para demostrar el patrón (sugerencia: `GameCard.tsx`, que es pequeño y está aislado).

> 📌 `apps/hub/src/app/globals.css` es **tuyo**. Los componentes `.tsx` también.

### Criterio de aceptación

`grep -rn "#[0-9a-fA-F]\{3,6\}" apps/hub/src/components` no devuelve colores de estado quemados.

---

## 🐛 BUG-011 + BUG-014 · `detectCollusion` sin cobertura ni prueba

**Severidad:** 🟡 Parcial / ⚪ Bajo

### Problema

`apps/realtime-server/src/anticheat.js:255-274` tiene `detectCollusion()`, pero:

1. **Solo actúa con `NODE_ENV === 'production'`** (`anticheat.js:263`). En desarrollo, dos pestañas del mismo usuario se emparejan entre sí a propósito.
2. **Cobertura cero:** ninguna suite la invoca. Un fallo en esa lógica llegaría a producción sin detectarse.

### Qué hacer

1. **Crea `apps/realtime-server/test/collusion_spec.js`** (nuevo) con los 4 casos: misma cuenta, misma IP en producción, misma IP en desarrollo, y caso limpio. Debe pasar.
2. **Reemplaza la dependencia de `NODE_ENV` por una bandera explícita** (ej. `ALLOW_SELF_MATCH`) para que el comportamiento sea intencional y testeable, no un efecto colateral del entorno.
3. Documenta la decisión.

> ⚠️ `anticheat.js` es **compartido**: la Parte A lo toca solo para leer `JWT_SECRET`. **Tú solo cambias `detectCollusion`.** No reorganices el archivo.

### Criterio de aceptación

`node --env-file=.env.test apps/realtime-server/test/collusion_spec.js` → exit 0 con 4/4 casos.

---

## ✅ Checklist antes de dar por terminado

- [ ] `SELECT rank_tier, COUNT(*) FROM game_passports GROUP BY rank_tier` muestra **más de una división**
- [ ] Ninguna liga con 10+ miembros tiene `is_locked = false`
- [ ] Prueba de concurrencia: 12 asignaciones simultáneas → exactamente 10 entran
- [ ] El lobby no devuelve datos fabricados
- [ ] `npm run test:governance` → **9/9** (obligatorio)
- [ ] Ningún archivo supera **350 líneas**
- [ ] Cero elipsis / `// TODO`
- [ ] Cada bug marcado `✅ RESUELTO` en `AUDITORIA_BUGS.md` con fecha y evidencia
- [ ] Hito registrado en `PROGRESS.md`
- [ ] `node scratch/check_bug_consistency.mjs` → **`✅ CONTEO CONSISTENTE`**

> ⚠️ **`AUDITORIA_BUGS.md` y `PROGRESS.md` los edita también la Parte A.** Edita solo tus secciones y **nunca reescribas el archivo completo** — usa edición por fragmento.

---

## 📤 Qué reportar al terminar

1. Los 8 bugs: estado final y **salida cruda** de la verificación de cada uno.
2. **La distribución de divisiones** antes y después del backfill (es la prueba de que el motor funciona).
3. **La prueba de concurrencia** del sellado de ligas.
4. Los umbrales de `resolveRankTier` que elegiste y por qué.
5. Cualquier bug **nuevo** que encuentres, con `archivo:línea` y evidencia.
