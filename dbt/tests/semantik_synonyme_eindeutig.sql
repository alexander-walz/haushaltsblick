-- Jede Kombination aus Begriff, Typ, Schlüssel, Konto und Beginn höchstens einmal (Primärschlüssel von semantic.synonym).
select begriff, typ, schluessel, konto, jahr_von, count(*) as anzahl
from {{ ref('semantik_synonyme') }}
group by begriff, typ, schluessel, konto, jahr_von
having count(*) > 1
