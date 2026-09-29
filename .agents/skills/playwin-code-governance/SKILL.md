---
name: playwin-code-governance
description: Protocolo estricto de gobernanza de código, límite de líneas por archivo (< 350 líneas), prevención de alucinaciones de IA, prohibición de lógica de negocio en frontend y cumplimiento de tokens de diseño sin estilos inventados.
---

# 🛡️ Gobernanza de Código y Prevención de Errores de IA (`playwin-code-governance`)

> **Propósito Fundamental:**  
> Evitar que la IA cometa errores comunes como inflar archivos monolíticos, inventar estilos arbitrarios, duplicar utilidades ya existentes o colocar lógica de dinero, stock, trampas o prompts en el frontend del cliente.

---

## 🛑 1. Las 5 Reglas Inviolables de Ingeniería

### 📏 Regla 1: Límite Estricto de Tamaño (< 350 Líneas Estándar, Techo Máximo de 800 Líneas)
* **Archivos Estándar y Nuevos Módulos:** Ningún archivo (`.ts`, `.tsx`, `.js`, `.css`) puede superar las **350 líneas de código**. Si supera las 300 líneas, es obligatorio modularizar.
* **Componentes Extendidos y Orquestadores Centrales (SDK, Motores, Routers):** Límite máximo e infranqueable de **800 líneas**. Queda terminantemente prohibido crear archivos que superen las 800 líneas.
* **Motores de Videojuegos Legacy (`public/games/`):** Los archivos de juegos preexistentes quedan exentos de reescritura monolítica pero están **estrictamente congelados contra el engorde**: queda prohibido inflarlos; cualquier cambio debe ser quirúrgico, mínimo e in-place.

### 🚫 Regla 2: Zero Lógica Crítica y Blindaje Anti-Manipulación en Frontend
El cliente (Next.js / Navegador / SDK) es un entorno inseguro por definición. Queda terminantemente prohibido:
* ❌ **Cálculos Financieros:** Nunca calcular saldos, ganancias, comisiones o premios en el front.
* ❌ **Gestión de Stock o Cuotas:** Nunca verificar inventario, cupos o elegibilidad de ligas solo en el cliente.
* ❌ **Árbitro de Partida:** El cliente nunca decide victorias; el servidor es el único árbitro.
* ❌ **Secretos y Prompts:** Prohibido quemar API keys secretas (Whop, PayPal Secret) o JWT secrets en el frontend.
* 🔒 **Blindaje en Runtime (SDK Tamper Protection):**
  * Toda API expuesta en cliente (`window.PlayWin`) debe estar congelada con `Object.freeze()`.
  * Todo estado interno (`socket`, variables de sala, semillas) debe permanecer aislado en clausuras IIFE sin exponerse en `window`.
  * Los métodos lectores (`getPlayer()`, `getOpponentState()`) deben retornar copias inmutables (`{ ...obj }`) para evitar mutación externa desde DevTools.

### 🎨 Regla 3: Cero Estilos Asumidos o Inventados (Strict Token Compliance)
* Queda **prohibido** introducir colores HEX arbitrarios (`#ffffff`, `#000000`, `#3b82f6`, etc.) o clases genéricas ajenas.
* Toda interfaz debe construirse **exclusivamente** con las variables oficiales de [playwin-ui-experience](file:///c:/Users/HP/OneDrive/Documentos/GitHub/Play%20Win/.agents/skills/playwin-ui-experience/SKILL.md):
  * Fondos: `var(--bg)`, `var(--hero-bg-1)`, `var(--hero-bg-2)`, `var(--card)`.
  * Tintas: `var(--ink)`, `var(--ink-soft)`, `var(--mute)`, `var(--line)`.
  * Acentos: `var(--orange)`, `var(--orange-2)`.
  * Píldoras: `var(--pill-dark)`, `var(--pill-light)`.

### 🔗 Regla 4: Conexión con lo Existente (Cero "Código Isla")
* Antes de escribir una función utilitaria (fechas, monedas, hashes, clientes HTTP):
  1. Inspeccionar si ya existe en `packages/` o `apps/hub/src/lib/`.
  2. Si existe, **reutilizarla obligatoriamente** importándola.
  3. No crear copias paralelas o duplicadas de la misma lógica.

### ✂️ Regla 5: Cero Elipsis y Código Completo (Surgical Integrity)
* Queda prohibido el uso de comentarios perezosos como `// ... resto del código sin cambios`, `/* TODO */`, o funciones vacías.
* Todo bloque entregado debe estar 100% implementado, funcional y listo para producción.

---

## 📋 Checklist Obligatorio Previo a Guardar Cambios
1. [ ] ¿El archivo tiene menos de 350 líneas?
2. [ ] ¿Hay alguna validación de dinero, premio o árbitro en el frontend que deba estar en el servidor?
3. [ ] ¿Estoy utilizando las variables CSS del sistema en lugar de inventar colores HEX?
4. [ ] ¿Revisé si ya existía una función similar en el repositorio antes de crear una nueva?
5. [ ] ¿El código entregado está completo y sin elipsis?
