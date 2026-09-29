---
name: playwin-auth-passport
description: Gestión de autenticación de usuarios, Pasaporte eSports competitivo multijuego, emisión de tokens efímeros para sesiones de juego en iframe y sincronización de billetera y estadísticas.
---

# 🛡️ Autenticación y Pasaporte eSports (`playwin-auth-passport`)

> **Misión Fundamental:**
> Centralizar la identidad del jugador, sus rangos independientes por cada videojuego, su balance de premios y la emisión segura de credenciales efímeras para que los juegos embebidos sepan quién está jugando sin comprometer credenciales maestras.

> ⚠️ **Esta skill fue reconciliada con el código real el 2026-09-29.** Todos los endpoints, nombres de campo y valores citados están verificados contra el código. Donde el diseño objetivo difiere de lo implementado, se marca explícitamente como **[PENDIENTE]**.

---

## 1. El Pasaporte eSports (Modelo de Datos Real)

Un jugador tiene una identidad única en Play Win, pero un rendimiento y rango completamente independientes por cada juego.

> 📌 **No existe una tabla `UserWallet` separada.** El saldo vive en `users.wallet_balance`. No existen los campos `pendingPrizesUsd` ni `payoutMethod`; el correo de cobro es `users.paypal_email`.

```
users                          game_passports
├── id            UUID PK      ├── id                 UUID PK
├── username      UNIQUE       ├── user_id            FK → users (CASCADE)
├── email         UNIQUE       ├── game_id            'carreras' | 'flapy-flapy' | 'space' | 'sky'
├── password_hash bcrypt       ├── rank_tier          DEFAULT 'BRONZE'
├── avatar_url    TEXT         ├── skill_rating       DEFAULT 1200
├── global_level  INT          ├── season_points      DEFAULT 0
├── has_premium   BOOLEAN      ├── total_matches      INT
├── paypal_email  VARCHAR      ├── wins / losses      INT
├── wallet_balance NUMERIC     ├── best_score         INT
├── is_verified   BOOLEAN      └── UNIQUE(user_id, game_id)
├── verification_token / reset_token / reset_token_expires_at
└── created_at / updated_at
```

**Relación:** 1 `UserAccount` → N `GamePassport` (uno por juego).

**Valores válidos de `rank_tier`:** `BRONZE` · `SILVER` · `GOLD` · `PLATINUM` · `DIAMOND` · `ELITE`

**Rango del `skill_rating`:** parte en `1200` por defecto. La banda teórica es `1200–3000`.

---

## 2. Flujo Real del Token Efímero de Partida (`MatchTicket`)

Para evitar que el juego tenga acceso a la sesión maestra o cookies del usuario en el navegador:

1. El usuario hace clic en "Jugar Duelo" en el Hub de Next.js.
2. El Hub llama a **`POST /api/games/ticket`** enviando la cookie de sesión HTTP-only.
   > 🔴 **Ruta exacta: `/api/games/ticket`** (implementada en `apps/hub/src/app/api/games/ticket/route.ts`, consumida en `apps/hub/src/components/GameLauncherModal.tsx:71`). No inventes `/api/v1/matches/ticket`: no existe.
3. El backend exige sesión válida (si no la hay → `401`) y genera un `MatchTicket`:
   ```json
   {
     "sub": "usr_99182",
     "username": "NeonRider",
     "avatar": "🎮",
     "gameId": "carreras",
     "type": "MATCH_SESSION_TICKET",
     "iat": 1727548700,
     "exp": 1727549000
   }
   ```
4. El Hub abre el iframe del juego y le envía el ticket mediante `window.postMessage` con el mensaje `PLAYWIN_INIT`.
5. El juego se conecta al WebSocket y envía el ticket en `JOIN_MATCH`: `{ action: 'JOIN_MATCH', player: { token, gameId } }`.
6. El servidor de duelos valida la firma en `verifyMatchTicket()` y **sobrescribe** la identidad del cliente con los claims del token (`rooms.js:24-27`). Lo que el cliente diga sobre su identidad se ignora.

### Firma del token (realidad técnica)

| Aspecto | Valor real |
| :--- | :--- |
| Algoritmo | **HMAC-SHA256 simétrico** (NO asimétrico) |
| Secreto | `JWT_SECRET` — **el mismo** que firma la sesión de usuario |
| Validez | **5 minutos** (`expiresIn: '5m'`) |
| Emisor | `authLib.signMatchTicket()` en `apps/hub/src/lib/auth.ts:26` |
| Verificador | `verifyMatchTicket()` en `apps/realtime-server/src/anticheat.js:55` (recalcula el HMAC manualmente) |

> ⚠️ **El juego nunca ve el `JWT_SECRET`.** Solo recibe el token ya firmado. El secreto debe ser **idéntico** entre el Hub y el servidor de duelos.

### Claims NO incluidos en el ticket

El ticket **no** transporta `skillRating` ni `leagueId`. El rango y la liga se resuelven en el servidor contra `game_passports` y `league_members` — el cliente nunca es la fuente de verdad de la división.

---

## 3. Mecánica de Sesión Maestra (realidad técnica)

| Aspecto | Valor real |
| :--- | :--- |
| Cookie | `playwin_session` · **httpOnly** · `sameSite: lax` · `secure` · `maxAge` 7 días |
| Algoritmo | JWT HS256 firmado con `JWT_SECRET` |
| Payload | `{ userId, username, email }` |
| Verificación | `authLib.verifyToken()` — `apps/hub/src/lib/auth.ts:40` |

### ⚠️ No existe middleware de sesión

**No hay `middleware.ts` ni helper compartido.** Cada route handler relee la cookie y verifica el token por su cuenta, y muchas rutas aceptan también `Authorization: Bearer <token>`. Al crear una ruta nueva, replica ese patrón.

**Inconsistencia conocida:** `/api/wallet/transactions` devuelve `200 { success: true, transactions: [] }` cuando no hay sesión, mientras `/api/matches/history` devuelve `401`. Unifica a `401` cuando crees rutas nuevas (ver `AUDITORIA_BUGS.md` → BUG-012).

---

## 4. Endpoints de Identidad (los reales)

| Ruta | Método | Auth | Función |
| :--- | :--- | :--- | :--- |
| `/api/auth/register` | POST | pública | Crea usuario + 4 pasaportes + slot de liga. Setea cookie. |
| `/api/auth/login` | POST | pública | **Username O email** + contraseña. Setea cookie. |
| `/api/auth/me` | GET | cookie/Bearer | Usuario + sus pasaportes. **Nunca da 401**: retorna `authenticated: false`. |
| `/api/auth/me` | POST | — | Logout: borra la cookie. |
| `/api/auth/verify-email` | POST / GET | token | Marca `is_verified = true`. |
| `/api/auth/forgot-password` | POST | pública | Token de 64 hex, TTL **60 min**. Respuesta genérica anti-enumeración. |
| `/api/auth/reset-password` | POST | token | Hashea la nueva contraseña y consume el token. |
| `/api/games/ticket` | POST | **sesión** | Emite el `MatchTicket` de 5 minutos. |

---

## 5. Especificación del Componente Pasaporte (UI)

El pasaporte del jugador en el frontend debe incluir:

* **Tarjeta de identidad:** avatar, nombre de usuario, insignia de cuenta verificada (`is_verified`) y tasa de victorias calculada.
* **Carrusel de Disciplinas:** tarjetas con el rango actual, Skill Rating, Season Points y récord V–D en *Space*, *Carreras*, *Sky* y *Flapy Flapy*, con botón directo a duelo 1v1.
* **Billetera de Premios:** saldo disponible (`users.wallet_balance`) y acceso al extracto contable.
* **Historial de Partidas:** últimos duelos con resultado, puntos ganados, rival enfrentado, marcador y semilla auditada.

> 📌 El componente real es `apps/hub/src/components/PassportView.tsx` (324L) con los tipos extraídos a `passport-types.ts`. Los tokens de diseño son obligatorios (ver `playwin-ui-experience`).

---

## 6. Reglas Inviolables

1. **Contraseñas cifradas con bcrypt.**
   * **Estado real: cost factor `10`** (`apps/hub/src/lib/auth.ts:14` → `bcrypt.genSalt(10)`).
   * **Mínimo exigido: `6` caracteres** (`apps/hub/src/app/api/auth/register/route.ts:28`). Username entre `3` y `20` caracteres.
   * 📋 **Objetivo [PENDIENTE]:** elevar el cost factor a `≥ 12` y endurecer la política de contraseñas. Hoy el código **incumple** esta regla.

2. **Zero Client Trust en la identidad.**
   El servidor de duelos **siempre** sobrescribe `id`, `username`, `avatar` y `gameId` con los claims del token verificado. Nunca confíes en los campos de identidad que envíe el cliente.

3. **Aislamiento de sesión.**
   Si el usuario no tiene sesión activa, el SDK muestra la pantalla `pw-screen-auth` y el Hub abre el modal de Login/Registro antes de permitir el ingreso a cualquier cola multijugador. El iframe **nunca** ve la cookie de sesión.

4. **Un solo secreto compartido.**
   `JWT_SECRET` firma tanto la sesión como el `MatchTicket`. Si difiere entre Hub y servidor de duelos, todos los emparejamientos fallarán con `SECURITY_ERROR`.

5. **Nunca quemar `JWT_SECRET` en el código.**
   📋 **Objetivo [PENDIENTE]:** hoy `apps/hub/src/lib/auth.ts:4` y `apps/realtime-server/src/anticheat.js:11` tienen el secreto de producción como valor por defecto. Debe eliminarse y fallar en el arranque si la variable no existe (ver `AUDITORIA_BUGS.md` → BUG-002).

---

## 7. Fuera de Alcance · Diseño Objetivo No Implementado

> Estas capacidades **no existen** en el código. No las asumas al escribir código nuevo.

| Capacidad | Estado |
| :--- | :--- |
| **MatchTicket de un solo uso** (invalidación al conectar) | ❌ **No implementado.** `verifyMatchTicket()` solo valida firma y expiración: no hay registro de nonces ni almacén de consumidos. El mismo ticket sirve para varias partidas durante sus 5 minutos, y el flujo de reconexión **depende** de que siga siendo válido. Diseñarlo requeriría una lista de consumidos con TTL en Redis/Postgres sincronizada con la ventana de reconexión de 15s. |
| **Firma asimétrica** (clave pública/privada) | ❌ No implementado. Hoy es HMAC simétrico. |
| **`skillRating` y `leagueId` dentro del ticket** | ❌ No incluidos. Se resuelven en servidor. |
| **Argon2id** | ❌ No implementado. Se usa bcrypt. |
| **Tabla `UserWallet`** | ❌ No existe. El saldo está en `users.wallet_balance`. |

---

## 📋 Registro de Correcciones (2026-09-29)

| Corrección | Antes (incorrecto) | Ahora (verificado) |
| :--- | :--- | :--- |
| Ruta del ticket | `/api/v1/matches/ticket` (404) | **`/api/games/ticket`** |
| Algoritmo de firma | "clave asimétrica" | **HMAC-SHA256 simétrico** |
| Token de un solo uso | Afirmado como Regla Inviolable cumplida | **Marcado como NO implementado** |
| Cost factor de bcrypt | "mínimo 12" | **Real: 10** (marcado como pendiente) |
| Longitud de contraseña | "longitud mínima" sin valor | **Real: mínimo 6 caracteres** |
| Campos del ticket | `skillRating`, `leagueId`, `avatar` como URL CDN | **Eliminados**; `type: 'MATCH_SESSION_TICKET'` añadido |
| Tabla `UserWallet` | Tabla separada con `pendingPrizesUsd` | **No existe**; saldo en `users.wallet_balance` |
| Campos de pasaporte | `currentSeasonPoints` | **`season_points`** (snake_case real) |
| Verificación de sesión | Implícita vía middleware | **No hay middleware**: cada ruta verifica por su cuenta |
