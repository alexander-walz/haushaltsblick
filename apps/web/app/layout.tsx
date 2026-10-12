import type { Metadata } from 'next';
import { Titillium_Web } from 'next/font/google';
import type { ReactNode } from 'react';
import { Fuss } from '@/components/ui/Fuss';
import { Kopf } from '@/components/ui/Kopf';
import './globals.css';

const schrift = Titillium_Web({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-titillium', display: 'swap' });

// Jede Seite wird je Anfrage gerendert; die API-Antworten selbst sind gecacht (Tag datenstand). So braucht der Build keine API.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Haushaltsblick', template: '%s | Haushaltsblick' },
  description: 'Der Bundeshaushalt verständlich und nachprüfbar: Soll, Ist und Abweichungen seit 2012, dargestellt nach IBCS.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" className={schrift.variable}>
      <body>
        <a href="#inhalt" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2">Zum Inhalt</a>
        <Kopf />
        <main id="inhalt" className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <Fuss />
      </body>
    </html>
  );
}
