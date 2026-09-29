import { NextResponse } from 'next/server';

/**
 * PLAY WIN — RESPUESTAS HTTP UNIFORMES (api-response.ts)
 * ==============================================================================
 * Estandariza la forma de todas las respuestas de error de la API.
 *
 * ¿Por qué existe?
 * Antes cada ruta inventaba su propio formato y sus propios códigos:
 * `/api/wallet/transactions` devolvía 200 con lista vacía cuando faltaba sesión,
 * mientras `/api/matches/history` devolvía 401. El cliente no podía distinguir
 * "sin movimientos" de "sin sesión" (BUG-012).
 *
 * ⚠️ REGLA: nunca devolver `err.message` crudo al cliente. Se registra en el
 *    servidor y se responde con un mensaje genérico, para no filtrar detalles
 *    internos (nombres de tablas, columnas, rutas de archivos).
 * ==============================================================================
 */

/** Forma canónica de una respuesta de error. */
export interface ApiErrorBody {
  success: false;
  error: string;
}

/** Error genérico con el código indicado. */
export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error: message } satisfies ApiErrorBody, { status });
}

/** 401 — falta sesión válida. Forma única en toda la API. */
export function unauthorized(message = 'Debes iniciar sesión para realizar esta acción.'): NextResponse {
  return apiError(message, 401);
}

/** 403 — hay sesión pero no tiene permiso. */
export function forbidden(message = 'No tienes permisos para realizar esta acción.'): NextResponse {
  return apiError(message, 403);
}

/** 404 — el recurso no existe. */
export function notFound(message = 'Recurso no encontrado.'): NextResponse {
  return apiError(message, 404);
}

/** 400 — la petición del cliente es inválida. */
export function badRequest(message: string): NextResponse {
  return apiError(message, 400);
}

/** 409 — conflicto con el estado actual (ej. usuario duplicado). */
export function conflict(message: string): NextResponse {
  return apiError(message, 409);
}

/** 429 — se superó el límite de peticiones. */
export function tooManyRequests(message: string, retryAfterSeconds: number): NextResponse {
  const response = apiError(message, 429);
  response.headers.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterSeconds))));
  return response;
}

/**
 * 500 — error inesperado del servidor.
 * Registra el error completo en el servidor y devuelve un mensaje genérico.
 */
export function serverError(err: unknown, context: string): NextResponse {
  console.error(`[API Error] ${context}:`, err);
  return apiError('Error interno del servidor.', 500);
}
