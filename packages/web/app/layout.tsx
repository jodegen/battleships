import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Schiffe versenken – gegen die KI',
  description: 'Minimal spielbares Frontend gegen die KI (Meilenstein 2).',
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
