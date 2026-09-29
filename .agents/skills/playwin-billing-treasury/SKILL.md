---
name: playwin-billing-treasury
description: Arquitectura y protocolos de pagos, suscripciones y dispersión de premios para Play Win integrando Whop (principal) y PayPal (pagos y retiros/payouts), con doble libro contable (Ledger) en PostgreSQL.
---

# 💳 Tesorería y Pasarela de Pagos (`playwin-billing-treasury`)

> **Misión Fundamental:**
> Orquestar las transacciones financieras de Play Win con seguridad de grado bancario: cobros de membresías y pases de temporada mediante **Whop**, pagos alternativos y dispersión de premios a ganadores mediante **PayPal**, garantizando consistencia ACID en la base de datos.

> ⚠️ **Esta skill fue reconciliada con el código real el 2026-09-29.** Los tipos de ledger, endpoints y estados citados están verificados. Donde el diseño objetivo difiere de lo implementado, se marca como **[PENDIENTE]**.
>
> 🔴 **Aviso de seguridad vigente:** el webhook de PayPal **no verifica firma** y el de Whop es **eludible**. Ver sección 7 antes de tocar cualquier cosa aquí.

---

## 1. Matriz de Pasarelas: Whop + PayPal

```
┌────────────────────────────────────────────────────────┐
│                   JUGADOR / COMPETIDOR                 │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
     [ WHOP (Principal) ]        [ PAYPAL (Secundario) ]
     - Membresías Premium        - Compra directa de créditos   [PENDIENTE]
     - Pases de Temporada        - Retiro de premios (Payouts)  [PARCIAL]
             │                           │
             └─────────────┬─────────────┘
                           │ Webhooks
                           ▼
┌────────────────────────────────────────────────────────┐
│           PLAY WIN LEDGER ENGINE (PostgreSQL)          │
│   (Transacciones Atómicas: Depósitos, Premios, Retiros)│
└────────────────────────────────────────────────────────┘
```

| Pasarela | Rol | Estado real |
| :--- | :--- | :--- |
| **Whop** | Pasarela principal: membresías y pases | ⚠️ Webhook implementado pero **validación eludible** |
| **PayPal** | Depósitos y retiros | 🔴 Depósitos **sin verificación de firma**; retiros **no llaman a la API real** |

---

## 2. Integración Whop (Webhooks)

### Flujo de Suscripción y Pases

1. El usuario elige una membresía Premium o Pase en el Hub.
2. El backend debe invocar la API de Whop para crear la sesión de checkout.
   📋 **[PENDIENTE]** No existe integración de salida con la API de Whop. Solo está implementado el **receptor** de webhooks.
3. Whop notifica al endpoint `/api/webhooks/whop`.
4. Se valida la cabecera de firma con `WHOP_WEBHOOK_SECRET`.
5. Se actualiza `users.has_premium` y se registra el asiento en `wallet_ledger`.

### Eventos Soportados (los realmente implementados)

| Evento | Acción en el código |
| :--- | :--- |
| `membership.went_valid` | `has_premium = TRUE` + asiento `WHOP_MEMBERSHIP_ACTIVATED` por `amount: 0` |
| `membership.went_invalid` | `has_premium = FALSE` |
| `payment.succeeded` | Asiento `DEPOSIT`. **Whop envía centavos**: se divide entre 100 |

> 📌 **`payment.failed` NO está implementado.** Si se necesita, hay que añadirlo.

### Resolución del usuario

El webhook busca al usuario por `LOWER(email)`. Si no lo encuentra, responde `200 { received: true, note: 'User not found in DB' }` **sin reintentar ni alertar**. Un correo desincronizado entre Whop y Play Win pierde el pago silenciosamente.

### Cabeceras aceptadas

`whop-signature` **o** `x-whop-signature`.

---

## 3. Integración PayPal

### A. Depósitos (PayPal Checkout) — 📋 [PENDIENTE]

**No implementado.** El paquete `@paypal/checkout-server-sdk` **no está instalado** y no existe flujo de `OrdersCreateRequest` → aprobación → `OrdersCaptureRequest`.

Lo único que existe es el **webhook receptor** `/api/webhooks/paypal`, que acredita `DEPOSIT` al recibir `PAYMENT.CAPTURE.COMPLETED`.

### B. Retiro de Premios (PayPal Payouts) — ⚠️ PARCIAL

El endpoint real es **`POST /api/payments/paypal/payout`**.

| Regla | Valor real verificado |
| :--- | :--- |
| Autenticación | Sesión obligatoria (`401` si falta) |
| Monto mínimo | **`$5.00 USD`** |
| Validación de saldo | `withdrawAmount > currentBalance` → `400` |
| Débito | Atómico, con guarda `WHERE wallet_balance >= $2` |
| Asiento contable | `type: 'WITHDRAWAL'`, `provider: 'PAYPAL'`, `status: 'COMPLETED'`, **`amount` NEGATIVO** |
| Destino del dinero | `paypalEmail` del body → `users.paypal_email` → `users.email` (primer valor disponible) |
| `provider_tx_id` | `payout_{userId:8}_{timestamp}` |

> 🔴 **Crítico — [PENDIENTE]:** el endpoint **NO invoca la PayPal Payouts API**. Debita el saldo y muestra *"Retiro procesado exitosamente"* sin que se emita ningún pago. Los campos `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` no están configurados.
>
> **Arreglo correcto:** marcar el asiento como `status: 'PENDING'` y completarlo **solo** al recibir la confirmación real (webhook `PAYMENT.PAYOUTSBATCH.SUCCESS`, que ya está parcialmente manejado en `apps/hub/src/app/api/webhooks/paypal/route.ts`). Mientras no exista la integración real, el endpoint debe **rechazar** la operación en lugar de debitar.

### C. Nota de contabilidad: el asiento de retiro se registra como `COMPLETED`

Hoy el débito al usuario y el asiento contable ocurren **en la misma transacción**, antes de cualquier llamada a PayPal. Cuando se implemente la API real, ese orden debe invertirse (asiento `PENDING` → confirmación → `COMPLETED`), o se contabilizará dinero que nunca salió.

---

## 4. Modelo de Datos del Libro Contable (Real)

> 📌 **La tabla se llama `wallet_ledger`. NO existe ninguna tabla `ledger_entries`.**

```sql
CREATE TABLE wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    amount NUMERIC(12, 2) NOT NULL,   -- Positivo = crédito · Negativo = débito
    currency VARCHAR(3) DEFAULT 'USD',
    type VARCHAR(32) NOT NULL,
    status VARCHAR(20) NOT NULL,
    provider VARCHAR(20) NOT NULL,
    provider_tx_id VARCHAR(128) UNIQUE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Valores REALES (no inventes otros)

| Campo | Valores escritos hoy en el código |
| :--- | :--- |
| **`type`** | `DEPOSIT` · `PRIZE_WIN` · `WITHDRAWAL` · `WHOP_MEMBERSHIP_ACTIVATED` · (`ENTRY_FEE` declarado en el esquema, sin uso todavía) |
| **`status`** | `COMPLETED` · `PENDING` · `FAILED` |
| **`provider`** | `WHOP` · `PAYPAL` · `SYSTEM` |

> 🔴 **Trampa que ya causó un bug:** los tipos `'WHOP_SUB'`, `'PAYPAL_DEPOSIT'`, `'PAYPAL_PAYOUT'` y `'LEAGUE_PRIZE'` **no se escriben nunca**. El panel de admin los buscaba y por eso mostraba siempre `$0.00` (ver `AUDITORIA_BUGS.md` → BUG-004). **Usa exclusivamente la tabla de arriba.**

### Nombres de columna exactos

`type` (NO `entry_type`) · `provider_tx_id` (NO `tx_id`) · `created_at` (TIMESTAMPTZ).

### Idempotencia

`provider_tx_id` es `UNIQUE`. **Patrón correcto** (ya usado en `settle.ts:79`):
```sql
INSERT INTO wallet_ledger (...) VALUES (...)
ON CONFLICT (provider_tx_id) DO NOTHING;
```

### Actualización de saldo

El saldo vive en **`users.wallet_balance`** y se mueve **dentro de la misma transacción** que inserta el asiento. `ledgerService.recordTransaction()` ya lo hace así para `status = 'COMPLETED'`. Nunca actualices el saldo por fuera de esa transacción.

---

## 5. Reparto de Premios (implementado)

En el cierre semanal (`apps/hub/src/lib/db/settle.ts`), cada liga de 10 reparte una bolsa de **$25.00 USD**:

| Posición | Premio | Asiento |
| :--- | :--- | :--- |
| 🥇 1º | `$15.00` | `PRIZE_WIN` / `SYSTEM` / `COMPLETED` |
| 🥈 2º | `$7.00` | `PRIZE_WIN` / `SYSTEM` / `COMPLETED` |
| 🥉 3º | `$3.00` | `PRIZE_WIN` / `SYSTEM` / `COMPLETED` |

`provider_tx_id` del premio: `prize_{leagueId}_{userId}` — determinista, lo que garantiza que re-ejecutar la liquidación **no duplique el pago**.

---

## 6. Reglas Inviolables

1. **Zero Client Trust.**
   Jamás acredites balances ni cambies estados de suscripción desde JavaScript del cliente. Todo se procesa exclusivamente en el servidor.

2. **Idempotencia obligatoria.**
   Todo webhook debe registrar su `provider_tx_id` (que es `UNIQUE`) y **manejar la violación de unicidad como éxito silencioso**, no como error `500`. Hoy este manejo es incompleto: el conflicto propaga una excepción (ver `AUDITORIA_BUGS.md` → BUG-001).

3. **Nunca quemar secretos de pasarela.**
   `WHOP_WEBHOOK_SECRET` y las credenciales de PayPal **no** pueden tener valor por defecto en el código. 🔴 Hoy `apps/hub/src/app/api/webhooks/whop/route.ts:5` sí lo tiene (ver BUG-002).

4. **El dinero solo se mueve en transacción atómica.**
   Asiento + saldo, o ninguno de los dos.

5. **Los montos se validan siempre en el servidor.**
   El cliente envía una intención; el servidor comprueba saldo, mínimos y reglas.

6. **El asiento de un retiro no puede nacer `COMPLETED` si el dinero aún no salió.**
   Requisito para cuando se implemente la API real de Payouts.

---

## 7. 🔴 Riesgos de Seguridad Abiertos (leer antes de tocar la tesorería)

| Riesgo | Ubicación | Efecto |
| :--- | :--- | :--- |
| **Webhook PayPal sin verificación de firma** | `apps/hub/src/app/api/webhooks/paypal/route.ts:4-40` | Un `POST` arbitrario acredita saldo a cualquier usuario. **Crea dinero de la nada**, retirable vía payout. |
| **HMAC de Whop eludible** | `apps/hub/src/app/api/webhooks/whop/route.ts:13` | La validación solo corre `if (NODE_ENV === 'production' && signature)`. **Omitir el header la salta entera.** Activa premium gratis. |
| **Comparación no constante en tiempo** | `whop/route.ts:16` (`!==`) | Debe usarse `crypto.timingSafeEqual`. |
| **Retiro que debita sin pagar** | `api/payments/paypal/payout/route.ts:44-84` | El usuario pierde saldo y no recibe dinero. |
| **Secreto de Whop quemado** | `whop/route.ts:5` | Acceso al secreto si el repo se filtra. |

**Orden correcto de arreglo:** verificar firma de PayPal → exigir firma de Whop siempre + `timingSafeEqual` → quitar secretos quemados y rotarlos → marcar retiros como `PENDING` hasta confirmación real.

---

## 📋 Registro de Correcciones (2026-09-29)

| Corrección | Antes (incorrecto) | Ahora (verificado) |
| :--- | :--- | :--- |
| Tipos de ledger | `'WHOP_SUB'`, `'PAYPAL_DEPOSIT'`, `'PRIZE_WIN'`, `'PAYPAL_PAYOUT'` | **`DEPOSIT`, `PRIZE_WIN`, `WITHDRAWAL`, `WHOP_MEMBERSHIP_ACTIVATED`** |
| Tabla de asientos | `ledger_entries` (en la Regla 2) | **`wallet_ledger`** |
| SDK de PayPal | "Implementado con `@paypal/checkout-server-sdk`" | **No instalado, no implementado** |
| Payouts API | "El backend invoca `POST /v1/payments/payouts`" | **No la invoca**; solo debita en local |
| Estado del retiro | `PENDING_PAYOUT` → `COMPLETED` tras webhook | **Nace `COMPLETED`** inmediatamente (incorrecto) |
| Bloqueo de retiros sospechosos | Regla 3: estado `FLAGGED_REVIEW` | **No existe.** Sin implementar |
| Evento `payment.failed` | Listado como escuchado | **No implementado** |
| Impacto de `has_premium` | `hasPremium: true` (camelCase) | **`users.has_premium`** (snake_case real) |
| Idempotencia | "restricción de unicidad" genérica | **`ON CONFLICT (provider_tx_id) DO NOTHING`** + el manejo del conflicto está incompleto |
