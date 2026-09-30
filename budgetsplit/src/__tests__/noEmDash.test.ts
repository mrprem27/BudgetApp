import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * `U-26` — no em dash on screen. The user's call (2026-09-30): it reads badly in the app's copy.
 *
 * Reads every string the app could show — string literals, template text and JSX text — with the
 * TypeScript parser, so comments (where the codebase's own prose uses them freely) are not touched.
 * `db/schema.ts` is SQL, never shown.
 */
const ROOT = path.resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') walk(f, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(f);
  }
  return out;
}

function shownStringsWithEmDash(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('—')) return [];
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: string[] = [];
  const visit = (n: ts.Node) => {
    const isText = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)
      || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)
      || n.kind === ts.SyntaxKind.JsxText;
    if (isText && n.getText(sf).includes('—')) {
      hits.push(`${path.relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

describe('U-26 · no em dash in anything the app shows', () => {
  const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))]
    .filter(f => !f.endsWith(path.join('db', 'schema.ts')));

  it('reads the source at all', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('finds none', () => {
    expect(files.flatMap(shownStringsWithEmDash)).toEqual([]);
  });
});
