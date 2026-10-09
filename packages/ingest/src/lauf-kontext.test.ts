import { describe, expect, it } from 'vitest';
import { laufKontext } from './lauf-kontext';

describe('laufKontext', () => {
  it('nutzt ohne Umgebungsvariablen den Projekt-User-Agent und den Trigger manual', () => {
    const k = laufKontext({});
    expect(k.trigger).toBe('manual');
    expect(k.pipelineVersion).toBe('0.2.0');
    expect(k.userAgent).toBe('Haushaltsblick/0.2.0 (+https://github.com/alexander-walz/haushaltsblick)');
  });

  it('übernimmt INGEST_USER_AGENT, HB_TRIGGER und GITHUB_SHA', () => {
    expect(laufKontext({ INGEST_USER_AGENT: 'X/1', HB_TRIGGER: 'schedule', GITHUB_SHA: 'abc123' })).toMatchObject({
      userAgent: 'X/1', trigger: 'schedule', gitSha: 'abc123',
    });
  });

  it('lehnt unbekannte Trigger ab', () => {
    expect(() => laufKontext({ HB_TRIGGER: 'cron' })).toThrow('Unbekannter HB_TRIGGER: cron');
  });
});
