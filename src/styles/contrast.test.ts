import { describe, expect, it } from 'vitest';
import specification from '../../docs/SPECIFICATION.md?raw';
import tokensCss from './tokens.css?raw';

function parseTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of css.matchAll(/--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6});/g)) {
    const [, name, value] = match;
    if (name && value) {
      tokens.set(name, value.toUpperCase());
    }
  }
  return tokens;
}

function parseSpecificationPalette(markdown: string): Map<string, string> {
  const palette = new Map<string, string>();
  for (const match of markdown.matchAll(/^\|\s*([A-Za-z ]+?)\s*\|\s*(#[0-9A-F]{6})\s*\|/gm)) {
    const [, name, value] = match;
    if (name && value) {
      palette.set(name, value);
    }
  }
  return palette;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const tokens = parseTokens(tokensCss);

function token(name: string): string {
  const value = tokens.get(name);
  if (!value) {
    throw new Error(`Missing colour token --color-${name}`);
  }
  return value;
}

/** Token name → name of the colour in the specification table (§2.3). */
const SPECIFICATION_NAMES: Record<string, string> = {
  obsidian: 'Obsidian',
  carbon: 'Carbon',
  graphite: 'Graphite',
  steel: 'Steel',
  line: 'Border',
  'line-subtle': 'Border subtle',
  fg: 'Primary text',
  'fg-secondary': 'Secondary text',
  'fg-muted': 'Muted text',
  'fg-disabled': 'Disabled text',
  amber: 'Archive Amber',
  blue: 'Electric Blue',
  cyan: 'Soft Cyan',
  purple: 'Purple',
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger',
  info: 'Information',
};

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;
const SURFACES = ['obsidian', 'carbon', 'graphite', 'steel'];

describe('design tokens', () => {
  it('match the mandatory palette of the specification exactly', () => {
    const palette = parseSpecificationPalette(specification);
    expect(palette.size).toBeGreaterThanOrEqual(17);
    expect(new Set(tokens.keys())).toEqual(new Set(Object.keys(SPECIFICATION_NAMES)));
    for (const [tokenName, specificationName] of Object.entries(SPECIFICATION_NAMES)) {
      expect(token(tokenName), tokenName).toBe(palette.get(specificationName));
    }
  });

  it.each(SURFACES)('keep primary and secondary text readable on %s (WCAG AA)', (surface) => {
    expect(contrast(token('fg'), token(surface))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(token('fg-secondary'), token(surface))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('allow muted text in small sizes on Obsidian only', () => {
    expect(contrast(token('fg-muted'), token('obsidian'))).toBeGreaterThanOrEqual(AA_TEXT);
    for (const surface of ['carbon', 'graphite', 'steel']) {
      expect(contrast(token('fg-muted'), token(surface))).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it.each(['amber', 'danger'])('keep Obsidian labels readable on %s buttons', (accent) => {
    expect(contrast(token('obsidian'), token(accent))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(['amber', 'blue', 'cyan', 'purple', 'success', 'warning', 'danger'])(
    'keep %s text readable on cards (badges, icons with labels)',
    (accent) => {
      expect(contrast(token(accent), token('graphite'))).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it('keep the focus ring visible on every surface', () => {
    for (const surface of SURFACES) {
      expect(contrast(token('blue'), token(surface))).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});
