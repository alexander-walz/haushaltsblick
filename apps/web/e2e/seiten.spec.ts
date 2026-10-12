import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('Start zeigt Kernaussage und führt in den Explorer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Der Bund plant 2026 Ausgaben von');
  await expect(page.getByText('Bund, Ausgaben nach Einzelplänen')).toBeVisible();
  await page.getByRole('link', { name: /^11 / }).first().click();
  await expect(page).toHaveURL(/\/explorer\?jahr=2026&konto=ausgaben&sicht=ressort&einzelplan=11$/);
});

test('Explorer: Drilldown bis zum Titelsteckbrief', async ({ page }) => {
  await page.goto('/explorer?jahr=2025&konto=ausgaben&sicht=ressort');
  await expect(page.getByText('Ausgaben gesamt')).toBeVisible();
  await page.getByRole('rowheader').getByRole('link', { name: /^14 / }).click();
  await expect(page).toHaveURL(/einzelplan=14$/);
  await page.getByRole('rowheader').getByRole('link').first().click();
  await expect(page).toHaveURL(/kapitel=14\d\d$/);
  await page.getByRole('rowheader').getByRole('link').first().click();
  await expect(page).toHaveURL(/\/titel\/2025\/14\d{7}$/);
  await expect(page.getByRole('heading', { name: 'Stammdaten 2025' })).toBeVisible();
});

test('Explorer korrigiert ungültige Parameter mit Hinweis', async ({ page }) => {
  await page.goto('/explorer?jahr=abc&einzelplan=9x');
  await expect(page.getByRole('status')).toContainText('nicht verfügbar');
});

test('Suche mit Synonym führt zum Einzelplan', async ({ page }) => {
  await page.goto('/');
  const feld = page.getByRole('combobox', { name: 'Suche im Bundeshaushalt' });
  await feld.fill('Bundeswehr');
  await expect(page.getByRole('option').first()).toContainText('Einzelplan 14');
  await feld.press('ArrowDown');
  await feld.press('Enter');
  await expect(page).toHaveURL(/einzelplan=14/);
});

test('Suche funktioniert ohne JavaScript', async ({ browser }) => {
  const kontext = await browser.newContext({ javaScriptEnabled: false });
  const page = await kontext.newPage();
  await page.goto('/suche?q=BAf%C3%B6G');
  await expect(page.getByText('Funktion 142')).toBeVisible();
  await kontext.close();
});

test('Plan und Wirklichkeit zeigt Kernaussage und beide Diagramme', async ({ page }) => {
  await page.goto('/plan-und-ist');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/2025 wurden .* (weniger|mehr) ausgegeben als geplant\./);
  await expect(page.getByText('ΔPL (Ist minus Soll)')).toBeVisible();
  await expect(page.getByText('ΔPL %')).toBeVisible();
  await page.goto('/plan-und-ist?jahr=2026');
  await expect(page.getByRole('status')).toContainText('noch kein Ist');
});

test('Seiten senden Sicherheits-Header', async ({ request }) => {
  const antwort = await request.get('/impressum');
  expect(antwort.headers()['x-content-type-options']).toBe('nosniff');
  expect(antwort.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(antwort.headers()['x-frame-options']).toBe('DENY');
});

test('Unbekannter Titel liefert 404', async ({ page }) => {
  const antwort = await page.goto('/titel/2025/999999999');
  expect(antwort?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Diese Seite gibt es nicht' })).toBeVisible();
});

for (const pfad of ['/', '/explorer?jahr=2025', '/plan-und-ist', '/titel/2026/041668421', '/methodik', '/datenqualitaet']) {
  test(`Barrierefreiheit ${pfad}`, async ({ page }) => {
    await page.goto(pfad);
    const ergebnis = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(ergebnis.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
}
