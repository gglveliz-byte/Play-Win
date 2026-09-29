import { query } from './index';

export const userService = {
  async createUser({
    username,
    email,
    passwordHash,
    avatarUrl = '🎮',
    verificationToken,
  }: {
    username: string;
    email: string;
    passwordHash: string;
    avatarUrl?: string;
    verificationToken?: string;
  }) {
    const text = `
      INSERT INTO users (username, email, password_hash, avatar_url, verification_token, is_verified)
      VALUES ($1, $2, $3, $4, $5, FALSE)
      RETURNING id, username, email, avatar_url, global_level, has_premium, wallet_balance, is_verified, created_at;
    `;
    const res = await query(text, [
      username.trim().toLowerCase(),
      email.trim().toLowerCase(),
      passwordHash,
      avatarUrl,
      verificationToken || null,
    ]);
    return res.rows[0];
  },

  async getUserById(id: string) {
    const text = `
      SELECT id, username, email, avatar_url, global_level, has_premium, paypal_email, wallet_balance, created_at
      FROM users
      WHERE id = $1;
    `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
  },

  async getUserByUsername(username: string) {
    const text = `
      SELECT id, username, email, password_hash, avatar_url, global_level, has_premium, paypal_email, wallet_balance, created_at
      FROM users
      WHERE LOWER(username) = LOWER($1);
    `;
    const res = await query(text, [username.trim()]);
    return res.rows[0] || null;
  },

  async getUserByEmail(email: string) {
    const text = `
      SELECT id, username, email, password_hash, avatar_url, global_level, has_premium, paypal_email, wallet_balance, created_at
      FROM users
      WHERE LOWER(email) = LOWER($1);
    `;
    const res = await query(text, [email.trim()]);
    return res.rows[0] || null;
  },

  async ensureUser({ id, username, email, avatarUrl = '🎮' }: { id?: string; username?: string; email?: string; avatarUrl?: string }) {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isIdValidUuid = typeof id === 'string' && UUID_REGEX.test(id);

    if (isIdValidUuid) {
      const existing = await this.getUserById(id!);
      if (existing) return existing;
    }

    const safeUsername = (username || `pilot_${Math.random().toString(36).slice(2, 7)}`).trim().toLowerCase();
    const existingByName = await this.getUserByUsername(safeUsername);
    if (existingByName) return existingByName;

    const safeEmail = (email || `${safeUsername}@playwin.gg`).trim().toLowerCase();
    const targetId = isIdValidUuid ? id : null;

    const text = `
      INSERT INTO users (id, username, email, password_hash, avatar_url)
      VALUES (COALESCE($1, gen_random_uuid()), $2, $3, 'ephemeral_guest_token_hash', $4)
      ON CONFLICT (username) DO UPDATE
      SET updated_at = NOW()
      RETURNING id, username, email, avatar_url, global_level, has_premium, wallet_balance;
    `;
    const res = await query(text, [targetId, safeUsername, safeEmail, avatarUrl]);
    return res.rows[0];
  },

  async updateBalance(userId: string, delta: number) {
    const text = `
      UPDATE users
      SET wallet_balance = wallet_balance + $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, username, wallet_balance;
    `;
    const res = await query(text, [userId, delta]);
    return res.rows[0];
  },

  async verifyUserEmail(token: string) {
    const text = `
      UPDATE users
      SET is_verified = TRUE, verification_token = NULL, updated_at = NOW()
      WHERE verification_token = $1
      RETURNING id, username, email, is_verified;
    `;
    const res = await query(text, [token.trim()]);
    return res.rows[0] || null;
  },

  async setPasswordResetToken(email: string, token: string, expiresAt: Date) {
    const text = `
      UPDATE users
      SET reset_token = $2, reset_token_expires_at = $3, updated_at = NOW()
      WHERE LOWER(email) = LOWER($1)
      RETURNING id, username, email;
    `;
    const res = await query(text, [email.trim(), token, expiresAt]);
    return res.rows[0] || null;
  },

  async resetPasswordWithToken(token: string, newPasswordHash: string) {
    const text = `
      UPDATE users
      SET password_hash = $2, reset_token = NULL, reset_token_expires_at = NULL, updated_at = NOW()
      WHERE reset_token = $1 AND reset_token_expires_at > NOW()
      RETURNING id, username, email;
    `;
    const res = await query(text, [token.trim(), newPasswordHash]);
    return res.rows[0] || null;
  }
};
