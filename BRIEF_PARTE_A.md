# 📦 BRIEF PARTE A — Infraestructura y Seguridad del Hub

> **Este documento es autocontenido.** No necesitas leer el resto del proyecto antes de empezar, pero **sí debes leer [PLAN_DIVISION_BUGS.md](PLAN_DIVISION_BUGS.md)** para conocer el contrato compartido y las advertencias.

---

## 🎯 Tu misión

Arreglar **7 bugs** de infraestructura de pruebas, seguridad de API y consistencia contable en el Hub Next.js de Play Win.

**Tus bugs:** BUG-006 · BUG-016 · BUG-004 · BUG-010 · BUG-012 · BUG-013 · BUG-015

**NO toques** los archivos de la Parte B (motor de competición y frontend). Ver la lista en `PLAN_DIVISION_BUGS.md`.

---

## 📚 Contexto mínimo que necesitas

**Proyecto:** plataforma eSports con micro-ligas semanales de 10 jugadores, duelos 1v1 en tiempo real y premios en dinero.

**Stack:**
- `apps/hub` — Next.js 16.3.6 (App Router) + API routes. Base de datos Neon PostgreSQL.
- `apps/realtime-server` — servidor de duelos con WebSocket (`ws` nativo).
- `packages/database` — esquema y servicios de BD compartidos.

**Reglas inviolables del proyecto** (están en `AGENTS.md` y `playwin-code-governance`):
1. **Ningún archivo supera 350 líneas** (orquestadores hasta 800).
2. **Cero secretos en el código.** Usa `apps/hub/src/lib/config.ts` (ya existe: `serverConfig.databaseUrl`, `.jwtSecret`, `.cronSecret`, `.whopWebhookSecret`, `.paypalMode`, etc.).
3. **Cero elipsis.** Prohibido `// TODO`, `// resto del código igual`, funciones vacías.
4. **Cero estilos inventados.** Solo tokens CSS (`var(--ink)`, `var(--orange)`, …).
5. **El cliente nunca decide nada crítico.** El servidor es el árbitro.

**Nombres de columna EXACTOS (no los inventes):**
- `wallet_ledger.type` (NO `entry_type`)
- `league_groups.rank_tier` (NO `tier`)
- Tipos de ledger reales: `DEPOSIT`, `PRIZE_WIN`, `WITHDRAWAL`, `WHOP_MEMBERSHIP_ACTIVATED`

**Estado de partida:** 0 bugs críticos abiertos. 6 ya resueltos. **No rompas lo que funciona.**

**Comandos útiles:**
```bash
npm run test:governance    # 9/9 obligatorio antes de dar nada por terminado
npm run test:db            # servicios de BD
npm run test:anticheat     # anti-cheat
npm run test:treasury      # tesorería end-to-end
node scratch/check_bug_consistency.mjs   # valida tu registro de bugs
```

---

## 🐛 BUG-006 · `test:duel` roto → `npm run test:all` se cuelga

**Severidad:** 🟠 Alto · **Archivo:** `apps/realtime-server/test/duel_test.js`

### Problema verificado

1. **Línea 7:** conecta a `ws://localhost:3001/ws` pero **nunca arranca el servidor**. Si no está corriendo, se cuelga sin timeout.
2. **Líneas 21-32:** envía `JOIN_MATCH` **sin `token`**. Pero `apps/realtime-server/src/rooms.js:20` exige el token:
   ```javascript
   if (!player.token) return this._send(socket, { event: 'SECURITY_ERROR', ... });
   ```
   El test no maneja `SECURITY_ERROR`, así que espera para siempre un `MATCH_WAITING` que no llega.
3. **No hay timeout global** ni `process.exit` de rescate.

**Evidencia de la ejecución real:**
```
$ npm run test:all                      → matado tras 20+ minutos sin salida
$ node apps/realtime-server/test/duel_test.js
🧪 Iniciando prueba automatizada de salas 1v1...
✅ Cliente 1 conectado. Encolando...
(se cuelga aquí para siempre)
```

**El servidor SÍ funciona.** Se verificó end-to-end con tickets firmados: dos clientes recibieron `MATCH_START` con **idéntica seed `9323438`**, los ticks se relayaron y el servidor emitió `MATCH_END`. **El bug está en el test.**

### Qué hacer

1. **Firmar un `MatchTicket` real.** El formato está en `apps/realtime-server/src/anticheat.js`:
   ```javascript
   const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
   const payload = Buffer.from(JSON.stringify({
     sub: id, username, avatar: '🎮', gameId,
     exp: Math.floor(Date.now() / 1000) + 300,
   })).toString('base64url');
   const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
   return `${header}.${payload}.${sig}`;
   ```
   > ✅ **Ya existe una implementación de referencia funcionando** en `apps/realtime-server/test/network_scenarios_test.js:10-21`. **Reutilízala, no la dupliques** (Regla 4 de gobernanza).

2. **Arrancar el servidor dentro del propio test.** El patrón ya existe en `network_scenarios_test.js:1-5`: crea un `createServer` + `WebSocketServer` en un **puerto libre** (usa `PORT=0` o un puerto alto aleatorio para no colisionar) y ciérralo en un `finally`.

3. **Timeout global:** `setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 30000)`.

4. **Cerrar los sockets** en todas las rutas de salida.

> ⚠️ **Ya se aplicó** `server.on('error')` para `EADDRINUSE` en `src/server.js`. No lo dupliques.

### Criterio de aceptación

```bash
npm run test:duel     # debe terminar con exit 0 y SIN servidor externo corriendo
npm run test:all      # debe completarse de principio a fin
```

---

## 🐛 BUG-016 · Las suites no cargan el entorno

**Severidad:** 🟡 Medio

### Problema

`apps/realtime-server/test/` y `apps/hub/test/` dependen de variables de entorno, pero varios puntos de entrada no las cargan. Los que ya están cubiertos por `--env-file=.env.test` en el `package.json` raíz están bien; los que se invocan **directamente** fallan.

> ✅ **Ya está hecho:** `server.on('error')` para `EADDRINUSE` en `src/server.js`, y el cargador `src/load-env.js`.

### Qué hacer

Revisa cada suite y garantiza que se pueda ejecutar de dos formas:
```bash
npm run test:xxx                        # vía npm (carga .env.test)
node apps/.../test/xxx.js               # directo → debe fallar con mensaje CLARO, no con un TypeError
```

Toda suite que necesite `JWT_SECRET` o `DATABASE_URL` debe:
- Importar el cargador (`../src/load-env.js` en realtime-server, o el patrón de `apps/hub/test/treasury_and_settle_test.mjs`).
- **Fallar con un mensaje accionable** si falta la variable — **nunca** caer a un valor por defecto.

> 🔴 **PROHIBIDO** volver a poner secretos quemados como fallback. Se acaban de eliminar 6 (BUG-002). Un test que necesite un secreto lo lee del entorno o falla.

### Criterio de aceptación

Ejecutar cada suite sin `--env-file` produce un error legible que dice qué variable falta y cómo configurarla.

---

## 🐛 BUG-004 · `/api/admin/metrics` roto y sin autenticación

**Severidad:** 🟠 Alto (dos defectos en un archivo)

### Problema A — el endpoint SIEMPRE devuelve 500

Consulta columnas que **no existen**:

| Línea | Consulta | Realidad |
| :--- | :--- | :--- |
| `route.ts:25,29` | `wallet_ledger.entry_type` | La columna es **`type`** |
| `route.ts:35` | `league_groups.tier` | La columna es **`rank_tier`** |

**Verificado contra la base de datos real:**
```
SELECT entry_type FROM wallet_ledger  →  ERROR: column "entry_type" does not exist
SELECT type FROM wallet_ledger        →  OK (3 tipos)
GET /api/admin/metrics (sin sesión)   →  HTTP 500 · column "entry_type" does not exist
```

### Problema B — los totales siempre marcan $0.00

`apps/hub/src/app/admin/page.tsx` busca tipos de ledger **que nunca se escriben**:

| El panel busca | Lo que el código realmente escribe |
| :--- | :--- |
| `'WHOP_DEPOSIT'` (`:86`) | `'DEPOSIT'` con `provider: 'WHOP'` |
| `'LEAGUE_PRIZE'` (`:94`) | `'PRIZE_WIN'` |

Además `page.tsx:29` filtra por `l.entry_type` y `:217` lee `l.tier`.

### Problema C — SIN autenticación

`route.ts:4` declara `export async function GET()` **sin ninguna comprobación de sesión**. Cualquiera con la URL obtiene usuarios, partidas, semillas PRNG y movimientos contables.

### Qué hacer

1. **Corregir las columnas:** `entry_type` → `type`, `tier` → `rank_tier` (en la ruta **y** en el panel).
2. **Unificar los tipos de ledger:** crea `packages/database/src/constants.js` con `LEDGER_TYPES` (ver el contrato en `PLAN_DIVISION_BUGS.md`) e úsalo en la ruta y en el panel. **Tú creas este archivo; la Parte B lo consume.**
3. **Añadir autenticación de administrador.** Necesitarás una columna `is_admin BOOLEAN DEFAULT FALSE` en `users` (migración en `packages/database/src/schema.sql`). Devuelve `401` si no hay sesión y `403` si no es admin.
4. **Que el panel muestre el error** cuando `!res.ok` en lugar de mostrar ceros.

### Criterio de aceptación

```bash
curl http://localhost:3000/api/admin/metrics          # → 401 (sin sesión)
# Con sesión de admin → 200 con datos REALES y totales != 0
SELECT type, SUM(amount) FROM wallet_ledger GROUP BY type;   # debe coincidir con el panel
```

---

## 🐛 BUG-010 · Sin rate limiting en autenticación (y sin CSRF)

**Severidad:** 🟡 Medio · **Documentado como resuelto en la bitácora, pero NO existe.**

### Problema

Verificado: **cero referencias** a `rateLimit` / `rate-limit` / `429` en `apps/hub/src/app/api/auth/` y `apps/hub/src/lib/`.

El Hito 6.6 afirma *"rate limiter en rutas de autenticación (máx 10 intentos por IP/minuto)"*. **Es falso.**

Consecuencia: fuerza bruta ilimitada de contraseñas y spam ilimitado de emails de recuperación (que además cuesta dinero real vía Gmail SMTP).

### Qué hacer

1. **Rate limiter** sobre `/api/auth/login`, `/api/auth/register` y `/api/auth/forgot-password`. Ventana deslizante por IP. Límite sugerido: **10 intentos/minuto**. Devuelve `429` con cabecera `Retry-After`.
   - Como puede haber varias instancias, lo correcto es Redis; si no está disponible, un `Map` en memoria con limpieza periódica es aceptable **pero documéntalo como limitación de una sola instancia**.
2. **CSRF:** la cookie de sesión usa `sameSite: 'lax'`. Añade protección de doble envío (token en cookie + cabecera) para las rutas que mutan estado, o pasa a `sameSite: 'strict'` donde sea viable. **Documenta la decisión.**
3. Crea `apps/hub/src/lib/rate-limit.ts` (nuevo, < 350 líneas).

### Criterio de aceptación

```bash
# 11 intentos de login seguidos → el nº 11 devuelve 429
for i in $(seq 1 11); do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"x","password":"y"}'; done
```

---

## 🐛 BUG-012 · Códigos HTTP inconsistentes y errores silenciados

**Severidad:** 🟡 Medio

### Problema (verificado)

| Ruta | Sin sesión | Correcto |
| :--- | :--- | :--- |
| `/api/wallet/transactions` | **HTTP 200** `{success:true, transactions:[]}` | Debería ser `401` |
| `/api/matches/history` | HTTP 401 | ✅ |

El cliente no puede distinguir *"sin movimientos"* de *"sin sesión"*.

Además:
- `api/auth/verify-email/route.ts:54` devuelve `err.message` crudo; el POST lo oculta. Inconsistente.
- `admin/page.tsx:16-26` ignora `res.ok`.
- Varios errores de red se tragan sin feedback.

### Qué hacer

1. Crea `apps/hub/src/app/api/errors.ts` (**tú lo creas; la Parte B lo consume**):
   ```typescript
   export function apiError(message: string, status: number): NextResponse
   export function unauthorized(): NextResponse      // 401 uniforme
   export function notFound(msg?: string): NextResponse
   export function badRequest(msg: string): NextResponse
   export function serverError(err: unknown, context: string): NextResponse
   ```
2. Unifica todas las rutas a `401` cuando falte sesión.
3. **Nunca devuelvas `err.message` crudo** al cliente en producción; regístralo en el servidor y devuelve un mensaje genérico.
4. **NO toques `api/matches/history/route.ts`** — ya es correcto.

### Criterio de aceptación

Ambas rutas devuelven `401` sin sesión. `node scratch/verify_bugs_api.mjs` ya no marca BUG-012.

---

## 🐛 BUG-013 · Registro de usuario sin transacción atómica

**Severidad:** 🟡 Medio · **Archivo:** `apps/hub/src/app/api/auth/register/route.ts:57-77`

### Problema

El registro hace `createUser` → crear **4 pasaportes** → asignar slot de liga, **cada paso en su propia transacción**. Si un paso intermedio falla, queda un usuario a medio construir. Los fallos de email se tragan (`:69-71`).

**Consecuencia:** usuarios sin pasaporte (no pueden competir ni ver su perfil) o sin slot de liga (no aparecen en standings), **sin que nadie se entere**.

> ⚠️ **Nota:** la *validación de entrada* de este endpoint **SÍ funciona** (`400` con *"El nombre de usuario debe tener entre 3 y 20 caracteres"*). No la toques. El bug es **solo la falta de atomicidad**.

### Qué hacer

1. Envolver **usuario + 4 pasaportes + asignación de liga** en un único `withTransaction` (ya existe en `apps/hub/src/lib/db/index.ts`).
2. Enviar los emails **después** del commit (fire-and-forget con `console.error` si fallan).
3. Si la transacción falla, devolver un error claro y **no dejar usuario a medias**.

### Criterio de aceptación

Provoca un fallo deliberado en la creación del 3er pasaporte: **ningún usuario debe quedar en la tabla `users`**. Pruébalo y aporta la evidencia.

---

## 🐛 BUG-015 · `paypal/payout` debita sin llamar a la API real

**Severidad:** ⚪ Bajo (pero documentado como completo en la bitácora)

### Problema

`apps/hub/src/app/api/payments/paypal/payout/route.ts` valida saldo, hace el débito atómico y registra el asiento `WITHDRAWAL`... **pero nunca llama a la API de PayPal Payouts**. El usuario pierde saldo y **no recibe el dinero**. Muestra *"Retiro procesado exitosamente"*.

### Qué hacer

Dos opciones; **elige y documenta el porqué**:

- **Opción 1 (recomendada):** implementar la llamada real a `POST /v1/payments/payouts` en `apps/hub/src/lib/paypal.ts` (ya existe ese archivo con OAuth). Marcar el asiento como `status: 'PENDING'` y completarlo **solo** cuando llegue la confirmación (webhook `PAYMENT.PAYOUTSBATCH.SUCCESS`, ya parcialmente manejado).
- **Opción 2:** mientras no haya integración, **rechazar** la operación con `503` en lugar de debitar. Es preferible a quitarle el saldo al usuario sin pagarle.

> 🔴 Regla de contabilidad: **un retiro no puede nacer `COMPLETED` si el dinero aún no salió.**

### Criterio de aceptación

O el dinero sale de verdad (con confirmación por webhook), o el endpoint rechaza sin tocar el saldo. **Nunca** debita sin pagar.

---

## ✅ Checklist antes de dar por terminado

- [ ] `npm run test:all` se completa de principio a fin (BUG-006)
- [ ] `npm run test:governance` → **9/9** (obligatorio)
- [ ] Ningún archivo supera **350 líneas**
- [ ] **Cero secretos** en el código (usa `lib/config.ts`)
- [ ] Cero elipsis / `// TODO`
- [ ] Cada bug marcado `✅ RESUELTO` en `AUDITORIA_BUGS.md` con fecha y evidencia
- [ ] Hito registrado en `PROGRESS.md`
- [ ] `node scratch/check_bug_consistency.mjs` → **`✅ CONTEO CONSISTENTE`**

> ⚠️ **`AUDITORIA_BUGS.md` y `PROGRESS.md` los edita también la Parte B.** Edita solo tus secciones y **nunca reescribas el archivo completo** — usa edición por fragmento.

---

## 📤 Qué reportar al terminar

1. Los 7 bugs: estado final y **salida cruda** de la verificación de cada uno.
2. Confirmación de que `npm run test:all` terminó (pega la salida).
3. Si creaste `constants.js` y `errors.ts`, confírmalo — **la Parte B depende de ellos**.
4. Cualquier bug **nuevo** que encuentres, con `archivo:línea` y evidencia.
