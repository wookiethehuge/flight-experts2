#!/usr/bin/env node
/**
 * One-off content update on the live CMS (flight-experts-cms.vercel.app):
 *   1. Thank-you page (slug thank-you): the Confirmation block's heading, subheading and body become the client's
 *      new copy ("Your Journey Starts Here" ...). The status line and the call prompt / button are in the site code.
 *   2. Home page (slug home): hero subheading "uncompromised" -> "exceptional".
 * Only those fields change; every other block and field is sent back exactly as it was read.
 *
 * Asks for a CMS admin login, saves a backup of both pages, shows the plan, and only writes after you type "yes".
 * Safe to run twice (fields already up to date are skipped).
 *
 *   node scripts/update-cms-thank-you-and-hero.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const CMS = (process.env.CMS_URL || 'https://flight-experts-cms.vercel.app').replace(/\/$/, '');
const HERE = path.dirname(fileURLToPath(import.meta.url));

const CONFIRMATION = {
  heading: 'Your Journey Starts Here',
  subheading: 'Thank you for choosing Flight-Experts!',
  body: 'One of our travel experts will personally review your request and reach out shortly with flight options tailored to your preferences.',
};
const HERO_FROM = 'uncompromised';
const HERO_TO = 'exceptional';

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); }));
}

async function api(method, p, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `JWT ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${CMS}/api/${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = json?.errors?.map((e) => e.message + (e.data?.errors ? ' ' + JSON.stringify(e.data.errors) : '')).join('; ') || res.statusText;
    throw new Error(`${method} /api/${p} failed (${res.status}): ${why}`);
  }
  return json;
}

const email = await ask('CMS admin email: ');
const password = await ask('CMS admin password: ', { hidden: true });
const { token } = await api('POST', 'users/login', { body: { email, password } });
if (!token) throw new Error('Login returned no token.');
console.log('Logged in.\n');

const bySlug = async (slug) => {
  const r = await api('GET', `pages?where[slug][equals]=${slug}&depth=0&draft=false&limit=1`, { token });
  if (!r.docs?.length) throw new Error(`Page "${slug}" not found. Nothing changed.`);
  return r.docs[0];
};
const thanks = await bySlug('thank-you');
const home = await bySlug('home');

fs.mkdirSync(path.join(HERE, 'backups'), { recursive: true });
const backup = path.join(HERE, 'backups', `cms-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(backup, JSON.stringify({ thanks, home }, null, 2));
console.log(`Backup saved: ${backup}\n`);

// ---- plan
const plan = [];
const confirmIdx = thanks.layout.findIndex((b) => b.blockType === 'confirmation');
if (confirmIdx < 0) throw new Error('The thank-you page has no Confirmation block. Nothing changed.');
const confirm = thanks.layout[confirmIdx];
const confirmChanges = Object.entries(CONFIRMATION).filter(([k, v]) => confirm[k] !== v);
for (const [k, v] of confirmChanges) plan.push(`  Thank-you ${k}: "${confirm[k] ?? ''}" -> "${v}"`);

const heroIdx = home.layout.findIndex((b) => b.blockType === 'homeHero');
if (heroIdx < 0) throw new Error('The home page has no hero block. Nothing changed.');
const heroSub = home.layout[heroIdx].subheading ?? '';
const newHeroSub = heroSub.replace(HERO_FROM, HERO_TO);
if (newHeroSub !== heroSub) plan.push(`  Home hero subheading: "${heroSub}" -> "${newHeroSub}"`);

if (!plan.length) { console.log('Everything is already up to date. Nothing changed.'); process.exit(0); }
console.log('Planned changes:\n' + plan.join('\n'));
if ((await ask('\nType yes to apply: ')).toLowerCase() !== 'yes') { console.log('Nothing changed.'); process.exit(0); }

// ---- apply (whole layout sent back, only the fields above changed)
if (confirmChanges.length) {
  const layout = thanks.layout.map((b, i) => (i === confirmIdx ? { ...b, ...CONFIRMATION } : b));
  await api('PATCH', `pages/${thanks.id}?draft=false`, { token, body: { _status: 'published', layout } });
  console.log('Thank-you page updated.');
}
if (newHeroSub !== heroSub) {
  const layout = home.layout.map((b, i) => (i === heroIdx ? { ...b, subheading: newHeroSub } : b));
  await api('PATCH', `pages/${home.id}?draft=false`, { token, body: { _status: 'published', layout } });
  console.log('Home page updated.');
}

console.log('\nDone. The site rebuilds by itself after a CMS save; give it a few minutes, then check:');
console.log('  https://flight-experts-web.vercel.app/thank-you/');
console.log('  https://flight-experts-web.vercel.app/');
