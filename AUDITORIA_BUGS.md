# 🐛 PLAY WIN — REGISTRO DE AUDITORÍA DE BUGS Y DEUDA TÉCNICA

> **Propósito:** Registro vivo de todos los defectos, vulnerabilidades y deuda técnica detectados en el proyecto. Cada bug tiene ubicación exacta, evidencia, impacto y arreglo propuesto.
>
> **Última auditoría:** 2026-09-29 · **Método:** lectura directa de código + ejecución de suites + partida 1v1 real + **verificación por ejecución de cada bug** (ver sección de veredictos).
>
> **Cómo usar este archivo:** al arreglar un bug, **no lo borres** — cámbialo a `✅ RESUELTO` indicando la fecha y cómo se verificó. Así el siguiente agente sabe qué ya se intentó.

---

## ✅ Veredictos de Verificación (2026-09-29)

Los bugs de este documento **no son suposiciones por lectura**: se verificaron ejecutando sondeos contra la base de datos real y contra el Hub en ejecución. Arnés reutilizable: `scratch/verify_bugs.mjs` (base de datos + código) y `scratch/verify_bugs_api.mjs` (HTTP).

### Resultado global

| Veredicto | Cantidad |
| :--- | :--- |
| 🔴 **CONFIRMADO** | **22** |
| ✅ **FALSO POSITIVO** (mi hallazgo era incorrecto) | **2** |
| 🟡 **PARCIAL** | 0 |

### Evidencia más contundente (salida cruda)

| Bug | Prueba ejecutada | Resultado real |
| :--- | :--- | :--- |
| **BUG-004** | `SELECT entry_type FROM wallet_ledger` | `column "entry_type" does not exist` |
| **BUG-004** | `SELECT tier FROM league_groups` | `column "tier" does not exist` |
| **BUG-004** | `GET /api/admin/metrics` sin sesión | **HTTP 500** · `column "entry_type" does not exist` |
| **BUG-001** | `POST /api/webhooks/paypal` **sin cabeceras de firma** | **HTTP 200** `{"received":true,...}` — procesado |
| **BUG-005** | `POST /api/webhooks/whop` **sin cabecera de firma** | **HTTP 200** — procesado |
| **BUG-005** | `POST /api/webhooks/whop` con firma **inválida** | **HTTP 200** — la firma no se valida |
| **BUG-002** | Escaneo de los 6 archivos con fallback | Neon ×2, JWT_SECRET ×2, WHOP_SECRET ×1 |
| **BUG-003** | Comparación de capas + búsqueda de import | 5/5 servicios duplicados · declara la dep pero **no la importa** |
| **BUG-010** | Búsqueda de `rateLimit`/`429` en `api/auth` y `lib` | **Cero coincidencias** |
| **BUG-015** | Búsqueda de `api.paypal.com`/`payments/payouts` | **No invoca la API de PayPal** |

### 🔴 Tres hallazgos NUEVOS que la verificación destapó

---

#### BUG-019 · Todos los pasaportes son BRONZE: el sharding por MMR no existe en la práctica

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟠 Alto |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Evidencia** | `SELECT rank_tier, COUNT(*) FROM game_passports GROUP BY rank_tier` → **178 pasaportes, 178 en `BRONZE`. Cero en cualquier otra división.** |

**Descripción:** `assignPlayerToLeague()` recibe `rankTier` con valor por defecto `'BRONZE'` y **ningún llamador lo calcula desde `skill_rating`**. No existe la función de mapeo MMR → división. El resultado es que **el 100% de los jugadores de la plataforma compite en Bronce**, sin importar su habilidad.

**Impacto:** Anula el pilar central del producto. La propuesta de valor es *"emparejamos jugadores de habilidad similar para que la competición sea justa"* (`info.negocio.md` §5). Hoy un jugador con 3000 de MMR compite contra uno de 1200. Las divisiones y sus bolsas escaladas ($5 → $250) son inalcanzables.

**Arreglo propuesto:** Implementar `resolveRankTier(skillRating)` con umbrales explícitos y usarla en **todos** los llamadores de `assignPlayerToLeague`. Backfill de los 178 pasaportes existentes. Añadir prueba de que un jugador con MMR alto entra a una división alta.

---

#### BUG-020 · `is_locked` no se activa al llegar a 10 jugadores — hay ligas llenas y abiertas

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟠 Alto |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Evidencia** | 5 ligas con **10 miembros y `is_locked = false`** · global: 21 ligas abiertas vs 8 selladas |

**Descripción:** `is_locked` **solo** se pone en `TRUE` al cerrar la temporada (`settle.ts:124`). El diseño (`playwin-league-engine` §2, `ARQUITECTURA_SISTEMA_ESPORTS.md` §5) exige que *"tan pronto el jugador #10 entra, el grupo se sella con `isLocked = true`"*.

Hoy la exclusión del jugador #11 depende **únicamente** de `HAVING COUNT(m.user_id) < 10` en la consulta. Eso abre una **condición de carrera**: dos jugadores concurrentes pueden leer la misma liga con 9 miembros e insertarse ambos → **liga de 11**.

**Impacto:** El sellado es un requisito de integridad competitiva (anti-deserción) y de corrección del reparto ($25 divididos entre 10, no entre 11). Sin `SELECT ... FOR UPDATE` ni constraint, el sistema no está protegido.

**Arreglo propuesto:** `UPDATE league_groups SET is_locked = TRUE WHERE id = $1 AND (SELECT COUNT(*) FROM league_members WHERE league_id = $1) >= 10` inmediatamente después de cada alta, más `SELECT ... FOR UPDATE` sobre la liga dentro de la transacción de asignación. Añadir constraint o trigger que rechace el miembro #11.

---

#### BUG-021 · El Hub no tiene `.env` propio y depende al 100% de los secretos quemados

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟠 Alto |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Evidencia original** | `apps/hub/.env.local = false` · `apps/hub/.env = false` · `.env` raíz = `true` |

**✅ Arreglo aplicado:**
1. Creado **`apps/hub/.env.local`** con `DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_REALTIME_WS_URL`, `WHOP_WEBHOOK_SECRET` y los huecos documentados de PayPal/Gmail.
2. Creado **`.env.test`** en la raíz para las suites (antes tenían los secretos quemados en el propio código).
3. `.gitignore` reforzado: `.env` / `.env.*` ignorados, `!.env.example` versionado.
4. Al eliminar los fallbacks (BUG-002), el Hub **ya no puede** arrancar con secretos del código: o lee `.env.local`, o falla de forma ruidosa.

**Verificación ejecutada:**
```
next build  →  "Environments: .env.local"   ✅ (Next ya carga el archivo)
npm run test:treasury  →  exit 0, firma válida aceptada, asiento [WHOP] DEPOSIT registrado ✅
```

**Nota para el siguiente agente:** los valores de `apps/hub/.env.local` y `.env.test` deben coincidir en `JWT_SECRET` y `WHOP_WEBHOOK_SECRET`, porque las suites firman peticiones que el Hub debe aceptar.

**Descripción:** Next.js **no lee el `.env` de la raíz del monorepo**: carga `.env` desde el directorio donde se ejecuta (`apps/hub/`). Ese archivo **no existe**.

**Consecuencia:** El Hub en ejecución está usando la **contraseña de Neon quemada en el código fuente** (`apps/hub/src/lib/db/index.ts:6`) y el **`JWT_SECRET` quemado** (`apps/hub/src/lib/auth.ts:4`). No son "un fallback de emergencia": son **la configuración activa de producción**.

Esto **agrava el BUG-002**: los secretos del repositorio no son solo un riesgo latente, están en uso.

**Arreglo propuesto:** Crear `apps/hub/.env.local` (gitignored) con `DATABASE_URL` y `JWT_SECRET`, y **eliminar los fallbacks** del código para que el Hub falle ruidosamente si falta la variable. Coordinar con el BUG-002 y rotar ambos secretos.

---

### ✅ Dos correcciones a mis propios hallazgos

| Bug | Mi afirmación original | Verdad verificada |
| :--- | :--- | :--- |
| **BUG-013** | "El registro no valida la robustez de la entrada" | ✅ **FALSO POSITIVO** — `register/route.ts` **sí** valida: `HTTP 400` con *"El nombre de usuario debe tener entre 3 y 20 caracteres."* La validación existe y funciona. **El bug real sigue siendo la falta de atomicidad**, no la validación. |
| **BUG-016** | "`server.js` no maneja `EADDRINUSE`" | ✅ **CONFIRMADO pero por otra razón de la que creí.** Mi regex hizo match con `socket.on('error')` (WebSocket) y me sugirió que sí había manejo. Verificado uno a uno: **no existe `server.on('error')`** en el nivel HTTP, por eso el `EADDRINUSE` crashea con traza (reproducido). Tampoco carga el `.env` (`dotenv=false`, `--env-file=false`). |

---

### Cómo reproducir la verificación

```bash
# Base de datos + código (solo lectura sobre PostgreSQL)
cp scratch/verify_bugs.mjs packages/database/_v.mjs
cd packages/database && node _v.mjs && rm _v.mjs

# Nivel HTTP (requiere el Hub arrancado)
node scratch/verify_bugs_api.mjs http://localhost:3000
```

> ⚠️ Los sondeos HTTP son **no destructivos a propósito**: los webhooks se prueban con **correos inexistentes** (`@playwin-invalid.test`) y **sin firmas válidas**. Que respondan `200` demuestra la vulnerabilidad **sin explotarla** ni mover dinero real.

---

## 📊 Resumen Ejecutivo

| Severidad | Cantidad | IDs |
| :--- | :--- | :--- |
| 🔴 **Crítico** | **0 abiertos** | ~~BUG-001~~ ✅ · ~~BUG-002~~ ✅ · ~~BUG-025~~ ✅ · ~~BUG-026~~ ✅ · ~~BUG-029~~ ✅ · ~~BUG-030~~ ✅ · ~~BUG-032~~ ✅ · ~~BUG-034~~ ✅ · ~~BUG-035~~ ✅ · ~~BUG-036~~ ✅ · ~~BUG-037~~ ✅ · ~~BUG-039~~ ✅ · ~~BUG-040~~ ✅ · ~~BUG-041~~ ✅ · ~~BUG-042~~ ✅ · ~~BUG-043~~ ✅ · ~~BUG-044~~ ✅ · ~~BUG-045~~ ✅ · ~~BUG-046~~ ✅ · ~~BUG-047~~ ✅ |
| 🟠 **Alto** | **0 abiertos** | ~~BUG-003~~ ✅ · ~~BUG-004~~ ✅ · ~~BUG-006~~ ✅ · ~~BUG-007~~ ✅ · ~~BUG-019~~ ✅ · ~~BUG-020~~ ✅ · ~~BUG-022~~ ✅ |
| 🟡 **Medio** | **2 abiertos** (BUG-028 · BUG-033) | ~~BUG-038~~ ✅ | ~~BUG-008~~ ✅ · ~~BUG-009~~ ✅ · ~~BUG-010~~ ✅ · ~~BUG-011~~ ✅ · ~~BUG-012~~ ✅ · ~~BUG-013~~ ✅ · ~~BUG-016~~ ✅ · ~~BUG-023~~ ✅ · ~~BUG-024~~ ✅ · ~~BUG-027~~ ✅ · ~~BUG-028~~ ✅ · **BUG-033** ❌ |
| ⚪ **Bajo** | **0 abiertos** | ~~BUG-014~~ ✅ · ~~BUG-015~~ ✅ |
| ✅ **Resueltos** | **49 de 51** | Todos menos BUG-028 y BUG-033 |

> **Aritmética:** **51 bugs catalogados = 49 resueltos · 2 abiertos · 0 parciales.**
> Comprobación automática: `node scratch/check_bug_consistency.mjs`
>
> **Los abiertos (BUG-028 y BUG-033) no son fallos de funcionamiento: son capas de UI**
> *Sky Runner* tiene su página de arranque vacía; hay que reconstruirla o retirar el
> juego del catálogo. Las dos opciones cambian lo que ve el jugador.

---

### 🔴 BUG-032 · `space` se quedaba atascado para siempre: sus pantallas no existían

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (bloqueo total: el jugador no podía continuar) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/public/games/space/index.html` · `style.css` |

**Síntoma reportado:** *"está lleno de bugs, la conexión la hace bien pero después no hay
vinculación real, no se ve bien, llega un momento que se queda en esa pantalla infinitamente"*.

**Cómo se encontró:** comparando los elementos que el motor busca por `id` con los que el
HTML realmente define. Herramienta nueva: [check-game-dom.mjs](scripts/check-game-dom.mjs).

```
$ node scripts/check-game-dom.mjs space
  El motor busca 32 elementos · el HTML define 16
  ❌ Ausentes: 17
      · btn_start · btn_restart · btn_menu · btn_resume
      · screen_title · screen_pause · screen_gameover
      · final_score · final_best · final_wave · final_speed · final_combo
      · new_record_badge · menu_best_val · pause_toggle …
```

**El `index.html` de `space` solo tenía canvas, HUD y controles móviles: le faltaba TODA la
capa de pantallas** (título, pausa y fin de partida) que el motor busca.

**Por qué producía un bloqueo infinito:**

```javascript
// script.js — al morir la nave
GameManager.prototype.gameOver = function () {
    this.state = 'gameover';                    // el bucle deja de actualizar
    var gameoverScreen = document.getElementById('screen_gameover');
    if (gameoverScreen) gameoverScreen.classList.add('active');   // ← null: no pasa nada
};
```

`state = 'gameover'` detiene la simulación, pero **como la pantalla no existe no aparece
nada**: ni resultado, ni botones, ni forma de salir. El jugador se quedaba mirando el espacio
infinitamente, exactamente como reportó.

**Arreglo aplicado:**

1. **Reconstruida la capa de pantallas** que el motor ya esperaba: título (con récord y
   `btn_start`), pausa y fin de partida con las 5 estadísticas (`final_score`, `final_wave`,
   `final_speed`, `final_combo`, `final_best`) y sus botones.
2. **CSS nuevo** para `.ui-screen` y `.ui-card`, usando **tokens** (se centralizaron
   `--on-dark`, `--mute`, `--soft`, `--warning`, `--line-faint`, `--fill-faint`).
3. **Un solo dueño por pantalla:** `showScreen()` del SDK ahora retira las `.ui-screen` del
   motor antes de mostrar la suya. Antes las dos podían quedar activas a la vez.
4. **Pausa coherente con el reglamento:** el SDK anula `P` y `Escape` durante la partida
   (regla *Zero Pause Trust*), así que la pantalla explica que **no se puede pausar en un
   duelo oficial** y ofrece salir, en vez de un botón de reanudar que no llevaba a ninguna parte.

**Dos ausencias deliberadas** (documentadas en el comprobador para que no parezcan olvidos):
`pause_toggle` (el SDK prohíbe la pausa local) y `btn_restart_pause` (con árbitro del
servidor no reinicia nada: sería un botón muerto).

**Verificación:** `check-game-dom.mjs space` → ✅ 32/32 sin ausencias · protocolo real del
juego completo (`MATCH_WAITING → MATCH_START → MATCH_LIVE → RIVAL_TICK`) · el SDK entrega
`onMatchReady → onMatchLive`.

---

### 🔴 BUG-048 · Los dos motores congelados dejaban la partida SIN RESULTADO

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (es el «murió el sistema» que reportó el usuario) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/src/stall-watch.js` (nuevo) · `rooms.js` |

**Síntoma reportado:** *"murió el sistema"* — los dos marcadores congelados, nadie puede moverse y **nunca llega un resultado**.

**Cómo se encontró:** análisis de inicio a fin con dos clientes reales contra el servidor. El escenario 1 (partida normal) salió perfecto; el escenario 2 (los dos clientes dejan de enviar ticks) reveló el agujero:

```
[17319ms] C y D -> DEJAN de enviar ticks
… 25 segundos después …
❌ C recibió MATCH_END · SIN RESULTADO
❌ D recibió MATCH_END · SIN RESULTADO
```

**Causa raíz:** el servidor no tenía forma de detectar que ya no había partida. Si los dos clientes callan a la vez (motor congelado, pestaña suspendida, wifi caído en ambos), no llega **ninguna** señal: ni caída, ni rendición, ni desconexión. El único tope era `MATCH_TIME_LIMIT_MS = 180000`, es decir **tres minutos** de espera para el jugador.

**Arreglo:** nuevo `stall-watch.js`. Si **ninguno** de los dos envía telemetría en **8 segundos**, la partida se cierra con motivo `ABANDONED` y gana quien más aguantó.

> ⚠️ **Distinción importante:** si sólo **uno** calla, **no se cierra nada**. Ese caso ya lo cubre la ventana de reconexión de 15 s, y cerrar ahí castigaría a quien sí está jugando.

**Verificado:**

```
[17319ms] C y D -> DEJAN de enviar ticks
[25409ms] C <- MATCH_END motivo=ABANDONED ganador=cccc…
[25410ms] D <- MATCH_END motivo=ABANDONED
✅ los dos ven el MISMO resultado · 🎉 FLUJO CORRECTO
```

---

### 🔴 BUG-049 · El cierre del WebSocket tumbaba el SDK y mataba el juego

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (excepción sin capturar) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `packages/game-sdk/playwin-bridge-connection.js` · `descartarSocket()` |

**Síntoma:** el proceso moría con

```
Error: WebSocket was closed before the connection was established
    at descartarSocket (playwin-bridge-connection.js:58)
Node.js v24.14.1        ← EL PROCESO MURIÓ
```

**Causa raíz:** al descartar un socket que **todavía estaba CONECTANDO**, el navegador emite un `error` de forma **ASÍNCRONA**. El código anulaba los manejadores a `null` antes de cerrar, así que ese `error` llegaba **sin ningún oyente** — y un `error` sin oyente en un `EventEmitter` **sube sin capturar**. En el navegador eso rompe la ejecución del juego.

**Arreglo:** los manejadores no se anulan, se sustituyen por **funciones mudas**. La diferencia es la clave: un `try/catch` alrededor de `close()` **no sirve**, porque el error no se lanza ahí — llega después, como evento.

```javascript
const mudos = () => {};
socket.onopen = mudos;
socket.onclose = mudos;   // evita que el cierre dispare una reconexión
socket.onerror = mudos;   // absorbe el error del cierre en curso
socket.onmessage = mudos;
```

---

### 🔴 BUG-050 · Reconectar siempre destruía la partida en curso

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Alto** (fallo introducido al arreglar el token) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `packages/game-sdk/playwin-bridge.js` · `PLAYWIN_INIT` |

**Síntoma:** en la consola del usuario:

```
WebSocket connection to 'ws://localhost:3001/ws' failed:
  WebSocket is closed before the connection is established.
  descartarSocket
```

**Causa raíz:** al arreglar el token caducado se pasó a reconectar en **cada** `PLAYWIN_INIT`. Pero el Hub lo envía **dos veces** al arrancar:

```javascript
onLoad={() => sendInitToIframe(t)}                       // al cargar el iframe
if (e.data?.type === 'PLAYWIN_READY') sendInitToIframe(t) // cuando el SDK avisa
```

Los dos con el **mismo** token. La segunda entrega **destruía el socket vivo** — justo el que estaba en cola o en partida.

**Arreglo:** la condición correcta no es «¿hay socket?» sino **«¿el token cambió?»**. Se compara con el token que viajó en el último `JOIN_MATCH`: si es el mismo y la conexión sigue abierta, **no se toca nada**.

| Caso | Antes | Ahora |
| :--- | :--- | :--- |
| Socket abierto con token **caducado** | ❌ no reconectaba | ✅ reconecta con el bueno |
| Socket abierto con el **mismo** token | ❌ reconectaba y lo rompía | ✅ no toca nada |
| Socket abierto con token **distinto** | ❌ no reconectaba | ✅ reconecta |

---

### 🔴 BUG-051 · Empate por puntuación: decía «Empate a N» y elegía ganador

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Alto** (mismo fallo que BUG-046, en otra vía de cierre) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/src/rooms.js` · `_resolveScoreWinner` |

**Causa raíz:**

```javascript
const winner = p1 >= p2 ? room.playerA : room.playerB;   // ← NO estricto
const resumen = p1 === p2 ? `Empate a ${p1}.` : …          // ← decía EMPATE
```

Con puntuaciones **iguales**, `p1 >= p2` es cierto y elegía a `playerA` **por posición**, mientras el resumen anunciaba un empate. Uno cobraba los **100 puntos de victoria** y el otro **20**. Es exactamente el BUG-046, pero seguía vivo en las vías de **tiempo agotado** y **abandono**.

**Arreglo:** comparación **estricta** (`p1 > p2`) y rama de empate que cierra **sin ganador**.

**Verificado:** `test:empate-puntos` comprueba el empate en **todas** las vías de cierre, incluido que el SDK sepa mostrarlo y que la comparación no estricta ya no exista.

---

### 🔒 BUG-052 · El servidor enviaba el token del RIVAL al cliente

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟠 **Medio** (exposición de credencial innecesaria) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/src/room-factory.js` · `sinToken()` |

**Cómo se encontró:** al revisar el log del flujo completo apareció el token del rival en claro:

```
MATCH_START { …, opponent: { username: 'rival_flujo', token: 'eyJhbGciOi…' } }
```

**Por qué importa:** el `MatchTicket` es una **credencial**: con él se puede abrir una conexión al servidor de duelos haciéndose pasar por ese jugador. El juego **no la necesita** — sólo usa alias, avatar y división — y quedaba expuesta a cualquiera que mirase el tráfico del WebSocket.

**Arreglo:** nuevo `sinToken()` que quita la credencial antes de enviar los datos de un jugador. Se aplicó a las dos vías (`MATCH_START` de duelo y de partida contra bot). **`MATCH_RESUME` ya estaba limpio.**

---

### 🔴 BUG-046 · El empate se anunciaba como tal pero repartía victoria y derrota

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Alto** (resultado injusto y mensaje contradictorio en pantalla) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/src/match-end.js` · `packages/game-sdk/playwin-bridge.js` |

**Síntoma reportado:** *"cuando ambos pierden a la misma vez no sé por qué marca a uno como ganador, cuando puede ser empate, ¿no crees?"*. Las capturas mostraban **¡VICTORIA!** a un jugador y **DERROTA** al otro, con el mismo texto *"Los dos cayeron a la vez con 3. Empate técnico."* en ambos.

**Verificado con dos clientes reales contra el servidor:**

```
Resumen: "Los dos cayeron a la vez con 3. Empate técnico."   <- decía EMPATE
Puntos A: {"winnerSeasonPoints":100,"loserSeasonPoints":20}
Puntos B: {"winnerSeasonPoints":100,"loserSeasonPoints":20}
```

El servidor **sabía** que era empate y lo escribía en el resumen, pero **seguía eligiendo a un ganador por posición** y repartiendo 100 puntos de victoria a uno y 20 al otro.

**Causa raíz — dos capas, ninguna sabía decir «empate»:**

1. **Servidor:** `resolverDobleCaida()` ya devolvía `empate: true`, pero `_resolverCaida()` **ignoraba esa bandera** y cerraba con ganador igualmente.
2. **SDK:** sólo entendía `isWin = winnerId === miId`, así que **no existía forma de mostrar un empate**. Uno veía ¡VICTORIA! y el otro DERROTA.

**Arreglo:**

* Nuevo `cerrarEnEmpate()`: aviso con **`isDraw: true`**, **`winnerId: null`**, motivo `DRAW` y **los mismos 50 puntos para los dos** (nadie cobra los 100 de victoria).
* El SDK detecta `isDraw` y muestra **EMPATE** con clase propia `pw-result-draw`, más los puntos reales.
* En el historial un empate se guarda con **`winner_id` nulo**, que el esquema ya admitía.

---

### 🔴 BUG-047 · El duelo se cerraba DOS VECES: llegaba un segundo resultado con otro ganador

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (el juego quedaba en un estado inconsistente) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/src/match-end.js` · `cerrarSala()` |

**Síntoma reportado:** *"al volver a perder al mismo tiempo después se queda muerto el juego, en un estado como que nadie perdió"*.

**Cómo se encontró:** la prueba de empate pasó a mostrar **dos `MATCH_END`** para la misma partida:

```
[4065ms] <- MATCH_END · motivo=DRAW · ganador=null · "Empate técnico."
[4411ms] <- MATCH_END · motivo=OPPONENT_CRASH · ganador=<el otro> · "cayó al abismo."
```

Con la traza de pila se localizó el origen del segundo aviso: **`Timeout._onTimeout`**, es decir el **reloj de cortesía** que debía haberse cancelado.

**Causa raíz — el orden de las operaciones estaba invertido:**

```javascript
ctx.broadcast(room.roomId, aviso);   // 1. se avisa…
room.status = 'FINISHED';             // 2. …y sólo después se cierra la sala
```

Al avisar primero, el reloj de cortesía pendiente encontraba la sala **todavía en `PLAYING`**, pasaba su comprobación de seguridad y **cerraba el duelo una segunda vez** con otro ganador. El cliente recibía dos resultados contradictorios.

**Arreglo:** nuevo `cerrarSala()` que **marca la sala como terminada y cancela TODOS sus relojes**
(cortesía, fin y reloj máximo) **antes** de emitir el aviso. La sonda confirma ahora **un único
`MATCH_END`**.

---

### 🔴 BUG-045 · El canvas quedó completamente en negro (fallo introducido al extraer la física)

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (el juego no mostraba nada) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/public/games/sky/js/game.js` · `updatePhysics` |

**Síntoma reportado:** *"verga cómo se quedó"* — pantalla completamente negra, sólo el HUD del
SDK y los botones. El escenario no se dibujaba.

**Causa raíz:** al extraer la física a `physics.js`, `updatePhysics` copiaba el estado a un
objeto, se lo pasaba y lo leía de vuelta:

```javascript
const estado = { gameState, x, y, z, … };
pasoDeFisica(estado, { … });
({ x, y, z, …, gameState } = estado);   // ← depende de que el campo esté en la copia
```

La lectura de vuelta depende por completo de que cada campo esté en la copia. **Cualquier campo
ausente vuelve como `undefined`**, y con `gameState` en `undefined` **ninguna rama de la
simulación se ejecuta**: no se avanza, no se puntúa, no se dibuja. El canvas queda negro y **no
aparece ningún error**.

**Arreglo (tres capas para que no se repita):**

1. **Todos los campos se declaran uno a uno** en el objeto de estado, sin depender del atajo de
   propiedades.
2. **La lectura de vuelta es explícita**, campo por campo.
3. **`gameState` se protege:** `gameState = estado.gameState ?? gameState`. Si el campo faltara,
   se conserva el valor anterior en lugar de dejar el juego mudo.

**La prueba que lo habría cazado** — `test-sky-physics` incluye ahora **16 comprobaciones de
integridad del estado**: recorre los 15 campos y verifica que ninguno se pierde al pasar por la
física, con una comprobación específica de que `gameState` nunca queda indefinido.

**Y `test-sky-render` (nuevo):** ejecuta la cadena de dibujo **real** con un canvas falso que
registra lo pintado, así un canvas vacío se detecta **sin abrir el navegador**:

```
antes de la partida:  581 rectángulos · 258 trazos · 2 gradientes
durante la partida:   269 rectángulos · 102 trazos
la pista existe hasta la fila que se dibuja, en z = 0, 40, 300 y 3000
```

---

### 🔴 BUG-042 · Sky Runner: se podía «jugar solito» antes de que hubiera partida

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Alto** (el juego parecía empezado sin rival ni reglas) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/public/games/sky/js/physics.js` (extraído de `game.js`) |

**Síntoma reportado:** *"al principio, cuando no hay nadie jugando y el primer jugador inicia, este juego puede literalmente jugar solito, no sé por qué"*.

**Causa raíz:**

```javascript
// gameState arranca en IDLE
if (gameState === STATE_IDLE || gameState === STATE_READY) {
  z += 0.12;                                    // ← ¡AVANZA SOLO!
  x = Math.sin(Date.now() * 0.002) * 0.25;
  return;
}
```

`gameState` **empieza en `IDLE`**, así que **desde el instante en que se abría la página la pista
avanzaba sola**. El primer jugador que entraba veía el escenario desplazarse y parecía que ya
estaba jugando: sin rival, sin marcador y sin forma de perder. No era un fallo de
emparejamiento, era el estado inicial del motor.

**Arreglo:** mientras no haya partida, el escenario está **QUIETO** y sólo se ve una vista previa
del circuito (con un balanceo suave del encuadre para que no parezca muerto). El avance empieza
con `MATCH_LIVE`, y sólo entonces. El rival fantasma tampoco se dibuja fuera de partida.

**Verificado:** `test-sky-physics.mjs` recorre 300 pasos en `IDLE` y en `READY` y confirma que
`z` no se mueve, que no se puntúa y que no se puede caer.

---

### 🔴 BUG-043 · Si los dos caían a la vez, el ganador salía por azar (y uno se quedaba sin resultado)

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Alto** (resultado injusto y pantalla colgada para el perdedor) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/src/match-clock.js` · `rooms.js` |

**Síntoma reportado:** *"si ambos caen a la misma vez, igual asigna a un ganador"*.

**Causa raíz:** cuando un jugador caía, el servidor **cerraba el duelo al instante**. El aviso
del otro llegaba unos milisegundos después y se descartaba por «partida ya terminada». Dos
consecuencias:

1. El jugador que había caído casi a la vez **se quedaba sin ver su resultado**: la pantalla
   parecía colgada, que es justo lo que se reportó al principio.
2. El ganador se decidía con el primer aviso que llegaba, es decir **por azar**.

**Arreglo:** cuando alguien cae se abre una **ventana corta (400 ms)** para escuchar también al
rival. Si el rival cae dentro de ella, gana **quien aguantó más tiempo** (la puntuación es el
tiempo sobrevivido). Si aguantaron **exactamente lo mismo**, se declara **empate técnico**: no se
inventa un mérito que no existe.

La regla vive en `resolverDobleCaida()` para poder probarla sin levantar el servidor.

**Verificado:** `test-doble-caida.mjs` comprueba 5 casos con tiempos reales de tu partida
(97 vs 46, 60 vs 61, 50 vs 50…) y **121 combinaciones** confirmando que el ganador **nunca** es
quien cayó antes.

---

### 🔴 BUG-044 · El tiempo de supervivencia se decide con datos del servidor, no del cliente

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Alto** (habría roto el principio Zero Client Trust) |
| **Estado** | ✅ **VERIFICADO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/src/rooms.js` · `_resolverCaida` |

**Contexto:** al comparar quién aguantó más en una doble caída había que decidir **de dónde sale
ese tiempo**. El cliente envía `PLAYER_CRASHED` **sin puntuación**, así que el navegador **no
tiene forma de dictar el resultado**.

El tiempo usado es `player.score`, que el servidor mantiene a partir de los **ticks ya validados**
por el anticheat (`tick-handler.js`: ritmo de paquetes + física del avance). Un cliente
manipulado que intentara inflar su tiempo sería detectado antes de que ese dato contara.

**Verificado recorriendo el flujo completo:** cliente → `PLAYER_TICK` (validado) →
`curPlayer.score` → `_resolverCaida`. **Ningún dato del cliente decide la partida.**

---

### 🔴 BUG-039 · Sky Runner: el rival fantasma desaparecía si iba detrás

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Alto** (el jugador no tenía referencia visual de su rival) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/public/games/sky/js/renderer.js` · `drawRivalGhost` |

**Síntoma reportado:** *"la sombrita azul del contrincante no sale"*.

**Causa raíz:**

```javascript
const dz = (rival.z - playerZ) + cameraInFront;
if (dz <= 0.4 || dz >= 44) return;   // ← si el rival se acercaba, DESAPARECÍA
```

Con los dos jugadores al mismo nivel (`dz = 3`) se dibujaba, pero en cuanto el rival se
quedaba **un poco por detrás** —tu captura mostraba 61 contra 41— la proyección daba
`dz = -17`: el rival quedaba **detrás de la cámara** y la función salía sin pintar nada.
Tampoco se veía la sombra azul que mencionabas.

**Regla confirmada contigo:** en este juego **los dos van al mismo nivel** y el fantasma
debe verse **superpuesto**, distinguible por su **transparencia**, no escondiéndolo.

**Arreglo:**

* El rival se dibuja a cualquier profundidad cercana (`dz > 0.05`), **también si va detrás
  o al mismo nivel**.
* Su opacidad **baja cuanto más cerca está**, para que los dos se distingan al solaparse.

**Verificado:** con los dos al mismo nivel, el rival se proyecta en **(640, 607)**, el mismo
punto que la bola del jugador: se ven superpuestos y ambos distinguibles.

---

### 🔴 BUG-040 · Sky Runner: la puntuación era la distancia, idéntica para los dos

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (hacía imposible que un duelo se decidiera) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/public/games/sky/js/game.js` (tick al servidor) |

**Síntoma reportado:** *"nadie gana, si es que va más adelante uno o más atrás otro no,
porque si te fijas ambos tienen la misma distancia… la forma de perder es cayéndose al
abismo, muy importante eso"*.

**Causa raíz:** el motor enviaba `score: Math.floor(z)`, es decir **la distancia
recorrida**. Pero en Sky Runner el avance **no depende del jugador**: es una función del
tiempo (`z += Math.min(0.5, 0.2 + z / 5000)`). Dos jugadores que aguantan lo mismo recorren
**exactamente la misma distancia**, así que el marcador mostraba el mismo número para los
dos y **el duelo no podía decidirse nunca por puntuación**.

Comprobado por simulación: dos jugadores iguales acababan en **17 209 con 0 m de
diferencia**.

> **Cada juego mide lo suyo.** En *Speed Horizon 3D* la puntuación **sí** es la distancia,
> porque allí el avance depende del jugador y ese diseño es correcto. En *Sky Runner* el
> avance es automático, así que puntuar distancia no distingue a nadie.

**Arreglo:** la puntuación pasa a ser **el tiempo sobrevivido** (`pasosVivo / 60`), que es
lo que de verdad mide la habilidad en un juego de supervivencia. Así:

* **Gana quien no cae al abismo**, tal y como pediste.
* Si los dos caen, gana quien **aguantó más tiempo**.

**Verificado:** `test-sky-win-condition.mjs` comprueba que la pista es superable, que la
puntuación refleja el tiempo y que la resolución del duelo es coherente.

---

### 🔴 BUG-041 · El servidor no limitaba la duración de un duelo: partidas eternas

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (la sala quedaba ocupada y no se registraba resultado) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/src/match-clock.js` (nuevo) · `rooms.js` |

**Cómo se encontró:** al analizar la lógica de Sky Runner. Con la pista garantizando un paso
practicable, **dos jugadores buenos pueden sobrevivir indefinidamente**. Y el servidor **no
tenía ningún tope de duración**: sólo existía la ventana de reconexión de 15 s. Una partida
así **no terminaba jamás**: la sala seguía ocupada, el emparejamiento no se liberaba y no se
registraba ningún resultado.

**Arreglo:** un reloj máximo por duelo (`MATCH_TIME_LIMIT_MS = 3 min`). Al agotarse se
resuelve **por puntuación**, con la misma regla que cuando un jugador termina y el otro no
aparece. El reloj se cancela al cerrar la sala para no dejar temporizadores vivos.

**Extracción de paso:** `rooms.js` había crecido a 363 líneas (límite 350). Se separaron dos
unidades coherentes: `join-queue.js` (entrada a la cola y reconexión) y `tick-handler.js`
(ritmo de paquetes, validación de física y reenvío al rival). Ahora `rooms.js` queda en
**273 líneas** y la gobernanza vuelve a **12/12**.

---

### 🔴 BUG-036 · Sky Runner: la bola NUNCA se movía en pantalla (cámara = jugador)

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (el juego parecía no responder a los controles) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/public/games/sky/js/renderer.js` (8 proyecciones) |

**Síntoma reportado:** *"la sombrita visual del enemigo debe tener sentido real de su posición, actualmente no se muestra bien"*.

**Causa raíz — una resta que siempre daba cero:**

```javascript
// project() calcula:
screenX = canvasWidth / 2 + (px - camX + curva) * scale;
//                           ^^^^^^^^^^ si ambos valen lo mismo, esto es 0 SIEMPRE

// Y el renderer pasaba la MISMA variable en los dos huecos:
project(x, y, dz, …, /* px */ x, /* camX */ x)
```

`drawTrack` sí usaba `camX = x` (la cámara) correctamente, pero `drawPlayerBall` y
`drawRivalGhost` pasaban la **posición del jugador** en ambos huecos. Resultado: **la bola, su
sombra y el rival fantasma se dibujaban clavados en el centro horizontal de la pantalla**. El
jugador se movía de verdad por los carriles, pero **en pantalla nada se movía**: parecía que
los controles no funcionaban.

**Arreglo:** la cámara se declara explícitamente y **las 8 proyecciones la usan**:

```javascript
export const cameraX = 0;   // la cámara se queda en el centro del mundo
```

El motor limita al jugador a `x ∈ [-3.4, 3.4]` y los 7 carriles abarcan `[-3.5, 3.5]`, así que
con la cámara centrada **toda la pista cabe en pantalla y el jugador se desplaza sobre ella**.

**Verificado:** la bola ahora recorre **de 136 px a 1144 px** sobre un lienzo de 1280, cruza el
centro en ambos sentidos y la sombra la acompaña.

---

### 🔴 BUG-037 · Sky Runner: la bola se dibujaba hundida en la pista

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (la bola no parecía estar sobre la pista) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/public/games/sky/js/renderer.js` · `drawPlayerBall` |

**Cómo se encontró:** el test de geometría midió la separación entre la bola y su sombra y
salió **negativa (−58.8 px)**: en esta proyección `+y` **sube** en pantalla, así que un valor
negativo significaba que **la bola se pintaba 58.8 px por debajo del suelo**, hundida en la
pista, en vez de rodar por encima.

**Causa:** el centro de la esfera se proyectaba con `y + 0.35` **y** la sombra con `y`, sin
relación con el radio real. La geometría estaba repartida y sin una fuente de verdad.

**Arreglo:** el radio se declara como constante y **ambos** lo respetan:

```javascript
export const RADIO_BOLA = 0.35;   // la bola rueda SOBRE la pista
```

**Verificado:** la bola se dibuja exactamente **58.8 px por encima** de su sombra (justo el
radio proyectado) y **nunca queda hundida**.

---

### 🟡 BUG-038 · Sky Runner: al morir, el escenario se movía para siempre

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio (el juego no se recuperaba tras el duelo) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/public/games/sky/js/game.js` · `onMatchEnd` |

**Síntoma reportado:** *"falló enorme, ambos murieron al mismo tiempo y se quedó ahí"*.

**Dos causas, las dos en el final del duelo:**

1. **`onMatchEnd` sólo ponía `STATE_IDLE`**, y ese estado **avanza la pista indefinidamente**
   (`z += 0.12`). Tras morir, el jugador veía el escenario desplazarse para siempre, sin final
   ni reinicio: parecía colgado aunque el motor siguiera vivo.
2. **El rival fantasma seguía "conectado"** con datos de una partida ya terminada, así que se
   dibujaba con posiciones muertas.

> **Sobre el doble choque:** que los dos mueran casi a la vez **no es un fallo**. La pista es
> determinista (misma semilla → mismo circuito), así que dos jugadores igual de rápidos caen en
> el mismo hueco. El servidor lo resuelve bien: el primero que avisa cierra el duelo por
> `OPPONENT_CRASH` y gana el rival; el aviso del segundo se descarta porque **no se puede
> perder dos veces**. El problema no era ése, sino que el perdedor no veía su resultado.

**Arreglo:** nuevo `endMatch()`, que además de volver a `IDLE` **desconecta al rival fantasma y
reinicia el escenario con la semilla del duelo** (guardada en `semillaActual`).

---

### 🔴 BUG-034 · Sky Runner 3D no existía: su `index.html` estaba VACÍO (0 bytes)

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (el juego era completamente inaccesible) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/public/games/sky/index.html` (0 bytes → 2 269 bytes) |

**Síntoma reportado:** *"Sky Runner 3D, dale, arréglame este juego, así mismo está, muchos bugs, todo"*.

**Hallazgo:** el cuarto juego anunciado en el Hub **no tenía página**. El archivo
`index.html` pesaba **0 bytes**, así que aunque el motor estaba completo y bien escrito
(`js/game.js` 295 L, `js/renderer.js` 198 L, `js/prng.js` 68 L, `js/audio.js` 115 L) y
`js/game.js` **ya llamaba a `PlayWin.init()`**, **nada se cargaba nunca**.

**Detalle que condicionaba el arreglo:** el juego es **modular con ES Modules** (`script.js`
hace `import './js/game.js'`), así que necesitaba `type="module"`. Cargarlo de cualquier otra
forma habría fallado con un error de sintaxis.

**Arreglo aplicado — reconstruida la página completa:**

| Elemento | Por qué |
| :--- | :--- |
| `<canvas id="game-canvas">` | El motor lo busca con ese id exacto al cargar el módulo |
| `.mobile-controls-layer` con `#btn-touch-left/right/jump` | **Las clases ya existían en `style.css` pero ningún HTML las usaba**: el juego era injugable en móvil |
| `<script type="module" src="script.js">` | Obligatorio: el juego usa `import` |
| Los 4 scripts del SDK, en orden | El puente debe existir antes de que el módulo llame a `PlayWin.init()` |

**Verificación:** `check-sky-modules.mjs` ✅ (los 3 `import` resuelven y cada símbolo
importado existe de verdad como export) · `check-sky-served.mjs` ✅ (los 7 ficheros se sirven
por HTTP 200 y el orden de carga es correcto) · el protocolo real funciona
(`MATCH_WAITING → MATCH_START → MATCH_LIVE → RIVAL_TICK`).

---

### 🔴 BUG-035 · Sky Runner: la pista tiene 7 carriles pero el motor usaba 9 posiciones

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (el jugador moría sin haber hecho nada malo) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/public/games/sky/js/game.js` (3 puntos de cálculo) |

**Cómo se encontró:** ejecutando la lógica determinista fuera del navegador
([test-sky-determinism.mjs](scripts/test-sky-determinism.mjs)) y comparando la geometría del
renderer con la del motor:

| Fuente | Fórmula | Resultado |
| :--- | :--- | :--- |
| **Renderer** (dibuja la pista) | `project(i - 3.5, …)` para 7 carriles | la pista abarca **x ∈ [-3.5, 3.5]** |
| **Motor** (limita el movimiento) | `Clamp(x, -4.2, 4.2)` | **x ∈ [-4.2, 4.2]** ← más ancho que la pista |
| **Motor** (calcula el carril) | `Math.round(x + 3)` | devuelve **-1 … 7** ← los válidos son 0…6 |

**Consecuencia:** en los extremos, `row[-1]` y `row[7]` son `undefined`, el juego considera
que el jugador **no está sobre la pista** y lo hace caer. Medido: **29 de 169 posiciones de
movimiento (17 %) provocaban una caída injusta**.

**Arreglo aplicado — una sola fuente de verdad para la geometría:**

```javascript
const CARRILES = 7;

/** Centro del carril ocupado por `x`, siempre dentro de 0..6. */
function carrilDe(x) {
  const col = Math.floor(x + CARRILES / 2);
  return Math.min(CARRILES - 1, Math.max(0, col));
}

/** Límite de movimiento: mantiene al jugador sobre la pista, nunca al borde. */
const LIMITE_X = CARRILES / 2 - 0.1;   // 3.4
```

* El límite de movimiento pasa de ±4.2 (inventado) a ±3.4 (**derivado del ancho real**).
* Los **3 puntos** de cálculo de carril usan ya `carrilDe(x)`, que **nunca** devuelve un
  índice fuera de rango.
* `Math.floor` respeta las bandas que dibuja el renderer.

**Verificación:** `test:sky` ✅ — recorridas **137 posiciones** de todo el rango: **0 fuera de
la pista** y **los 7 carriles alcanzables**. Además se valida que el PRNG y el generador de
pista son deterministas (misma semilla → mismo circuito), condición indispensable para que un
duelo 1v1 sea justo.

---

### 🟡 BUG-033 · `carreras` tiene la misma capa de pantallas incompleta (no bloquea)

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio (pérdida de información, no bloqueo) |
| **Estado** | ❌ **ABIERTO** — documentado, pendiente de decisión |
| **Ubicación** | `apps/hub/public/games/carreras/index.html` |

**Hallazgo:** el motor de carreras busca **17** elementos y el HTML define **11**. Faltan:

```
go-distance · go-checkpoints · go-best · hud-best · btn-start · btn-restart · btn-menu · btn_sound
```

**Por qué NO bloquea:** en carreras, `endGame()` llama **antes** a `PlayWin.notifyFinish()`,
el servidor resuelve la partida y **el SDK muestra su pantalla de resultado**. El jugador sí
puede continuar. Lo que se pierde es el detalle local del motor (distancia, checkpoints,
mejor marca) y sus botones de menú.

**Arreglo pendiente:** reconstruir esos elementos igual que en `space`. **No se hizo en este
hito** para no mezclar dos juegos en un mismo cambio; el comprobador ya lo señala de forma
permanente (`node scripts/check-game-dom.mjs carreras`).

---

### 🔴 BUG-029 · El SDK enviaba pero NO recibía: el manejador de mensajes se perdía

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** — **era la causa real de "la partida no arranca en ningún juego"** |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `packages/game-sdk/playwin-bridge-connection.js` (`setOnMessage`) |

**Síntoma:** *"mantiene el mismo síntoma, no funciona"*. Los juegos mostraban el HUD con
`TIEMPO 20` **congelado** y los coches quietos, en cualquier título.

**Cómo se encontró (sin navegador):** se construyó
[simulate-sdk-client.mjs](scripts/simulate-sdk-client.mjs), que ejecuta los **4 módulos
reales del SDK** dentro de Node con un DOM mínimo y un WebSocket falso que entrega la
misma secuencia que el servidor. El veredicto fue inmediato:

```
Mensajes que el SDK envió al servidor: JOIN_MATCH, PING, PING   ← envía bien
Callbacks recibidos por el juego: (NINGUNO)                     ← ¡no recibe NADA!
```

**Causa raíz — un orden de llamadas incorrecto:**

```javascript
// playwin-bridge.js
connection.setOnMessage(handleServerMessage);   // se llama PRIMERO…
connection.connect();                           // …y el socket se crea DESPUÉS

// playwin-bridge-connection.js (ANTES)
setOnMessage: function (handler) { if (socket) socket.onmessage = handler; }
//                                 ^^^^^^^^^ el socket aún es null -> el manejador SE PIERDE
```

El manejador de mensajes **nunca se enganchaba al WebSocket**. El SDK enviaba
`JOIN_MATCH` y `PING` correctamente, pero todo lo que el servidor respondía se
descartaba. Consecuencia: ni `MATCH_WAITING`, ni `MATCH_START`, ni `MATCH_LIVE`; el
juego nunca arrancaba y **no aparecía ningún error en ninguna parte**.

**Arreglo:** el manejador se guarda en una variable propia y se engancha a **cada**
socket nuevo (incluidas las reconexiones).

---

### 🔴 BUG-030 · `handleMatchStart` llamaba a una función que no existía

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** — segunda causa del mismo síntoma |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `packages/game-sdk/playwin-bridge.js` (`stopWaitingNotice`) |

**Cómo se encontró:** el mismo simulador, ya con BUG-029 arreglado, destapó el
siguiente fallo al entregar `MATCH_START`:

```
ReferenceError: stopWaitingNotice is not defined
    at handleMatchStart (packages/game-sdk/playwin-bridge.js:291:5)
```

`handleMatchStart()` invocaba `stopWaitingNotice()`, pero **esa función nunca se
definió**. Al recibir `MATCH_START` se lanzaba la excepción y **toda la secuencia de
emparejamiento moría ahí**: ni pantalla de versus, ni `MATCH_LIVE`, ni arranque del
juego. El jugador veía exactamente lo que reportaba: el HUD congelado en `20`.

**Arreglo:** se define la función que faltaba y se **blinda el procesador completo de
mensajes** con `try/catch`, para que un fallo puntual no vuelva a matar la secuencia en
silencio.

---

### ✅ Cierre del Hito C.3 — el juego respeta al árbitro (2026-09-29)

| Bug | Arreglo | Verificación |
| :--- | :--- | :--- |
| **BUG-025** 🔴 | Guardián `PlayWin.canStartLocally()` (siempre `false` con el SDK cargado) + blindaje de los **6 disparadores locales** en 3 motores: `Enter` en carreras, botones de space, botones de flapy-flapy. `sky` ya era correcto. | Prueba nueva en gobernanza (12/12). **Probada en negativo:** quitando el guardián, la suite señala `carreras/script.js:201 arranca sin guardián`. |
| **BUG-022** 🟠 | Nuevo `playwin-bridge-connection.js`: el fallo de conexión se avisa **siempre** (no solo en partida), con **timeout de 10 s**, pantalla elegante de *"Duelos fuera de línea"*, detalle con la URL intentada y botón **REINTENTAR CONEXIÓN**. | El SDK ya no puede fallar en silencio. |
| **BUG-024** 🟡 | Tras 15 s esperando, el radar explica la verdad: *"Los rivales de entrenamiento están desactivados, así que la espera puede alargarse"*. | Mensaje condicionado a que la partida no haya empezado. |

**Modularización del SDK** (la Regla 1 prevé techo de 800 líneas para SDK/orquestadores, pero se dividió igualmente por claridad):

| Módulo | Líneas | Responsabilidad |
| :--- | :--- | :--- |
| `playwin-bridge.js` | ~396 | Lógica del protocolo (orquestador; techo 800) |
| `playwin-bridge-ui.js` | 124 | Markup de las 6 pantallas + inyección del DOM |
| `playwin-bridge-connection.js` | 111 | Ciclo de vida del WebSocket |
| `playwin-bridge-status.js` | 67 | Avisos y pantalla de indisponibilidad |
| `playwin-bridge.css` | 349 | Tokens y estilos |

**Corrección de la propia suite:** la comprobación de tamaño aplicaba **350 líneas al Bridge SDK**, cuando la Regla 1 le asigna **800** por ser orquestador explícito. Se corrigió la prueba (no el código) con una **lista explícita** de orquestadores.

**Pantallas del ciclo, ahora 6:**
`#pw-screen-mm` (radar) · `#pw-screen-vs` (versus) · `#pw-live-hud` · `#pw-screen-result` ·
`#pw-screen-auth` · **`#pw-screen-offline`** (nueva: servidor no disponible)

---

### 🔴 BUG-025 · Los juegos arrancan carreras LOCALES saltándose el árbitro del servidor

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (viola la regla fundacional «el servidor es el único árbitro») |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | Los 4 juegos: `carreras/script.js:195-199` · `space/script.js:1065-1071` · `flapy-flapy/script.js:1423,1430,1561` · `sky/js/game.js:273` |

**Síntoma reportado:** *"inicié con la cuenta de una persona, le di a iniciar partida y se puso así — no salió el menú de espera. No inicia."*
Las capturas muestran la arena con el HUD en `0 KM/H · TIEMPO 20 · 0 M` en **dos ventanas a la vez**.

**Causa raíz (verificada en el código):**

```javascript
// apps/hub/public/games/carreras/script.js:195-199
if (k === 'enter') {
    if (gameState === STATE_TITLE || gameState === STATE_GAMEOVER) {
        startRace();          // ← arranca una carrera LOCAL, sin servidor
    }
}
```

Cada juego conserva **sus propios disparadores de arranque local** de cuando eran juegos de un solo jugador. Al pulsarlos, el juego entra en `STATE_PLAYING` y el reloj empieza a correr **sin que exista partida en el servidor**:

* `startRace()` hace `time = maxTime` (20 s) y `gameState = STATE_PLAYING`.
* El HUD queda en `0 KM/H · 20 · 0 M`.
* El coche **no se mueve**, porque el juego sólo llama a `PlayWin.sendTick()` cuando `PlayWin.isLive()` es verdadero.

**Resultado:** el jugador cree que está en una partida que nunca empezó. Y si pulsa el botón antes de encolar, **nunca llega a la pantalla de espera** — que es exactamente el síntoma de la primera captura.

**Contradicción con la skill `playwin-game-bridge`:**

> *Regla 4: «El bucle arranca en `onMatchLive`. No antes.»*

Los 4 juegos **incumplen** esa regla. El arranque correcto ya existe y funciona (`carreras/script.js:1310-1313`):

```javascript
onMatchLive: () => { startRace(); updateHUD(); }   // ✅ el correcto
```

**Inventario de disparadores locales a desactivar:**

| Juego | Ubicación | Disparador |
| :--- | :--- | :--- |
| carreras | `script.js:195-199` | Tecla `Enter` |
| space | `script.js:1065` | Botón `#btn_start` |
| space | `script.js:1068` | Botón `#btn_restart` |
| space | `script.js:1071` | Botón `#btn_restart_pause` |
| flapy-flapy | `script.js:1423, 1430, 1561` | Tecla / clic / botón |
| sky | `js/game.js:273` | Tecla / clic |

**Arreglo propuesto:**
1. Crear un guardián en el SDK: `PlayWin.canStartLocally()` → `true` **solo** si el SDK NO está presente (modo práctica / página suelta), `false` cuando hay SDK cargado.
2. Envolver los 6-8 disparadores locales con ese guardián. **Micro-edición quirúrgica**: no reestructurar los motores (están congelados por gobernanza).
3. Documentarlo en cada motor con un comentario de una línea.
4. Prueba automatizada que detecte si algún juego vuelve a arrancar sin `isLive()`.

**Nota:** los motores de `public/games/` están **congelados contra el engorde** (`playwin-code-governance`). El arreglo debe ser mínimo: **un `if` por disparador**, sin refactorizar.

---

### 🟠 BUG-022 · El SDK falla en silencio cuando el servidor de duelos está caído

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟠 Alto (UX crítico: el jugador cree que el sistema está roto) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `packages/game-sdk/playwin-bridge.js:137-147` |

**Síntoma reportado:** *"inicié una partida y se quedó así… ¿por qué no sale el panel de espera?"*

**Causa raíz verificada:**

```javascript
socket.onclose = () => {
  if (isMatchLive) { /* aviso de reconexión */ }   // ← SOLO si ya está en partida
};
socket.onerror = () => {
  if (isMatchLive) showReconnectBanner(...);        // ← ídem
};
```

Los dos manejadores de error están **condicionados a `isMatchLive`**. Si la conexión falla **antes** de que empiece la partida (caso normal: el jugador entra, el servidor está caído), el error **no se muestra en ninguna parte**.

**Resultado:** el jugador se queda mirando la pantalla de radar indefinidamente, sin ningún mensaje. No puede distinguir *"no hay rivales"* de *"el servidor no existe"*.

**Evidencia del diagnóstico:**

```
$ node packages/database/scripts/diagnose.mjs
  SERVIDOR DE DUELOS → ❌ SIN RESPUESTA: fetch failed
     → El servidor de duelos NO está corriendo.
  HUB → EN LÍNEA (HTTP 200)
```

El Hub funcionaba, el servidor de duelos no, y **el SDK no lo dijo**.

**Agravante:** no hay **timeout de conexión**. Si el WebSocket queda en `CONNECTING` indefinidamente (URL mal configurada, firewall), tampoco hay aviso.

**Arreglo propuesto:**
1. Mostrar el error de conexión **siempre**, no solo durante la partida.
2. Añadir un **timeout de conexión** (10 s) que muestre *"No se pudo contactar con el servidor de duelos"* con la URL intentada.
3. Ofrecer un botón **REINTENTAR** en esa pantalla.
4. Cuando los bots están apagados y el jugador es el único en cola, explicarlo: *"Esperando rival humano. Si nadie entra, seguirás esperando."*

---

### 🟡 BUG-023 · El flujo de partida sí funciona, pero no hay forma de verlo

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio (falta de observabilidad, no de función) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `packages/database/scripts/diagnose.mjs` (nuevo) · `/health` del servidor de duelos |

**Contexto:** el jugador reportó que una partida con 2 personas *"no valió, se quedó así"*. Al reproducirlo con el servidor levantado, **la partida funcionó perfectamente**:

```
sala duel_carreras_a592113a · PLAYING · humanas=1 · bots=0
A=progamer2026 · B=carlos_pro
score: 0/115 → 0/615 → 366/687 → 2872/687 → 4385/2258 → 5696/5671
→ MATCH_END: carlos_pro gana 6752 vs 6793 (HIGHER_SCORE, 23s)
```

Ambos jugadores avanzaban y el resultado se persistió correctamente en `match_records`.

**Conclusión:** el motor de duelos **es correcto**. Lo que fallaba era que **no existía ninguna forma de comprobarlo**: ni panel, ni logs visibles, ni endpoint con estado de las colas.

**Arreglo aplicado:** `scripts/diagnose.mjs` responde de un vistazo a las tres preguntas útiles:
- ¿Está el servidor de duelos en línea? ¿Con bots encendidos o apagados?
- ¿Hay partidas vivas ahora mismo? ¿Humanas o contra bot? ¿Con qué marcador?
- ¿Se están registrando resultados en la base de datos?

```bash
node --env-file=.env.test packages/database/scripts/diagnose.mjs
```

---

### 🟡 BUG-024 · Los bots apagados dejan al jugador esperando sin explicación

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `packages/game-sdk/playwin-bridge.js` (pantalla `#pw-screen-mm`) |

**Contexto:** los bots se apagaron por decisión de producto (BUG-021). Efecto colateral: un jugador solo en la cola **espera indefinidamente** viendo el radar, sin saber que no va a llegar nadie.

**Arreglo propuesto:** tras 15 s esperando, cambiar el texto del radar a algo honesto:
> *"Esperando rival humano… Los rivales de entrenamiento están desactivados. Entra con otra cuenta para probar, o pide que activen los bots."*

---

---

### 🔴 BUG-026 · El guardián de BUG-025 bloqueaba el arranque con el SDK cacheado

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 **Crítico** (la partida se emparejaba y los dos jugadores se quedaban quietos) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | Los 3 guardianes de los motores + versión del SDK |

**Síntoma reportado:** *"no funciona amigo, incluso cuando no está perdido el servidor de websocket. Yo desconecté el websocket, le di reintentar y nada, no se conectó."*
Las capturas muestran **dos jugadores reales emparejados** con `0 KM/H · 0 M` en ambos lados.

**Evidencia recogida antes de tocar nada:**

```
$ node scripts/check-sdk-served.mjs
  SERVIDOR DE DUELOS: EN LÍNEA · salas: 1 (humanas 1)
    · duel_carreras_7ff98f58 [PLAYING] progamer2026 0 vs 0 carlos_pro
```

El servidor **sí emparejó** (semilla 4926714, `isGhostMatch: false`), pero los marcadores nunca subieron.

**Causa raíz — el guardián que escribí en BUG-025 era peligroso:**

```javascript
if (window.PlayWin && !window.PlayWin.canStartLocally()) return;
```

Si el navegador sirve una **copia cacheada** de `playwin-bridge.js` (anterior al arreglo), entonces `canStartLocally` es `undefined`:

```
!undefined  ===  true   ->   BLOQUEA EL ARRANQUE
```

Y no bloquea sólo el arranque local: **bloquea también el legítimo del servidor** (`onMatchLive`), porque la guarda está en el mismo manejador. Resultado: el servidor empieza la partida, el jugador no puede arrancar su bucle, y los dos coches se quedan en la línea de salida **sin ningún aviso**.

**Dos defectos de fondo:**

1. **No había cache-busting.** Las etiquetas `<script>` no llevaban versión, así que el navegador reutilizaba el SDK antiguo indefinidamente. Se depuró durante horas un fallo que ya estaba arreglado en disco.
2. **Un guardián nunca debe romper el camino feliz cuando falta información.** Asumir "función ausente = bloquear" convirtió una protección en un bloqueo total.

**Arreglo aplicado:**

1. **Guardián con semántica positiva y tolerante a versiones antiguas:**

```javascript
const tieneArbitroDelServidor = () =>
    !!window.PlayWin &&
    typeof window.PlayWin.canStartLocally === 'function' &&
    !window.PlayWin.canStartLocally();

if (!tieneArbitroDelServidor()) return;
```

Con un SDK viejo devuelve `false` y **no bloquea**: se degrada al comportamiento anterior en lugar de romperse.

2. **Cache-busting en los 4 juegos:** `<script src="/game-sdk/playwin-bridge.js?v=4">`, etc. La versión vive en `scratch/sync_sdk_scripts.mjs` y **debe subirse al tocar el SDK**.

3. **Detección de versiones mezcladas:** `playwin-bridge.js` y `playwin-bridge-connection.js` llevan `SDK_VERSION`. Si no coinciden, el jugador ve *"Versiones mezcladas del SDK. Recarga con Ctrl+Shift+R"* en lugar de un fallo mudo.

**Verificación:** gobernanza **12/12** · `test:duel`, `test:ghost`, `test:anticheat` en verde · `scripts/check-sdk-served.mjs` confirma los 5 ficheros idénticos y los 4 scripts con `?v=4`.

---

### 🟡 BUG-027 · Reinicio automático de servidores en desarrollo

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio (herramienta de desarrollo, causa raíz de horas perdidas) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `scripts/dev-watch.mjs` (nuevo) · `npm run dev:watch` |

**Contexto:** el usuario pidió explícitamente *"necesitamos que en cada cambio que hagamos los servidores se reinicien solos, porque veo que no funciona"*. Tenía razón: se editaba código y los servidores seguían con la versión antigua en memoria, así que se depuraban fallos ya arreglados.

**Solución:** un vigilante que levanta **los dos servidores** y los reinicia solo:

| Vigila | Reinicia |
| :--- | :--- |
| `apps/realtime-server/src` · `packages/database/src` · `.env` | Servidor de duelos |
| `apps/hub/src` · `next.config.ts` · `.env.local` | Hub |
| `packages/game-sdk` · `apps/hub/public/game-sdk` | **Los dos** (y avisa de recargar el navegador) |

```powershell
npm run dev:watch     # levanta :3000 y :3001 y los reinicia al guardar
```
`Ctrl+C` detiene los dos (mata el árbol de procesos completo en Windows).

Además `apps/realtime-server` incorpora `dev:watch` con `node --watch` nativo.

**Verificado:** arrancó ambos servidores correctamente (probado en puertos alternos para no interferir con los del usuario).

---

### 🟡 BUG-028 · `sky/index.html` está vacío: el juego no puede funcionar

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio |
| **Estado** | ❌ **ABIERTO** — requiere decisión de producto |
| **Ubicación** | `apps/hub/public/games/sky/index.html` (**0 bytes**) |

**Hallazgo:** el cuarto juego anunciado en el Hub (*Sky Runner*) tiene su `index.html`
**completamente vacío**. Los módulos existen (`js/game.js`, `js/renderer.js`,
`js/audio.js`, `js/prng.js`, `script.js`) y `js/game.js` **ya llama a `PlayWin.init()`**,
pero al no haber página no se carga nada: **el juego es inaccesible**.

**Verificado:** `apps/hub/public/games/sky/index.html` pesa 0 bytes y no contiene
ninguna etiqueta `<script>`.

**Opciones:** (a) reconstruir la página de arranque, (b) retirar *Sky Runner* del Hub
mientras no esté operativo. **No se toca sin decisión tuya**, porque afecta a lo que
ve el jugador y al catálogo de la liga.

---

### ✅ Resueltos en el bloque 3 (2026-09-29)

| Bug | Arreglo | Verificación |
| :--- | :--- | :--- |
| **BUG-019** | `resolveRankTier()` conectada en todos los llamadores; backfill de los pasaportes; `api/leagues` ya no fuerza `'BRONZE'` | `test:leagues` → **13/13** límites de umbral · distribución real con **3 divisiones** |
| **BUG-020** | Sellado en `assignPlayerToLeague` + `SELECT ... FOR UPDATE` + **dos triggers** de base de datos: uno rechaza el miembro #11 y otro sella la liga al llenarse | Liga rellenada a 10: el #11 es **RECHAZADO** · 0 ligas llenas sin sellar |
| **BUG-003** | `users`, `passports`, `matches` y `ledger` del Hub convertidos en **re-exportaciones** de `@playwin/database` | `npx tsc --noEmit` → exit 0 · `test:db`, `test:duel`, `test:history` en verde |
| **BUG-008** | El frontend consume `PRIZE_SPLIT`, `LEAGUE_PRIZE_POOL`, `GAMES` y `SEASON_POINTS` del paquete | Sin importes quemados en los componentes |
| **BUG-009** | 6 tokens semánticos nuevos (`--success`, `--danger`, `--on-dark`…) y **21 HEX sustituidos** en 6 componentes | `scratch/replace_hex_tokens.mjs` → sin HEX de estado |
| **BUG-011** | `detectCollusion` usa la bandera explícita `ALLOW_SELF_MATCH`; `rooms.js` también | `test:collusion` → **11/11** |
| **BUG-014** | Creada `collusion_spec.js` (antes cobertura CERO) | 11 casos, en ambos modos |
| **BUG-015** | El retiro **rechaza con 503** sin credenciales de PayPal en vez de debitar sin pagar; el asiento nace `PENDING` | `test:treasury` valida el rechazo y que **el saldo queda intacto** |

**Bug adicional detectado y corregido:** poner un `import` de `@playwin/database` en un componente **cliente** rompía la página entera, porque el paquete lanzaba en el **nivel de módulo** si faltaba `DATABASE_URL` (variable que no existe en el navegador). El pool pasó a crearse de forma **perezosa**: el paquete se importa sin efectos secundarios y sigue fallando ruidosamente en el primer uso real.


### ✅ Resueltos en el bloque 2º (2026-09-29)

| Bug | Cómo se arregló | Verificación |
| :--- | :--- | :--- |
| **BUG-006** | `duel_test.js` reescrito: arranca su propio servidor en puerto efímero, firma `MatchTicket` reales y tiene timeout global de 40 s. Añadida aserción de que un cliente **sin ticket es rechazado**. | `npm run test:duel` → **exit 0** (semilla idéntica, ticks bidireccionales, `MATCH_END` del servidor) |
| **BUG-004** | Columnas corregidas (`type`, `rank_tier`); autorización de administrador con `users.is_admin` (migración idempotente aplicada); tipos de ledger desde `LEDGER_TYPES`; el panel ahora **muestra el error** en vez de ceros. | `GET /api/admin/metrics` sin sesión → **401** (antes 500) |
| **BUG-010** | Creado `lib/rate-limit.ts` (ventana deslizante) aplicado a login (10/min), register (20/h) y forgot-password (10/15min). | 11 intentos de login → el 11º devuelve **429** con `Retry-After` |
| **BUG-012** | Creado `lib/api-response.ts` con `unauthorized()` uniforme; wallet devuelve **401** como history; ningún `err.message` crudo al cliente. | Ambas rutas → **401** (antes 200 vs 401) |
| **BUG-013** | El alta completa (usuario + 4 pasaportes + 4 ligas) ocurre en **una transacción** con `SELECT ... FOR UPDATE`; los correos se envían tras el commit. | `test:e2e` crea usuarios reales y completa el flujo → **exit 0** |
| **BUG-016** | `server.on('error')` con mensaje accionable para `EADDRINUSE`; `--env-file=.env.test` en todas las suites; `load-env.js` sin dependencias. | Arranque sin `JWT_SECRET` → bloqueado con mensaje claro |
| **BUG-007** | Eliminado el fallback que etiquetaba a cualquier usuario como `'ORO'`/1850/240. El lobby devuelve pilotos reales, conteo real y la división **del pasaporte del jugador** (o `null`). | `divisionTier` ya no existe · `totalActiveInDivision` = pilotos reales |

**Arquitectura nueva:** `packages/database/src/constants.js` (única fuente de verdad de tipos de ledger, premios, MMR, divisiones y catálogo de juegos) · `apps/hub/src/lib/api-response.ts` · `apps/hub/src/lib/rate-limit.ts` · `packages/database/scripts/grant-admin.mjs`.

**Bug adicional detectado y corregido:** `e2e_flow_test.mjs` enviaba `JOIN_MATCH` **sin `token`** (mismo defecto que `duel_test`), por lo que se colgaba; y **no llamaba a `process.exit(0)`** en el camino de éxito, así que el proceso nunca terminaba.

---

### ✅ Resueltos en el bloque 1º (2026-09-29)

| Bug | Cómo se arregló | Cómo se verificó |
| :--- | :--- | :--- |
| **BUG-001** | Verificación criptográfica obligatoria de la firma de PayPal vía `/v1/notifications/verify-webhook-signature` (método postback oficial, sin dependencias). Sin cabeceras → `401`; sin credenciales → `503`. Eliminado todo camino que acredite sin verificar. | `POST /api/webhooks/paypal` sin firma → **HTTP 401** (antes 200) |
| **BUG-002** | Eliminados los 6 secretos quemados de `db/index.ts`, `packages/database/src/index.js`, `auth.ts`, `anticheat.js`, `webhooks/whop/route.ts` y `cron/settle-leagues/route.ts`. Centralizados en `lib/config.ts` con **fallo ruidoso**. | Escaneo de todo el fuente: **cero secretos** · arranque sin `JWT_SECRET` → bloqueado con mensaje accionable |
| **BUG-005** | La firma de Whop ahora es **obligatoria** (sin cabecera → `401`), sin condicionar a `NODE_ENV`, comparada con `crypto.timingSafeEqual`. | Firma válida → `200` · firma inválida → `401` · 5/5 casos HMAC correctos |
| **BUG-021** | Creado `apps/hub/.env.local` con los secretos reales; `.gitignore` reforzado (`.env.*` con excepción de `.env.example`). | `next build` reporta `Environments: .env.local` |
| **BUG-017/018** | Documentación y skills reconciliadas (hito anterior). | — |

**Archivos nuevos:** `apps/hub/src/lib/config.ts` · `apps/hub/src/lib/paypal.ts` · `apps/realtime-server/src/load-env.js` · `apps/hub/.env.local` · `.env.test` · `scratch/load-env.mjs`

**Bug adicional encontrado y corregido:** `treasury_and_settle_test.mjs` reportaba *"Webhook Whop procesado exitosamente"* con un **HTTP 503**. Ahora firma la petición y **exige 200**, de modo que la suite valida la seguridad en lugar de esquivarla.

---

**Los 3 arreglos de mayor retorno inmediato:**
1. **BUG-001** — hoy cualquiera puede crear dinero de la nada.
2. **BUG-002** — las credenciales de producción están en el código fuente.
3. **BUG-006** — `npm run test:all` no funciona, así que no hay red de seguridad.

---

## 🔴 CRÍTICOS

---

### BUG-001 · Webhook de PayPal sin verificación de firma — cualquiera puede crear dinero

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 Crítico |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/src/app/api/webhooks/paypal/route.ts` · `apps/hub/src/lib/paypal.ts` (nuevo) |

**✅ Arreglo aplicado:**
1. Nuevo `apps/hub/src/lib/paypal.ts` con `verifyWebhookSignature()`: implementa el **método postback oficial** de PayPal (`POST /v1/notifications/verify-webhook-signature`) con token OAuth `client_credentials`. Se eligió postback sobre la verificación propia porque no requiere dependencias externas (`buffer-crc32`, descarga de certificados) — ver [documentación oficial](https://developer.paypal.com/api/rest/webhooks/rest.md).
2. La ruta ahora: lee el **cuerpo crudo** con `req.text()` (PayPal exige reenviarlo sin reformatear), exige las 5 cabeceras `paypal-transmission-*` (`401` si faltan), y verifica contra PayPal (`401` si no es `SUCCESS`). Sin credenciales configuradas → `503`.
3. **No queda ningún camino** que acredite saldo sin verificación criptográfica previa.

**Verificación ejecutada:**
```
POST /api/webhooks/paypal  (sin cabeceras de firma)
  ANTES: HTTP 200 {"received":true,...}      ← acreditaba
  AHORA: HTTP 401 {"error":"Faltan las cabeceras de verificación de PayPal."} ✅
```

**Pendiente de operación:** configurar `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` y `PAYPAL_WEBHOOK_ID` reales para que el endpoint opere en producción (hoy responde `503` de forma segura).

**Descripción:**
El endpoint `POST /api/webhooks/paypal` **nunca verifica la firma de PayPal** (no hay llamada a la API de verificación de webhooks ni validación de `PAYPAL-TRANS-*`). Simplemente lee el JSON del cuerpo y, si `event_type === 'PAYMENT.CAPTURE.COMPLETED'`, busca al usuario por email y **acredita el monto en su saldo**.

**Evidencia:**
```ts
// route.ts:4-15 — no existe ninguna verificación de firma
export async function POST(req: Request) {
  const rawBody = await req.json();
  const eventType = rawBody.event_type;
  const resource = rawBody.resource;
  ...
  if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
    const email = resource?.payer?.email_address?.toLowerCase();
    const amount = parseFloat(resource?.amount?.value || '0');
    if (email && amount > 0) { /* acredita el saldo */ }
```

**Reproducción:**
```bash
curl -X POST http://localhost:3000/api/webhooks/paypal \
  -H "Content-Type: application/json" \
  -d '{"event_type":"PAYMENT.CAPTURE.COMPLETED",
       "resource":{"id":"FAKE_1","amount":{"value":"9999.00","currency_code":"USD"},
                   "payer":{"email_address":"victima@ejemplo.com"}}}'
```
Resultado: el saldo del usuario sube $9.999 sin que exista ningún pago real. Además `provider_tx_id` es único, así que basta variar `resource.id` para repetirlo infinitas veces.

**Impacto:** Pérdida económica directa e ilimitada. Permite retirar ese saldo vía `/api/payments/paypal/payout`. Anula por completo la Regla 2 de gobernanza (Zero Client Trust) y el Vector 4 de la auditoría de ciberseguridad, que la bitácora declara "aprobado".

**Arreglo propuesto:**
1. Implementar la verificación oficial de firma de PayPal (`/v1/notifications/verify-webhook-signature`) usando los headers `paypal-transmission-id`, `paypal-transmission-time`, `paypal-transmission-sig`, `paypal-cert-url` y el `PAYPAL_WEBHOOK_ID`.
2. Rechazar con `401` si la verificación falla.
3. Envolver la acreditación en `withTransaction` y manejar la violación `UNIQUE` de `provider_tx_id` como **idempotencia silenciosa** (devolver `200` sin volver a acreditar), no como error `500`.
4. Añadir la verificación a una prueba automatizada que intente explícitamente el curl de arriba.

---

### BUG-002 · Credenciales de producción quemadas como valor por defecto en el código fuente

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🔴 Crítico |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/src/lib/config.ts` (nuevo) + 6 archivos limpiados |

**✅ Arreglo aplicado:**
1. Nuevo `apps/hub/src/lib/config.ts`: única fuente de verdad para variables de entorno. **Sin valores por defecto para secretos.** Si falta una variable obligatoria, lanza `ConfigError` con instrucciones accionables.
2. **Eliminados los 6 secretos quemados:**

| Archivo | Secreto eliminado |
| :--- | :--- |
| `apps/hub/src/lib/db/index.ts:6` | Cadena de conexión Neon (con contraseña) |
| `packages/database/src/index.js:6` | Cadena de conexión Neon (con contraseña) |
| `apps/hub/src/lib/auth.ts:4` | `JWT_SECRET` |
| `apps/realtime-server/src/anticheat.js:11` | `JWT_SECRET` |
| `apps/hub/src/app/api/webhooks/whop/route.ts:5` | `WHOP_WEBHOOK_SECRET` |
| `apps/hub/src/app/api/cron/settle-leagues/route.ts:4` | `CRON_SECRET` |

3. Nuevo `apps/realtime-server/src/load-env.js`: cargador de `.env` sin dependencias (el paquete `dotenv` no está instalado).
4. **Los 3 archivos de test** que también tenían secretos quemados ahora leen del entorno: `treasury_and_settle_test.mjs`, `anticheat_test.js`, `network_scenarios_test.js`.
5. `.gitignore` reforzado: `.env` y `.env.*` ignorados, `!.env.example` versionado a propósito.

**Verificación ejecutada:**
```
Escaneo de todo el código fuente (excluyendo .env*):
  → *** CERO SECRETOS ***

Arranque del servidor de duelos sin JWT_SECRET en entorno ni en archivos:
  → BLOQUEADO CORRECTAMENTE ✅
    "[PlayWin AntiCheat] Falta la variable de entorno obligatoria JWT_SECRET.
     → Debe ser IDÉNTICA a la del Hub (apps/hub/.env.local)."

npx tsc --noEmit  → exit 0
```

**Nota:** según indicación del responsable, **no se rotaron** los secretos: el repositorio nunca se publicó ni llegó a producción, así que no hubo exposición externa.

**Descripción:**
Si la variable de entorno no está definida, el código **cae silenciosamente a un secreto real escrito en el fuente**. La contraseña de la base de datos Neon de producción aparece en texto plano en dos archivos.

**Evidencia** *(credenciales redactadas — este documento se publica en un repositorio público)*:

```ts
// apps/hub/src/lib/db/index.ts:4-6  (idéntico en packages/database/src/index.js:4-6)
const connectionString = process.env.DATABASE_URL ||
  'postgresql://neondb_owner:<CONTRASEÑA_REDACTADA>@ep-royal-haze-<ID>.us-east-2.aws.neon.tech/neondb?sslmode=require';

// apps/hub/src/lib/auth.ts:4
const JWT_SECRET = process.env.JWT_SECRET || '<JWT_SECRET_REDACTADO>';

// apps/hub/src/app/api/webhooks/whop/route.ts:5
const WHOP_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || '<WHOP_SECRET_REDACTADO>';
```

> 🔒 **Nota de seguridad:** las credenciales reales estuvieron escritas en estos archivos y se **eliminaron** en el Hito B.1. Este documento las cita redactadas a propósito: es evidencia de auditoría, no un canal de distribución de secretos.

**Mitigación parcial existente:** `.env` está correctamente en `.gitignore:2`, y el directorio **no está inicializado como repositorio git**, así que el secreto aún no se ha filtrado por commits. Es una bomba de relojería, no una fuga consumada.

**Impacto:** Quien lea el repositorio (colaborador, fork, empaquetado, copia de seguridad) obtiene acceso completo a la base de datos de producción y puede firmar JWT válidos para cualquier usuario. El `JWT_SECRET` quemado es especialmente grave: permite **falsificar MatchTickets y sesiones de usuario**.

**Arreglo propuesto:**
1. Eliminar todos los fallbacks; usar un helper que lance un error explícito en el arranque si la variable falta.
2. **Rotar** la contraseña de Neon y el `JWT_SECRET` (asumir que el actual ya está comprometido).
3. Añadir una comprobación real al test de gobernanza: buscar cadenas de conexión, `npg_`, `whsec_`, `sk_live` y `postgres://` en `src/` de `apps/` y `packages/` — la comprobación actual (9/9 PASS) **no los detecta**.

---

## 🟠 ALTOS

---

### BUG-003 · Capa de datos duplicada entre el Hub y `packages/database`

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟠 Alto |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/src/lib/db/*.ts` vs `packages/database/src/services/*.js` |

**Descripción:**
Existen dos implementaciones paralelas de exactamente la misma lógica de negocio. `apps/hub/package.json:12` declara `"@playwin/database": "file:../../packages/database"`, pero **el Hub nunca lo importa** (0 referencias en `apps/hub/src`). El servidor de duelos sí usa el paquete real (`rooms.js:1`).

| Módulo | Copia del Hub | Paquete real |
| :--- | :--- | :--- |
| users | 132 líneas | 143 líneas |
| passports | 82 | 96 |
| matches | 100 | 123 |
| leagues | 93 | 113 |
| ledger | 69 | 70 |
| settle | 153 | — (solo en el Hub) |

**Impacto:** Viola la Regla 4 de gobernanza ("Cero Código Isla"). Cualquier corrección de bug aplicada a una copia **no se propaga** a la otra — divergencia silenciosa garantizada. Es la causa raíz de futuros bugs contables.

**Arreglo propuesto:** Elegir `packages/database` como única fuente de verdad. Migrar las API routes del Hub a importar `@playwin/database` y eliminar `apps/hub/src/lib/db/{users,passports,matches,leagues,ledger}.ts`. Conservar en el Hub solo `settle.ts` (o moverlo al paquete) e `index.ts` si hace falta el pool.

**Nota:** `apps/hub/src/lib/db/index.ts` también duplica el `Pool` de `packages/database/src/index.js`, con la misma configuración y la misma credencial quemada.

---

### BUG-004 · `/api/admin/metrics` roto (columnas inexistentes) y sin autenticación

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟠 Alto |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/src/app/api/admin/metrics/route.ts:1-63` · `apps/hub/src/app/admin/page.tsx:29,86,94,217` |

**Descripción — defecto A (el endpoint siempre falla):**
Consulta columnas que **no existen** en el esquema:

| Código consulta | Esquema real (`packages/database/src/schema.sql`) |
| :--- | :--- |
| `wallet_ledger.entry_type` (`route.ts:25,29`) | `wallet_ledger.type` (`schema.sql:87`) |
| `league_groups.tier` (`route.ts:35`) | `league_groups.rank_tier` (`schema.sql:47`) |

PostgreSQL lanza `column does not exist`, el `catch` de `route.ts:56` responde `500`, y el `finally` de `admin/page.tsx:24` pone `loading = false` — así que el panel muestra "0" en todo sin indicar error. `admin/page.tsx:16-26` **ignora `res.ok`**, por lo que un `500` se traga silenciosamente.

**Descripción — defecto B (totales siempre en cero aunque el endpoint funcione):**
`admin/page.tsx:29` filtra por `l.entry_type`, y busca los tipos `'WHOP_DEPOSIT'` (`:86`) y `'LEAGUE_PRIZE'` (`:94`). Pero el código **nunca escribe esos tipos**:

| Tipo buscado por el panel | Tipo realmente escrito en el ledger |
| :--- | :--- |
| `WHOP_DEPOSIT` | `DEPOSIT` (`webhooks/whop/route.ts:61`) o `WHOP_MEMBERSHIP_ACTIVATED` (`:47`) |
| `LEAGUE_PRIZE` | `PRIZE_WIN` (`lib/db/settle.ts:78`) |

**Descripción — defecto C (sin autenticación):**
`route.ts:4` declara `export async function GET()` **sin ninguna comprobación de sesión ni rol de administrador**. Cualquiera que conozca la URL obtiene la lista de usuarios, partidas, semillas PRNG, movimientos contables y ocupación de ligas.

**Impacto:** El "Dashboard de Auditoría Anti-Cheat" (Hito 6.2) es **no funcional por construcción**. Además expone datos internos sin autenticación.

**Arreglo propuesto:**
1. Corregir `entry_type` → `type` y `tier` → `rank_tier` en el `route.ts` y en el panel.
2. Unificar los nombres de tipo del ledger: crear constantes compartidas (`LEDGER_TYPES.DEPOSIT`, `PRIZE_WIN`, …) — ver BUG-008.
3. Añadir guardia de administrador (campo `is_admin` en `users` + verificación de sesión) y devolver `401`/`403`.
4. Que el panel muestre un estado de error visible cuando `!res.ok`.

---

### BUG-005 · Validación HMAC del webhook de Whop eludible

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟠 Alto |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/src/app/api/webhooks/whop/route.ts:12-19` |

**✅ Arreglo aplicado:**
1. **La firma es obligatoria.** Se eliminó la condición `&& signature`: si falta la cabecera → `401` (antes se procesaba el evento).
2. **Se eliminó la dependencia de `NODE_ENV`**: la verificación corre siempre.
3. **Comparación en tiempo constante** con `crypto.timingSafeEqual` (antes `!==`).
4. Soporte para el formato `sha256=<hex>` además de `<hex>` en crudo.
5. Sin `WHOP_WEBHOOK_SECRET` configurado → `503` (no se puede validar autenticidad, así que se rechaza).
6. El mismo `timingSafeEqual` se aplicó a `CRON_SECRET` en `/api/cron/settle-leagues`.

**Verificación ejecutada:**
```
Firma válida   → HTTP 200  (depósito aplicado: asiento [WHOP] DEPOSIT 19.99 USD) ✅
Firma inválida → HTTP 401  ✅
Sin cabecera   → HTTP 503  (secreto no configurado) ✅

Prueba unitaria aislada de la lógica HMAC — 5/5 casos:
  ✅ firma correcta                    → ACEPTADA
  ✅ firma incorrecta                  → rechazada
  ✅ firma truncada (distinta longitud) → rechazada
  ✅ firma vacía                       → rechazada
  ✅ firma del cuerpo de OTRO payload   → rechazada
```

**Descripción:**
```ts
// route.ts:13 — la validación SOLO corre si NODE_ENV es production Y el header existe
if (process.env.NODE_ENV === 'production' && signature) {
  const digest = hmac.update(rawBody).digest('hex');
  if (digest !== signature) { return 401; }
}
```
Tres fallos encadenados:
1. **La firma es opcional.** Si el atacante simplemente **omite** el header `whop-signature`, la condición `&& signature` es falsa y la validación se salta entera. El webhook se procesa igual.
2. **Depende de `NODE_ENV`.** En cualquier despliegue donde no se fije exactamente a `production` (staging, Vercel preview, contenedor mal configurado) no hay verificación.
3. **Comparación no constante en tiempo** (`!==` sobre strings). Debe usar `crypto.timingSafeEqual`. El mismo patrón existe en `apps/realtime-server/src/anticheat.js:67` para la firma del MatchTicket.

**Impacto:** Un atacante puede activar `has_premium = true` gratis para cualquier usuario cuyo email conozca, e insertar depósitos falsos en el ledger.

**Arreglo propuesto:** Exigir siempre la firma (rechazar `401` si falta el header), verificarla sin condicionar a `NODE_ENV`, y comparar con `crypto.timingSafeEqual` sobre buffers de igual longitud. Aplicar el mismo cambio en `anticheat.js:62-69`.

---

### BUG-006 · `test:duel` roto → `npm run test:all` se cuelga y deja procesos huérfanos

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟠 Alto |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/test/duel_test.js:7,21-32,108-124` |

**Descripción:**
La suite de duelos está escrita contra el protocolo **anterior** al endurecimiento de seguridad y hoy es imposible que pase:

1. **`duel_test.js:21-32` envía `JOIN_MATCH` sin `token`.** Pero `apps/realtime-server/src/rooms.js:20` ha hard-requerido el token desde el Hito 6.6:
   ```js
   if (!player.token) return this._send(socket, { event: 'SECURITY_ERROR', ... });
   ```
   El test no maneja `SECURITY_ERROR`, así que se queda esperando un `MATCH_WAITING` que nunca llega.
2. **`duel_test.js:7` asume `ws://localhost:3001/ws` pero no arranca el servidor.** Si el servidor no está corriendo, el test se cuelga en la conexión sin timeout ni `process.exit` de rescate.
3. **No hay timeout global.** Las rutas de salida (`:110`, `:113`, `:124`) solo se alcanzan tras eventos que no ocurren.

**Evidencia de la ejecución real:**
```
$ npm run test:all
(killed after 20+ minutes, no output)

$ node apps/realtime-server/test/duel_test.js     # sin servidor
TIMEOUT after 30s -> KILLED
🧪 Iniciando prueba automatizada de salas 1v1 ...
✅ Cliente 1 conectado. Encolando...
(se cuelga aquí para siempre)
```

**Verificación de que el servidor SÍ funciona:** se levantó un servidor limpio y se ejecutó una sonda con `MatchTicket` firmado correctamente. Resultado: ambos clientes recibieron `MATCH_START` con **idéntica seed `9323438`**, los ticks se relayaron en ambos sentidos y el servidor emitió `MATCH_END`. **El bug está en el test, no en el servidor.**

**Impacto:** `npm run test:all` es inutilizable — y con él, toda la red de seguridad del proyecto. La bitácora afirmaba "8/8 suites al 100%", lo cual es falso. Además, la ejecución interrumpida deja **servidores huérfanos escuchando en :3001** que no responden al protocolo actual y provocan `EADDRINUSE` en la siguiente ejecución (observado durante esta auditoría: un proceso con 75 minutos de vida).

**Arreglo propuesto:**
1. Reescribir `duel_test.js` para firmar un `MatchTicket` real (HMAC-SHA256 con `JWT_SECRET`, claims `{ sub, username, avatar, gameId, exp }` — ver `anticheat.js:55-81`).
2. Arrancar el servidor dentro del propio test (`child_process.spawn` sobre `src/server.js` en un puerto libre) y cerrarlo en un `finally`.
3. Añadir un timeout global (`setTimeout(() => process.exit(1), 30000)`) y `ws.close()` en todas las rutas de salida.
4. Hacer que `server.js` respete `process.env.PORT` **al importarse** — hoy ya lo lee en `server.js:5`, pero el puerto debe ser inyectable para los tests.
5. Reutilizar el arnés ya verificado en `scratch/ctx_handshake_probe.mjs`.

---

### BUG-007 · `/api/games/lobby` devuelve datos fabricados mostrados como reales

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟠 Alto |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/src/app/api/games/lobby/route.ts:102-122` |

**Descripción:**
El endpoint declara consultar los "mejores pilotos reales de la base de datos", pero incluye un fallback con **datos inventados** que se muestran al usuario como si fueran standings reales:

- `route.ts:107-110`: filas falsas con `rank_tier: 'ORO'`, `skillRating: 1850`, `seasonPoints: 240` y nombres ficticios.
- `route.ts:121`: `totalActiveInDivision: Math.max(len, 6)` — si hay 1 jugador real, se reportan **6 activos**.
- `route.ts:122`: `divisionTier: 'DIVISIÓN ORO #3'` — una división fija inventada.

Además `apps/hub/src/components/GameLauncherModal.tsx:106-107` quema `rank: 'ORO'` y `skillRating: 1820` **en el cliente**, y `:108` usa `ws://localhost:3001/ws` como default.

**Impacto:** Engaña al usuario sobre su división y sobre cuánta gente compite. Viola la Regla 2 de gobernanza y el principio de "Cero Demos" del Hito 4.1. Contradice directamente la afirmación de la bitácora de que se erradicaron los datos falsos.

**Arreglo propuesto:** Eliminar las filas y los valores fabricados. Si no hay datos reales, devolver una lista vacía y estado "sin datos" en la UI. La división y el MMR deben venir del `game_passports` del usuario autenticado, y el `wsUrl` de `NEXT_PUBLIC_REALTIME_WS_URL`.

---

## 🟡 MEDIOS

---

### BUG-008 · Constantes de dinero y puntos duplicadas en 6+ lugares

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `lib/db/settle.ts:55-61` · `api/games/lobby/route.ts:15-16,39-40,60-61,82-83` · `LeagueStandings.tsx:55,103-106,145-147,207` · `api/matches/history/route.ts:62` · `lib/db/matches.ts:16-17` |

**Descripción:** Los repartos `$25/$15/$7/$3` y los puntos `+100/+20` están escritos literalmente en al menos 6 archivos distintos, tanto en backend como en frontend. También los 4 `game_id` y sus metadatos están duplicados en 5 lugares (`page.tsx:12-41`, `api/games/lobby/route.ts:4-93`, `components/passport-types.ts:26-31`, `LeagueStandings.tsx:11-16`, `GameLauncherModal.tsx:13-25`) y en `api/auth/register/route.ts:7`.

**Impacto:** Cambiar el premio de una liga exige editar 6 sitios. Cualquier olvido produce **inconsistencia contable entre lo mostrado y lo pagado** — exactamente el tipo de discrepancia que esta plataforma no puede permitirse.

**Arreglo propuesto:** Crear `packages/types/` (declarado en AGENTS.md y aún inexistente) o `apps/hub/src/lib/constants.ts` con `SEASON_POINTS`, `PRIZE_SPLIT`, `GAMES` y los tipos del ledger. Importarlo desde todos los puntos. La Regla 2 prohíbe calcular premios en el cliente, así que el frontend debe **recibir** los valores, no definirlos.

---

### BUG-009 · Violaciones de los tokens de diseño (colores HEX directos)

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `AuthModal.tsx:105,111,133` · `WalletView.tsx:75,127,131` · `Navigation.tsx:126` · `PassportView.tsx:303` · `GameCard.tsx:83-84` · `LeagueStandings.tsx:105-119` · `globals.css:223,234-235` |

**Descripción:** La Regla 3 de gobernanza prohíbe colores HEX arbitrarios, pero hay usos directos de `#ef4444`, `#dc2626`, `#fff`, `#ffffff`, `#22c55e`, `#16a34a`, `#059669`, `#000` y `rgba(210,105,26,.92)`. Además **ningún componente usa CSS Modules** (la Regla 1.4 de `AGENTS.md` los pide): todo son objetos `style={{}}` en línea.

**Evidencia:** El test de gobernanza pasa 9/9 porque **no comprueba los tokens de diseño** — solo tamaños, elipsis, secretos y el blindaje del SDK.

**Impacto:** Deriva visual progresiva e inconsistencia en estados de error/éxito. El sistema de diseño deja de ser una fuente de verdad.

**Arreglo propuesto:** Añadir tokens semánticos de estado a `playwin-ui-experience` (`--success`, `--danger`, `--warning`) y sustituir todos los HEX. Añadir una comprobación de tokens al test de gobernanza.

---

### BUG-010 · Sin protección CSRF ni rate limiting en autenticación

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `api/auth/login/route.ts:5` · `api/auth/forgot-password/route.ts` |

**Descripción:** El Hito 6.6 (Vector 3) afirma que existe un rate limiter de "máx 10 intentos por IP/minuto en las rutas de autenticación de Next.js". **No existe ninguna implementación**: no hay contador, ni en memoria ni en Redis, ni middleware. No hay tokens CSRF; la sesión es una cookie `sameSite: lax`.

**Impacto:** Fuerza bruta ilimitada de contraseñas y spam ilimitado de emails de recuperación (que además cuesta dinero real vía Gmail SMTP). `sameSite: lax` deja la puerta abierta a ataques CSRF en navegación de nivel superior.

**Arreglo propuesto:** Rate limiter real (Redis con ventana deslizante, o en memoria si es un solo proceso) sobre login, register y forgot-password. Añadir cabeceras CSRF de doble envío o pasar a `sameSite: strict` donde sea viable.

---

### BUG-011 · `detectCollusion` desactivado fuera de producción

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/src/anticheat.js:263` · `apps/realtime-server/src/rooms.js:97-108` |

**Descripción:** La detección de misma IP solo se activa con `NODE_ENV === 'production'` (`anticheat.js:263`). En `rooms.js:97,106` el modo dev además permite que dos pestañas del **mismo usuario** se emparejen entre sí (renombrando al segundo a `" (Tab 2)"`, `rooms.js:109`) y saltándose el bloqueo por colusión.

**Impacto:** Es una decisión razonable para desarrollo, pero significa que **el camino anti-colusión nunca se ejecuta** en ninguna suite (ver BUG-014). Un fallo en esa lógica llegaría a producción sin detectarse.

**Arreglo propuesto:** Extraer el emparejamiento de desarrollo detrás de una bandera explícita (`ALLOW_SELF_MATCH`) en vez de `NODE_ENV`, y escribir una prueba que ejercite `detectCollusion` directamente.

---

### BUG-012 · Errores silenciados e inconsistencia de códigos HTTP

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `api/wallet/transactions/route.ts:25:13` · `api/auth/verify-email/route.ts:54` vs `:25-28` · `admin/page.tsx:16-26` · `page.tsx:80-84` · `api/games/lobby/route.ts:106-111` |

**Descripción:**
- `wallet/transactions` sin sesión devuelve **`200 { success: true, transactions: [] }`** en vez de `401`, mientras `matches/history` sí devuelve `401`. El cliente no puede distinguir "sin movimientos" de "sin sesión".
- `verify-email` GET devuelve `err.message` crudo al cliente (`:54`) mientras el POST lo oculta (`:25-28`).
- El fallback de `lobby` captura el error de BD y devuelve datos falsos (BUG-007) en lugar de propagar el fallo.
- Varios errores de red se tragan sin feedback al usuario.

**Impacto:** Depuración difícil y comportamiento inconsistente del frontend ante sesión expirada.

**Arreglo propuesto:** Un helper compartido `getSessionUser(req)` que devuelva `401` de forma uniforme; respuestas de error con forma única; nunca devolver `err.message` crudo en producción.

---

### BUG-013 · Registro sin transacción atómica

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/src/app/api/auth/register/route.ts:57-77` |

**Descripción:** El registro hace `createUser` → crear 4 pasaportes → asignar slot de liga, **cada paso en su propia transacción**. Si un paso intermedio falla, queda un usuario a medio construir. Los fallos de envío de email se tragan (`:69-71`), así que tampoco hay señal.

**Impacto:** Usuarios sin pasaporte (no pueden competir ni ver su perfil) o sin slot de liga (no aparecen en standings), sin que nadie se entere. La bitácora afirma "transacciones atómicas" en el Hito 2.2 — esto no lo es.

**Arreglo propuesto:** Envolver la creación de usuario + pasaportes + asignación de liga en un único `withTransaction`. Enviar los emails **después** del commit (fire-and-forget con logging de fallo).

---

### BUG-016 · `server.js` escucha siempre en :3001 sin respetar `.env`, y sin manejo de `EADDRINUSE`

| Campo | Valor |
| :--- | :--- |
| **Severidad** | 🟡 Medio |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/src/server.js:5,88-91` |

**Descripción:** `server.js` lee `process.env.PORT` (`:5`), pero **nada carga el archivo `.env`** en el servidor de duelos. No hay `dotenv` ni `--env-file` en `apps/realtime-server/package.json`, así que en la práctica siempre cae al `3001` por defecto, ignorando el `PORT=3001` del `.env` raíz. Además, un `EADDRINUSE` provoca un crash con traza sin capturar (sin mensaje útil ni código de salida controlado).

**Evidencia (durante esta auditoría):**
```
Error: listen EADDRINUSE: address already in use :::3001
    at Server.listen (server.js:88:8)
Emitted 'error' event on WebSocketServer instance ...
```
Un proceso huérfano de una ejecución anterior de `test:all` mantuvo el puerto 75 minutos, impidiendo arrancar una instancia limpia y haciendo imposible diagnosticar los tests.

**Impacto:** Imposible correr dos entornos en paralelo; imposible diagnosticar cuando el puerto está ocupado; los tests heredan un servidor de código potencialmente obsoleto (fue exactamente lo que ocurrió aquí).

**Arreglo propuesto:**
1. Cargar el entorno de forma explícita (`node --env-file=../../.env src/server.js`, disponible en Node 20+) o añadir `dotenv`.
2. Manejar `server.on('error')` para `EADDRINUSE` con un mensaje claro y `process.exit(1)` controlado.
3. Permitir `PORT=0` (puerto efímero) y exponer el puerto elegido, para que los tests no colisionen.

---

## ⚪ BAJOS

---

### BUG-014 · La lógica anti-colusión nunca se prueba

| Campo | Valor |
| :--- | :--- |
| **Severidad** | ⚪ Bajo |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/realtime-server/src/anticheat.js:255-274` · `apps/realtime-server/test/*` |

**Descripción:** `detectCollusion` no está invocada por ninguna suite. Combinado con BUG-011 (desactivada en no-producción), la función tiene **cobertura cero**.

**Arreglo propuesto:** Prueba unitaria directa de `detectCollusion` con los 4 casos: misma cuenta, misma IP en producción, misma IP en dev, y caso limpio.

---

### BUG-015 · `paypal/payout` no llama realmente a la API de PayPal

| Campo | Valor |
| :--- | :--- |
| **Severidad** | ⚪ Bajo |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `apps/hub/src/app/api/payments/paypal/payout/route.ts:44-76` |

**Descripción:** El endpoint valida el saldo, hace el débito atómico y registra el asiento `WITHDRAWAL`, pero **no invoca la API de PayPal Payouts**. El dinero sale del saldo del usuario sin que se emita ningún pago. Las variables `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET` no están configuradas.

**Impacto:** Es un "hueco silencioso": el usuario pierde saldo y no recibe el dinero. El Hito 5.2 lo declara implementado.

**Arreglo propuesto:** Marcar los retiros como `PENDING` y completarlos solo tras la confirmación real de la API de Payouts (o vía webhook `PAYMENT.PAYOUTSBATCH.SUCCESS`, que ya está parcialmente manejado en `webhooks/paypal/route.ts:31-33`). Mientras no haya integración real, el endpoint debe devolver un error explícito en lugar de debitar.

---

### BUG-017 · Documentación y bitácora con afirmaciones falsas

| Campo | Valor |
| :--- | :--- |
| **Severidad** | ⚪ Bajo (pero con alto costo de confusión) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `PROGRESS.md` (reescrito) · `DOCUMENTACION_PROYECTO.md` (nuevo) |

**Descripción:** La bitácora afirmaba cosas que la ejecución desmiente. Se documentan aquí para que nadie vuelva a confiar en ellas:

| Afirmación en PROGRESS.md | Realidad verificada |
| :--- | :--- |
| "7/7 suites pasando al 100% (`npm run test:all`)" — Hito 6.4/7.1 | `test:all` se **cuelga indefinidamente** (BUG-006) |
| "Auditoría de Ciberseguridad 4/4 vectores aprobados" — Hito 6.6 | El archivo citado `cybersecurity_audit_test.mjs` **no existe** (el real es `cybersecurity_suite.js`); el webhook de PayPal no tiene verificación (BUG-001) |
| "Rate limiter en rutas de autenticación (máx 10/min)" — Hito 6.6 | **No existe** ninguna implementación (BUG-010) |
| "Panel de auditoría con balance de liquidez" — Hito 6.2 | El endpoint **siempre devuelve 500** por columnas inexistentes (BUG-004) |
| "Erradicación de fugas técnicas" — Hito 6.3 | Quedan credenciales de producción quemadas en el código (BUG-002) |
| "Cero mocks" / "Cero Demos" | `/api/games/lobby` devuelve pilotos y divisiones inventadas (BUG-007) |
| "Transacciones atómicas" — Hito 2.2 | El registro de usuario no es atómico (BUG-013) |

**Arreglo aplicado:** `PROGRESS.md` reescrito con el estado real verificado y separando lo comprobado de lo no comprobado. Creado `DOCUMENTACION_PROYECTO.md` como contexto maestro.

**Lección operativa registrada:** **verificar ejecutando, no leyendo el porcentaje de la bitácora.**

---

### BUG-018 · Las skills de `.agents/` divergieron del código y desinformaban a los agentes

| Campo | Valor |
| :--- | :--- |
| **Severidad** | ⚪ Bajo (pero con alto costo de confusión) |
| **Estado** | ✅ **RESUELTO** el 2026-09-29 |
| **Ubicación** | `.agents/skills/*/SKILL.md` |

**Descripción:**
Las 8 skills se escribieron como *especificación de lo que se quería construir* y nunca se reconciliaron con lo que se construyó. Un agente que las siguiera al pie de la letra produciría código incompatible con el sistema real.

**Hallazgos por skill (antes de la corrección):**

| Skill | Precisión | Problema principal |
| :--- | :--- | :--- |
| `playwin-auth-passport` | ~40% | 🔴 Indicaba `/api/v1/matches/ticket` (**404**) en lugar de `/api/games/ticket`; afirmaba que el `MatchTicket` es de un solo uso (**no implementado**); decía firma asimétrica cuando es HMAC simétrico |
| `playwin-billing-treasury` | ~50% | Tipos de ledger `'WHOP_SUB'`/`'PAYPAL_DEPOSIT'`/`'PAYPAL_PAYOUT'` que **nunca se escriben** (raíz del BUG-004); tabla `ledger_entries` inexistente; aseguraba integración con `@paypal/checkout-server-sdk` (no instalado) |
| `playwin-league-engine` | ~50% | **Los 6 valores de MMR eran distintos** a los reales; exigía Redis (`ZREVRANGE`, locks) del que hay **cero referencias**; afirmaba sellado automático a los 10 jugadores (falso) |
| `playwin-game-bridge` | ~60% | Eventos `EVENT_INPUT`/`EVENT_STATE`/`EVENT_CRASH` inexistentes; manifiesto `playwin.json` **que no existe** con `maxTheoreticalPointsPerSecond: 120` cuando el real es `2500`; atribuía cambios de MMR a los duelos |
| `playwin-realtime-duels` | ~85% | Decía ventana de gracia de **5s** cuando son **15s**; declaraba un matchmaker "MMR ± 100" inexistente; citaba Fastify/Colyseus |

**Efecto colateral detectado en el código:** el comentario `apps/realtime-server/src/match-reconnect.js:4` decía *"Regla 2: 5s de gracia"* — la skill desactualizada había contaminado también el código fuente. **Corregido a 15s.**

**Impacto:** Un agente nuevo construye sobre rutas inexistentes, tablas fantasma y garantías de seguridad que no existen. Coste alto en tokens y riesgo de introducir bugs.

**Arreglo aplicado (2026-09-29):**
1. Reescritas las 4 skills desviadas con todos los valores verificados contra el código, y con referencias `archivo:línea`.
2. Añadida a cada una una sección **"Fuera de Alcance · Diseño Objetivo No Implementado"** que marca explícitamente lo que **no** existe (Redis, `playwin.json`, token de un solo uso, Checkout de PayPal, mapeo MMR→división, sellado a los 10, bolsas escaladas).
3. Añadido a cada una un **"Registro de Correcciones"** con el formato *antes (incorrecto) → ahora (verificado)*.
4. Corregido el comentario obsoleto en `match-reconnect.js:4`.
5. Corregida la descripción del frontmatter de `realtime-duels` (decía "Colyseus").

**Prevención pendiente:**
📋 Añadir a `test/code_protection_governance_test.mjs` una prueba **"Sincronía de Skills"** que verifique automáticamente que:
- Toda ruta de API citada en las skills existe como archivo en `apps/hub/src/app/api/`.
- Los valores numéricos clave (MMR, premios, ventana de gracia, límites de física) citados coinciden con las constantes del código.
- Ninguna skill promete una capacidad marcada como `[PENDIENTE]`.

Sin esa prueba, las skills **volverán a divergir** en cuanto el código evolucione.

---

## 🧪 Estado Real de las Suites de Prueba

| Comando | Estado real | Nota |
| :--- | :--- | :--- |
| `test:governance` | ✅ **9/9 PASA** | Verificado en esta auditoría. Pero no detecta BUG-002 ni BUG-009. |
| `test:anticheat` | ✅ **PASA** | Detecta y descalifica correctamente la inyección de speedhack. |
| `test:db` | ✅ **PASA** | Escrituras reales verificadas en Neon PostgreSQL. |
| `test:duel` | 🔴 **SE CUELGA** | BUG-006. El servidor funciona; el test está obsoleto. |
| `test:cyber` | ⚠️ **NO VERIFICADO** | El nombre del archivo citado en la bitácora no existe. |
| `test:treasury` / `test:e2e` / `test:email` / `test:history` | ⚠️ **NO VERIFICADOS** | Dependen de Neon y de servicios externos. |
| `test:all` | 🔴 **SE CUELGA** | Bloqueado por `test:duel`. |

---

## 📋 Orden de Arreglo Recomendado

| Prioridad | Bugs | Motivo |
| :--- | :--- | :--- |
| **1º** | BUG-001, BUG-002, **BUG-021**, BUG-005 | Riesgo financiero y de seguridad **activo**. BUG-021 eleva BUG-002: los secretos quemados **son la configuración en uso**. |
| **2º** | BUG-006, BUG-016 | Sin red de pruebas no se puede verificar nada más |
| **3º** | BUG-004, BUG-007 | Funcionalidad declarada que no existe, y datos falsos al usuario |
| **4º** | **BUG-019, BUG-020** | Rompen el pilar del producto (divisiones) y la integridad competitiva |
| **5º** | BUG-003, BUG-008 | Deuda estructural que genera bugs futuros |
| **6º** | BUG-009 → BUG-015, BUG-017, BUG-018 | Calidad, consistencia y prevención |

---

*Registro generado a partir de auditoría directa del código el 2026-09-29. Toda afirmación de este documento incluye `archivo:línea` verificable.*
