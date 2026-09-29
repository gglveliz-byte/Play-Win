/**
 * RE-EXPORTACIÓN: las cuentas de usuario viven en `@playwin/database`.
 *
 * Era una copia de `packages/database/src/services/users.js` (BUG-003).
 *
 * ⚠️ Las operaciones que deben participar de una transacción (como el alta
 *    completa) NO pasan por aquí: usan el cliente de la transacción
 *    directamente, porque estos servicios consultan el pool global.
 */
import { userService as sharedUserService } from '@playwin/database';

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  avatar_url: string;
  global_level: number;
  has_premium: boolean;
  paypal_email: string | null;
  wallet_balance: string | number;
  is_verified?: boolean;
  is_admin?: boolean;
  created_at: string;
}

export const userService = sharedUserService as unknown as {
  createUser(args: {
    username: string;
    email: string;
    passwordHash: string;
    avatarUrl?: string;
    verificationToken?: string;
  }): Promise<UserAccount>;
  getUserById(id: string): Promise<UserAccount | null>;
  getUserByUsername(username: string): Promise<UserAccount | null>;
  getUserByEmail(email: string): Promise<UserAccount | null>;
  ensureUser(args: { id?: string; username?: string; email?: string; avatarUrl?: string }): Promise<UserAccount>;
  updateBalance(userId: string, delta: number): Promise<{ id: string; username: string; wallet_balance: string | number }>;
  verifyUserEmail(token: string): Promise<{ id: string; username: string; email: string; is_verified: boolean } | null>;
  setPasswordResetToken(
    email: string,
    token: string,
    expiresAt: Date
  ): Promise<{ id: string; username: string; email: string } | null>;
  resetPasswordWithToken(
    token: string,
    newPasswordHash: string
  ): Promise<{ id: string; username: string; email: string } | null>;
};
