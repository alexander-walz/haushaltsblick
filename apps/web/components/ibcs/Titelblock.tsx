import type { Titel } from '@/lib/ibcs/titel';

/** IBCS-Titel über jeder Darstellung: WER, darunter WAS | WANN. */
export function Titelblock({ wer, was, wann, id }: Titel & { id?: string }) {
  return (
    <div id={id} className="mb-2 leading-snug">
      <p className="text-base font-semibold">{wer}</p>
      <p className="text-sm text-[var(--hb-gedaempft)]">{was} | {wann}</p>
    </div>
  );
}
