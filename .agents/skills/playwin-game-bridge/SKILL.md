---
name: playwin-game-bridge
description: Especificación e implementación del SDK universal de integración de juegos para Play Win. Define el handshake postMessage, menús estándar 1v1 sin pausas, blindaje anti-trampas, sistema de puntaje unificado y sincronización de estados.
---

# 🔌 PlayWin Game Bridge SDK (`playwin-game-bridge`)

> **Misión Fundamental:**
> Proveer una capa agnóstica de integración para que cualquier videojuego (Space, Carreras, Sky, Flapy Flapy o títulos futuros en Phaser, Three.js, Godot HTML5) se comunique de forma segura con la plataforma Play Win sin acoplar código, con menús estandarizados idénticos, sin pausas locales y con blindaje estricto anti-trampas.

> ⚠️ **Esta skill fue reconciliada con el código real el 2026-09-29.** Los nombres de eventos, métodos y límites están verificados contra `packages/game-sdk/playwin-bridge.js` y `apps/realtime-server/src/anticheat.js`. Donde el diseño objetivo difiere de lo implementado, se marca como **[PENDIENTE]**.

**Archivos reales:**
- SDK fuente: `packages/game-sdk/playwin-bridge.js` (343L) + `playwin-bridge.css`
- Copia servida: `apps/hub/public/game-sdk/playwin-bridge.js` (341L CSS) — **hay que mantenerlas sincronizadas**
- Motores de juego: `apps/hub/public/games/{carreras,flapy-flapy,space,sky}/`

---

## 1. Ciclo de Menús y Pantallas Estándar

Dado que todos los juegos operan en modalidad competitiva 1v1 en tiempo real, **queda prohibido el uso de botones de pausa local, pantallas de 'Game Over' personalizadas con récords locales desconectados, o botones de reinicio independientes**.

Todos los juegos deben renderizar o delegar al SDK las siguientes **4 fases obligatorias**:

```
[ 1. BUSCANDO RIVAL ] ➔ [ 2. VERSUS & CONTEO 3-2-1 ] ➔ [ 3. PARTIDA EN VIVO ] ➔ [ 4. RESULTADO FINAL ]
```

**El SDK inyecta las 4 pantallas automáticamente** desde `injectInterface()`. El juego solo debe aportar su canvas y su bucle; **no debe dibujar HUDs de puntuación propios** salvo que use `Orbitron` para el marcador interno.

### IDs reales de las pantallas (no inventes otros)

| Pantalla | ID en el DOM | Se activa con |
| :--- | :--- | :--- |
| Matchmaking (radar) | `#pw-screen-mm` | evento `MATCH_WAITING` |
| Versus y conteo | `#pw-screen-vs` | evento `MATCH_START` |
| HUD en vivo | `#pw-live-hud` (clase `.active`) | evento `MATCH_LIVE` |
| Resultado | `#pw-screen-result` | evento `MATCH_END` |
| Acceso requerido | `#pw-screen-auth` | falta de token / `SECURITY_ERROR` |
| Banner de reconexión | `#pw-reconnect-banner` | `RIVAL_DISCONNECTED` |

### Pantalla 1 · Matchmaking Overlay

* Radar animado con pulso en `--orange`. **Ya viene incluido en el SDK.**
* Tarjeta del jugador local (avatar, username, `RATING`).
* Texto: *"Buscando contrincante en tu división..."*
* Botón `CANCELAR Y VOLVER` → emite `PLAYWIN_CLOSE_ARENA` al Hub.

### Pantalla 2 · Versus y Conteo Sincronizado

* Tarjeta doble: jugador local (izquierda) · emblema `VS` + contador `3… 2… 1… ¡YA!` (centro) · rival (derecha).
* **El contador es puramente visual: dura 3 segundos.** El arranque real del juego lo dicta el evento `MATCH_LIVE` del servidor, no el contador del cliente.
* Al recibir `MATCH_END` el SDK calcula la victoria comparando `msg.winnerId === currentPlayer.id`.

### Pantalla 3 · HUD Superior en Vivo

* **Prohibido el botón de Pausa.** El SDK intercepta `Escape` y `P` con `preventDefault()` + `stopPropagation()` durante la partida.
* Estructura: tu puntuación (izq.) · indicador de liderazgo dinámico (centro) · puntuación y nombre del rival + `RENDIRSE` (der.).
* Indicador de liderazgo: `VAS GANANDO (+XX)` / `VAS PERDIENDO (-XX)` / `EMPATADOS`.
* Ping en vivo mostrado en el HUD (`--ms`) mediante `PING`/`PONG` cada 2 segundos.

> 🔴 **Aviso sobre `RENDIRSE`:** el botón llama **directamente** a `notifyCrash()` **sin diálogo de confirmación** (`playwin-bridge.js:129`). Un clic accidental cuesta la partida. Si tocas este componente, **añade la confirmación** — es una regla del diseño que hoy no se cumple.

### Pantalla 4 · Resultado de Partida

* *Título:* `¡VICTORIA!` o `DERROTA`.
* *Causa:* el campo `summary` que envía el servidor en `MATCH_END` (ej. *"El rival se estrelló contra un obstáculo"*).
* *Desglose:* el SDK lee **`msg.payout.winnerSeasonPoints`** y **`msg.payout.loserSeasonPoints`** — usa esos valores, **nunca los hardcodees**.
* *Botones:* `SIGUIENTE DUELO ➔` (re-entra a matchmaking) y `VOLVER AL HUB` (emite `PLAYWIN_CLOSE_ARENA`).

> ⚠️ Al terminar, el SDK emite `PLAYWIN_MATCH_COMPLETED` al Hub, que refresca el pasaporte y la liga sin recargar la página.

---

## 2. API Real del SDK (`window.PlayWin`)

> 🔒 Sellado con `Object.freeze()`. Las variables internas (socket, semilla, estado) viven en una clausura IIFE y **no están expuestas en `window`**.

```javascript
window.PlayWin.init({
  gameId: 'carreras',                     // requerido
  callbacks: {
    onMatchReady({ seed, opponent }) {},   // rival encontrado (llega MATCH_START)
    onMatchLive({ seed, isResume }) {},    // ¡ARRANCA EL BUCLE DEL JUEGO AQUÍ!
    onMatchEnd({ isWin, payout }) {}       // fin de partida
  }
});

window.PlayWin.startMatchmaking();                       // entrar a la cola (o reconectar)
window.PlayWin.sendTick({ x, y, score, isAlive });       // telemetría, ~20Hz
window.PlayWin.notifyCrash();                            // reportar choque
window.PlayWin.notifyFinish(score);                      // reportar fin (OBLIGATORIO en carreras)
window.PlayWin.getOpponentState();                       // → copia inmutable { x, y, score, isAlive }
window.PlayWin.getPlayer();                              // → copia inmutable de la sesión
window.PlayWin.isLive();                                 // → boolean
```

### Contrato crítico

**El bucle de juego NO debe arrancar hasta que se invoque `callbacks.onMatchLive()`.** Nunca arranques el juego al cargar la página ni al recibir `onMatchReady` (eso solo indica que el rival fue encontrado).

**`sendTick` recibe un OBJETO**, no parámetros sueltos. Firma real:
```javascript
sendTick(state = {})   // { x, y, score, isAlive }
```
Si no está en partida viva o el socket no está abierto, el SDK **descarta la llamada silenciosamente**.

### Variables globales opcionales

| Variable | Default | Uso |
| :--- | :--- | :--- |
| `window.PLAYWIN_WS_URL` | `ws://localhost:3001/ws` | URL del servidor WS. El Hub la sobreescribe vía `PLAYWIN_INIT.wsUrl`. |
| `window.PLAYWIN_SDK_CSS_URL` | `/game-sdk/playwin-bridge.css` | Hoja de estilos del SDK. |

---

## 3. Handshake `postMessage` (Hub ↔ iframe)

| Dirección | `type` | Payload | Cuándo |
| :--- | :--- | :--- | :--- |
| Juego → Hub | `PLAYWIN_READY` | — | El SDK se inicializó dentro del iframe. |
| Hub → Juego | `PLAYWIN_INIT` | `{ playerId, username, avatar, rank, skillRating, token, wsUrl, gameId }` | Inyecta identidad y ticket. |
| Juego → Hub | `PLAYWIN_REQUEST_LOGIN` | — | El juego necesita sesión. |
| Hub → Juego | `PLAYWIN_REQUIRE_LOGIN` | — | El Hub ordena mostrar `#pw-screen-auth`. |
| Juego → Hub | `PLAYWIN_MATCH_COMPLETED` | `{ winnerId, isWin, payout }` | Al terminar. Dispara el refresco del Hub. |
| Juego → Hub | `PLAYWIN_CLOSE_ARENA` | — | El usuario quiere volver al Hub. |

---

## 4. Blindaje de Seguridad y Anti-Manipulación (Zero-Tamper)

1. **Encapsulamiento en IIFE (Zero Global Leak).**
   Prohibido exponer variables en `window` (nada de `window.score = 0`). Toda la lógica vive en ámbito cerrado.

2. **El Servidor es el Árbitro Supremo.**
   El cliente **nunca declara que ganó**. Solo emite estas acciones WebSocket:

   | Acción real | Significado |
   | :--- | :--- |
   | `PLAYER_TICK` | `{ x, y, score, isAlive }` cada ~50ms |
   | `PLAYER_CRASHED` | *"Colisioné"*. En **carreras** el servidor la delega a `PLAYER_FINISH` |
   | `PLAYER_FINISH` | `{ score }`. **Obligatoria en carreras**: la victoria se decide por mayor distancia |

   > 📌 **No existen los eventos `EVENT_INPUT` / `EVENT_STATE` / `EVENT_CRASH`.** Esos nombres nunca estuvieron implementados.

3. **Validación de Límites Físicos.**
   Los límites viven en **`GAME_PHYSICS_BOUNDS`** (`apps/realtime-server/src/anticheat.js:16`), **no en un manifiesto**.

   > 📌 **No existe ningún archivo `playwin.json`** ni sistema de manifiestos de juego. Ver sección 6.

4. **Semilla Protegida (PRNG).**
   El cliente no genera obstáculos al azar localmente. Los dicta la `seed` que el servidor envía en `MATCH_START`. Cada juego inicializa **Mulberry32** con esa semilla → ambos jugadores ven exactamente la misma pista.

5. **Interpolación del rival (Lerp).**
   El SDK interpola el estado del rival a 60Hz (`factor 0.28`) entre los `RIVAL_TICK` recibidos. Los juegos deben leer el fantasma con `getOpponentState()`, **no** dibujarlo desde el último paquete crudo.

---

## 5. Sistema de Puntos Unificado

| Resultado de la Partida 1v1 | Season Points | Impacto en MMR | Condición |
| :--- | :---: | :---: | :--- |
| 🥇 **Victoria** | **+100** | **Ninguno** | Rival choca primero, o superas su puntaje/distancia. |
| 🥈 **Derrota** | **+20** | **Ninguno** | Chocas primero, o el rival tiene mejor score. |
| 🚪 **Abandono / Rendición** | **0** | **Ninguno** | Cierre de ventana, rendirse o no reconectar en 15s. |
| 🚫 **Detección de Trampa** | **0** | **Ninguno** | Inyección de score o manipulación de ticks. |

> 🔴 **El MMR NO se mueve por un duelo.** Se ajusta **una sola vez por semana** al cerrar la temporada, según la posición final en la liga de 10. Ver `playwin-league-engine` → sección 4.

### Criterio Universal de Victoria

1. **Regla de Supervivencia Directa (Muerte Súbita)** — en *Flapy Flapy*, *Space* y *Sky*: el primero que choca o cae pierde de inmediato.
2. **Regla de Mayor Distancia** — en *Carreras*: gana quien acumuló **más metros**. El servidor recibe `PLAYER_FINISH` y compara `p1 >= p2`. **Un choque en carreras NO te hace perder**: se delega a la comparación de distancia (`rooms.js:241-244`).

### Resolución por juego (implementada)

| Juego | Criterio | Fin de partida |
| :--- | :--- | :--- |
| **carreras** | Mayor distancia (`HIGHER_SCORE`) | `PLAYER_FINISH` · reloj de **20s iniciales + 10s por checkpoint** |
| **flapy-flapy** | Supervivencia (`OPPONENT_CRASH`) | Choque con tubería |
| **space** | Supervivencia (`OPPONENT_CRASH`) | Colisión |
| **sky** | Supervivencia / puntaje | Caída al abismo |

> 📌 **Carreras no tiene un límite fijo de 90 segundos.** El reloj arranca en `maxTime = 20` segundos y cada checkpoint suma `10` (`carreras/script.js:60-61`). El reloj es **de pared** (`performance.now()`), inmune a minimizar la pestaña.

---

## 6. Límites Físicos Reales (`GAME_PHYSICS_BOUNDS`)

> Esta es la **fuente de verdad** anti-cheat. Vuelve a leerla **antes** de añadir un juego nuevo o cambiar el scoring de uno existente: un límite mal calibrado descalifica a jugadores legítimos.

| Juego | Tipo de score | Límite de score | Salto máx. de posición | Límites espaciales | Duración mín. |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **carreras** | Continuo (m/s) | `2500`/s | `800` px | `maxPlayerX: 2200` | 4000 ms |
| **flapy-flapy** | **Discreto** (+1/tubería) | `1.25`/s · ráfaga máx. `2` | `350` px | `minY: -25` · `maxY: 575` · `x` fija en `88` (±45) | 2500 ms |
| **space** | Continuo | `15000`/s | `1200` px | `maxPlayerX: 2800` · `maxPlayerY: 1600` | 3500 ms |
| **sky** | Continuo | `100`/s | `500` px | — | 3500 ms |

### Sistema de Strikes

Violaciones `MEDIUM` acumulan `cheatStrikes`. A los **2 strikes** o ante una violación `HIGH` → **descalificación** (`PLAYER_DISQUALIFIED`): derrota, **0 Season Points** y registro de auditoría en BD.

### Rate limit de paquetes

Máximo **35 paquetes/segundo** por jugador. Superarlo → `PACKET_FLOOD_ANOMALY` → descalificación.

---

## 7. Reglas Inviolables

1. **Cero Pausas Locales.** Ningún juego debe incluir botones ni atajos de pausa. El SDK ya bloquea `Escape` y `P`.
2. **Mismo Ciclo de Menús.** Las 4 pantallas las renderiza el SDK. El juego no las duplica.
3. **Árbitro del Servidor.** Jamás confiar en el veredicto del cliente para acreditar victorias o premios.
4. **El bucle arranca en `onMatchLive`.** No antes.
5. **`sendTick` recibe un objeto.** Firma exacta: `sendTick({ x, y, score, isAlive })`.
6. **No inventes nombres de eventos.** Los reales son `PLAYER_TICK`, `PLAYER_CRASHED`, `PLAYER_FINISH`.
7. **No quemes los puntos en el cliente.** El desglose sale de `msg.payout` que envía el servidor.
8. **Sincroniza las dos copias del SDK.** `packages/game-sdk/` y `apps/hub/public/game-sdk/` deben tener el mismo contenido.

---

## 8. Fuera de Alcance · Diseño Objetivo No Implementado

| Capacidad | Estado |
| :--- | :--- |
| **Manifiesto `playwin.json`** | ❌ **No existe en el repositorio.** Los límites viven en `GAME_PHYSICS_BOUNDS`. |
| **Eventos `EVENT_INPUT` / `EVENT_STATE` / `EVENT_CRASH`** | ❌ Nunca implementados. |
| **IDs `SCREEN_MATCHMAKING` / `SCREEN_VERSUS` / …** | ❌ Los reales son `pw-screen-mm`, `pw-screen-vs`, `pw-screen-result`. |
| **Confirmación antes de rendirse** | ❌ No implementada. `RENDIRSE` llama directo a `notifyCrash()`. |
| **Bloqueo de cuenta por trampa** | ❌ Solo descalifica la partida. No hay ban de cuenta. |
| **`maxSpeedLimit: 350` del manifiesto** | ⚠️ Valor inventado. La velocidad real de carreras llega a `390` (`maxNitroSpeed`) y el límite de score es `2500`/s. |

---

## 📋 Registro de Correcciones (2026-09-29)

| Corrección | Antes (incorrecto) | Ahora (verificado) |
| :--- | :--- | :--- |
| Eventos del cliente | `EVENT_INPUT`, `EVENT_STATE`, `EVENT_CRASH` | **`PLAYER_TICK`, `PLAYER_CRASHED`, `PLAYER_FINISH`** |
| IDs de pantalla | `SCREEN_MATCHMAKING`, `SCREEN_VERSUS`… | **`#pw-screen-mm`, `#pw-screen-vs`, `#pw-live-hud`, `#pw-screen-result`** |
| Manifiesto del juego | `playwin.json` con ejemplo completo de carreras | **No existe**; los límites están en `GAME_PHYSICS_BOUNDS` |
| Límite de score de carreras | `maxTheoreticalPointsPerSecond: 120` | **`2500`/s** |
| Velocidad máxima | `maxSpeedLimit: 350` | **`390` real** (`maxNitroSpeed`) |
| Fin de partida en carreras | "si ambos sobreviven la tanda (ej. 90 segundos)" | **20s + 10s por checkpoint**; el choque no hace perder |
| Impacto en MMR por duelo | Tabla con "+15 a +25 MMR" / "−30 MMR" | **Un duelo NO mueve el MMR** |
| Confirmación de rendición | "muestra confirmación flotante" | **No existe confirmación** (marcado como pendiente) |
| Bloqueo de cuenta por trampa | "Bloqueo de Cuenta" | **No implementado**; solo descalifica la partida |
| API de ticks | "coordenadas y puntaje cada 50ms" | **`sendTick({ x, y, score, isAlive })`** — recibe un objeto |
| Arranque del juego | Implícito al llegar a 0 el contador | **`callbacks.onMatchLive()`** (el contador es solo visual) |
| Ocultamiento del HUD | No documentado | El SDK lo hace solo; los juegos no deben dibujar HUD de puntuación |
