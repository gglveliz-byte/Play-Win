import { NextResponse } from 'next/server';
import { passportService, query } from '@/lib/db';

export const GAME_DETAILS: Record<string, any> = {
  'carreras': {
    id: 'carreras',
    title: 'Speed Horizon 3D',
    subtitle: 'Simulador de Carreras y Esquiva de Tráfico',
    category: '3D RACING',
    coverImage: '/images/games/carreras.jpg',
    description: 'Compite a más de 300 km/h en una autopista de 3 carriles esquivando tráfico continuo.',
    objective: 'Sobrevive la mayor distancia posible esquivando coches y camiones en tiempo real contra tu rival.',
    scoring: '+1 punto por cada metro de asfalto recorrido a máxima velocidad.',
    suddenDeath: 'El primer piloto que choque contra otro vehículo pierde inmediatamente. El superviviente gana la partida.',
    seasonPoints: 'Ganador: +100 Season Points (+25 MMR) | Derrota: +20 Season Points (-15 MMR)',
    prizePool: 'Bolsa semanal de $25 USD por Micro-Liga de 10 pilotos ($15 al 1º, $7 al 2º, $3 al 3º).',
    controlsPC: [
      { key: 'A / ⬅️', label: 'Cambiar al carril izquierdo' },
      { key: 'D / ➡️', label: 'Cambiar al carril derecho' },
      { key: 'W / ⬆️', label: 'Acelerar / Turbo Nitro' },
      { key: 'S / ⬇️', label: 'Frenar / Reducir velocidad' }
    ],
    controlsMobile: [
      { gesture: 'Toque Izquierda', label: 'Desvío de carril a la izquierda' },
      { gesture: 'Toque Derecha', label: 'Desvío de carril a la derecha' },
      { gesture: 'Deslizar Arriba', label: 'Activar Turbo Nitro' }
    ]
  },
  'flapy-flapy': {
    id: 'flapy-flapy',
    title: 'Bati Vuelo 1v1',
    subtitle: 'Duelo Aéreo de Precisión y Gravedad',
    category: 'PRECISION TAPPER',
    coverImage: '/images/games/flapy-flapy.jpg',
    description: 'Navega a través de tuberías milimétricas con física estricta de gravedad y resistencia al viento.',
    objective: 'Mantén el vuelo aleteando a través de las aperturas sin rozar los obstáculos ni el suelo.',
    scoring: '+1 punto por cada columna de tuberías superada limpiamente.',
    suddenDeath: 'El primer jugador que toque una tubería o caiga al suelo queda eliminado en el acto.',
    seasonPoints: 'Ganador: +100 Season Points (+25 MMR) | Derrota: +20 Season Points (-15 MMR)',
    prizePool: 'Bolsa semanal de $25 USD por Micro-Liga de 10 pilotos ($15 al 1º, $7 al 2º, $3 al 3º).',
    controlsPC: [
      { key: 'Espacio', label: 'Aletear e impulsarse hacia arriba' },
      { key: 'Flecha ⬆️', label: 'Impulso secundario' },
      { key: 'Clic Izquierdo', label: 'Toque de aleteo con ratón' }
    ],
    controlsMobile: [
      { gesture: 'Toque en Pantalla (Tap)', label: 'Aletear con el pulgar para ganar altura' }
    ]
  },
  'space': {
    id: 'space',
    title: 'Fuerza Espacial',
    subtitle: 'Combate Arcade de Disparos en el Espacio',
    category: 'ARCADE SHMUP',
    coverImage: '/images/games/space.jpg',
    description: 'Pilota tu caza estelar en un campo de asteroides denso repeliendo cazas enemigos.',
    objective: 'Destruye naves enemigas y esquiva proyectiles de plasma y asteroides más tiempo que tu oponente.',
    scoring: '+10 puntos por nave alienígena destruida, +1 punto por segundo de vuelo.',
    suddenDeath: 'Impacto de asteroide o fuego láser destruye tu nave y adjudica la victoria a tu rival.',
    seasonPoints: 'Ganador: +100 Season Points (+25 MMR) | Derrota: +20 Season Points (-15 MMR)',
    prizePool: 'Bolsa semanal de $25 USD por Micro-Liga de 10 pilotos ($15 al 1º, $7 al 2º, $3 al 3º).',
    controlsPC: [
      { key: 'A / ⬅️', label: 'Mover nave a la izquierda' },
      { key: 'D / ➡️', label: 'Mover nave a la derecha' },
      { key: 'Espacio / Clic', label: 'Disparar cañones láser de plasma' }
    ],
    controlsMobile: [
      { gesture: 'Deslizar Dedo', label: 'Mover la nave horizontalmente' },
      { gesture: 'Botón Disparo', label: 'Ráfaga de cañón láser' }
    ]
  },
  'sky': {
    id: 'sky',
    title: 'Sky Runner 3D',
    subtitle: 'Carrera de Plataformas Aéreas y Abismos',
    category: '3D RUNNER',
    coverImage: '/images/games/sky.jpg',
    description: 'Corre a gran velocidad sobre plataformas suspendidas en el cielo sorteando vacíos mortales.',
    objective: 'Cruza la mayor cantidad de plataformas aéreas saltando en el momento preciso sin caer.',
    scoring: '+1 punto por cada sección de plataforma superada.',
    suddenDeath: 'Caer al abismo o chocar con un muro flotante elimina inmediatamente al jugador.',
    seasonPoints: 'Ganador: +100 Season Points (+25 MMR) | Derrota: +20 Season Points (-15 MMR)',
    prizePool: 'Bolsa semanal de $25 USD por Micro-Liga de 10 pilotos ($15 al 1º, $7 al 2º, $3 al 3º).',
    controlsPC: [
      { key: '⬅️ / ➡️', label: 'Desplazamiento lateral' },
      { key: 'Espacio / ⬆️', label: 'Saltar sobre abismos y huecos' }
    ],
    controlsMobile: [
      { gesture: 'Deslizar Lateral', label: 'Cambiar de carril en la pista' },
      { gesture: 'Toque en Pantalla', label: 'Saltar abismos y obstáculos' }
    ]
  }
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId') || 'carreras';
    const gameInfo = GAME_DETAILS[gameId] || GAME_DETAILS['carreras'];

    // 1. Obtener jugadores reales de la base de datos Neon PostgreSQL para este juego
    let activePlayers = await passportService.getGameLeaderboard(gameId, 8);

    // 2. Si hay menos de 4 pasaportes registrados para este juego, enriquecer con usuarios de la plataforma
    if (activePlayers.length < 4) {
      const fallbackUsers = await query(
        `SELECT id as user_id, username, avatar_url, 'ORO' as rank_tier, 1850 as skill_rating, 240 as season_points, 4 as wins, 1 as losses, 0 as best_score
         FROM users
         ORDER BY created_at DESC
         LIMIT 8;`
      );
      if (fallbackUsers.rows.length > 0) {
        activePlayers = fallbackUsers.rows;
      }
    }

    return NextResponse.json({
      success: true,
      game: gameInfo,
      activePlayers,
      totalActiveInDivision: Math.max(activePlayers.length, 6),
      divisionTier: 'DIVISIÓN ORO #3',
    });
  } catch (err: any) {
    console.error('[API /api/games/lobby error]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error cargando lobby' },
      { status: 500 }
    );
  }
}
