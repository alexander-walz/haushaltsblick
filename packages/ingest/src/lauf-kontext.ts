import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { standardUserAgent } from './abruf/http';
import type { Trigger } from './db/lade-soll';

const TRIGGER: readonly Trigger[] = ['schedule', 'manual', 'ci'];

export type LaufKontext = { trigger: Trigger; gitSha: string; pipelineVersion: string; userAgent: string };

function gitSha(env: NodeJS.ProcessEnv): string {
  if (env.GITHUB_SHA) return env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unbekannt';
  }
}

function pipelineVersion(): string {
  const paket = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return paket.version;
}

/** Trigger, Git-SHA, pipeline_version und User-Agent eines CLI-Laufs aus der Umgebung. */
export function laufKontext(env: NodeJS.ProcessEnv = process.env): LaufKontext {
  const trigger = (env.HB_TRIGGER || 'manual') as Trigger;
  if (!TRIGGER.includes(trigger)) throw new Error(`Unbekannter HB_TRIGGER: ${trigger}`);
  const version = pipelineVersion();
  return { trigger, gitSha: gitSha(env), pipelineVersion: version, userAgent: env.INGEST_USER_AGENT || standardUserAgent(version) };
}
