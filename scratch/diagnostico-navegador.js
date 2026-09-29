/**
 * DIAGNÓSTICO DEL SDK EN EL NAVEGADOR
 * ==============================================================================
 * Copia TODO este contenido en la consola del navegador (F12) con el juego
 * abierto y pega aquí el resultado. Dice exactamente en qué punto se atasca.
 *
 * No modifica nada: sólo lee el estado.
 * ==============================================================================
 */
(() => {
  const r = [];
  const linea = (etiqueta, valor) => r.push(`${etiqueta.padEnd(34)} ${valor}`);

  r.push('═══ 1. MÓDULOS DEL SDK CARGADOS ═══');
  linea('window.PLAYWIN_UI', typeof window.PLAYWIN_UI);
  linea('window.PLAYWIN_STATUS', typeof window.PLAYWIN_STATUS);
  linea('window.PLAYWIN_CONNECTION', typeof window.PLAYWIN_CONNECTION);
  linea('window.PlayWin', typeof window.PlayWin);
  linea('versión conexión (esperada 4)', window.PLAYWIN_CONNECTION?.SDK_VERSION ?? '(no expuesta)');

  r.push('');
  r.push('═══ 2. SCRIPTS DEL SDK EN LA PÁGINA ═══');
  document.querySelectorAll('script[src*="game-sdk"]').forEach((s) => {
    linea('  script', s.getAttribute('src'));
  });

  r.push('');
  r.push('═══ 3. ESTADO DE LA CONEXIÓN ═══');
  if (window.PlayWin) {
    linea('isLive()', window.PlayWin.isLive());
    linea('isOffline()', typeof window.PlayWin.isOffline === 'function' ? window.PlayWin.isOffline() : '(no existe: SDK viejo)');
    linea('canStartLocally()', typeof window.PlayWin.canStartLocally === 'function' ? window.PlayWin.canStartLocally() : '(no existe: SDK VIEJO EN CACHÉ)');
    try {
      linea('getPlayer()', JSON.stringify(window.PlayWin.getPlayer()));
      linea('¿tiene token?', !!(window.PlayWin.getPlayer() || {}).token);
    } catch (e) {
      linea('getPlayer()', 'ERROR: ' + e.message);
    }
  } else {
    linea('SDK', 'NO CARGADO');
  }

  r.push('');
  r.push('═══ 4. PANTALLAS VISIBLES ═══');
  const pantallas = ['pw-screen-mm', 'pw-screen-vs', 'pw-screen-result', 'pw-screen-auth', 'pw-screen-offline'];
  pantallas.forEach((id) => {
    const el = document.getElementById(id);
    linea('  ' + id, el ? (el.classList.contains('active') ? '► VISIBLE' : 'oculta') : 'NO EXISTE');
  });
  const hud = document.getElementById('pw-live-hud');
  linea('  pw-live-hud', hud ? (hud.classList.contains('active') ? '► VISIBLE' : 'oculta') : 'NO EXISTE');

  r.push('');
  r.push('═══ 5. HUD DEL JUEGO (elementos del motor) ═══');
  ['vel', 'time', 'dist', 'goDist', 'speed'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) linea('  #' + id, JSON.stringify(el.textContent.trim()));
  });
  const canvas = document.querySelector('canvas');
  linea('  canvas', canvas ? `${canvas.width}x${canvas.height}` : 'NO EXISTE');

  r.push('');
  r.push('═══ 6. ANDAMIAJE (iframe del Hub) ═══');
  linea('¿dentro de iframe?', window.parent !== window);
  linea('URL', window.location.href);

  r.push('');
  r.push('═══ 7. ALMACENAMIENTO LOCAL ═══');
  try {
    const claves = Object.keys(localStorage);
    linea('claves', claves.length ? claves.join(', ') : '(vacío)');
  } catch (e) {
    linea('localStorage', 'BLOQUEADO: ' + e.message);
  }

  const salida = r.join('\n');
  console.log(salida);
  console.log('\n👆 COPIA TODO LO ANTERIOR Y PÉGALO EN EL CHAT');
  return salida;
})();
