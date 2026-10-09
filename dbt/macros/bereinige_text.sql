{# Entfernt unsichtbare Zeichen, verbindet Silbentrennung am Zeilenende, vereinheitlicht Leerraum (Roadmap: Übertrag aus Plan 1).
   Escapes als Postgres-ARE: \u00AD weiches Trennzeichen, \u200B-\u200D breitenlose Zeichen, \u2060 Wortverbinder,
   \uFEFF BOM, \u00A0 NBSP (wird zu Leerzeichen). #}
{% macro bereinige_text(ausdruck) -%}
nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace({{ ausdruck }},
  '[\u00AD\u200B\u200C\u200D\u2060\uFEFF]', '', 'g'),
  '\u00A0', ' ', 'g'),
  '-[ \t]*\n\s*', '-', 'g'),
  '\s+', ' ', 'g')), '')
{%- endmacro %}
