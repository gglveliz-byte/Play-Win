import { query, withTransaction } from '../index.js';

/**
 * Servicio de producción para el Doble Libro Contable (Ledger Financiero)
 */
export const ledgerService = {
  /**
   * Registra una transacción inmutable y actualiza el saldo atómicamente si está completada
   */
  async recordTransaction({
    userId,
    amount,
    currency = 'USD',
    type, // 'DEPOSIT', 'PRIZE_WIN', 'WITHDRAWAL', 'ENTRY_FEE'
    status = 'COMPLETED', // 'COMPLETED', 'PENDING', 'FAILED'
    provider = 'SYSTEM', // 'WHOP', 'PAYPAL', 'SYSTEM'
    providerTxId = null,
    metadata = {},
  }) {
    return await withTransaction(async (client) => {
      const insertSql = `
        INSERT INTO wallet_ledger (
          user_id, amount, currency, type, status, provider, provider_tx_id, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, user_id, amount, currency, type, status, provider, provider_tx_id, created_at;
      `;
      const res = await client.query(insertSql, [
        userId,
        amount,
        currency,
        type,
        status,
        provider,
        providerTxId,
        JSON.stringify(metadata),
      ]);
      const tx = res.rows[0];

      // Si la transacción está completada, impactar el saldo del usuario
      if (status === 'COMPLETED') {
        const updateBalanceSql = `
          UPDATE users
          SET wallet_balance = wallet_balance + $2, updated_at = NOW()
          WHERE id = $1
          RETURNING wallet_balance;
        `;
        const balRes = await client.query(updateBalanceSql, [userId, amount]);
        tx.new_balance = balRes.rows[0]?.wallet_balance;
      }

      return tx;
    });
  },

  /**
   * Obtiene el extracto de movimientos de un usuario
   */
  async getUserTransactions(userId, limit = 50) {
    const text = `
      SELECT id, amount, currency, type, status, provider, provider_tx_id, metadata, created_at
      FROM wallet_ledger
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `;
    const res = await query(text, [userId, limit]);
    return res.rows;
  }
};
