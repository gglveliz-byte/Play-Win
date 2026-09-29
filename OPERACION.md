# 🚀 OPERACIÓN — ARRANQUE Y MONITORIZACIÓN

> Guía práctica para levantar Play Win y ver qué está pasando sin adivinar.
> **Última actualización:** 2026-09-29

---

## ⚡ Arranque rápido

Necesitas **dos terminales**: el Hub (web) y el servidor de duelos (WebSocket).

### Terminal 1 — Hub (Next.js)

```powershell
cd "C:\Users\HP\OneDrive\Documentos\GitHub\Play Win"
npm run dev:hub
```
→ Abre **http://localhost:3000**

### Terminal 2 — Servidor de duelos

```powershell
cd "C:\Users\HP\OneDrive\Documentos\GitHub\Play Win"
npm run dev:realtime
```
→ Escucha en **ws://localhost:3001/ws** · salud en **http://localhost:3001/health**

---

## 🤖 Los bots están DESACTIVADOS por defecto

Un rival de división (bot) **solo entra si lo pides explícitamente**. Con los bots apagados, un jugador sin rival humano se queda esperando en el radar, que es lo correcto mientras se valida el emparejamiento real entre personas.

### Encender los bots (cuando tú lo decidas)

```powershell
# PowerShell
$env:GHOST_BOTS_ENABLED='true'
$env:GHOST_BOT_DELAY_MS='10000'   # opcional: cuánto esperar antes de recurrir a un bot
npm run dev:realtime
```

```bash
# Bash / Git Bash
GHOST_BOTS_ENABLED=true GHOST_BOT_DELAY_MS=10000 npm run dev:realtime
```

> ⚠️ **Cuando los bots están encendidos, la interfaz lo dice claramente:**
> la pantalla de versus muestra *"RIVAL DE ENTRENAMIENTO · NO HABÍA JUGADORES EN COLA"*
> y el HUD lleva una insignia `🤖 BOT` junto al rival. Nunca se oculta.

### Apagarlos otra vez

Cierra la terminal del servidor de duelos y arráncalo sin la variable. El valor por
defecto es **apagado**, así que no hay nada que deshacer.

---

## 📊 Monitorización

### Estado del servidor de duelos

```powershell
Invoke-RestMethod http://localhost:3001/health | ConvertTo-Json -Depth 6
```

Devuelve, entre otras cosas:

| Campo | Qué significa |
| :--- | :--- |
| `duels.humanMatchCount` | Partidas **entre personas** en curso |
| `duels.ghostMatchCount` | Partidas **contra bots** en curso |
| `duels.waitingInQueue` | Cuántos esperan rival, **por juego** |
| `duels.waitingPlayersTotal` | Total esperando |
| `duels.rooms[]` | Detalle de cada sala: jugadores, marcadores, semilla, si es contra bot |
| `config.ghostBotsEnabled` | Si los bots están encendidos **ahora mismo** |
| `config.ghostBotDelayMs` | Espera antes de que entre un bot |
| `config.selfMatchAllowed` | Si se permite emparejar al mismo jugador |
| `uptimeSeconds` | **Cuánto lleva vivo el proceso** (delata servidores viejos) |

### Comprobación rápida: ¿estoy ejecutando el código nuevo?

```powershell
(Invoke-RestMethod http://localhost:3001/health).config
```

Si devuelve algo → código nuevo. Si sale vacío → **estás ejecutando una versión antigua**.

### Ver solo lo esencial

```powershell
$h = Invoke-RestMethod http://localhost:3001/health
"Humanos: $($h.duels.humanMatchCount) | Bots: $($h.duels.ghostMatchCount) | En cola: $($h.duels.waitingPlayersTotal) | Uptime: $([math]::Round($h.uptimeSeconds/60,1)) min"
```

### Bucle de monitorización en vivo (cada 5 s)

```powershell
while ($true) {
  Clear-Host
  $h = Invoke-RestMethod http://localhost:3001/health
  "=== PLAY WIN · $((Get-Date).ToString('HH:mm:ss')) ==="
  "Uptime        : $([math]::Round($h.uptimeSeconds/60,1)) min"
  "Partidas      : $($h.duels.humanMatchCount) humanas · $($h.duels.ghostMatchCount) contra bot"
  "En cola       : $($h.duels.waitingPlayersTotal)"
  "Bots activos  : $($h.config.ghostBotsEnabled)"
  ""
  $h.duels.rooms | Format-Table gameId, status, playerA, playerB, rival, scoreA, scoreB -AutoSize
  Start-Sleep 5
}
```

### Estado del Hub

```powershell
# ¿Responde el Hub?
(Invoke-WebRequest http://localhost:3000/api/auth/me -UseBasicParsing).StatusCode   # 200 esperado
```

---

## 🔧 Mantenimiento de la base de datos

### Listar usuarios

```powershell
node --env-file=.env.test packages/database/scripts/list-users.mjs
```
Separa las cuentas reales de las generadas por las suites de prueba.

### Conceder permisos de administrador

```powershell
node --env-file=.env.test packages/database/scripts/grant-admin.mjs <usuario-o-email>
```
Sin esto, `/api/admin/metrics` responde **403**: ningún usuario es admin por defecto.

### Aplicar migraciones (idempotentes, se pueden repetir)

```powershell
npm run test:migrate          # integridad de ligas + sharding por MMR
npm run test:migrate:ranks    # rank_tier derivado de skill_rating
```

---

## 🧪 Verificación antes de confiar en un cambio

```powershell
npm run test:all        # las 11 suites
```
Suites individuales:

| Comando | Qué verifica | ¿Necesita servidores? |
| :--- | :--- | :--- |
| `test:governance` | Límites, secretos, frontera cliente/servidor, blindaje del SDK | No |
| `test:db` | Servicios de base de datos | No |
| `test:duel` | Protocolo 1v1 completo (arranca su propio servidor) | No |
| `test:anticheat` | Detección de trampas | No |
| `test:cyber` | Auditoría de ciberseguridad | No |
| `test:collusion` | Detección de colusión | No |
| `test:ghost` | Coherencia de los rivales de división | No |
| `test:leagues` | Sharding por MMR e integridad de ligas | No |
| `test:treasury` | Tesorería y cierre semanal | **Sí (:3000)** |
| `test:email` | Correo y recuperación | **Sí (:3000)** |
| `test:e2e` | Flujo completo con duelo real | **Sí (:3000 y :3001)** |

---

## 🛑 Parar los servidores

```powershell
# Ver qué está escuchando
netstat -ano | Select-String ":3000|:3001"

# Cerrar por PID (sustituye <PID>)
taskkill /PID <PID> /T /F
```

Si el puerto está ocupado por un proceso antiguo, `taskkill` avisará
`Access denied` cuando el proceso no sea tuyo. En ese caso ciérralo desde el
Administrador de tareas o reinicia la sesión.

> 💡 **Truco:** el campo `uptimeSeconds` de `/health` delata un servidor viejo.
> Si marca horas cuando acabas de arrancar, estás hablando con otro proceso.

---

## 🚨 Problemas frecuentes

| Síntoma | Causa probable | Solución |
| :--- | :--- | :--- |
| La página devuelve 500 sin cuerpo | Caché de build corrupta | `Remove-Item -Recurse -Force "apps\hub\.next"` y reiniciar |
| `Module not found: Can't resolve 'dns'` | Un componente de cliente importa `@playwin/database` en vez de `/constants` | `npm run test:governance` lo detecta y señala el archivo |
| Un jugador espera para siempre en el radar | **Es lo esperado:** los bots están apagados y no hay rival humano | Enciende los bots o entra con una segunda cuenta |
| `EADDRINUSE` al arrancar el servidor de duelos | Otro proceso ocupa el 3001 | `PORT=3002 npm run dev:realtime` |
| El panel `/admin` muestra "NO SE PUDIERON CARGAR LAS MÉTRICAS" | Tu cuenta no es administrador | `node --env-file=.env.test packages/database/scripts/grant-admin.mjs <tu-usuario>` |
