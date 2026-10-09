-- Wirtschaftspläne von Sondervermögen (Roadmap E1): nie Teil des Gesamthaushalts
select jahr, konto, anlage_zu_kapitel_nr, kapitel_nr, kapitel_text, titel_key, titel_text, fkt, soll_eur
from {{ ref('stg_soll_titel') }}
where ist_anlage
