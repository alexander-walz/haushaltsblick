import { describe, expect, it } from 'vitest';
import { istLokaleDb } from './test-hilfen';

describe('istLokaleDb', () => {
  it.each([
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'postgresql://postgres:postgres@localhost:5432/postgres',
  ])('erlaubt %s', (url) => expect(istLokaleDb(url)).toBe(true));

  it.each([
    'postgresql://postgres:pw@db.example.supabase.co:5432/postgres',
    'postgresql://postgres:pw@127.0.0.1.example.org:5432/postgres',
    'postgresql://localhost@evil.example.org/postgres',
    'kein url',
  ])('verweigert %s', (url) => expect(istLokaleDb(url)).toBe(false));
});
