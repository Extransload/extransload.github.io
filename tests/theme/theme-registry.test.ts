import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTheme, themes } from '../../src/shared/themes/registry';
import { applyTheme, earlyThemeScript, THEME_STORAGE_KEY } from '../../src/shared/scripts/theme-init';

const themeFile = (id: string) => `src/shared/themes/${id}.css`;

/** Custom properties a stylesheet declares, with their values. */
function declarations(css: string): Map<string, string> {
  return new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

const DEFAULT_THEME = themes[0];
const CORE_PALETTE = [...declarations(readFileSync(themeFile(DEFAULT_THEME.id), 'utf8')).keys()];

describe('theme registry', () => {
  it('resolves known IDs and falls back to the default theme', () => {
    expect(DEFAULT_THEME.id).toBe('midnight');
    expect(getTheme('light').id).toBe('light');
    expect(getTheme('unknown').id).toBe('midnight');
    expect(getTheme(null).id).toBe('midnight');
    expect(getTheme(undefined).id).toBe('midnight');
  });

  it('applies a valid theme and falls back for invalid IDs', () => {
    const root = { dataset: {} } as HTMLElement;

    expect(applyTheme('light', root).id).toBe('light');
    expect(root.dataset.theme).toBe('light');
    expect(applyTheme('invalid', root).id).toBe('midnight');
    expect(root.dataset.theme).toBe('midnight');
  });

  it('reads and writes the same storage key the early script uses', () => {
    expect(earlyThemeScript).toContain(THEME_STORAGE_KEY);
  });
});

describe('theme stylesheets', () => {
  it('ships a stylesheet for every registered theme', () => {
    for (const theme of themes) {
      expect(existsSync(themeFile(theme.id)), `${theme.id} has no stylesheet`).toBe(true);
    }
  });

  it('declares a non-empty core palette in every theme', () => {
    expect(CORE_PALETTE.length).toBeGreaterThan(10);

    for (const theme of themes) {
      const declared = declarations(readFileSync(themeFile(theme.id), 'utf8'));
      const missing = CORE_PALETTE.filter((token) => !declared.has(token));

      expect(missing, `${theme.id} is missing core tokens`).toEqual([]);
      for (const token of CORE_PALETTE) {
        expect(declared.get(token), `${theme.id} ${token}`).toBeTruthy();
      }
    }
  });

  it('scopes each theme to its own data-theme selector', () => {
    for (const theme of themes) {
      const css = readFileSync(themeFile(theme.id), 'utf8');
      // Quote style is normalised by the formatter, so match either form.
      expect(css, `${theme.id} must be selectable`).toMatch(new RegExp(`\\[data-theme=['"]${theme.id}['"]\\]`));
    }
  });

  it('declares a color-scheme so form controls and scrollbars follow the theme', () => {
    for (const theme of themes) {
      expect(readFileSync(themeFile(theme.id), 'utf8'), theme.id).toMatch(/color-scheme:\s*(light|dark)/);
    }
  });
});
