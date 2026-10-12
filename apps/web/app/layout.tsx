import type { Metadata } from 'next';
import { Titillium_Web } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const schrift = Titillium_Web({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-titillium', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Haushaltsblick', template: '%s | Haushaltsblick' },
  description: 'Der Bundeshaushalt verständlich und nachprüfbar: Soll, Ist und Abweichungen seit 2012, dargestellt nach IBCS.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" className={schrift.variable}>
      <body>
        <main id="inhalt" className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
