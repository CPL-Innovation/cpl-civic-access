#!/usr/bin/env node
/**
 * One-way sync: the Obsidian vault's catalog (the facts library) → src/content/catalog.generated.json.
 *
 *   npm run catalog:sync                      # default vault path below
 *   CATALOG_DIR=/path/to/catalog npm run catalog:sync
 *
 * Reads only each file's YAML frontmatter (the markdown body is notes for humans). Never writes to the vault.
 * Fails if a {{entity.fact}} reference points at a fact that doesn't exist, as the catalog README requires.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.join(process.env.HOME || '', 'Library/Mobile Documents/iCloud~md~obsidian/Documents/Projects/01 Develop/CPL Cleveland Civic Access/build/catalog');
const DIR = process.env.CATALOG_DIR || DEFAULT_DIR;
const OUT = path.resolve(here, '../src/content/catalog.generated.json');

if (!fs.existsSync(DIR)) { console.error(`catalog: not found at ${DIR} (set CATALOG_DIR)`); process.exit(1); }

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'media' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.md') && e.name !== 'README.md' ? [path.join(d, e.name)] : []);

const sections = {};
const errors = [];
for (const file of walk(DIR).sort()) {
  const rel = path.relative(DIR, file);
  const section = rel.split(path.sep)[0];
  const m = fs.readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!m) { errors.push(`${rel}: no frontmatter`); continue; }
  let fm;
  try { fm = YAML.parse(m[1]); } catch (e) { errors.push(`${rel}: ${e.message}`); continue; }
  if (!fm?.id || !fm?.type) { errors.push(`${rel}: missing id or type`); continue; }
  (sections[section] ||= []).push({ file: rel, ...fm });
}

// Every {{entity.fact}} must resolve.
const facts = new Set();
for (const files of Object.values(sections)) for (const f of files) for (const k of Object.keys(f.facts || {})) facts.add(`${f.id}.${k}`);
const refs = (v, out = []) => { if (typeof v === 'string') for (const r of v.matchAll(/\{\{([\w-]+\.[\w-]+)\}\}/g)) out.push(r[1]); else if (v && typeof v === 'object') for (const x of Object.values(v)) refs(x, out); return out; };
for (const files of Object.values(sections)) for (const f of files) for (const r of refs(f)) if (!facts.has(r)) errors.push(`${f.file}: {{${r}}} points at a fact that doesn't exist`);

if (errors.length) { console.error('catalog: sync failed\n  ' + errors.join('\n  ')); process.exit(1); }

const counts = {};
for (const files of Object.values(sections)) for (const f of files) for (const x of Object.values(f.facts || {})) counts[x.provenance || 'unset'] = (counts[x.provenance || 'unset'] || 0) + 1;

fs.writeFileSync(OUT, JSON.stringify({
  _generated: 'GENERATED from the vault catalog by scripts/sync-catalog.mjs. Do not edit: fix the fact in the vault, then run npm run catalog:sync.',
  syncedAt: new Date().toISOString(),
  sections,
}, null, 2) + '\n');
console.log(`catalog: ${Object.values(sections).flat().length} files, ${facts.size} facts (${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}) → ${path.relative(process.cwd(), OUT)}`);
