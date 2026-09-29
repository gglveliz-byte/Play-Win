/**
 * RE-EXPORTACIÓN: el libro contable vive en `@playwin/database`.
 *
 * Este archivo era una COPIA de `packages/database/src/services/ledger.js`.
 * Tener dos implementaciones del mismo servicio garantizaba que una corrección
 * aplicada a una no llegara a la otra: divergencia silenciosa y, en este caso,
 * riesgo contable (BUG-003).
 *
 * Ahora solo re-exporta. No añadas lógica de negocio aquí.
 */
import { ledgerService as sharedLedgerService } from '@playwin/database';

export const ledgerService = sharedLedgerService as unknown as {
  recordTransaction(args: {
    userId: string;
    amount: number;
    currency?: string;
    type: string;
    status?: string;
    provider?: string;
    providerTxId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  getUserTransactions(userId: string, limit?: number): Promise<Array<Record<string, unknown>>>;
};
