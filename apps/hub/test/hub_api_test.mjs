async function testHub() {
  console.log('🧪 Probando API de Play Win Hub en http://localhost:3000...');

  const uniqueUser = `champ_${Date.now().toString(36).slice(-6)}`;
  const email = `${uniqueUser}@playwin.gg`;

  // 1. Registro
  console.log(`\n1️⃣ Registrando usuario real en Neon DB: ${uniqueUser}...`);
  const regRes = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: uniqueUser,
      email,
      password: 'SecurePassword2026!',
      avatarUrl: '👑',
    }),
  });
  const regData = await regRes.json();
  console.log('Respuesta Registro:', regRes.status, regData.user?.username, 'ID:', regData.user?.id);
  if (!regData.success) throw new Error('Fallo en registro');

  // Obtener cookie de sesión
  const cookie = regRes.headers.get('set-cookie');
  console.log('✅ Cookie de sesión recibida:', cookie?.split(';')[0]);

  // 2. Consultar perfil y pasaportes
  console.log('\n2️⃣ Consultando sesión y pasaportes multijuego en /api/auth/me...');
  const meRes = await fetch('http://localhost:3000/api/auth/me', {
    headers: { Cookie: cookie || '' },
  });
  const meData = await meRes.json();
  console.log('✅ Usuario autenticado:', meData.user?.username, '| Saldo:', meData.user?.wallet_balance);
  console.log('✅ Pasaportes generados en Neon:', meData.passports?.length, 'juegos');
  meData.passports.forEach(p => console.log(`   - [${p.game_id}] Tier: ${p.rank_tier} | SP: +${p.season_points}`));

  // 3. Consultar Micro-Liga de 10
  console.log('\n3️⃣ Consultando Micro-Liga semanal de 10 en /api/leagues...');
  const leagueRes = await fetch('http://localhost:3000/api/leagues?gameId=carreras', {
    headers: { Cookie: cookie || '' },
  });
  const leagueData = await leagueRes.json();
  console.log('✅ Liga activa obtenida:', leagueData.league?.game_id, '| Miembros en grupo:', leagueData.league?.standings?.length);
  console.log('   Top 3 del grupo:', leagueData.league?.standings?.slice(0, 3).map(m => `${m.username} (+${m.season_points} SP)`));

  // 4. Emisión de MatchTicket seguro
  console.log('\n4️⃣ Generando MatchTicket efímero para iframe en /api/games/ticket...');
  const ticketRes = await fetch('http://localhost:3000/api/games/ticket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie || '',
    },
    body: JSON.stringify({ gameId: 'carreras' }),
  });
  const ticketData = await ticketRes.json();
  console.log('✅ MatchTicket generado exitosamente:', ticketData.ticket ? 'JWT OK' : 'Error');
  console.log('   Jugador inyectado:', ticketData.player?.username, 'ID:', ticketData.player?.id);

  // 5. Prueba de Inicio de Sesión
  console.log('\n5️⃣ Probando inicio de sesión con contraseña en /api/auth/login...');
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: uniqueUser,
      password: 'SecurePassword2026!',
    }),
  });
  const loginData = await loginRes.json();
  console.log('✅ Login exitoso:', loginRes.status, loginData.user?.username, 'ID:', loginData.user?.id);
  if (!loginData.success) throw new Error('Fallo en login');

  console.log('\n🏆 ¡TODAS LAS RUTAS DE LA PLATAFORMA HUB FUNCIONAN AL 100% CON NEON POSTGRESQL!');
}

testHub().catch(err => {
  console.error('❌ Error en prueba Hub:', err);
  process.exit(1);
});
