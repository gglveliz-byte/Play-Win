# 🎮 PLAY WIN — ESPECIFICACIÓN DE ARQUITECTURA TÉCNICA Y DE NEGOCIO
**Plataforma Global de Competición eSports Basada en Micro-Ligas Semanales**
*Versión:* 1.0.0 | *Fecha:* 2026-09-28 | *Estado:* Arquitectura Base para Desarrollo de Skills e Implementación

---

## 📌 1. Resumen Ejecutivo y Visión

**Play Win** transforma la competición de videojuegos eliminando la frustración del "Torneo Masivo Único" (donde miles compiten y el 99.9% pierde el interés en 24 horas). 

El sistema implementa un **motor de micro-ligas semanales cerradas de 10 jugadores**, emparejados por habilidad matemática (**Skill Rating / MMR**), compitiendo por **Puntos de Temporada (Season Points)** para obtener premios directos, subir de división y desbloquear premios mayores en temporadas futuras.

```mermaid
flowchart LR
    A["👤 Jugador"] --> B["🎮 Jugar Partida"]
    B --> C["⚡ Ganar Season Points"]
    C --> D["🏆 Liderar Liga de 10"]
    D --> E["💰 Reclamar Premio Semanal"]
    E --> F["⭐ Incrementar Skill Rating"]
    F --> G["👑 Ascenso a División Superior"]
    G --> H["💎 Competir por Premios Mayores"]
    H --> B
```

---

## 🏗️ 2. Arquitectura de Alto Nivel del Ecosistema

La plataforma desacopla completamente el **Catálogo de Videojuegos** del **Motor de Competición**, permitiendo integrar desde juegos HTML5 ligeros locales (`sky`, `carreras`, `flapy flapy`, `space`) hasta videojuegos de terceros vía API.

```mermaid
graph TB
    subgraph ClientLayer ["Capas de Clientes"]
        PWA["💻 Web App Hub (Play Win Dashboard)"]
        G1["🚀 Space Arcade"]
        G2["🏎️ Carreras GP"]
        G3["🪽 Sky Runner"]
        G4["🐦 Flapy Flapy"]
    end

    subgraph GatewayLayer ["Puerta de Entrada & Telemetría"]
        API_GW["🚪 API Gateway & Auth Service (JWT / Sessions)"]
        BRIDGE["📡 Game Bridge SDK (postMessage / WebSockets / Anti-Cheat)"]
    end

    subgraph CoreEngine ["Motor Central de Competición (eSports Core)"]
        MM_SRV["⚖️ Matchmaking & Sharding Engine (Grupos de 10)"]
        SEASON_SRV["🗓️ Season Orchestrator (Cron Lunes - Domingo)"]
        RATING_SRV["⭐ Skill Rating & Rank Progression (MMR / Elo)"]
        POINTS_SRV["🏆 Season Points & Leaderboard Service"]
        FRAUD_SRV["🛡️ Anti-Cheat & Telemetry Validator"]
    end

    subgraph EconomicLayer ["Economía & Recompensas"]
        LEDGER["💰 Wallet & Prize Ledger"]
        SPONSOR["📢 Sponsor & Campaign Manager"]
    end

    subgraph StorageLayer ["Persistencia y Caché"]
        PG[("🐘 PostgreSQL - Base Relacional")]
        REDIS[("⚡ Redis - Leaderboards & Season Locks")]
    end

    G1 & G2 & G3 & G4 -->|Telemetría cifrada| BRIDGE
    BRIDGE --> API_GW
    PWA --> API_GW

    API_GW --> MM_SRV
    API_GW --> SEASON_SRV
    API_GW --> FRAUD_SRV
    API_GW --> POINTS_SRV

    FRAUD_SRV -->|Validado OK| POINTS_SRV
    POINTS_SRV --> REDIS
    MM_SRV --> PG
    SEASON_SRV --> PG
    SEASON_SRV --> REDIS
    RATING_SRV --> PG
    LEDGER --> PG
```

---

## 🔄 3. Ciclo de Vida Semanal Automatizado (The Weekly Loop)

Cada temporada es una máquina de estados determinista que inicia el **Lunes 00:00 UTC** y finaliza el **Domingo 23:59 UTC**.

```mermaid
sequenceDiagram
    autonumber
    actor Player as 👤 Jugador
    participant Cron as ⏰ Season Cron
    participant MM as ⚖️ Matchmaker
    participant Game as 🎮 Videojuego
    participant Validator as 🛡️ Anti-Cheat
    participant Board as 📊 Leaderboard
    participant Ledger as 💰 Prize Ledger

    Note over Cron, MM: Lunes 00:00 UTC - Apertura de Temporada
    Cron->>MM: Trigger 'Season_Start' (Snapshot de Skill Rating)
    Player->>MM: Ingresa a competir en un Juego
    MM->>MM: Buscar bracket por Skill Rating (Rango Bronce..Elite)
    MM->>MM: Asignar a Liga de 10 jugadores (Cluster Lock 🔒)
    MM-->>Player: Notificar Grupo Asignado (#8,421)

    Note over Player, Board: Durante la Semana (Lunes a Domingo)
    loop Bucle de Partidas
        Player->>Game: Juega partida en vivo
        Game->>Validator: Enviar telemetría (Duración, Scores, Eventos, Hashes)
        Validator->>Validator: Validar consistencia anti-trampas
        alt Partida Válida
            Validator->>Board: Acreditar Season Points (+100 victoria, bonus)
            Board-->>Player: Actualizar Ranking de los 10 en tiempo real
        else Anomalía Detectada
            Validator-->>Player: Rechazar score / Marcar flag de revisión
        end
    end

    Note over Cron, Ledger: Domingo 23:59 UTC - Cierre de Temporada
    Cron->>Board: Congelar tablas de clasificación (Lock Total)
    Cron->>Ledger: Identificar TOP 1..3 de cada Liga de 10
    Ledger->>Ledger: Dispersar premios del Prize Pool a billeteras
    Cron->>MM: Recalcular Skill Rating (+Δ MMR para Top, -Δ MMR para Bottom)
    Cron->>MM: Procesar ascensos / descensos de división
    Cron->>Player: Notificar resultados, recompensas y nuevo Rango
```

---

## ⚖️ 4. Doble Motor: Season Points vs. Skill Rating

Uno de los pilares fundamentales del modelo de negocio es la separación conceptual entre el **Esfuerzo Semanal** y el **Nivel de Destreza Real**:

```mermaid
classDiagram
    class PlayerProfile {
        +UUID playerId
        +String username
        +Map~GameId, GamePassport~ games
        +Wallet wallet
    }

    class GamePassport {
        +String gameId
        +RankTier rankTier
        +Int skillRating
        +Int currentSeasonPoints
        +UUID currentLeagueId
        +History stats
    }

    class LeagueGroup {
        +UUID leagueId
        +Int seasonNumber
        +String gameId
        +RankTier tier
        +List~UUID~ players
        +Boolean isLocked
        +Timestamp expiresAt
    }

    class RankTier {
        <<enumeration>>
        BRONZE
        SILVER
        GOLD
        PLATINUM
        DIAMOND
        ELITE
    }

    PlayerProfile "1" *-- "many" GamePassport
    GamePassport --> RankTier
    LeagueGroup --> RankTier
```

### Tabla Comparativa de Motores

| Dimensión | 🏆 Season Points (Puntos de Temporada) | ⭐ Skill Rating / MMR (Habilidad) |
| :--- | :--- | :--- |
| **Propósito** | Determinar quién gana la liga **esta semana**. | Determinar contra quién juegas la **próxima temporada**. |
| **Persistencia** | Se reinicia a **0** cada lunes. | Se mantiene y ajusta semanalmente según resultados. |
| **Cómo se gana** | Jugando partidas, logrando victorias, combos y objetivos. | Rendimiento relativo frente a los 9 rivales de grupo. |
| **Recompensa** | Premio en efectivo/créditos de la semana. | Ascenso de categoría (ej. de Oro a Platino) y mayor bolsa. |
| **Psicología** | Grind activo, adrenalina de carrera corta. | Prestigio, estatus competitivo, maestría a largo plazo. |

---

## 🎯 5. Motor de Sharding y Formación de Ligas (Grupos de 10)

Cuando hay 100.000 jugadores en un juego, el sistema ejecuta un algoritmo de agrupamiento por proximidad de Skill Rating:

```mermaid
flowchart TD
    Total["👥 100.000 Jugadores Activos"] --> Filter["Segmentación por Rango (Bronce, Plata, Oro...)"]
    
    subgraph BucketGold ["Bucket: División ORO (ej. 30.000 jugadores)"]
        Sort["Ordenar jugadores por Skill Rating descendente"]
        Chunks["Dividir en bloques contiguos de 10 jugadores"]
        Sort --> Chunks
    end
    
    Filter --> BucketGold
    
    Chunks --> G1["🏆 Liga #101 (Rating: 1850 - 1840)"]
    Chunks --> G2["🏆 Liga #102 (Rating: 1839 - 1825)"]
    Chunks --> G3["🏆 Liga #... (Rating: 1824 - 1810)"]
    Chunks --> GN["🏆 Liga #3000 (Rating: 1610 - 1600)"]
    
    G1 & G2 & G3 & GN --> Lock["🔒 Grupo Bloqueado por 7 Días"]
```

### Reglas de Bloqueo y Asignación Dinámica:
1. **Asignación en Primera Partida:** Si un jugador no inicia la semana inmediatamente el lunes, ingresa en el momento en que inicia su primera partida dentro de un grupo abierto de su mismo rango.
2. **Capacidad Máxima 10:** Tan pronto el jugador #10 entra, el grupo se sella con `isLocked = true`.
3. **Anti-Desertion:** Ningún jugador puede transferirse de liga a mitad de semana para evitar cazar grupos con puntajes bajos.

---

## 🛡️ 6. Sistema Anti-Trampas y Telemetría de Juegos

Para los juegos web actuales (`sky`, `carreras`, `flapy flapy`, `space`) y juegos integrados vía web, la plataforma no confía en el puntaje enviado por el cliente. Se utiliza un canal de telemetría de eventos:

```mermaid
flowchart LR
    subgraph Client ["Cliente Navegador / Canvas"]
        Game["🎮 Motor del Juego"]
        Telemetry["⏱️ Tracker de Eventos & Inputs"]
        Packer["🔐 Generador de Token de Sesión"]
        Game --> Telemetry --> Packer
    end

    subgraph Bridge ["Play Win Bridge SDK"]
        PostMsg["📨 window.postMessage Cifrado"]
        Packer --> PostMsg
    end

    subgraph ServerValidator ["Backend Anti-Cheat"]
        Decrypt["Desempaquetar & Validar Firma"]
        Sim["Auditoría Heurística de Telemetría"]
        Score["Aprobación de Puntos"]
        
        PostMsg --> Decrypt --> Sim --> Score
    end
```

### Reglas del Validador Anti-Cheat:
* **Duración vs. Score:** Verificación de que la relación `Score / Tiempo_de_juego` no exceda los límites matemáticos del motor del juego.
* **Frecuencia de Inputs:** Detección de patrones de botting (clics equidistantes al milisegundo en Flapy o aceleración antinatural en Carreras).
* **Nonce de Sesión:** Cada partida solicita un `matchToken` firmado por el backend antes de iniciar; el resultado debe reportarse con ese token único dentro de una ventana de expiración.

---

## 💰 7. Modelo Financiero y Distribución de Premios

El modelo opera bajo el estándar legal de **Competición basada en Habilidad (Skill-Based Gaming)**:

```mermaid
pie title Distribución Típica de Ingresos Brutos
    "🏆 Prize Pool para Ganadores" : 50
    "🛡️ Operación, Servidores y Anti-Cheat" : 20
    "📢 Marketing y Adquisición" : 15
    "💼 Margen de la Plataforma" : 15
```

### Fuentes de Alimentación del Prize Pool:
1. **Patrocinios Corporativos:** Marcas patrocinan ligas completas (ej. *Copa Red Bull Space League*).
2. **Suscripción Premium ($4.99/mes):** Estadísticas avanzadas, insignias cosméticas, ligas exclusivas sin ventaja competitiva directa (no Pay-To-Win).
3. **Monetización Publicitaria No Invasiva:** Recompensas de visualización opcional y banners perimetrales en torneos.

### Escalado de Premios por División:
$$\text{Premio Top 1} \propto \text{Rango} \times \text{Factor de Dificultad}$$

* 🥉 **Bronce:** Bolsa pequeña / Premios formativos ($5).
* 🥈 **Plata:** Bolsa media ($10).
* 🥇 **Oro:** Bolsa competitiva ($25).
* 💠 **Platino:** Bolsa avanzada ($50).
* 💎 **Diamante:** Bolsa profesional ($100).
* 👑 **Elite:** Supercopa / Gran Premio ($250+).

---

## 🎮 8. Integración Directa con los 4 Juegos Existentes

Los juegos alojados en el repositorio se integran como las primeras cuatro disciplinas oficiales de Play Win:

```mermaid
graph TD
    Hub["🏆 PLAY WIN ARENA (Hub Principal)"]
    
    subgraph Games ["4 Disciplinas Oficiales"]
        G1["🚀 SPACE (Shmup Arcade) - Reflejos, Supervivencia, Combos"]
        G2["🏎️ CARRERAS (Top-Down Racing) - Precisión, Tiempo por Vuelta"]
        G3["🪽 SKY (Sky Runner) - Esquiva, Altitud, Score Attack"]
        G4["🐦 FLAPY FLAPY (Precision Tapper) - Resistencia, Pulso"]
    end
    
    Hub -->|Lanzar en Iframe Seguro| G1
    Hub -->|Lanzar en Iframe Seguro| G2
    Hub -->|Lanzar en Iframe Seguro| G3
    Hub -->|Lanzar en Iframe Seguro| G4
```

Cada juego compartirá el **SDK Común `playwin-bridge.js`**:
* Notificación de inicio de partida: `PLAY_WIN_MATCH_START`.
* Notificación de progreso/telemetría: `PLAY_WIN_TELEMETRY`.
* Notificación de fin de partida y score: `PLAY_WIN_MATCH_RESULT`.
* Retorno a la arena: `PLAY_WIN_CLOSE_ARENA`.

---

## 🤖 9. Ecosistema de Skills para el Equipo de IA

Para construir este sistema con rigor y calidad de producción, dividiremos el trabajo en **Skills de Agentes Especializados** organizados en `.agents/skills/`:

```mermaid
graph TD
    subgraph AgentSkills ["Habilidades del Equipo de IA (.agents/skills)"]
        S1["🧠 esports-league-core\n(Reglas de negocio, temporadas, ligas de 10, scoring)"]
        S2["⚖️ esports-matchmaker\n(Algoritmos de ELO/MMR, sharding y locking)"]
        S3["🛡️ esports-anticheat-telemetry\n(Validación de sesiones, tokens y detección de fraude)"]
        S4["🔌 esports-game-bridge\n(SDK JS unificado para integrar los 4 juegos)"]
        S5["🎨 esports-ui-arena\n(Dashboard visual de ligas, podiums y pasaporte del jugador)"]
    end
```

### Detalle de Skills a Crear:
1. `esports-league-core`: Gestiona el ciclo semanal, máquinas de estados (Lunes-Domingo), cálculo de Season Points y orquestación de ascensos/descensos.
2. `esports-matchmaker`: Algoritmo de clustering de 10 jugadores basado en Skill Rating y gestión de slots.
3. `esports-anticheat-telemetry`: Cifrado, tokens de sesión y heurísticas para validar partidas sin confiar ciegamente en el cliente.
4. `esports-game-bridge`: Módulo universal inyectable en `space`, `carreras`, `sky` y `flapy flapy`.
5. `esports-ui-arena`: Interfaz web moderna con estética eSports competitiva (tablas de posiciones en tiempo real, perfil con pasaporte multijuego y modal de juego).

---

## ✅ 10. Conclusión y Próximos Pasos

Con este documento maestro de arquitectura:
1. Tenemos la base formal de datos, flujos de negocio y seguridad.
2. Procederemos a empaquetar las **Skills** correspondientes para que los asistentes de IA ejecuten cada componente con estándares de ingeniería de software.
