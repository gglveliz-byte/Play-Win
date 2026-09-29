export interface MatchItem {
  id: string;
  roomId: string;
  gameId: string;
  isWinner: boolean;
  myScore: number;
  opponentScore: number;
  opponent: {
    username: string;
    avatar: string;
  };
  pointsDelta: number;
  finishReason: string;
  durationSeconds: number;
  seed: number;
  createdAt: string;
}

export interface PassportViewProps {
  user: any;
  passports: any[];
  onOpenAuth: () => void;
  onLaunchGame: (gameId: string) => void;
}

export const GAME_NAMES: Record<string, { name: string; badge: string; color: string }> = {
  carreras: { name: 'Speed Horizon 3D', badge: '3D RACING', color: 'var(--orange)' },
  'flapy-flapy': { name: 'Bati Vuelo 1v1', badge: 'PRECISION TAP', color: '#8b5cf6' },
  space: { name: 'Fuerza Espacial', badge: 'ARCADE SHMUP', color: '#0ea5e9' },
  sky: { name: 'Sky Runner 3D', badge: '3D RUNNER', color: '#10b981' },
};

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Hace un momento';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays} d`;
}
