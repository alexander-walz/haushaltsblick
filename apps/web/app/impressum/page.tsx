import type { Metadata } from 'next';
import { impressum } from '@/lib/impressum';

export const metadata: Metadata = { title: 'Impressum' };

export default function Impressum() {
  const i = impressum();
  return (
    <article className="max-w-2xl">
      <h1 className="text-2xl font-bold">Impressum</h1>
      {i ? (
        <>
          <p className="mt-2">Angaben gemäß § 5 Digitale-Dienste-Gesetz</p>
          <address className="mt-2 not-italic">{i.name}<br />{i.anschrift.map((z, n) => <span key={n}>{z}<br /></span>)}</address>
          <p className="mt-2">Kontakt: {i.kontakt}</p>
          <p className="mt-4 text-sm">Haushaltsblick ist ein privates, nicht kommerzielles Projekt.</p>
        </>
      ) : (
        <p className="mt-2">Die Angaben werden vor dem Start ergänzt.</p>
      )}
    </article>
  );
}
