// Carga la raíz del monorepo `.env` ANTES que cualquier módulo que lea secretos.
// El orden de los imports ESM garantiza que esto se ejecuta primero.
import './load-env.js';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';

const PORT = process.env.PORT || 3001;
const roomManager = new RoomManager();

// Servidor HTTP para health check y métricas
const server = createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'online',
        service: 'PlayWin Realtime Duels Server',
        activeRooms: roomManager.rooms.size,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
});

// Servidor WebSocket montado sobre el servidor HTTP
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket, request) => {
  const clientIp = request.socket.remoteAddress;

  socket.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      switch (data.action) {
        case 'JOIN_MATCH':
          roomManager.joinQueue(data.player, socket, clientIp);
          break;

        case 'PLAYER_TICK':
          roomManager.handlePlayerTick(socket, data);
          break;

        case 'PLAYER_CRASHED':
          roomManager.handlePlayerCrash(socket);
          break;

        case 'PLAYER_FINISH':
          roomManager.handlePlayerFinish(socket, data);
          break;

        case 'PING':
          socket.send(JSON.stringify({ event: 'PONG', clientTime: data.clientTime || 0, time: Date.now() }));
          break;

        default:
          console.warn('[WS] Acción no reconocida:', data.action);
      }
    } catch (err) {
      console.error('[WS] Error procesando paquete JSON:', err.message);
    }
  });

  socket.on('close', () => {
    roomManager.handleDisconnect(socket);
  });

  socket.on('error', (err) => {
    console.error(`[WS] Error en socket ${clientIp}:`, err.message);
    roomManager.handleDisconnect(socket);
  });
});

server.listen(PORT, () => {
  console.log(`⚡ [PlayWin Realtime] Servidor de duelos activo en http://localhost:${PORT}`);
  console.log(`🛰️ [PlayWin Realtime] Canal WebSocket listo en ws://localhost:${PORT}/ws`);
});

// Manejo explícito de errores de arranque: un EADDRINUSE produce un mensaje
// accionable en lugar de una traza sin capturar (BUG-016 de la auditoría).
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n❌ [PlayWin Realtime] El puerto ${PORT} ya está ocupado.\n` +
        '   → Cierra el proceso que lo usa, o arranca en otro puerto:\n' +
        `     PORT=3002 npm run dev:realtime\n`
    );
  } else {
    console.error('[PlayWin Realtime] Error fatal del servidor HTTP:', err.message);
  }
  process.exit(1);
});
