#!/usr/bin/env node
/**
 * One-off content update on the live CMS (flight-experts-cms.vercel.app): the hero accreditation "USDA" becomes the
 * FDACS seal (Florida Department of Agriculture and Consumer Services, which registers Sellers of Travel).
 *   1. Uploads apps/web/src/assets/seed/accreditation-fdacs-seal.png to Media (reused if already there).
 *   2. Site settings > Accreditations: the USDA row gets name "FDACS" and the seal as its logo.
 *      ASTA / IATA / IATAN and every other setting are left as they are.
 * The site shows it with the one-colour seal filter (HomeHero matches "seal" in the name or alt text).
 *
 * Asks for a CMS admin login, saves a backup of the accreditations, shows the plan, and only writes after you type
 * "yes". Safe to run twice (nothing to do once the seal is in).
 *
 *   node scripts/update-cms-fdacs-seal.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const CMS = (process.env.CMS_URL || 'https://flight-experts-cms.vercel.app').replace(/\/$/, '');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEAL_FILE = path.join(HERE, '..', 'apps/web/src/assets/seed/accreditation-fdacs-seal.png');
const NAME = 'FDACS';
const ALT = 'Seal of the Florida Department of Agriculture and Consumer Services';

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); }));
}

async function api(method, p, { token, body, form } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `JWT ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${CMS}/api/${p}`, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = json?.errors?.map((e) => e.message + (e.data?.errors ? ' ' + JSON.stringify(e.data.errors) : '')).join('; ') || res.statusText;
    throw new Error(`${method} /api/${p} failed (${res.status}): ${why}`);
  }
  return json;
}

if (!fs.existsSync(SEAL_FILE)) throw new Error(`Seal image not found: ${SEAL_FILE}. Nothing changed.`);

const email = await ask('CMS admin email: ');
const password = await ask('CMS admin password: ', { hidden: true });
const { token } = await api('POST', 'users/login', { body: { email, password } });
if (!token) throw new Error('Login returned no token.');
console.log('Logged in.\n');

const settings = await api('GET', 'globals/site-settings?depth=0', { token });
const rows = settings.accreditations ?? [];
fs.mkdirSync(path.join(HERE, 'backups'), { recursive: true });
const backup = path.join(HERE, 'backups', `cms-backup-accreditations-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(backup, JSON.stringify({ accreditations: rows }, null, 2));
console.log(`Backup saved: ${backup}\n`);

const idx = rows.findIndex((r) => /usda/i.test(r.name));
if (idx < 0) {
  const done = rows.some((r) => r.name === NAME);
  console.log(done ? 'The FDACS seal is already in. Nothing changed.' : 'No "USDA" accreditation found. Nothing changed.');
  process.exit(0);
}

const existing = await api('GET', `media?where[filename][like]=accreditation-fdacs-seal&depth=0&limit=1`, { token });
const reuse = existing.docs?.[0];
console.log('Planned changes:');
console.log(reuse ? `  Media: reuse ${reuse.filename} (id ${reuse.id})` : `  Media: upload ${path.basename(SEAL_FILE)} (alt "${ALT}")`);
console.log(`  Accreditation ${idx + 1}: "${rows[idx].name}" (logo id ${rows[idx].logo}) -> "${NAME}" with the seal`);
if ((await ask('\nType yes to apply: ')).toLowerCase() !== 'yes') { console.log('Nothing changed.'); process.exit(0); }

let mediaId = reuse?.id;
if (!mediaId) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(SEAL_FILE)], { type: 'image/png' }), path.basename(SEAL_FILE));
  form.append('_payload', JSON.stringify({ alt: ALT }));
  const up = await api('POST', 'media', { token, form });
  mediaId = up.doc?.id;
  if (!mediaId) throw new Error('Upload returned no media id. Settings not changed.');
  console.log(`Seal uploaded (media id ${mediaId}).`);
}

// whole array sent back (row ids kept), only the USDA row changed
const accreditations = rows.map((r, i) => (i === idx ? { ...r, name: NAME, logo: mediaId } : r));
await api('POST', 'globals/site-settings', { token, body: { accreditations } });
console.log('Accreditations updated.');

console.log('\nDone. The site rebuilds by itself after a CMS save; give it a few minutes, then check:');
console.log('  https://flight-experts-web.vercel.app/');
