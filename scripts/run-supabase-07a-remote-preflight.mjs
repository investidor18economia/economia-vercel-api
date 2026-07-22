#!/usr/bin/env node
/**
 * SUPABASE-07A — Execute read-only preflight queries against linked production.
 * Saves one JSON/text artifact per query under supabase/.temp/audit/SUPABASE-07A/
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sqlPath = path.join(root, 'supabase/tests/supabase-07a-remote-preflight-readonly.sql');
const outDir = path.join(root, 'supabase/.temp/audit/SUPABASE-07A');

const sql = fs.readFileSync(sqlPath, 'utf8');
const statements = sql
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.replace(/^--[^\n]*\n?/gm, '').trim())
  .filter(Boolean);

fs.mkdirSync(outDir, { recursive: true });

const manifest = {
  generated_at_utc: new Date().toISOString(),
  project_ref: 'xzijmzqsquasrtnkotrw',
  mode: 'read-only',
  statements: [],
};

for (let i = 0; i < statements.length; i += 1) {
  const statement = statements[i];
  const label = `q${String(i + 1).padStart(2, '0')}`;
  const outFile = path.join(outDir, `remote-preflight-${label}.json`);
  const raw = execFileSync('npx.cmd', ['supabase', 'db', 'query', '--linked', statement], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    shell: true,
  });
  fs.writeFileSync(outFile, raw, 'utf8');
  manifest.statements.push({ label, outFile: path.relative(root, outFile), bytes: Buffer.byteLength(raw) });
}

fs.writeFileSync(
  path.join(outDir, 'remote-preflight-manifest.json'),
  JSON.stringify(manifest, null, 2),
  'utf8'
);

console.log(`SUPABASE-07A remote preflight: ${statements.length} read-only queries saved to ${path.relative(root, outDir)}`);
