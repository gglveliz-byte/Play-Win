# 📋 PLAY WIN — BITÁCORA DE PROGRESO Y CONTROL QUIRÚRGICO (PROGRESS.md)

> **Este documento es la fuente de verdad del estado de avance.**
> Todo agente que inicie un turno debe leerlo **antes de escribir código** para sincronizarse con las decisiones tomadas y los contratos activos.
>
> 📖 **Contexto completo del proyecto (obligatorio, evita releer código):** [DOCUMENTACION_PROYECTO.md](DOCUMENTACION_PROYECTO.md)
> 🐛 **Bugs y deuda técnica abierta:** [AUDITORIA_BUGS.md](AUDITORIA_BUGS.md)

---

## 🚦 Estado General del Proyecto

| Campo | Valor |
| :--- | :--- |
| **Fase Actual** | `FASE 7 — Historial extendido, Rankings Globales y Despliegue VPS/Docker` |
| **Estándar de Diseño** | `Warm Editorial Tangerine` ([playwin-ui-experience](.agents/skills/playwin-ui-experience/SKILL.md)) |
| **Límite de Archivos** | `< 350 líneas` estándar · techo `800` para orquestadores ([playwin-code-governance](.agents/skills/playwin-code-governance/SKILL.md)) |
| **Persistencia** | Neon Serverless PostgreSQL (`ep-royal-haze`) — activa, cero mocks |
| **Salud del repositorio** | ⚠️ **13 bugs abiertos** (0 críticos) · ✅ **6 resueltos** · 22 pruebas de verificación ejecutadas. Ver [AUDITORIA_BUGS.md](AUDITORIA_BUGS.md) |
| **Red de pruebas** | 🔴 **ROTA** — `npm run test:all` se cuelga (BUG-006) |

### ⚠️ Aviso crítico vigente

> **La bitácora anterior afirmaba "7/7 suites al 100%" y "4/4 vectores de ciberseguridad aprobados". Ambas afirmaciones eran FALSAS.**
>
> La ejecución real demuestra que:
> - `npm run test:all` **se cuelga indefinidamente** en `test:duel`.
> - El archivo `cybersecurity_audit_test.mjs` **no existe**.
> - El webhook de PayPal **no verifica firma** y permite crear dinero de la nada (BUG-001).
> - Hay **credenciales de producción quemadas** en el código fuente (BUG-002).
>
> **Regla operativa nueva: verificar ejecutando, nunca leyendo el porcentaje de esta bitácora.**

---

## 🗺️ Mapa de Fases de Construcción

```
[ FASE 1: SDK Universal + Servidor WS ] ➔ [ FASE 2: Piloto Flapy + Neon DB ] ➔ [ FASE 3: Adaptar 3 Juegos ]
                     │
                     ▼
[ FASE 4: Hub Next.js (Auth & Passport) ] ➔ [ FASE 5: Ligas de 10 & Whop/PayPal ]
                     │
                     ▼
[ FASE 6: Anti-Cheat + Auditoría + Pre-Match Lobby + Google SMTP ] (⚠️ Parcial, ver bugs)
                     │
                     ▼
[ FASE 7: Historial Extendido, Rankings Globales & Despliegue VPS Docker ] (🔄 EN CURSO)
```

---

## ✅ Verificación Ejecutada en la Auditoría del 2026-09-29

> Esto es lo que **realmente** se comprobó ejecutando comandos, no leyendo la bitácora.

| Componente | Resultado | Evidencia |
| :--- | :--- | :--- |
| Gobernanza de código | ✅ **9/9 PASA** | `npm run test:governance` → exit `0` |
| Motor anti-cheat | ✅ **PASA** | Detecta inyección de speedhack y descalifica al tramposo |
| Base de datos Neon | ✅ **EN VIVO** | Inserción real de usuarios, pasaportes y asientos contables |
| Compilación del Hub | ⚠️ No re-verificada | La bitácora afirma build de 2.8s con 15 rutas |
| **Protocolo 1v1 completo** | ✅ **VERIFICADO END-TO-END** | Ver detalle abajo |
| `npm run test:all` | 🔴 **SE CUELGA** | Matado tras 20+ minutos sin salida |

### Evidencia cruda del protocolo 1v1

Se levantó un servidor limpio (puerto alterno, ante un proceso huérfano en `:3001`) y se ejecutó una sonda con `MatchTicket` firmado correctamente:

```
A: open -> JOIN_MATCH
A: <- MATCH_WAITING (Buscando contrincante en tu división...)
B: open -> JOIN_MATCH
A: <- MATCH_START seed=9323438
B: <- MATCH_START seed=9323438     ← MISMA SEMILLA: determinismo confirmado
A: <- MATCH_LIVE
B: <- MATCH_LIVE
A: <- RIVAL_TICK  ... (relay bidireccional a 20Hz)
A: <- MATCH_END
B: <- MATCH_END                    ← VEREDICTO EMITIDO POR EL SERVIDOR

RESULT: PROTOCOL OK — match resolved by server
```

**Conclusión:** el núcleo Zero-Client-Trust **funciona de verdad**. El bug está en la suite de pruebas obsoleta, no en el servidor. El arnés reutilizable vive en `scratch/ctx_handshake_probe.mjs`.

---

## 📝 Registro de Hitos

> **Leyenda de estado:**
> ✅ `VERIFICADO` — comprobado ejecutando en la auditoría del 2026-09-29
> ⚠️ `REPORTADO` — afirmado en su momento, no re-verificado en esta auditoría
> 🔴 `DESMENTIDO` — la auditoría probó que la afirmación era falsa o incompleta

---

### ✅ Hito 0: Gobernanza, Skills y Arquitectura · `VERIFICADO`

* **Creado:** Matriz de 8 skills operativas en `.agents/skills/`.
* **Creado:** [AGENTS.md](AGENTS.md) con directrices maestras, flujos de seguridad y tabla de enrutamiento.
* **Definido:**
  * Ciclo unificado de 4 pantallas para todos los juegos (Matchmaking, Versus 3-2-1, In-Game HUD, Resultados).
  * Blindaje anti-trampas: el servidor es el único árbitro; prohibidas variables globales en `window`.
  * Puntuación universal fase 1: **+100 Victoria, +20 Derrota, 0 Abandono**.
  * Tokens CSS oficiales Warm Editorial Tangerine.

---

### ✅ Hito 1.1: Servidor Realtime 1v1 y Motor de Salas · `VERIFICADO`

* **Implementado:**
  * [rooms.js](apps/realtime-server/src/rooms.js) (340L): gestor de colas por juego, salas de duelo, semilla determinista, retransmisión de `RIVAL_TICK` a 20Hz, árbitro de muerte súbita y gestión de reconexión.
  * [server.js](apps/realtime-server/src/server.js) (91L): servidor HTTP/WebSocket nativo. Endpoints `/health` y `/ws`.
* **Verificación:** confirmada en la auditoría — semilla idéntica para ambos clientes y `MATCH_END` emitido por el servidor.

---

### ✅ Hito 1.2: SDK Universal del Cliente e Interfaz Warm Editorial · `VERIFICADO`

* **Implementado:**
  * [playwin-bridge.css](packages/game-sdk/playwin-bridge.css): tokens Warm Editorial, grano SVG, radares animados, tarjetas Hero 3D y HUD flotante.
  * [playwin-bridge.js](packages/game-sdk/playwin-bridge.js) (343L): cliente agnóstico con inyección automática de las 4 pantallas, handshake `postMessage`, captura de teclas para anular pausas y retransmisión de estado.
* **Verificación:** el test de gobernanza confirma `Object.freeze()` en `window.PlayWin`, inmutabilidad de `getPlayer()`/`getOpponentState()` y aislamiento en clausura IIFE.

---

### ✅ Hito 2.1: Adaptación de Flapy Flapy al SDK Universal 1v1 · `REPORTADO`

* Generador PRNG determinista `Mulberry32` alimentado por la semilla del servidor.
* Ticks a 20Hz, renderizado del murciélago rival translúcido (`globalAlpha = 0.52`) y muerte súbita vía `PlayWin.notifyCrash()`.
* **Verificación en su momento:** ejecución en navegador con 2 pestañas simultáneas y capturas archivadas.

---

### ✅ Hito 2.2: Persistencia Real en Neon PostgreSQL · `VERIFICADO` (con salvedad)

* **Implementado:** [schema.sql](packages/database/src/schema.sql) con 6 tablas de producción, y los servicios `userService`, `passportService`, `matchService`, `leagueService`, `ledgerService`.
* **Verificación:** la suite `test:db` insertó realmente usuarios, un pasaporte, una partida y un asiento contable en Neon.
* 🔴 **Salvedad:** este hito afirma "transacciones atómicas". El **registro de usuario del Hub no lo es** ([BUG-013](AUDITORIA_BUGS.md)). Las transacciones del ledger sí son atómicas.

---

### ✅ Hito 3.1 / 3.2 / 3.3: Adaptación de Carreras, Space y Sky 1v1 · `REPORTADO`

* Generador `Mulberry32` con la semilla del servidor para sincronizar curvas, conos, oleadas enemigas y brechas.
* Renderizado de rivales fantasma (Ghost Car / Ghost Ship / Ghost Runner) con píldora de nombre flotante.
* Ticks a 20Hz y muerte súbita vinculada al árbitro.
* 📌 **Nota de mantenimiento:** los motores de juego viven en `apps/hub/public/games/` (migrados en el Hito 6.4) y están **congelados contra el engorde** — solo micro-ediciones quirúrgicas.

---

### ✅ Hito 4.1: Hub Play Win en Next.js con Auth, Pasaporte y Micro-Ligas · `VERIFICADO`

* **Implementado en `apps/hub`:**
  * **Sistema de Diseño Warm Editorial Tangerine:** paleta oficial, grano mate, píldora de navegación flotante con reloj de temporada.
  * **Autenticación real:** `/api/auth/register`, `/api/auth/login`, `/api/auth/me` con `bcryptjs`, JWT y cookie httpOnly.
  * **Pasaporte Competitivo Multijuego:** estadísticas por juego desde `game_passports`.
  * **Micro-Ligas de 10 Jugadores:** standings de grupo cerrado desde `league_members`.
  * **Launcher en Iframe Seguro:** inyección de `MatchTicket` vía `postMessage`.
  * **Billetera y Tesorería:** saldo real, extracto `wallet_ledger`, estado premium y correo de PayPal.
* **Verificación:** 18 handlers en 16 archivos de ruta, 9 componentes, ningún archivo supera las 350 líneas (máximo `PassportView.tsx` 324L).

---

### ✅ Hito 5.1: Motor de Cierre Semanal de Micro-Ligas y Ajuste de MMR · `REPORTADO`

* **Implementado en [settle.ts](apps/hub/src/lib/db/settle.ts):** liquidación de ligas expiradas con reparto `$15/$7/$3` registrado en `wallet_ledger`, recálculo determinista de MMR (`+60/+35/+20/0/−25/−50`), reseteo de Season Points y sellado `is_locked = true`.
* **Endpoint:** [api/cron/settle-leagues](apps/hub/src/app/api/cron/settle-leagues/route.ts) protegido por `CRON_SECRET`.

---

### ✅ Hito 5.2: Pasarelas Whop (Webhooks HMAC) & PayPal Payouts · `REPORTADO`

* **Whop:** manejador de `membership.went_valid`, `membership.went_invalid` y `payment.succeeded` con idempotencia por `provider_tx_id`.
* **PayPal:** endpoint de retiro con validación de saldo, débito atómico y registro contable.
* 🔴 **Correcciones de la auditoría:**
  * La validación HMAC de Whop es **eludible** (omitiendo el header) y usa comparación no constante en tiempo → [BUG-005](AUDITORIA_BUGS.md).
  * El endpoint de Payout **no llama realmente a la API de PayPal** → [BUG-015](AUDITORIA_BUGS.md).

---

### ✅ Hito 6.1: Flujo E2E Completo y Handshake PostMessage · `REPORTADO`

* Handshake bidireccional iframe ↔ Hub: `PLAYWIN_READY` → `PLAYWIN_INIT` con ticket firmado → `PLAYWIN_MATCH_COMPLETED` → refresco reactivo del Pasaporte y la liga sin recargar la página.

---

### 🔴 Hito 6.2: Panel de Auditoría, Telemetría y Preparación a Producción · `DESMENTIDO`

* **Lo afirmado:** dashboard con duelos auditados, balance de liquidez Whop/PayPal y ocupación de ligas.
* **Realidad verificada:** `/api/admin/metrics` consulta columnas **que no existen** (`wallet_ledger.entry_type`, `league_groups.tier`), por lo que **siempre devuelve 500**. El panel muestra "0" en todo. Además el endpoint **no tiene autenticación**. Ver [BUG-004](AUDITORIA_BUGS.md).

---

### ✅ Hito 6.3: Portadas Oficiales y Erradicación de Fugas Técnicas · `REPORTADO`

* Generadas 4 portadas cinematográficas para los juegos y reemplazados los emojis planos por badges de categoría.
* Eliminadas las menciones a "Whop" y a la base de datos en pantallas de usuario.
* 🔴 **Corrección:** la "erradicación de fugas" fue incompleta — quedan **credenciales de producción quemadas en el código fuente** → [BUG-002](AUDITORIA_BUGS.md).

---

### ✅ Hito 6.4: Unificación Arquitectónica — Juegos Nativos en Next.js · `VERIFICADO`

* Todos los juegos y el SDK se sirven desde `apps/hub/public/`. Se eliminó el servidor estático Python `:8080`.
* Inyección dinámica de `NEXT_PUBLIC_REALTIME_WS_URL` al iframe vía handshake.
* 🔴 **Salvedad:** `playwin-bridge.js:8` conserva `ws://localhost:3001/ws` como default, y `GameLauncherModal.tsx:106-107` quema `rank: 'ORO'` / `skillRating: 1820` en el cliente → [BUG-007](AUDITORIA_BUGS.md).

---

### ✅ Hito 6.5: Motor Anti-Cheat en Tiempo Real · `VERIFICADO`

* **Implementado en [anticheat.js](apps/realtime-server/src/anticheat.js) (289L):** límites físicos por juego, rate limiter de 35 paquetes/s, detección de speedhack y teletransporte con 3 strikes, y emisión de descalificación forzada.
* **Verificación:** la suite `test:anticheat` simula inyección maliciosa y el servidor **detecta y descalifica** con `SPEEDHACK_SCORE_OVERFLOW`. Éxito confirmado en la auditoría.

---

### 🔴 Hito 6.6: Auditoría de Ciberseguridad y Blindaje de 4 Vectores · `DESMENTIDO`

* **Lo afirmado:** 4/4 vectores blindados y aprobados por `cybersecurity_audit_test.mjs`.
* **Realidad verificada:**
  * El archivo citado **no existe** (el real es `cybersecurity_suite.js`).
  * **Vector 1 (identidad):** ✅ correcto — los juegos solo reciben un ticket efímero de 5 min.
  * **Vector 2 (SQLi/XSS):** ✅ correcto — consultas parametrizadas `$1, $2`.
  * **Vector 3 (fuerza bruta):** 🔴 **no existe** ningún rate limiter en las rutas de auth → [BUG-010](AUDITORIA_BUGS.md).
  * **Vector 4 (integridad contable):** 🔴 el webhook de PayPal **no verifica firma** y permite crear dinero de la nada → [BUG-001](AUDITORIA_BUGS.md).

---

### ✅ Hito 6.7: Pre-Match Lobby, Pilotos Activos y Controles PC/Móvil · `REPORTADO`

* **Implementado en [GameLobbyView.tsx](apps/hub/src/components/GameLobbyView.tsx) (230L):** modal previo a la partida (se eliminó el auto-emparejamiento involuntario), listado de pilotos, guía de puntuación y selector de controles teclado/táctil.
* 🔴 **Corrección:** el endpoint que alimenta ese listado devuelve **pilotos y divisiones inventadas** cuando no hay datos reales → [BUG-007](AUDITORIA_BUGS.md).

---

### ✅ Hito 6.8: Motor Transaccional de Correo Google SMTP y Recuperación · `REPORTADO`

* **Implementado en [email.ts](apps/hub/src/lib/email.ts) (215L):** integración con Gmail SMTP y 3 plantillas HTML con estética Warm Editorial.
* **Migración:** columnas `is_verified`, `verification_token`, `reset_token`, `reset_token_expires_at` en `users` (confirmadas en `schema.sql`).
* **Rutas:** `/api/auth/verify-email`, `/api/auth/forgot-password`, `/api/auth/reset-password`, más las vistas `/verificar-cuenta` y `/restablecer-password`.

---

### ✅ Hito 7.1: Pasaporte Extendido e Historial de Duelos · `REPORTADO`

* **[PassportView.tsx](apps/hub/src/components/PassportView.tsx) (324L):** identidad, badges, tasa de victorias, tarjetas por juego con MMR y récord, y feed de historial con píldoras de resultado, marcador, tiempo relativo y sello "Verificada por Árbitro".
* **Endpoint:** [api/matches/history](apps/hub/src/app/api/matches/history/route.ts) con sesión JWT.

---

### ✅ Hito 7.2: Identidad Visual Oficial — Logotipo y Banners · `REPORTADO`

* Logotipo eSports con monograma P/W integrado como favicon en [layout.tsx](apps/hub/src/app/layout.tsx) y en [Navigation.tsx](apps/hub/src/components/Navigation.tsx).
* Banner panorámico de la arena 1v1 en [page.tsx](apps/hub/src/app/page.tsx) y banner del campeonato semanal en [LeagueStandings.tsx](apps/hub/src/components/LeagueStandings.tsx).

---

### ✅ Hito 7.3: Integración Definitiva de Fuerza Espacial (Space) · `REPORTADO`

* Sustitución por el motor arcade real de 55KB y eliminación de la carpeta obsoleta `space/js/`.
* **Ergonomía PC:** movimiento con flechas/WASD, disparo con espacio/clic, bomba cuántica con `[B]`.
* **Ergonomía móvil:** seguimiento táctil 1:1, botón de bomba (70px) y de disparo (72px), toggle de auto-disparo, aislamiento con `stopPropagation()`.
* **Calibración anti-cheat para `space`:** `maxScoreDeltaPerSec: 25000` (eliminando falsos positivos por bombas y combos).
* **Corrección de integridad referencial:** `rival.id = dbRival.id` en `room-factory.js` para evitar fallos de clave foránea.

---

### ✅ Hito 7.4: Blindaje de Red, Latencia y Tolerancia a Fallos · `REPORTADO`

* **Ventana de gracia de reconexión ampliada a 15s** (antes 5s), permitiendo recargar el navegador sin perder la partida.
* **Soporte de reconexión en Ghost Matches:** la simulación se pausa durante la desconexión y se reanuda al volver.
* **Doble verificación en [rooms.js](apps/realtime-server/src/rooms.js):** si el jugador ya está en una sala `COUNTDOWN`/`PLAYING`, el servidor reasigna su socket con `MATCH_RESUME` y prohíbe duplicados.
* **Restauración en cliente:** el SDK oculta el radar, activa el HUD y reactiva el bucle vía `onMatchLive({ seed, isResume: true })`.
* **Persistencia de sesión:** la arena en curso se guarda en `sessionStorage` para restaurarla tras un F5.

---

### ✅ Hito 7.5: Blindaje Anti-Hack Especializado — Carreras y Flapy · `REPORTADO`

* **Carreras:** `maxScoreDeltaPerSec: 2500`, `maxPlayerX: 2200`, divisor efectivo `Math.max(deltaSec, 0.08)` para tolerar packet clustering en WiFi, y limitador de física a 60 FPS con despacho de ticks a 20Hz.
* **Flapy:** `isDiscreteScore: true` con `maxScoreBurstDelta: 2` y validación macro, blindaje del eje Y (`minY: -25`, `maxY: 575`) anulando los exploits de vuelo sobre tuberías y noclip bajo el césped, y cadencia de red a 20Hz con `performance.now()`.
* **Suites:** `carreras_anticheat_spec.js` 11/11 y `flapy_anticheat_spec.js` 14/14 (según reporte original, no re-ejecutadas en esta auditoría).

---

### ✅ Hito 7.6: Reloj Inmune a Desenfoque y Victoria por Distancia en Carreras · `REPORTADO`

* **Causa raíz documentada:** los navegadores suspenden `requestAnimationFrame` al minimizar, congelando el reloj del jugador inactivo; al vencer el tiempo el cliente llamaba erróneamente a `notifyCrash()`, declarando perdedor al piloto con más metros.
* **Solución — Reloj Absoluto de Pared:** el tiempo restante es una función matemática de `performance.now() - raceStartTime`, inmune a caídas de FPS o cambio de pestaña. Ticker desacoplado con `setInterval(..., 50)` y sincronización al recuperar el foco.
* **Protocolo `PLAYER_FINISH`:** se eliminó el auto-choque arbitrario de 4s. En Carreras la victoria se decide estrictamente por **mayor distancia** (`HIGHER_SCORE`). Compatibilidad garantizada: `PLAYER_CRASHED` en Carreras se delega a `handlePlayerFinish`, impidiendo castigar al líder.
* **Nota:** verificado en `rooms.js`. La lógica de reloj absoluto vive en `apps/hub/public/games/carreras/script.js` (motor legacy, congelado).

---

### ✅ Hito 7.7: Actualización de Gobernanza, Blindaje en Runtime y Suite Automatizada · `VERIFICADO`

* **Regla 1 calibrada:** archivos estándar `< 350 líneas`; orquestadores (Bridge SDK, routers, motores) con techo de **800 líneas**; motores legacy congelados contra el engorde.
* **Regla 2 (Blindaje en Runtime):** `Object.freeze(window.PlayWin)` y getters que devuelven copias clonadas.
* **Modularización:** `PassportView.tsx` reducido de 369L a 324L extrayendo tipos a `passport-types.ts`. El 100% de los archivos en `apps/` y `packages/` cumple el límite.
* **Suite [code_protection_governance_test.mjs](test/code_protection_governance_test.mjs):** 9/9 pruebas — límites de tamaño, cero elipsis, cero secretos en cliente, `Object.freeze()`, inmutabilidad de getters, aislamiento en IIFE y Zero Client Trust.
* **Verificación:** ✅ **ejecutada y confirmada 9/9** en la auditoría del 2026-09-29.
* 🔴 **Limitación descubierta:** la comprobación de secretos **no detecta** las credenciales de producción quemadas en `src/lib/db/index.ts` ni las violaciones de tokens de diseño.

---

### ✅ Hito A.1: Reconciliación de las Skills con el Código Real · `VERIFICADO`

**Fecha:** 2026-09-29 · **Bug asociado:** [BUG-018](AUDITORIA_BUGS.md)

* **Problema detectado:** las 8 skills de `.agents/skills/` se escribieron como *especificación de lo que se quería construir* y nunca se reconciliaron con lo que se construyó. Cinco de ellas desinformaban a cualquier agente nuevo.
* **Hallazgo más grave:** `playwin-auth-passport` indicaba `/api/v1/matches/ticket` (ruta **inexistente**, la real es `/api/games/ticket`) y afirmaba como Regla Inviolable cumplida que el `MatchTicket` es de **un solo uso** — capacidad que **no está implementada**.
* **Efecto colateral encontrado en el código:** `apps/realtime-server/src/match-reconnect.js:4` decía *"Regla 2: 5s de gracia"* cuando el valor real es **15000 ms**. La skill desactualizada había contaminado el comentario del fuente. **Corregido.**
* **Skills reescritas (5):** `playwin-auth-passport` · `playwin-billing-treasury` · `playwin-league-engine` · `playwin-game-bridge` · `playwin-realtime-duels`
* **Correcciones destacadas:**

| Skill | Corrección principal |
| :--- | :--- |
| auth-passport | Ruta real `/api/games/ticket` · firma HMAC **simétrica** (no asimétrica) · token de un solo uso marcado como **no implementado** · bcrypt cost real `10` (no `12`) |
| billing-treasury | Tipos de ledger reales (`DEPOSIT`, `PRIZE_WIN`, `WITHDRAWAL`, `WHOP_MEMBERSHIP_ACTIVATED`) · tabla **`wallet_ledger`** (no `ledger_entries`) · Checkout de PayPal marcado como no implementado |
| league-engine | MMR real (`+60/+35/+20/0/−25/−50`) · premios reales (`$15/$7/$3`) · **sin Redis** · sellado a los 10 marcado como falso · mapeo MMR→división marcado como no implementado |
| game-bridge | Eventos reales (`PLAYER_TICK`/`PLAYER_CRASHED`/`PLAYER_FINISH`) · **sin `playwin.json`** · límites reales (`2500`/s, no `120`) · un duelo **no** mueve el MMR |
| realtime-duels | Ventana de gracia **15s** (no 5s) · **sin** matchmaker MMR ± 100 · `ws` nativo (no Fastify/Colyseus) |

* **Estructura nueva en cada skill:**
  1. Sección **"Fuera de Alcance · Diseño Objetivo No Implementado"** — marca explícitamente lo que no existe.
  2. Sección **"Registro de Correcciones"** — tabla *antes (incorrecto) → ahora (verificado)*.
* **Verificación:** `npm run test:governance` → **9/9 PASA** (exit `0`) tras los cambios. Las 8 skills citan `archivo:línea` verificable y ninguna promete una capacidad inexistente sin marcarla.
* 🔴 **Prevención pendiente:** añadir una prueba de **sincronía de skills** al test de gobernanza (que valide rutas citadas y valores numéricos contra el código). Sin ella, las skills volverán a divergir.

---

### ✅ Hito A.2: Verificación por Ejecución de Todos los Bugs · `VERIFICADO`

**Fecha:** 2026-09-29 · **Arnés:** `scratch/verify_bugs.mjs` (BD + código) · `scratch/verify_bugs_api.mjs` (HTTP)

* **Objetivo:** convertir cada bug de *hallazgo por lectura de código* en **veredicto comprobado**, para no arreglar falsos positivos.
* **Resultado:** **22 pruebas ejecutadas → 20 CONFIRMADAS · 2 FALSOS POSITIVOS corregidos.**
* **Método no destructivo:** los webhooks se sondearon con **correos inexistentes** (`@playwin-invalid.test`) y **sin firmas válidas**. Que devolvieran `200` demuestra la vulnerabilidad **sin explotarla** ni mover dinero real.

#### Evidencia más contundente

| Bug | Prueba | Resultado |
| :--- | :--- | :--- |
| BUG-004 | `GET /api/admin/metrics` sin sesión | **HTTP 500** · `column "entry_type" does not exist` |
| BUG-001 | `POST /api/webhooks/paypal` sin firma | **HTTP 200** — evento procesado |
| BUG-005 | `POST /api/webhooks/whop` con firma **inválida** | **HTTP 200** — la firma no se valida |
| BUG-002 | Escaneo de archivos con fallback | Neon ×2 · JWT_SECRET ×2 · WHOP_SECRET ×1 |
| BUG-003 | Comparación de capas de datos | 5/5 duplicados · declara la dep pero **no la importa** |
| BUG-010 | Búsqueda de `rateLimit`/`429` | **Cero coincidencias** |
| BUG-015 | Búsqueda de `api.paypal.com` | **No invoca la API** |

#### 🔴 3 hallazgos NUEVOS destapados por la verificación

| ID | Hallazgo | Evidencia |
| :--- | :--- | :--- |
| **BUG-019** | **El sharding por MMR no existe en la práctica** | **178 de 178 pasaportes son `BRONZE`.** Ningún llamador calcula `rankTier` desde `skill_rating`: no existe la función de mapeo. Anula el pilar del producto. |
| **BUG-020** | **`is_locked` no se activa al llegar a 10 jugadores** | 5 ligas con **10 miembros y `is_locked = false`**. La exclusión depende solo de `HAVING COUNT < 10` → condición de carrera hacia ligas de 11. |
| **BUG-021** | **El Hub no tiene `.env` propio: los secretos quemados SON la configuración activa** | `apps/hub/.env.local = false`. Next.js no lee el `.env` de la raíz del monorepo → está usando la contraseña de Neon y el `JWT_SECRET` del código. **Agrava el BUG-002.** |

#### ✅ Correcciones a mis propios hallazgos

| Bug | Afirmación original | Verdad verificada |
| :--- | :--- | :--- |
| BUG-013 | "El registro no valida la entrada" | ✅ **FALSO POSITIVO.** Sí valida: `HTTP 400` con *"El nombre de usuario debe tener entre 3 y 20 caracteres."* El bug real sigue siendo la **falta de atomicidad**, no la validación. |
| BUG-016 | "No maneja `EADDRINUSE`" | ✅ **CONFIRMADO, pero mi regex me engañó primero:** hizo match con `socket.on('error')` (WebSocket) y sugirió que sí había manejo. Verificado: **no existe `server.on('error')`** a nivel HTTP. |

* **Lección registrada:** verificar por ejecución **también corrige al auditor**. Dos de mis afirmaciones eran imprecisas y quedaron rectificadas antes de tocar una sola línea de arreglo.

---

### ✅ Hito B.1: Bloque 1º — Blindaje de la Tesorería y Eliminación de Secretos · `VERIFICADO`

**Fecha:** 2026-09-29 · **Bugs resueltos:** BUG-001 · BUG-002 · BUG-005 · BUG-021

* **Alcance:** cerrar las 4 vulnerabilidades que permitían pérdida económica o acceso a credenciales.

#### 1. BUG-001 — Verificación de firma de PayPal (la más grave)

* **Creado [lib/paypal.ts](apps/hub/src/lib/paypal.ts):** verificación criptográfica mediante el **método postback oficial** (`POST /v1/notifications/verify-webhook-signature`) con token OAuth `client_credentials`. Se eligió postback sobre la verificación propia porque **no requiere dependencias externas** (la verificación propia necesita `buffer-crc32` y descarga de certificados). Ver [documentación oficial](https://developer.paypal.com/api/rest/webhooks/rest.md).
* **La ruta ahora:** lee el cuerpo **crudo** con `req.text()` (PayPal exige reenviarlo sin reformatear), exige las 5 cabeceras `paypal-transmission-*` → `401`, y verifica contra PayPal → `401` si no es `SUCCESS`. Sin credenciales → `503`.
* **Resultado:** no queda **ningún** camino que acredite saldo sin verificación previa.

#### 2. BUG-002 + BUG-021 — Secretos fuera del código

* **Creado [lib/config.ts](apps/hub/src/lib/config.ts):** única fuente de verdad del entorno, con **fallo ruidoso** (`ConfigError`) en lugar de valores por defecto para secretos.
* **6 secretos quemados eliminados:**

| Archivo | Secreto |
| :--- | :--- |
| `apps/hub/src/lib/db/index.ts` | Cadena de conexión Neon con contraseña |
| `packages/database/src/index.js` | Cadena de conexión Neon con contraseña |
| `apps/hub/src/lib/auth.ts` | `JWT_SECRET` |
| `apps/realtime-server/src/anticheat.js` | `JWT_SECRET` |
| `api/webhooks/whop/route.ts` | `WHOP_WEBHOOK_SECRET` |
| `api/cron/settle-leagues/route.ts` | `CRON_SECRET` |

* **Creado [load-env.js](apps/realtime-server/src/load-env.js):** cargador de `.env` sin dependencias (el paquete `dotenv` no está instalado).
* **Creados** `apps/hub/.env.local` y `.env.test` (ambos gitignored). `.gitignore` reforzado.
* **3 archivos de test** que también tenían secretos quemados ahora leen del entorno.

#### 3. BUG-005 — HMAC de Whop blindado

* Firma **obligatoria** (se eliminó el `&& signature` que permitía eludirla omitiendo la cabecera).
* Verificación **independiente de `NODE_ENV`**.
* Comparación con **`crypto.timingSafeEqual`** (antes `!==`). El mismo tratamiento se aplicó a `CRON_SECRET`.

#### 4. Bug adicional encontrado y corregido

* `treasury_and_settle_test.mjs` reportaba **"Webhook Whop procesado exitosamente"** con un **HTTP 503**: nunca validaba el status. Ahora **firma la petición y exige 200**, de modo que la suite **valida** la seguridad en lugar de esquivarla.

#### Verificación ejecutada

| Prueba | Resultado |
| :--- | :--- |
| Escaneo de secretos en todo el fuente | ✅ **CERO SECRETOS** |
| Arranque sin `JWT_SECRET` (sin entorno ni archivos) | ✅ **BLOQUEADO** con mensaje accionable |
| `POST /api/webhooks/paypal` sin firma | ✅ **HTTP 401** (antes 200) |
| `POST /api/webhooks/whop` sin firma | ✅ **HTTP 503/401** (antes 200) |
| `POST /api/webhooks/whop` con firma válida | ✅ **HTTP 200** + asiento `[WHOP] DEPOSIT 19.99 USD` |
| Lógica HMAC aislada (5 casos, incl. ataque de timing) | ✅ **5/5 correctos** |
| `npm run test:treasury` | ✅ **exit 0** |
| `npm run test:anticheat` | ✅ **PASA** (firma tokens desde el entorno) |
| `npm run test:governance` | ✅ **9/9** |
| `npx tsc --noEmit` | ✅ **exit 0** |

* **Decisión registrada:** **no se rotaron** los secretos, por indicación expresa del responsable — el repositorio nunca se publicó ni llegó a producción, así que no hubo exposición externa.
* 🔴 **Pendiente de operación:** configurar `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` y `PAYPAL_WEBHOOK_ID` reales para que el webhook de PayPal opere (hoy responde `503` de forma segura). El `WHOP_WEBHOOK_SECRET` actual es un valor de **no producción**.
* 📌 **Siguiente hito:** bloque 2º — reparar la red de pruebas (BUG-006 + BUG-016).

---

### 🔧 Corrección posterior: frontera cliente/servidor en `@playwin/database` · `VERIFICADO`

**Fecha:** 2026-09-29 · **Origen:** error de build detectado en el navegador

* **Síntoma:**
  ```
  Module not found: Can't resolve 'dns'
  ./packages/database/node_modules/pg/lib/connection-parameters.js
    Import trace: Client Component Browser
  ```
* **Causa raíz:** al unificar la capa de datos (BUG-003) y conectar las constantes compartidas, **cuatro componentes de cliente** (`LeagueStandings`, `GameLobbyView`, `admin/page`) empezaron a importar el **punto de entrada principal** de `@playwin/database`. Ese paquete importa `pg`, que hace `require('dns')` / `require('net')` / `require('fs')` — módulos que **no existen en el navegador**.
* **Intento fallido:** convertir el pool a creación perezosa **no bastó**. Evitaba el `throw` al importar, pero el bundler de cliente **sigue intentando resolver `pg`** y por tanto `dns`.
* **Arreglo correcto:** **dos puntos de entrada** en el paquete mediante `exports`:

  | Punto de entrada | Quién lo usa | Contenido |
  | :--- | :--- | :--- |
  | `@playwin/database` | Solo servidor | Servicios + pool de `pg` + constantes |
  | `@playwin/database/constants` | Servidor **y cliente** | Solo constantes puras, cero dependencias de Node |

* **Verificación:**
  * `NEXT_DIST_DIR=.next-verify2 npx next build` → **`✓ Compiled successfully in 7.4s`** + TypeScript OK. El error de `dns` desapareció.
  * Añadida la prueba **"Ningún componente de CLIENTE importa módulos de servidor"** a la suite de gobernanza → **11/11**.
  * **Probada en negativo:** se reintrodujo el import incorrecto a propósito y la suite **falló con el mensaje exacto** señalando el archivo y el import correcto. Restaurado después.
* **Herramienta nueva:** `NEXT_DIST_DIR` permite compilar a un directorio alternativo para verificar sin tocar el `.next` en uso.
* **Documentado como regla permanente** en [DOCUMENTACION_PROYECTO.md](DOCUMENTACION_PROYECTO.md) → sección 6.8.

---

### 🔬 Hito C.1: Análisis de "la partida no arranca" · `VERIFICADO`

**Fecha:** 2026-09-29 · **Bugs:** BUG-022 y BUG-024 detectados; BUG-023 resuelto

* **Síntomas reportados:**
  1. *"Inicié una partida y se quedó así… ¿por qué no sale el panel de espera?"* (1 jugador)
  2. *"Ahora sí inicié con 2 personas: no valió, se quedó así"* (ambos coches parados)

* **Método:** observación en vivo con el servidor levantado. **No se tocó código hasta tener datos.**

#### Hallazgo 1 · El servidor de duelos estaba CAÍDO

```
$ node packages/database/scripts/diagnose.mjs
  SERVIDOR DE DUELOS → ❌ SIN RESPUESTA: fetch failed
  HUB                → EN LÍNEA (HTTP 200)
```

El Hub respondía; el servidor de duelos no. **Eso explica el síntoma 1 por completo.**

#### Hallazgo 2 · El motor de duelos FUNCIONA (verificado en vivo)

Se levantó el servidor y se observó una partida real de dos personas:

```
sala duel_carreras_a592113a · PLAYING · humanas=1 · bots=0
A=progamer2026 · B=carlos_pro
score: 0/115 → 0/615 → 366/687 → 2872/687 → 4385/2258 → 5696/5671
→ MATCH_END: carlos_pro gana 6752 vs 6793 (HIGHER_SCORE, 23 s)
```

* Ambos marcadores **subían en paralelo**: los dos coches avanzaban de verdad.
* La victoria se resolvió por **mayor distancia**, como dicta la regla de carreras.
* El resultado **se persistió** en `match_records`.

**Conclusión del síntoma 2:** no era un fallo del motor. Los coches están en la línea
de salida porque la captura es de antes de empezar a moverse, o de un momento sin servidor.

#### Hallazgo 3 · BUG-022 (nuevo, ABIERTO) — el SDK falla en silencio

```javascript
// packages/game-sdk/playwin-bridge.js:137-147
socket.onclose = () => { if (isMatchLive) { /* aviso */ } };   // ← condicionado
socket.onerror = () => { if (isMatchLive) showReconnectBanner(...) };
```

Si la conexión falla **antes** de empezar la partida, **el error no se muestra en
ninguna parte**: el jugador mira el radar para siempre sin saber que el servidor no
existe. Viola el principio de transparencia ya aplicado en el resto del proyecto
(aviso de bot, panel de admin con errores visibles).

#### Hallazgo 4 · BUG-024 (nuevo, ABIERTO) — bots apagados sin explicación

Consecuencia directa de desactivar los bots: un jugador solo espera indefinidamente
sin saber que no va a llegar nadie.

#### Herramienta nueva

[diagnose.mjs](packages/database/scripts/diagnose.mjs) responde de un vistazo:
¿servidor en línea?, ¿bots encendidos?, ¿partidas vivas (humanas o de bot)?,
¿alguien en cola?, ¿se registran resultados?

#### Estado tras este hito

| Métrica | Valor |
| :--- | :--- |
| Bugs catalogados | **24** |
| ✅ Resueltos | **22** |
| ❌ Abiertos | **2** — BUG-022 y BUG-024 (misma familia: el SDK no comunica) |

* **Siguiente hito inmediato:** arreglar BUG-022 (mostrar el error siempre + timeout
  de 10 s + botón REINTENTAR) y BUG-024 (mensaje honesto al esperar solo).

---

### 🔴 Hito C.2: Causa raíz de "no inicia" — arranque local sin árbitro · `VERIFICADO`

**Fecha:** 2026-09-29 · **Bug:** BUG-025 (CRÍTICO, nuevo)

* **Síntoma:** *"inicié con la cuenta de una persona, le di a iniciar partida y se puso así — no salió el menú de espera. No inicia."*
  Dos ventanas mostrando `0 KM/H · TIEMPO 20 · 0 M` a la vez.

* **Causa raíz encontrada en el código:**

```javascript
// apps/hub/public/games/carreras/script.js:195-199
if (k === 'enter') {
    if (gameState === STATE_TITLE || gameState === STATE_GAMEOVER) {
        startRace();          // ← carrera LOCAL, sin servidor
    }
}
```

* **Qué ocurre exactamente:**
  1. El jugador pulsa `Enter` (o el botón de inicio) **antes** de encolar.
  2. El juego entra en `STATE_PLAYING` y pone `time = 20` por su cuenta.
  3. El HUD muestra `0 KM/H · 20 · 0 M` y el coche **no se mueve**.
  4. El motivo de que no se mueva: el juego sólo envía ticks si `PlayWin.isLive()` es verdadero… pero el reloj local **sí** corre.
  5. Como nunca se encoló, **la pantalla de espera no aparece nunca**.

* **Por qué es CRÍTICO:** viola la regla fundacional del proyecto (*«el servidor es el único árbitro»*) y la Regla 4 de `playwin-game-bridge` (*«el bucle arranca en `onMatchLive`»*).

* **Alcance — los 4 juegos lo incumplen:**

| Juego | Disparadores locales |
| :--- | :--- |
| carreras | tecla `Enter` (`script.js:195-199`) |
| space | botones `#btn_start`, `#btn_restart`, `#btn_restart_pause` (`script.js:1065-1071`) |
| flapy-flapy | tecla / clic / botón (`script.js:1423, 1430, 1561`) |
| sky | tecla / clic (`js/game.js:273`) |

* **El arranque correcto YA existe y funciona** (`carreras/script.js:1310-1313`):
  `onMatchLive: () => { startRace(); updateHUD(); }`

* **Arreglo propuesto (micro-hito C.3):**
  1. Guardián en el SDK: `PlayWin.canStartLocally()`.
  2. Envolver los disparadores locales con él. **Un `if` por disparador** — los motores
     están congelados por gobernanza, no se reestructuran.
  3. Prueba que detecte si algún juego vuelve a arrancar sin respetar el ciclo.

* **Estado tras este hito:** 25 bugs catalogados · 22 resueltos · **3 abiertos**
  (BUG-025, BUG-022, BUG-024 — los tres de la misma familia: el juego no respeta el
  ciclo del árbitro ni comunica lo que pasa).

---

### ✅ Hito C.3: El juego respeta al árbitro y nunca falla en silencio · `VERIFICADO`

**Fecha:** 2026-09-29 · **Bugs cerrados:** BUG-025 (crítico) · BUG-022 · BUG-024

* **Objetivo:** cerrar los 3 bugs de la misma familia —el juego no respetaba el ciclo
  del árbitro ni comunicaba lo que ocurría— en un solo micro-hito.

#### 1. BUG-025 · Guardián del ciclo de partida

* Nuevo `PlayWin.canStartLocally()` en el SDK: devuelve **siempre `false`** cuando el
  SDK está cargado, así que el único que decide cuándo arrancar es `onMatchLive`.
* **6 disparadores locales blindados** en 3 motores:

| Motor | Disparadores corregidos |
| :--- | :--- |
| `carreras/script.js` | tecla `Enter` |
| `space/script.js` | `#btn_start`, `#btn_restart`, `#btn_restart_pause` |
| `flapy-flapy/script.js` | botones de inicio y reinicio (helper DRY `puedeArrancarLocal()`) |
| `sky/js/game.js` | *(ya era correcto: sólo arrancaba en `onMatchLive`)* |

* **Micro-ediciones quirúrgicas**: un `if` por disparador. Los motores siguen
  congelados contra el engorde, como exige la gobernanza.

#### 2. BUG-022 · El SDK ya no falla en silencio

Nuevo módulo `playwin-bridge-connection.js`:

* El fallo de conexión se avisa **siempre**, no solo durante la partida.
* **Timeout de 10 s**: un socket atascado ya no queda en silencio.
* Pantalla elegante nueva **`#pw-screen-offline`**: *"Duelos fuera de línea /
  Los juegos en línea no están disponibles en este momento"*, con el detalle
  técnico (URL intentada) y botón **REINTENTAR CONEXIÓN**.

#### 3. BUG-024 · Espera honesta

Tras 15 s en el radar sin rival, el texto cambia a:

> *"Seguimos buscando rival humano. Los rivales de entrenamiento están
> desactivados, así que la espera puede alargarse: entra con otra cuenta o avisa
> a alguien para duelar."*

#### Modularización del SDK

La Regla 1 de gobernanza asigna **800 líneas** a SDK/orquestadores, pero se dividió
igualmente para que cada módulo tenga una responsabilidad clara:

`playwin-bridge.js` (~396L, protocolo) · `playwin-bridge-ui.js` (124L, markup e
inyección) · `playwin-bridge-connection.js` (111L, WebSocket) ·
`playwin-bridge-status.js` (67L, avisos) · `playwin-bridge.css` (349L).

Los 4 juegos cargan ahora los 4 scripts en orden obligatorio.

#### Corrección de la propia suite de gobernanza

La comprobación de tamaño aplicaba **350 líneas al Bridge SDK**, cuando la Regla 1
le asigna **800** por ser orquestador explícito. **Se corrigió la prueba, no el
código**, con una lista explícita de orquestadores (nada de exclusiones amplias).

#### Verificación ejecutada

| Prueba | Resultado |
| :--- | :--- |
| `npm run test:governance` | ✅ **12/12** |
| Prueba nueva: *"Los juegos no arrancan partidas locales saltándose al árbitro"* | ✅ Pasa |
| **La misma prueba EN NEGATIVO** (quitando el guardián de carreras) | ✅ **Falla señalando `carreras/script.js:201 arranca sin guardián`** |
| `test:duel` · `test:anticheat` · `test:cyber` · `test:collusion` · `test:ghost` | ✅ PASS |
| `node scratch/check_bug_consistency.mjs` | ✅ 25 = 25 resueltos · 0 abiertos |

* 🔴 **Nota metodológica:** la primera versión de la prueba en negativo **dio un
  falso "OK"** porque `execFileSync` no puede capturar la salida de un hijo en este
  entorno (`spawn EPERM`). La verificación válida se hizo **desde PowerShell**, que
  sí captura la salida. Queda registrado para no repetir el error.

* **Estado final: 25 bugs catalogados · 25 resueltos · 0 abiertos.**

---

### 🔴 Hito C.4: El guardián de BUG-025 bloqueaba la partida (BUG-026) · `VERIFICADO`

**Fecha:** 2026-09-29 · **Bugs:** BUG-026 (crítico) · BUG-027 · BUG-028 detectado

* **Síntoma:** *"no funciona amigo… yo desconecté el websocket, le di reintentar y nada"*.
  Las capturas muestran **dos jugadores reales emparejados** con `0 KM/H · 0 M`.

* **Evidencia recogida ANTES de tocar código:**
  ```
  $ node scripts/check-sdk-served.mjs
    SERVIDOR DE DUELOS: EN LÍNEA · salas: 1 (humanas 1)
      · duel_carreras_7ff98f58 [PLAYING] progamer2026 0 vs 0 carlos_pro
  ```
  El servidor **sí emparejó** (semilla 4926714, `isGhostMatch: false`). Los marcadores
  nunca subieron porque **el cliente no podía arrancar su bucle**.

* **Causa raíz — mi propio guardián era peligroso:**
  ```javascript
  if (window.PlayWin && !window.PlayWin.canStartLocally()) return;
  ```
  Con un SDK **cacheado** (anterior al arreglo), `canStartLocally` es `undefined` y
  `!undefined === true` → **bloquea el arranque**. Y no sólo el local: también el
  legítimo del servidor (`onMatchLive`), porque la guarda está en el mismo manejador.

* **Dos defectos de fondo:**
  1. **No había cache-busting**: el navegador servía el SDK antiguo indefinidamente.
  2. **Un guardián nunca debe romper el camino feliz cuando falta información.**

* **Arreglos aplicados:**
  1. **Semántica positiva y tolerante a versiones viejas:**
     `const tieneArbitroDelServidor = () => !!window.PlayWin && typeof window.PlayWin.canStartLocally === 'function' && !window.PlayWin.canStartLocally();`
     → con SDK viejo devuelve `false` y **no bloquea**; se degrada en lugar de romperse.
  2. **Cache-busting** `?v=4` en los 4 juegos, centralizado en `sync_sdk_scripts.mjs`.
  3. **Detección de versiones mezcladas** entre módulos del SDK, con aviso al jugador.

* **BUG-027 (resuelto): reinicio automático de servidores** — el usuario lo pidió
  explícitamente y tenía razón: se depuraban fallos ya arreglados porque los
  servidores mantenían el código viejo en memoria. Nuevo `scripts/dev-watch.mjs`:
  ```powershell
  npm run dev:watch    # levanta :3000 y :3001 y los reinicia al guardar
  ```
  Vigila `apps/hub/src`, `apps/realtime-server/src`, `packages/database/src`,
  `packages/game-sdk` y los `.env`. `Ctrl+C` detiene los dos.

* **BUG-028 (abierto, decisión de producto):** `apps/hub/public/games/sky/index.html`
  está **vacío (0 bytes)**. *Sky Runner* es inaccesible pese a que `js/game.js` ya
  llama a `PlayWin.init()`. Hay que reconstruir la página o retirar el juego.

* **Verificación:** gobernanza **12/12** · `test:duel`, `test:ghost`, `test:anticheat`
  en verde · `check-sdk-served.mjs` confirma 5/5 ficheros idénticos y 4/4 scripts con `?v=4`.

* **Estado: 28 bugs catalogados · 27 resueltos · 1 abierto (BUG-028).**

---

## 🎯 Próximos Pasos Inmediatos

> El orden responde a riesgo, no a novedad. Ver [AUDITORIA_BUGS.md](AUDITORIA_BUGS.md) para el detalle de cada uno.

| Orden | Trabajo | Bugs |
| :--- | :--- | :--- |
| ~~**1º**~~ | ~~**Blindar la tesorería**~~ ✅ **COMPLETADO** — ver Hito B.1 | ~~BUG-001, 002, 005, 021~~ |
| **2º** | **Reparar la red de pruebas:** reescribir `duel_test.js` al protocolo con MatchTicket y arranque propio del servidor | BUG-006 |
| **3º** | **Arreglar el panel admin:** columnas correctas (`type`, `rank_tier`) + autenticación de administrador + tipos de ledger unificados | BUG-004 |
| **4º** | **Quitar los datos fabricados** del lobby y del launcher | BUG-007 |
| **5º** | **Restaurar el motor de competición:** implementar `resolveRankTier(skillRating)`, sellado real de las ligas de 10 y bloqueo `FOR UPDATE` | **BUG-019, 020** |
| **6º** | **Eliminar la duplicación** de la capa de datos Hub ↔ `packages/database` | BUG-003 |
| **7º** | **Centralizar constantes** de dinero, puntos y catálogo de juegos | BUG-008 |
| **8º** | **Endurecer calidad:** rate limiting en auth, CSRF, códigos HTTP consistentes, registro atómico, tokens de diseño | BUG-009 → BUG-016 |
| **9º** | **FASE 7:** rankings globales y despliegue VPS/Docker | — |

> 📌 **Nota del hito B.1:** `server.on('error')` y `--env-file` (parte del BUG-016) **ya se aplicaron** durante el bloque 1º, porque el cargador de entorno era necesario para eliminar el fallback de `JWT_SECRET`.

---

## 📌 Decisiones Técnicas Activas (no re-litigar)

| Decisión | Valor |
| :--- | :--- |
| Puntuación universal fase 1 | +100 victoria · +20 derrota · 0 abandono |
| Bolsa por liga | $25.00 → 1º $15 · 2º $7 · 3º $3 |
| Ajuste de MMR al cierre | +60 / +35 / +20 / 0 / −25 / −50 |
| Espera antes de Ghost Bot | 3.5 segundos |
| Ventana de reconexión | 15 segundos |
| Duración del MatchTicket | 5 minutos |
| Duración de la sesión | 7 días (cookie httpOnly `playwin_session`) |
| Rate limit de paquetes WS | 35 paquetes/segundo por jugador |
| Strikes anti-cheat | 2 strikes `MEDIUM` o 1 `HIGH` → descalificación |
| Columnas exactas del ledger | `wallet_ledger.type` (NO `entry_type`) |
| Columna exacta de división | `league_groups.rank_tier` (NO `tier`) |
| Juegos | `carreras` · `flapy-flapy` · `space` · `sky` |
| Puerto del servidor de duelos | `3001` (ver BUG-016: no carga el `.env`) |

---

*Bitácora reescrita el 2026-09-29 tras auditoría integral ejecutada. Separación explícita entre lo `VERIFICADO` y lo `REPORTADO`. Si detectas una discrepancia entre este documento y el código, **el código gana**: corrige este archivo.*
