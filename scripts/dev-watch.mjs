/**
 * PLAY WIN — VIGILANTE DE DESARROLLO (scripts/dev-watch.mjs)
 * ==============================================================================
 * Levanta los DOS servidores (Hub en :3000 y Duelos en :3001) y los REINICIA
 * SOLOS cuando cambia el código, sin que tengas que tocar nada.
 *
 * ¿Por qué existe?
 * Durante el desarrollo se editaban archivos y los servidores seguían con el
 * código viejo en memoria. Eso producía horas de depuración persiguiendo fallos
 * que ya estaban arreglados en disco. Con este vigilante, lo que ves en pantalla
 * siempre corresponde a lo que hay en el repositorio.
 *
 * Qué vigila:
 *   · apps/realtime-server/src   -> reinicia el servidor de duelos
 *   · packages/database/src      -> reinicia el servidor de duelos
 *   · apps/hub/src               -> reinicia el Hub
 *   · packages/game-sdk          -> reinicia los dos (y hay que recargar el navegador)
 *
 * Uso:  npm run dev:watch
 * Parar: Ctrl+C  (detiene los dos servidores)
 * ==============================================================================
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = process.cwd();

/** Servidores gestionados y las rutas cuyo cambio los obliga a reiniciarse. */
const SERVIDORES = [
  {
    nombre: 'HUB   :3000',
    comando: 'npm',
    argumentos: ['run', 'dev', '--prefix', 'apps/hub'],
    vigila: ['apps/hub/src', 'apps/hub/next.config.ts', 'apps/hub/.env.local'],
    color: '\x1b[36m', // cian
  },
  {
    nombre: 'DUELOS :3001',
    comando: 'npm',
    argumentos: ['run', 'dev', '--prefix', 'apps/realtime-server'],
    // packages/database/src también: los dos servidores comparten ese paquete.
    vigila: ['apps/realtime-server/src', 'packages/database/src', '.env'],
    color: '\x1b[35m', // magenta
  },
];

/** El SDK lo consumen los juegos del Hub: al cambiarlo hay que recargar todo. */
const VIGILA_TODOS = ['packages/game-sdk', 'apps/hub/public/game-sdk'];

const RESET = '\x1b[0m';
const GRIS = '\x1b[90m';
const AMARILLO = '\x1b[33m';
const VERDE = '\x1b[32m';

/** Estado en memoria de cada servidor. */
const estado = new Map();

function registrar(srv, mensaje) {
  const hora = new Date().toTimeString().slice(0, 8);
  console.log(`${GRIS}[${hora}]${RESET} ${srv.color}[${srv.nombre}]${RESET} ${mensaje}`);
}

function arrancar(srv) {
  const previo = estado.get(srv);
  if (previo && previo.proceso && !previo.proceso.killed) {
    // En Windows hay que matar el árbol entero o el hijo de npm sobrevive.
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(previo.proceso.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        previo.proceso.kill('SIGTERM');
      }
    } catch (err) {
      registrar(srv, `${AMARILLO}no se pudo detener el proceso anterior: ${err.message}${RESET}`);
    }
  }

  const proceso = spawn(srv.comando, srv.argumentos, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  estado.set(srv, { proceso, reinicios: (previo?.reinicios || 0) + 1 });

  proceso.on('exit', (codigo) => {
    const actual = estado.get(srv);
    // Sólo avisa si no lo estamos reiniciando nosotros.
    if (actual && actual.proceso === proceso && codigo !== 0 && codigo !== null) {
      registrar(srv, `${AMARILLO}terminó con código ${codigo}${RESET}`);
    }
  });
}

/**
 * Vigila recursivamente las rutas indicadas y llama a `alCambiar` con retardo
 * (debounce) para no reiniciar diez veces mientras se guarda un archivo.
 */
function vigilar(rutas, alCambiar) {
  let temporizador = null;
  const disparar = (archivo) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => alCambiar(archivo), 400);
  };

  for (const ruta of rutas) {
    const absoluta = path.join(RAIZ, ruta);
    if (!fs.existsSync(absoluta)) continue;
    try {
      fs.watch(absoluta, { recursive: true }, (_evento, archivo) => {
        if (!archivo) return;
        // Ignora ruido de build y de control de versiones.
        if (/node_modules|\.next|\.git|\.next-verify/.test(archivo)) return;
        disparar(path.join(ruta, archivo));
      });
    } catch (err) {
      console.error(`${AMARILLO}No se pudo vigilar ${ruta}: ${err.message}${RESET}`);
    }
  }
}

console.log(`
${VERDE}╔══════════════════════════════════════════════════════════════════╗
║  PLAY WIN · VIGILANTE DE DESARROLLO                              ║
║  Los servidores se reinician SOLOS al guardar cambios.           ║
║  Parar: Ctrl+C                                                   ║
╚══════════════════════════════════════════════════════════════════╝${RESET}
`);

for (const srv of SERVIDORES) {
  arrancar(srv);
  registrar(srv, `${VERDE}arrancado${RESET}`);
  vigilar(srv.vigila, (archivo) => {
    registrar(srv, `${AMARILLO}reiniciando por cambio en ${archivo}${RESET}`);
    arrancar(srv);
  });
}

// El SDK afecta a los juegos del Hub: se reinician los dos.
vigilar(VIGILA_TODOS, (archivo) => {
  console.log(`\n${AMARILLO}⚡ Cambió el SDK (${archivo}): reiniciando los dos servidores.${RESET}`);
  console.log(`${AMARILLO}   Recuerda recargar el navegador (Ctrl+Shift+R) para cargar el SDK nuevo.${RESET}\n`);
  for (const srv of SERVIDORES) arrancar(srv);
});

// Al salir con Ctrl+C, se llevan por delante los dos servidores.
const apagar = () => {
  console.log(`\n${GRIS}Deteniendo servidores...${RESET}`);
  for (const srv of SERVIDORES) {
    const e = estado.get(srv);
    if (!e?.proceso) continue;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(e.proceso.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        e.proceso.kill('SIGTERM');
      }
    } catch {
      // Si ya murió, no hay nada que hacer.
    }
  }
  setTimeout(() => process.exit(0), 600);
};

process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
