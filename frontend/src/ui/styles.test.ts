/**
 * Guards against a class of regression that bit three times while building the
 * hand screen: a bulk edit to theme.css silently dropping rules that components
 * still reference. Nothing fails loudly when that happens -- the element just
 * renders unstyled -- so it takes a screenshot to notice.
 *
 * Only element/modifier names (those containing `__` or `--`) are checked. They
 * are the ones that get clobbered, and they are unambiguous enough to extract
 * from source without parsing JSX.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = new URL('..', import.meta.url).pathname;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(path);
    return e.name.endsWith('.tsx') ? [path] : [];
  });
}

/** BEM-ish class names appearing as string literals in components. */
function referencedClasses(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of tsxFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/[a-z][a-z0-9]*(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)+|[a-z][a-z0-9]*__[a-z0-9-]+/g)) {
      found.set(m[0], file.replace(SRC, ''));
    }
  }
  return found;
}

describe('stylesheet coverage', () => {
  const css = readFileSync(join(SRC, 'ui/theme.css'), 'utf8');
  const referenced = referencedClasses();

  it('finds classes to check, so the test cannot silently pass on nothing', () => {
    expect(referenced.size).toBeGreaterThan(15);
  });

  it('defines every element and modifier class the components use', () => {
    const missing = [...referenced]
      .filter(([cls]) => !new RegExp(`\\.${cls}(?![\\w-])`).test(css))
      .map(([cls, file]) => `${cls} (used in ${file})`);
    expect(missing).toEqual([]);
  });
});
