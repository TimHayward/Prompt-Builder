/**
 * The workflow the application exists for, driven through the browser:
 *
 *   Find → Select → Customise → Resolve → Copy
 *
 * One test walks the whole thing rather than ten isolated ones, because the
 * point is that the steps hold together: what is typed survives a reload, what
 * the preview shows is what the clipboard gets, and clearing values leaves the
 * prompt itself alone.
 */
import { expect, test, type Page } from '@playwright/test';

const SECTION_TEXT =
  'Review the {{technology}} estate for {{customer}} in a {{tone: formal/casual}} tone.';

/** The editor's content area is a contenteditable div, not a textarea. */
const sectionEditor = (page: Page) => page.locator('.editable-content').first();

/**
 * Starts a new prompt.
 *
 * A library with no prompts offers a Create Prompt button instead of the tab
 * bar, so the first prompt of a run is made differently from the rest.
 */
const createPrompt = async (page: Page) => {
  // The empty state is shown while the prompts are still loading, so let the
  // page settle before deciding which of the two buttons is the real one.
  await page.waitForLoadState('networkidle');

  const emptyState = page.getByRole('button', { name: 'Create Prompt' });

  if (await emptyState.isVisible()) {
    await emptyState.click();
  } else {
    await page.getByTitle('Add New Prompt').click();
  }

  // A prompt started from the tab bar arrives with no sections; one from the
  // empty state gets a default section. Either way, end up with one to type in.
  if ((await page.locator('.section').count()) === 0) {
    await page.getByTitle('Add New Section').click();
  }

  await expect(sectionEditor(page)).toBeVisible();
};

/** Types into the section, replacing whatever is there. */
const writeSection = async (page: Page, text: string) => {
  // The editor opens in Using, where typing changes this use only. Authoring
  // the prompt means editing the source, so say so first.
  await page.getByRole('button', { name: 'Editing source' }).click();

  const editor = sectionEditor(page);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
  // The editor saves on a debounce; wait for the indicator to settle.
  await expect(page.locator('.save-state')).toHaveText('Saved', { timeout: 15_000 });
};

const previewText = (page: Page) => page.locator('.resolved-preview-text');

test.describe('the prompt workflow', () => {
  test('create, edit, reload, resolve, copy and clear', async ({ page }) => {
    await page.goto('/');

    // ── create ────────────────────────────────────────────────────────────
    await createPrompt(page);
    await expect(page.locator('.section')).toHaveCount(1);

    // ── edit ──────────────────────────────────────────────────────────────
    await writeSection(page, SECTION_TEXT);

    // ── reload, and verify persistence ────────────────────────────────────
    await page.reload();
    await expect(sectionEditor(page)).toContainText('Review the');
    await expect(sectionEditor(page)).toContainText('estate for');

    // ── populate a variable ───────────────────────────────────────────────
    // Free-text variables get a textarea; the choice list gets a dropdown.
    const technology = page.locator('#var-technology');
    await technology.fill('Intune');
    const customer = page.locator('#var-customer');
    await customer.fill('Contoso');
    await page.locator('#var-tone').selectOption('formal');

    // ── preview the result ────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(previewText(page)).toContainText(
      'Review the Intune estate for Contoso in a formal tone.'
    );

    const shown = (await previewText(page).textContent()) ?? '';

    // ── copy, and compare the clipboard with the preview ──────────────────
    await page.getByTitle('Copy Prompt').click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(shown);

    // ── clear values ──────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.getByRole('button', { name: 'Reset working prompt' }).click();

    // The values are gone...
    await expect(page.locator('#var-technology')).toHaveValue('');

    // ...and the source prompt, with its choice list, is untouched.
    await expect(sectionEditor(page)).toContainText('{{tone: formal/casual}}');
    const toneOptions = await page.locator('#var-tone option').allTextContents();
    expect(toneOptions).toContain('formal');
    expect(toneOptions).toContain('casual');
  });

  test('a variable left empty resolves to nothing, in preview and clipboard alike', async ({
    page,
  }) => {
    await page.goto('/');

    await createPrompt(page);
    await writeSection(page, 'Hello {{name}}!');

    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(previewText(page)).toHaveText('Hello !');

    const shown = (await previewText(page).textContent()) ?? '';
    await page.getByTitle('Copy Prompt').click();

    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shown);
    // And the user is told which one was blank.
    await expect(page.getByText(/left empty: name/)).toBeVisible();
  });
});

test.describe('an idle app', () => {
  test('stops writing once everything is saved', async ({ page }) => {
    // Regression: the effect that marked the library unsaved had the save state
    // in its dependencies, so marking it re-ran the effect, which marked it
    // again — the library was rewritten every few seconds forever and the
    // indicator never left "Unsaved changes".
    const librarySaves: number[] = [];
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname === '/api/components' && response.request().method() === 'POST') {
        librarySaves.push(Date.now());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Long enough for three turns of the 2.5s save debounce.
    await page.waitForTimeout(9000);

    expect(librarySaves.length).toBeLessThanOrEqual(1);
    await expect(page.locator('.save-state')).toHaveText('Saved');
  });
});

test.describe('changing a prompt for one use', () => {
  test('does not touch the stored prompt', async ({ page }) => {
    await page.goto('/');
    await createPrompt(page);
    await writeSection(page, 'Produce a comprehensive assessment.');

    // Back to the default mode, where typing changes this use only.
    await page.getByRole('button', { name: 'Using' }).click();

    const editor = sectionEditor(page);
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Produce a concise assessment.');
    await expect(page.locator('.save-state')).toHaveText('Saved', { timeout: 15_000 });

    await expect(page.locator('.section-override-indicator')).toContainText('Changed for this use');

    // The copy takes the change...
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(previewText(page)).toContainText('Produce a concise assessment.');

    // ...and the stored prompt, after a reload, does not have it. Resetting
    // asks first, because text changed for this use is not visible from the
    // variables pane.
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.getByRole('button', { name: 'Reset working prompt' }).click();
    await page.reload();

    await expect(sectionEditor(page)).toContainText('Produce a comprehensive assessment.');
  });
});
