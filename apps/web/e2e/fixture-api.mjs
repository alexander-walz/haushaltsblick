// Liefert aufgezeichnete Antworten der Data API für Ende-zu-Ende-Tests; mit HB_AUFNAHME_QUELLE wird aufgezeichnet.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const VERZEICHNIS = new URL('./aufnahmen/', import.meta.url);
const PORT = Number(process.env.FIXTURE_PORT ?? 4010);
const QUELLE = process.env.HB_AUFNAHME_QUELLE?.replace(/\/+$/, '');
const KEY = process.env.HB_AUFNAHME_KEY;
const name = (pfad) => `${createHash('sha256').update(pfad).digest('hex').slice(0, 24)}.json`;

createServer(async (req, res) => {
  const pfad = req.url ?? '/';
  if (pfad === '/health') return res.writeHead(200).end('ok');
  const datei = new URL(name(pfad), VERZEICHNIS);
  try {
    if (QUELLE) {
      const antwort = await fetch(QUELLE + pfad, { headers: { apikey: KEY ?? '', 'Accept-Profile': 'api', Accept: 'application/json' } });
      const text = await antwort.text();
      await mkdir(VERZEICHNIS, { recursive: true });
      await writeFile(datei, `${JSON.stringify({ pfad, status: antwort.status, text }, null, 1)}\n`);
      return res.writeHead(antwort.status, { 'content-type': 'application/json' }).end(text);
    }
    const aufnahme = JSON.parse(await readFile(datei, 'utf8'));
    return res.writeHead(aufnahme.status, { 'content-type': 'application/json' }).end(aufnahme.text);
  } catch {
    return res.writeHead(500, { 'content-type': 'application/json' })
      .end(JSON.stringify({ code: 'AUFNAHME', message: `Keine Aufnahme für ${pfad}. Neu aufnehmen mit HB_AUFNAHME_QUELLE.` }));
  }
}).listen(PORT, '127.0.0.1');
