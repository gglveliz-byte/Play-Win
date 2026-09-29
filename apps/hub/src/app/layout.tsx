import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Play Win — Plataforma eSports Competitiva en Tiempo Real',
  description: 'Compite en duelos 1v1 en Micro-Ligas cerradas de 10 jugadores. Partidas sincronizadas con tecnología de árbitro en el servidor y premios semanales.',
  icons: {
    icon: '/images/logo.jpg',
    apple: '/images/logo.jpg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="darkreader-lock" content="darkreader-lock" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
