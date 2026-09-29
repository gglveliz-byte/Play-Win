# 🔀 PLAN DE DIVISIÓN DE BUGS EN DOS PARTES

> **Fecha:** 2026-09-29 · **Origen:** [AUDITORIA_BUGS.md](AUDITORIA_BUGS.md)
> **Objetivo:** repartir los **13 bugs abiertos + 2 parciales** entre dos agentes que trabajan en paralelo sin pisarse.

---

## ⚠️ ADVERTENCIA CRÍTICA ANTES DE EMPEZAR

**Este repositorio NO tiene control de versiones.** Se verificó: no existe `.git` en la raíz ni en subcarpetas.

**Consecuencia:** si dos agentes editan la misma carpeta al mismo tiempo, **no hay merge, ni diff, ni recuperación**. Un agente sobreescribe el trabajo del otro y no queda rastro.

### Cómo trabaja cada agente (elegir UNO)

| Opción | Cuándo usarla | Riesgo |
| :--- | :--- | :--- |
| **A. Serializar** — la otra IA espera a que yo termine | Lo más seguro | Ninguno. Más lento |
| **B. Inicializar git + una rama por agente** | Si se quiere velocidad | Bajo (hay merge real) |
| **C. Paralelo puro con esta división de archivos** | Ya está diseñada sin solapamiento | Medio (nadie impide que un agente toque un archivo ajeno) |

### Comandos recomendados para la opción B

```bash
cd "Play Win"
git init
git add -A
git commit -m "Punto de partida antes de la division de bugs"
git branch parte-a && git branch parte-b
# Agente A: git checkout parte-a
# Agente B: git checkout parte-b
# Al terminar: git checkout main && git merge parte-a && git merge parte-b
```

> 📌 **Recomendación:** empezar por la opción **A** (serializar). La división de archivos de este documento hace que sea rápido igual.

---

## 🧭 Regla de oro: CERO solapamiento de archivos

Cada archivo del repositorio está asignado a **una sola parte**. Si un agente necesita cambiar un archivo de la otra parte, **debe pedirlo** en vez de editarlo.

---

## 📦 PARTE A — Infraestructura y Seguridad del Hub

**Brief completo:** [BRIEF_PARTE_A.md](BRIEF_PARTE_A.md) · **7 bugs · ~4-5 horas**

| Bug | Título | Severidad |
| :--- | :--- | :--- |
| **BUG-006** | `test:duel` roto → `npm run test:all` se cuelga | 🟠 Alto |
| **BUG-016** | `--env-file` en las suites (la mitad de `on('error')` ya está hecha) | 🟡 Medio |
| **BUG-004** | `/api/admin/metrics` roto (columnas inexistentes) + sin auth | 🟠 Alto |
| **BUG-010** | Sin rate limiting en autenticación (+ CSRF) | 🟡 Medio |
| **BUG-012** | Códigos HTTP inconsistentes / errores silenciados | 🟡 Medio |
| **BUG-013** | Registro de usuario sin transacción atómica | 🟡 Medio |
| **BUG-015** | `paypal/payout` debita sin llamar a la API real | ⚪ Bajo |

**Archivos que posee la Parte A:**

```
package.json
.env.test
test/code_protection_governance_test.mjs
apps/realtime-server/package.json
apps/realtime-server/test/*
apps/realtime-server/src/server.js            (solo EADDRINUSE, ya aplicado)
apps/realtime-server/src/load-env.js          (ya creado)
apps/hub/src/app/api/admin/metrics/**
apps/hub/src/app/admin/page.tsx
apps/hub/src/app/api/auth/**
apps/hub/src/app/api/wallet/transactions/route.ts
apps/hub/src/app/api/errors.ts                (NUEVO — helper de respuesta)
apps/hub/src/app/api/payments/paypal/payout/route.ts
apps/hub/src/lib/paypal.ts                    (añadir payouts)
apps/hub/test/*
apps/hub/src/lib/db/matches.ts                (solo tipos de ledger)
apps/hub/src/lib/db/passports.ts              (solo tipos de ledger)
apps/hub/src/lib/db/ledger.ts                 (solo tipos de ledger)
```

---

## 📦 PARTE B — Motor de Competición y Frontend

**Brief completo:** [BRIEF_PARTE_B.md](BRIEF_PARTE_B.md) · **7 bugs · ~5-6 horas**

| Bug | Título | Severidad |
| :--- | :--- | :--- |
| **BUG-019** | El sharding por MMR no existe (178/178 en BRONCE) | 🟠 Alto |
| **BUG-020** | `is_locked` no se activa a los 10 jugadores | 🟠 Alto |
| **BUG-007** | `/api/games/lobby` devuelve datos fabricados | 🟠 Alto |
| **BUG-003** | Capa de datos duplicada Hub ↔ `packages/database` | 🟠 Alto |
| **BUG-008** | Constantes de dinero/puntos duplicadas (parte frontend) | 🟡 Medio |
| **BUG-009** | Violaciones de tokens de diseño (HEX directos) | 🟡 Medio |
| **BUG-011** | `detectCollusion` sin cobertura ni verificación | 🟡 Parcial |
| **BUG-014** | `detectCollusion` nunca se prueba | ⚪ Bajo |

**Archivos que posee la Parte B:**

```
apps/hub/src/lib/db/leagues.ts
apps/hub/src/lib/db/settle.ts
apps/hub/src/lib/db/users.ts
apps/hub/src/app/api/games/lobby/route.ts
apps/hub/src/app/api/leagues/route.ts
apps/hub/src/components/*.tsx                 (todos)
apps/hub/src/app/globals.css
apps/hub/src/app/page.tsx
apps/hub/src/app/layout.tsx
apps/hub/src/app/verificar-cuenta/**
apps/hub/src/app/restablecer-password/**
apps/realtime-server/src/anticheat.js         (solo detectCollusion)
apps/realtime-server/test/collusion_spec.js   (NUEVO)
packages/database/src/services/**             (destino de la unificación)
packages/database/test/**
.env.example  (raíz)
```

---

## 📐 CONTRATO COMPARTIDO (leer antes de empezar)

Estas piezas las **crea la Parte A** y las **consume la Parte B**. La Parte B **no debe redefinirlas**.

### 1. Tipos de ledger y constantes — `packages/database/src/constants.js` (NUEVO)

**Lo crea:** Parte A · **Lo consume:** Parte B

```javascript
// Tipos de asiento contable. NUNCA inventar otros: BUG-004 se causó por esto.
export const LEDGER_TYPES = {
  DEPOSIT: 'DEPOSIT',
  PRIZE_WIN: 'PRIZE_WIN',
  WITHDRAWAL: 'WITHDRAWAL',
  ENTRY_FEE: 'ENTRY_FEE',
  WHOP_MEMBERSHIP_ACTIVATED: 'WHOP_MEMBERSHIP_ACTIVATED',
};

export const LEDGER_PROVIDERS = { WHOP: 'WHOP', PAYPAL: 'PAYPAL', SYSTEM: 'SYSTEM' };
export const LEDGER_STATUS = { COMPLETED: 'COMPLETED', PENDING: 'PENDING', FAILED: 'FAILED' };

// Reparto de la bolsa por liga de 10 (debe coincidir con settle.ts)
export const PRIZE_SPLIT = { 1: 15.0, 2: 7.0, 3: 3.0 };
export const LEAGUE_PRIZE_POOL = 25.0;

// Ajuste de MMR por posición final (debe coincidir con settle.ts)
export const MMR_DELTAS = { 1: 60, 2: 35, 3: 20, mid: 0, low: -25, last: -50 };

// Puntuación por duelo
export const SEASON_POINTS = { WIN: 100, LOSS: 20, FORFEIT: 0, CHEAT: 0 };
```

**Acción requerida de la Parte B:** importar estas constantes en los componentes y borrar los valores quemados.

### 2. Helpers de respuesta HTTP — `apps/hub/src/app/api/errors.ts` (NUEVO)

**Lo crea:** Parte A · **Lo consume:** Parte B (si añade rutas)

```typescript
export function apiError(message: string, status: number): NextResponse
export function unauthorized(): NextResponse      // 401 uniforme
export function notFound(msg?: string): NextResponse
export function badRequest(msg: string): NextResponse
export function serverError(err: unknown, context: string): NextResponse
```

**Acción requerida de la Parte B:** usar `unauthorized()` en lugar de devolver `200` con lista vacía.

### 3. Función de división por MMR — `resolveRankTier()`

**Lo crea:** Parte B (en `apps/hub/src/lib/db/leagues.ts`) · **La consume:** nadie más por ahora

> 📌 La Parte A **no** toca esta función, pero **sí necesita** que exista para el backfill del BUG-019. Si la Parte A termina antes, debe avisar.

---

## 🔗 Dependencias entre partes

```
Parte A  ──crea──▶  constants.js  ──consume──▶  Parte B
Parte A  ──crea──▶  errors.ts     ──consume──▶  Parte B
Parte B  ──crea──▶  resolveRankTier()  ──necesita──▶  Parte A (backfill BUG-019)
```

**No hay dependencia bloqueante en ninguna dirección.** Ambas partes pueden empezar a la vez.

---

## ✅ Definición de "Terminado" (igual para ambas partes)

1. **Cero secretos** nuevos en el código (usa `lib/config.ts`).
2. **Ningún archivo supera 350 líneas** (`npm run test:governance` debe pasar 9/9).
3. **Sin elipsis** (`// TODO`, `// resto del código`).
4. **Cada bug arreglado se verifica ejecutando**, no leyendo. Aportar la salida cruda.
5. **Marcar el bug como `✅ RESUELTO`** en [AUDITORIA_BUGS.md](AUDITORIA_BUGS.md) con fecha y cómo se verificó. **No borrarlo.**
6. **Registrar el hito** en [PROGRESS.md](PROGRESS.md).
7. 🔴 **Conflicto de archivo compartido:** `AUDITORIA_BUGS.md` y `PROGRESS.md` los editan **ambas** partes. Editar **solo las secciones propias** y **nunca reescribir el archivo completo** (usar edición por fragmento, no `write`).

---

## 📋 Estado de partida

| Métrica | Valor |
| :--- | :--- |
| Bugs catalogados | 21 |
| ✅ Resueltos | 6 (BUG-001, 002, 005, 017, 018, 021) |
| ❌ Abiertos | 13 |
| ⚠️ Parciales | 2 (BUG-011, BUG-015) |
| **Críticos abiertos** | **0** |

**Herramientas de verificación disponibles:**
- `node scratch/check_bug_consistency.mjs` — valida la aritmética del registro de bugs
- `node scratch/verify_bugs.mjs` — verifica bugs de BD y código
- `node scratch/verify_bugs_api.mjs` — verifica bugs HTTP contra el Hub en ejecución
- `node scratch/verify_whop_hmac.mjs` — verifica la lógica HMAC de forma aislada
- `npm run test:governance` — 9/9 obligatorio

---

*División diseñada verificando la propiedad de cada archivo contra el uso real en el código. Sin solapamientos.*
