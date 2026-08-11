#!/usr/bin/env node
// Verifies every text-on-background token pair in site/app.css against WCAG AA.
// Run after touching any color token: node scripts/check-contrast.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'site/app.css'), 'utf8');

const AA_NORMAL = 4.5;

function luminance(hex) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The light palette is everything before the first @media; the pinned dark
// block carries the same tokens for the dark theme.
function paletteOf(theme) {
  const block =
    theme === 'light'
      ? css.slice(0, css.indexOf('@media'))
      : css.slice(css.indexOf(':root[data-theme="dark"]'));
  const palette = {};
  for (const [, name, hex] of block.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
    if (!(name in palette)) palette[name] = hex;
  }
  return palette;
}

const PAIRS = [
  ['ink', 'ground'],
  ['ink', 'surface'],
  ['muted', 'ground'],
  ['muted', 'surface'],
  ['accent', 'ground'],
  ['accent', 'surface'],
  ['accent', 'accent-soft'],
  ['on-accent', 'accent'],
];

let failures = 0;

for (const theme of ['light', 'dark']) {
  const palette = paletteOf(theme);
  for (const [fg, bg] of PAIRS) {
    if (!palette[fg] || !palette[bg]) {
      console.error(`${theme}: missing token --${palette[fg] ? bg : fg}`);
      failures++;
      continue;
    }
    const ratio = contrast(palette[fg], palette[bg]);
    const ok = ratio >= AA_NORMAL;
    if (!ok) failures++;
    console.log(
      `${theme.padEnd(6)}${`${fg} on ${bg}`.padEnd(26)}` +
        `${ratio.toFixed(2).padStart(6)}:1  ${ok ? 'AA' : 'FAIL'}`
    );
  }
}

console.log(
  failures
    ? `\n${failures} pair(s) below ${AA_NORMAL}:1`
    : `\nall pairs clear ${AA_NORMAL}:1 in both themes`
);

process.exit(failures ? 1 : 0);
