{# Entfernt unsichtbare Zeichen, verbindet Silbentrennung am Zeilenende, vereinheitlicht Leerraum (Roadmap: Übertrag aus Plan 1) #}
{% macro bereinige_text(ausdruck) -%}
nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace({{ ausdruck }},
  '[­​‌‍⁠﻿]', '', 'g'),
  ' ', ' ', 'g'),
  '-[ \t]*\n\s*', '-', 'g'),
  '\s+', ' ', 'g')), '')
{%- endmacro %}
