-- =============================================================================
-- PLAY WIN eSPORTS — ESQUEMA RELACIONAL DE PRODUCCIÓN (PostgreSQL Neon)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tabla de Usuarios y Pasaporte Principal
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(32) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT DEFAULT '🎮',
    global_level INT DEFAULT 1,
    has_premium BOOLEAN DEFAULT FALSE,
    paypal_email VARCHAR(255),
    wallet_balance NUMERIC(12, 2) DEFAULT 0.00,
    is_verified BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migración idempotente para bases de datos ya creadas antes de existir is_admin.
-- CREATE TABLE IF NOT EXISTS no altera tablas existentes, así que esta línea es
-- necesaria para que el panel de administración pueda autorizar (BUG-004).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_admin ON users(is_admin) WHERE is_admin = TRUE;

-- 2. Pasaporte Competitivo por Videojuego (Rangos, MMR y Estadísticas)
CREATE TABLE IF NOT EXISTS game_passports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id VARCHAR(32) NOT NULL,
    rank_tier VARCHAR(16) DEFAULT 'BRONZE', -- BRONZE, SILVER, GOLD, PLATINUM, DIAMOND, ELITE
    skill_rating INT DEFAULT 1200,
    season_points INT DEFAULT 0,
    total_matches INT DEFAULT 0,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    best_score INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_game UNIQUE (user_id, game_id)
);

-- 3. Grupos de Micro-Ligas Semanales (10 Jugadores Cerradas)
CREATE TABLE IF NOT EXISTS league_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_number INT NOT NULL,
    game_id VARCHAR(32) NOT NULL,
    rank_tier VARCHAR(16) NOT NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    prize_pool NUMERIC(12, 2) DEFAULT 25.00,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Miembros Asignados a cada Liga de 10
CREATE TABLE IF NOT EXISTS league_members (
    league_id UUID NOT NULL REFERENCES league_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    season_points INT DEFAULT 0,
    position INT DEFAULT 10,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (league_id, user_id)
);

-- 5. Registro Histórico de Partidas y Duelos 1v1
CREATE TABLE IF NOT EXISTS match_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(64) NOT NULL,
    game_id VARCHAR(32) NOT NULL,
    player1_id UUID NOT NULL REFERENCES users(id),
    player2_id UUID NOT NULL REFERENCES users(id),
    winner_id UUID REFERENCES users(id),
    p1_score INT DEFAULT 0,
    p2_score INT DEFAULT 0,
    seed BIGINT NOT NULL,
    finish_reason VARCHAR(32) NOT NULL,
    duration_ms INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Doble Libro Contable Inmutable (Ledger Financiero)
CREATE TABLE IF NOT EXISTS wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    type VARCHAR(32) NOT NULL, -- 'DEPOSIT', 'PRIZE_WIN', 'WITHDRAWAL', 'ENTRY_FEE'
    status VARCHAR(20) NOT NULL, -- 'COMPLETED', 'PENDING', 'FAILED'
    provider VARCHAR(20) NOT NULL, -- 'WHOP', 'PAYPAL', 'SYSTEM'
    provider_tx_id VARCHAR(128) UNIQUE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_passports_lookup ON game_passports(user_id, game_id);
CREATE INDEX IF NOT EXISTS idx_passports_ranking ON game_passports(game_id, season_points DESC);
CREATE INDEX IF NOT EXISTS idx_leagues_season ON league_groups(season_number, game_id, rank_tier);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON wallet_ledger(user_id, created_at DESC);
