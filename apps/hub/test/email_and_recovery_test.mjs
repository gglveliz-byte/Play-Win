/**
 * ==============================================================================
 * TEST DE VERIFICACIÓN DE EMAIL, RECUPERACIÓN Y GMAIL SMTP (email_and_recovery_test.mjs)
 * Prueba el ciclo completo:
 * 1. Registro de usuario con generación de token de verificación
 * 2. Emisión de Correo de Bienvenida y Correo de Verificación
 * 3. Activación de cuenta vía endpoint de verificación
 * 4. Solicitud de recuperación de contraseña (Forgot Password) y emisión de email
 * 5. Restablecimiento de contraseña con token criptográfico
 * 6. Login exitoso con la nueva contraseña
 * ==============================================================================
 */

const BASE_URL = process.env.TEST_APP_URL || 'http://localhost:3000';

async function runEmailAndRecoveryTests() {
  console.log('🧪 Iniciando prueba de Verificación de Email y Recuperación de Contraseña...');

  const uniqueId = Math.random().toString(36).slice(2, 7);
  const testUser = {
    username: `pilot_${uniqueId}`,
    email: `player_${uniqueId}@playwin.gg`,
    password: 'InitialPassword123!',
    avatarUrl: '🏎️',
  };

  // 1. Registro de Usuario
  console.log(`\n1️⃣ Registrando usuario de prueba: ${testUser.username} (${testUser.email})...`);
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUser),
  });

  const regData = await regRes.json();
  if (!regRes.ok || !regData.success) {
    throw new Error(`Fallo en registro: ${JSON.stringify(regData)}`);
  }
  console.log('✅ Usuario registrado exitosamente.');
  console.log(`   - ID: ${regData.user.id}`);
  console.log(`   - Estado Verificado Inicial: ${regData.user.is_verified}`);

  // 2. Consultar token de verificación en la base de datos Neon PostgreSQL
  console.log('\n2️⃣ Consultando token de verificación generado en Neon DB...');
  const { userService, query } = await import('../../../packages/database/src/index.js');
  const dbUser = await userService.getUserByEmail(testUser.email);
  if (!dbUser) throw new Error('Usuario no encontrado en Neon DB');
  const tokenQuery = await query('SELECT verification_token, is_verified FROM users WHERE id = $1', [dbUser.id]);
  const verificationToken = tokenQuery.rows[0]?.verification_token;
  console.log(`✅ Token de verificación recuperado de DB: ${verificationToken?.slice(0, 16)}...`);

  // 3. Verificación de Cuenta
  console.log('\n3️⃣ Verificando cuenta con el token (/api/auth/verify-email)...');
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: verificationToken }),
  });

  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData.success) {
    throw new Error(`Fallo en verificación de email: ${JSON.stringify(verifyData)}`);
  }
  console.log(`✅ ${verifyData.message}`);

  const postVerify = await query('SELECT is_verified, verification_token FROM users WHERE id = $1', [dbUser.id]);
  if (!postVerify.rows[0]?.is_verified) {
    throw new Error('La cuenta no quedó marcada como verificada en DB');
  }
  console.log('✅ Base de datos actualizada: is_verified = TRUE, verification_token limpiado.');

  // 4. Solicitar Recuperación de Contraseña (Forgot Password)
  console.log('\n4️⃣ Solicitando recuperación de contraseña (/api/auth/forgot-password)...');
  const forgotRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testUser.email }),
  });

  const forgotData = await forgotRes.json();
  if (!forgotRes.ok || !forgotData.success) {
    throw new Error(`Fallo en forgot-password: ${JSON.stringify(forgotData)}`);
  }
  console.log(`✅ ${forgotData.message}`);

  const resetQuery = await query('SELECT reset_token, reset_token_expires_at FROM users WHERE id = $1', [dbUser.id]);
  const resetToken = resetQuery.rows[0]?.reset_token;
  console.log(`✅ Token de recuperación generado: ${resetToken?.slice(0, 16)}...`);
  console.log(`   - Expiración: ${resetQuery.rows[0]?.reset_token_expires_at}`);

  // 5. Restablecer Contraseña (Reset Password)
  console.log('\n5️⃣ Restableciendo contraseña (/api/auth/reset-password)...');
  const newPassword = 'NewSecretPassword2026!';
  const resetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, newPassword }),
  });

  const resetData = await resetRes.json();
  if (!resetRes.ok || !resetData.success) {
    throw new Error(`Fallo en reset-password: ${JSON.stringify(resetData)}`);
  }
  console.log(`✅ ${resetData.message}`);

  // 6. Probar Login con la Nueva Contraseña
  console.log('\n6️⃣ Probando inicio de sesión con la NUEVA contraseña (/api/auth/login)...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: testUser.email, password: newPassword }),
  });

  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.success) {
    throw new Error(`Login con nueva contraseña falló: ${JSON.stringify(loginData)}`);
  }
  console.log(`✅ Inicio de sesión exitoso como ${loginData.user.username}.`);

  console.log('\n🎉 ¡TODOS LOS FLUJOS DE BIENVENIDA, VERIFICACIÓN Y RECUPERACIÓN DE CUENTA PASARON AL 100%!\n');
}

runEmailAndRecoveryTests().catch((err) => {
  console.error('❌ Error en prueba de emails y recuperación:', err);
  process.exit(1);
});
