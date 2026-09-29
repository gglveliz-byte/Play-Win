# 🛠️ PLAN DE CORRECCIÓN — BUGS PENDIENTES

> **Fecha:** 2026-09-29 · **Origen:** [AUDITORIA_BUGS.md](AUDITORIA_BUGS.md)
> **Estado de partida:** 21 bugs catalogados → **13 resueltos · 6 abiertos · 2 parciales**

---

## 📊 Cuántos faltan

| Estado | Cantidad | IDs |
| :--- | :--- | :--- |
| 🟠 **Alto** | **3** | BUG-019 · BUG-020 · BUG-003 |
| 🟡 **Medio** | **3** | BUG-008 · BUG-009 · BUG-011 |
| ⚪ **Bajo** | **2** | BUG-014 · BUG-015 |
| **TOTAL PENDIENTE** | **8** | 6 abiertos + 2 parciales |

**Cero bugs críticos.** Los dos críticos (PayPal y secretos) se cerraron en el bloque 1º.

---

## 🎯 Orden de ejecución recomendado

El orden responde a **dependencias técnicas**, no a severidad. Cada bloque deja el sistema verificable.

```
BLOQUE 3 · Motor de competición   →  BUG-019, BUG-020   (el corazón del producto)
      │
BLOQUE 4 · Unificación de datos   →  BUG-003, BUG-008
      │
BLOQUE 5 · Acabado y cobertura    →  BUG-009, BUG-011, BUG-014, BUG-015
```

---

# 🔴 BLOQUE 3 · Motor de Competición

> **Por qué primero:** son los dos bugs que rompen la propuesta de valor. Hoy el sistema de ligas **no funciona como se diseñó**: todos compiten en Bronce y las ligas no se sellan.

---

## 🐛 BUG-019 · El sharding por MMR no existe — todos son BRONCE

| | |
| :--- | :--- |
| **Severidad** | 🟠 Alto |
| **Esfuerzo** | Medio (~1,5 h) |
| **Ubicación** | `apps/hub/src/lib/db/leagues.ts` · `api/leagues/route.ts` |
| **Depende de** | Nada — **la base ya está construida** |

### Problema verificado

```
SELECT rank_tier, COUNT(*) FROM game_passports GROUP BY rank_tier;
→ 178 pasaportes · 178 en BRONCE · 0 en cualquier otra división
```

`assignPlayerToLeague()` recibe `rankTier = 'BRONZE'` por defecto y **ningún llamador lo calcula desde el `skill_rating`** (no existía la función de mapeo).

### ✅ Ya está hecho (en el bloque 2º)

`packages/database/src/constants.js` ya contiene:

- `RANK_TIER_THRESHOLDS` — umbrales documentados (ELITE ≥2400, DIAMOND ≥2100, PLATINUM ≥1850, GOLD ≥1600, SILVER ≥1400, BRONZE ≥0)
- `resolveRankTier(skillRating)` — **función implementada y exportada**, con test de límites
- El registro (`api/auth/register/route.ts`) **ya la usa** para asignar la división inicial

### Trabajo restante

1. **Conectar `resolveRankTier` en los llamadores restantes.** Buscarlos:
   ```bash
   grep -rn "assignPlayerToLeague" apps/hub/src
   ```
   El que queda es `api/leagues/route.ts`. Debe leer el `skill_rating` del pasaporte del jugador y resolver su división, en vez de pasar `'BRONZE'` fijo.
2. **Backfill de los 178 pasaportes existentes:** script que recalcule `rank_tier` desde el `skill_rating` actual. **Debe ser idempotente** (ejecutarlo dos veces no cambia nada).
3. **Verificar la distribución resultante** y documentarla.

### Criterio de aceptación

```sql
SELECT rank_tier, COUNT(*) FROM game_passports GROUP BY rank_tier;
-- Debe devolver MÁS DE UNA división, coherente con los skill_rating
```

Y una prueba que verifique el mapeo **en los límites exactos** de cada umbral (1399→BRONZE, 1400→SILVER, 2399→DIAMOND, 2400→ELITE).

---

## 🐛 BUG-020 · `is_locked` no se activa al llegar a 10 jugadores

| | |
| :--- | :--- |
| **Severidad** | 🟠 Alto |
| **Esfuerzo** | Medio (~1,5 h) |
| **Ubicación** | `apps/hub/src/lib/db/leagues.ts` |
| **Depende de** | BUG-019 (comparten `leagues.ts` — hacerlo después evita reescribir) |

### Problema verificado

```
is_locked = false → 21 ligas · is_locked = true → 8 ligas
Ocupación: 5 ligas con 10 miembros y is_locked = FALSE
```

`is_locked` **solo** se pone en `TRUE` al cerrar la temporada (`settle.ts:124`). El diseño exige sellarlo cuando entra el jugador #10. Hoy la exclusión depende únicamente de `HAVING COUNT < 10`, lo que abre una **condición de carrera hacia una liga de 11** (y un reparto de $25 mal dividido).

### ✅ Ya está hecho (parcialmente)

`api/auth/register/route.ts` ya sella la liga tras cada alta (`UPDATE ... WHERE COUNT >= 10`) y usa `SELECT ... FOR UPDATE`. **Ese camino ya es correcto.**

### Trabajo restante

1. **Aplicar el mismo sellado en `leagueService.assignPlayerToLeague`** (`leagues.ts`), que es el camino que usan las demás rutas.
2. **Bloqueo pesimista:** `SELECT ... FOR UPDATE` sobre la liga candidata dentro de la transacción, para serializar asignaciones concurrentes.
3. **Defensa en profundidad:** un **trigger o constraint** que rechace el miembro #11 a nivel de base de datos. No confiar solo en el código de aplicación.
4. **Backfill:** sellar las 5 ligas que ya tienen 10 miembros y `is_locked = false`.

### Criterio de aceptación

- Ninguna liga con `COUNT(*) >= 10` puede tener `is_locked = false`.
- **Prueba de concurrencia:** lanzar 12 asignaciones simultáneas a la misma liga y verificar que **entran exactamente 10**.

---

# 🟠 BLOQUE 4 · Unificación de Datos

> **Por qué ahora:** BUG-003 toca los mismos archivos que el bloque 3. Hacerlo antes obligaría a reescribir.

---

## 🐛 BUG-003 · Capa de datos duplicada Hub ↔ `packages/database`

| | |
| :--- | :--- |
| **Severidad** | 🟠 Alto |
| **Esfuerzo** | Alto (~2,5 h) |
| **Ubicación** | `apps/hub/src/lib/db/*.ts` vs `packages/database/src/services/*.js` |

### Problema verificado

Cinco módulos de negocio implementados **dos veces**:

| Módulo | Copia del Hub | Paquete real |
| :--- | :--- | :--- |
| users | 132L | 143L |
| passports | 82L | 96L |
| matches | 100L | 123L |
| leagues | 93L | 113L |
| ledger | 69L | 70L |

`apps/hub/package.json` declara `@playwin/database` pero **el Hub nunca lo importa** (0 referencias). El servidor de duelos **sí** usa el paquete real.

### Riesgo si no se arregla

Cualquier corrección aplicada a una copia **no se propaga** a la otra. Es la causa raíz de futuros bugs contables: el Hub y el servidor de duelos pueden divergir en cómo escriben el ledger.

### Trabajo

1. **Elegir `packages/database` como única fuente de verdad.**
2. **Migrar las rutas del Hub** a importar `@playwin/database` en lugar de `@/lib/db` para las entidades duplicadas. (`api/auth/register/route.ts` ya lo hace — sirve de ejemplo.)
3. **Eliminar los duplicados** solo cuando no queden consumidores. **Conservar** `apps/hub/src/lib/db/settle.ts` (el cierre semanal solo existe ahí) e `index.ts` si hace falta el pool.
4. **Verificar con `grep` que no queda ningún import roto** antes de borrar.

### Criterio de aceptación

```bash
grep -rn "@/lib/db" apps/hub/src   # solo settle y pool, justificados
npm run test:all                    # 9/9 sigue en verde
```

---

## 🐛 BUG-008 · Constantes de dinero y puntos duplicadas

| | |
| :--- | :--- |
| **Severidad** | 🟡 Medio |
| **Esfuerzo** | Medio (~1,5 h) |
| **Ubicación** | `LeagueStandings.tsx` · `passport-types.ts` · `page.tsx` · `lobby/route.ts` |

### ✅ Ya está hecho (la base)

`packages/database/src/constants.js` **ya es la fuente única**: `LEDGER_TYPES`, `PRIZE_SPLIT`, `MMR_DELTAS`, `SEASON_POINTS`, `LEAGUE_PRIZE_POOL`, `GAMES`, `GAME_IDS`, `resolveRankTier`. El panel admin y el registro ya lo consumen.

### Trabajo restante

1. **Frontend:** eliminar los valores quemados en los componentes y consumir las constantes (o recibir los datos del servidor).
2. **Regla 2 de gobernanza:** el frontend **no debe calcular premios**, solo mostrarlos. Si algún componente calcula, cambiarlo para que reciba el dato.
3. **Catálogo de juegos:** unificar los 5 lugares en la única fuente (`GAMES`).

### Criterio de aceptación

```bash
grep -rn "15.00\|25.00\|WHOP_DEPOSIT\|LEAGUE_PRIZE" apps/hub/src/components   # sin resultados
```

---

# 🟡 BLOQUE 5 · Acabado y Cobertura

---

## 🐛 BUG-009 · Violaciones de los tokens de diseño (HEX directos)

| | |
| :--- | :--- |
| **Severidad** | 🟡 Medio |
| **Esfuerzo** | Medio (~2 h) |
| **Ubicación** | `AuthModal.tsx` · `WalletView.tsx` · `Navigation.tsx` · `PassportView.tsx` · `GameCard.tsx` · `LeagueStandings.tsx` · `globals.css` |

### Problema verificado

Usos directos de `#ef4444`, `#dc2626`, `#fff`, `#22c55e`, `#16a34a`, `#059669`, `#000` en 7 archivos. Además **ningún componente usa CSS Modules** (la Regla 1.4 los pide): todo son `style={{}}` en línea.

### Trabajo

1. **Añadir tokens semánticos de estado** a `globals.css`: `--success`, `--success-soft`, `--danger`, `--danger-soft`, `--warning`. Deben ser **coherentes con la paleta Warm Editorial** (cálida, apergaminada). **No introducir azules ni verdes chillones.**
2. **Sustituir todos los HEX** por esos tokens.
3. **Migrar al menos un componente a CSS Modules** para establecer el patrón (sugerencia: `GameCard.tsx`, pequeño y aislado).
4. **Añadir la comprobación de tokens al test de gobernanza**, que hoy no los valida (por eso pasa 9/9 con HEX dentro).

### Criterio de aceptación

```bash
grep -rn "#[0-9a-fA-F]\{3,6\}" apps/hub/src/components   # sin colores de estado quemados
```

---

## 🐛 BUG-011 + BUG-014 · `detectCollusion` inactivo y sin pruebas

| | |
| :--- | :--- |
| **Severidad** | 🟡 Medio (011) · ⚪ Bajo (014) |
| **Esfuerzo** | Bajo (~1 h) — **se hacen juntos** |
| **Ubicación** | `apps/realtime-server/src/anticheat.js:255-274` |

### Problema

1. La detección por IP **solo** actúa con `NODE_ENV === 'production'` — un efecto colateral del entorno, no una decisión explícita.
2. **Cobertura cero:** ninguna suite la invoca. Un fallo llegaría a producción sin detectarse.

### Trabajo

1. **Reemplazar la dependencia de `NODE_ENV` por una bandera explícita** (`ALLOW_SELF_MATCH`), para que el comportamiento sea intencional y testeable.
2. **Crear `apps/realtime-server/test/collusion_spec.js`** con 4 casos: misma cuenta · misma IP en modo estricto · misma IP con la bandera activa · caso limpio.

> ⚠️ `anticheat.js` es compartido con el bloque de seguridad. **Tocar solo `detectCollusion`**, no reorganizar el archivo.

### Criterio de aceptación

`node --env-file=.env.test apps/realtime-server/test/collusion_spec.js` → exit 0 con 4/4.

---

## 🐛 BUG-015 · `paypal/payout` debita sin llamar a la API de PayPal

| | |
| :--- | :--- |
| **Severidad** | ⚪ Bajo (pero documentado como completo en la bitácora) |
| **Esfuerzo** | Bajo (~1 h) la opción segura · Alto (~3 h) la integración real |
| **Ubicación** | `apps/hub/src/app/api/payments/paypal/payout/route.ts` · `lib/paypal.ts` |

### Problema

El endpoint valida saldo, hace el débito atómico y registra `WITHDRAWAL`... **pero nunca llama a PayPal**. El usuario pierde saldo y **no recibe el dinero**, viendo *"Retiro procesado exitosamente"*.

### 🔴 Regla contable

**Un retiro no puede nacer `COMPLETED` si el dinero aún no salió.**

### Dos caminos (elegir y documentar)

| Opción | Qué implica |
| :--- | :--- |
| **A (recomendada, ~1 h)** | Mientras no haya integración, **rechazar con `503`** en lugar de debitar. Evita quitarle saldo al usuario sin pagarle. |
| **B (~3 h)** | Integración real: `POST /v1/payments/payouts` en `lib/paypal.ts`, asiento en `PENDING`, y completarlo **solo** al recibir `PAYMENT.PAYOUTSBATCH.SUCCESS` por webhook (ya parcialmente manejado). |

### Criterio de aceptación

O el dinero sale de verdad con confirmación por webhook, o el endpoint rechaza **sin tocar el saldo**. Nunca debita sin pagar.

---

## 📋 Resumen de esfuerzo

| Bloque | Bugs | Esfuerzo estimado |
| :--- | :--- | :--- |
| **3 · Motor de competición** | BUG-019, BUG-020 | ~3 h |
| **4 · Unificación de datos** | BUG-003, BUG-008 | ~4 h |
| **5 · Acabado y cobertura** | BUG-009, BUG-011, BUG-014, BUG-015 | ~4 h |
| **TOTAL** | **8 bugs** | **~11 h** |

---

## ✅ Definición de "Terminado" (aplica a cada bug)

1. `npm run test:all` → **9/9 en verde** (ya funciona; era el bug BUG-006).
2. `npm run test:governance` → **9/9**.
3. `npx tsc --noEmit` → **exit 0**.
4. Ningún archivo supera **350 líneas**.
5. **Cero secretos** en el código (usar `apps/hub/src/lib/config.ts`).
6. Cada bug marcado `✅ RESUELTO` en [AUDITORIA_BUGS.md](AUDITORIA_BUGS.md) con **evidencia de ejecución**, no afirmaciones.
7. `node scratch/check_bug_consistency.mjs` → **`✅ CONTEO CONSISTENTE`**.

---

## 🧰 Herramientas de verificación disponibles

```bash
node scratch/check_bug_consistency.mjs   # valida la aritmética del registro de bugs
node scratch/verify_bugs_api.mjs         # verifica bugs HTTP (requiere el Hub en :3000)
node scratch/verify_whop_hmac.mjs        # verifica la lógica HMAC aislada
node scratch/fix_bug_states.mjs          # fija el estado de cada bug sin corromper el conteo
npm run test:all                         # las 9 suites
```

---

*Plan generado el 2026-09-29 a partir del estado verificado del repositorio. Los tres bugs de mayor impacto (BUG-019, BUG-020, BUG-003) están en los bloques 3 y 4.*
