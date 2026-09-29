import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` es un paquete de servidor: no debe empaquetarse en el bundle de Node.
  serverExternalPackages: ['pg'],

  // Permite compilar a un directorio alternativo (verificación sin tocar .next).
  // Uso: NEXT_DIST_DIR=.next-verify npx next build
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
