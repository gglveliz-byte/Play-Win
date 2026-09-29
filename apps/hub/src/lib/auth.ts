import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { serverConfig } from './config';

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
}

export const authLib = {
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  },

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  signUserToken(payload: TokenPayload): string {
    return jwt.sign(payload, serverConfig.jwtSecret, { expiresIn: '7d' });
  },

  signMatchTicket(user: { id: string; username: string; avatar: string; gameId: string }): string {
    return jwt.sign(
      {
        sub: user.id,
        username: user.username,
        avatar: user.avatar,
        gameId: user.gameId,
        type: 'MATCH_SESSION_TICKET',
      },
      serverConfig.jwtSecret,
      { expiresIn: '5m' }
    );
  },

  verifyToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, serverConfig.jwtSecret) as TokenPayload;
    } catch {
      return null;
    }
  },
};
