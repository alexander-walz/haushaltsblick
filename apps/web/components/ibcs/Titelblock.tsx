import type { Titel } from '@/lib/ibcs/titel';
import { Skalierungsmarker } from './Skalierungsmarker';

/** IBCS-Titel über jeder Darstellung: WER, darunter WAS | WANN; bei eigenem Maßstab mit Skalierungsmarker. */
export function Titelblock({ wer, was, wann, id, eigenerMasstab = false }: Titel & { id?: string; eigenerMasstab?: boolean }) {
  return (
    <div id={id} className="mb-2 leading-snug">
      <p className="text-base font-semibold">{wer}</p>
      <p className="text-sm text-[var(--hb-gedaempft)]">{was} | {wann}{eigenerMasstab && <Skalierungsmarker />}</p>
    </div>
  );
}
