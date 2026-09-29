---
name: playwin-ui-experience
description: Sistema de diseño de autor y directrices de UI/UX para Play Win con estética Warm Editorial & Tangerine Luxury (paleta apergaminada/tinta/naranja volumétrico, grano SVG analógico, tipografía Inter y navegación flotante por píldoras).
---

# 🎨 Sistema de Diseño y Experiencia de Usuario (`playwin-ui-experience`)

> **Identidad Visual del Ecosistema:**  
> **Warm Editorial Tangerine eSports**. Una estética premium de alta gama que fusiona la calidez de fondos apergaminados y texturizados con la elegancia sobria de la tinta oscura (`--ink`), acentos de energía en naranja terracota volumétrico (`--orange`), microinteracciones suaves y tarjetas de contornos redondeados con desenfoque de cristal (`backdrop-filter`).

---

## 🏛️ 1. Tokens de Diseño Globales (CSS Tokens Oficiales)

Todo componente del Hub de Play Win y de las interfaces de soporte debe regirse estrictamente por estos tokens:

```css
:root {
  /* Fondos Orgánicos y Superficies de Tarjetas */
  --bg: #dcdcdb;
  --hero-bg-1: #edecea;
  --hero-bg-2: #c8c7c5;
  --card: #f2f1ee;

  /* Tintas y Tipografía */
  --ink: #0c0c0e;
  --ink-soft: #2a2a2d;
  --mute: #8a8780;
  --line: #dad6ce;

  /* Acentos Energéticos Tangerine eSports */
  --orange: #d2691a;
  --orange-2: #bb570f;

  /* Elementos Píldora e Interacciones */
  --pill-dark: #0c0c0e;
  --pill-light: #e8e7e4;

  /* Tipografía Oficial */
  --font-main: "Inter", system-ui, -apple-system, sans-serif;
  --font-hud: "Orbitron", sans-serif; /* Reservado para marcadores y HUDs en partida */
}
```

---

## 📜 2. Elementos Clave de Identidad Visual

### A. Capa de Grano Analógico (Noise Overlay)
Cada vista principal (Hero Card o contenedor global) debe incluir el efecto sutil de ruido mate para evitar superficies planas artificiales:

```css
.hero-card::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  opacity: 0.04;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.1  0 0 0 0 0.1  0 0 0 0 0.1  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}
```

### B. Barra de Navegación Flotante en Píldora (`.nav`)
* Forma orgánica de píldora redondeada (`border-radius: 999px`).
* Sombra suave con bisel interior: `box-shadow: 0 8px 18px -6px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.7)`.
* Enlaces con indicador esférico activo (`::after` de 6x6px) y animación de rotación en iconos al hacer hover.
* Reloj de temporada / zona horaria a la derecha con micro-etiquetas.

### C. Botones Píldora Táctiles con Bisel 3D
* **Pill Dark (`.pill-dark`):** Fondo negro tinta (`#0c0c0e`), texto claro, círculo para icono de flecha que rota 45° en hover (`transform: rotate(45deg)`).
* **Pill Ghost (`.pill-ghost`):** Fondo semitransparente con `backdrop-filter: blur(8px)`.
* **Big Pills (`.bigpill`):** Píldoras monumentales para selector de disciplinas de juego con gradientes enérgicos:
  * Gradiente Neutro (`.bp-we`): `#f2f1ee` a `#dedcd7`.
  * Gradiente Naranja eSports (`.bp-create`): `#d9701f` a `#a4480b`.
  * Gradiente Flecha Negra (`.bp-arrow`): `#16161a` a `#050507`.

---

## 🎮 3. Aplicación a Componentes eSports de Play Win

### 1. El Tablero de Liga de 10 Jugadores:
* Enmarcado en tarjetas de cristal con fondo `--card` (`#f2f1ee`).
* Las posiciones 1º, 2º y 3º (zona de premios) se destacan con cápsulas de relieve, badges en `--orange` y tipografía nítida en `--ink`.
* Las posiciones 8º a 10º (zona de descenso de división) usan bordes sutiles con tono desaturado en `--line`.

### 2. El Escaparate Central del Juego (Centerpiece Hero):
* Tipografía gigante translúcida de fondo (`rgba(160, 158, 152, 0.35)`).
* Imagen del personaje/vehículo flotante con sombra volumétrica profunda (`drop-shadow(0 30px 40px rgba(20, 15, 5, 0.25))`).
* Resplandor cálido inferior radial (`background: radial-gradient(ellipse at center, rgba(210, 105, 26, 0.25), transparent 70%)`).

### 3. El Pasaporte del Jugador:
* Tarjeta de usuario con bordes de 28px (`border-radius: 28px`).
* Billetera de premios con montos en negrita y botones de retiro directo a PayPal o gestión de suscripción en Whop.

---

## 🛑 Reglas Inviolables de UI
1. **Consistencia Cromática Estricta:** No usar colores arbitrarios o azules genéricos fuera del sistema. Toda la jerarquía se resuelve con contrastes entre papel (`--bg`, `--card`), tinta (`--ink`) y fuego cítrico (`--orange`, `--orange-2`).
2. **Microinteracciones en Hover:** Todo elemento interactivo debe tener transición suave de elevación (`transform: translateY(-2px)` o `-4px`) con curvas cúbicas fluidas.
3. **Diseño Totalmente Responsive:** El sistema debe colapsar ordenadamente en pantallas móviles (< 800px) ocultando elementos decorativos secundarios y adaptando el tamaño de píldoras.
