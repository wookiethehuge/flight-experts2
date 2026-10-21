#!/usr/bin/env node
/**
 * One-off content update on the live CMS (flight-experts-cms.vercel.app):
 *   1. Home page (slug home): hero mobile rating text "5 star rating" -> "4.9 star rating" (the Trustpilot score is
 *      4.9). The ad landing pages (/lp/...) read this text from the home hero, so they follow.
 *   2. About page (slug about): closing call to action heading "Command your itinerary." -> "Request your itinerary."
 * Only those fields change; every other block and field is sent back exactly as it was read.
 *
 * Asks for a CMS admin login, saves a backup of both pages, shows the plan, and only writes after you type "yes".
 * Safe to run twice (fields already up to date are skipped).
 *
 *   node scripts/update-cms-pending-text.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const CMS = (process.env.CMS_URL || 'https://flight-experts-cms.vercel.app').replace(/\/$/, '');
const HERE = path.dirname(fileURLToPath(import.meta.url));

const RATING_TO = '4.9 star rating';
const CTA_FROM = 'Command your itinerary.';
const CTA_TO = 'Request your itinerary.';

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
const home = await bySlug('home');
const about = await bySlug('about');

fs.mkdirSync(path.join(HERE, 'backups'), { recursive: true });
const backup = path.join(HERE, 'backups', `cms-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(backup, JSON.stringify({ home, about }, null, 2));
console.log(`Backup saved: ${backup}\n`);

// ---- plan
const plan = [];
const heroIdx = home.layout.findIndex((b) => b.blockType === 'homeHero');
if (heroIdx < 0) throw new Error('The home page has no hero block. Nothing changed.');
const rating = home.layout[heroIdx].mobileRatingText ?? '';
const ratingDue = rating !== RATING_TO;
if (ratingDue) plan.push(`  Home hero mobile rating text: "${rating}" -> "${RATING_TO}"`);

const ctaIdx = about.layout.findIndex((b) => b.blockType === 'ctaBanner');
if (ctaIdx < 0) throw new Error('The about page has no call to action block. Nothing changed.');
const ctaHeading = about.layout[ctaIdx].heading ?? '';
const newCtaHeading = ctaHeading.replace(CTA_FROM, CTA_TO);
const ctaDue = newCtaHeading !== ctaHeading;
if (ctaDue) plan.push(`  About call to action heading: "${ctaHeading}" -> "${newCtaHeading}"`);

if (!plan.length) { console.log('Everything is already up to date. Nothing changed.'); process.exit(0); }
console.log('Planned changes:\n' + plan.join('\n'));
if ((await ask('\nType yes to apply: ')).toLowerCase() !== 'yes') { console.log('Nothing changed.'); process.exit(0); }

// ---- apply (whole layout sent back, only the fields above changed)
if (ratingDue) {
  const layout = home.layout.map((b, i) => (i === heroIdx ? { ...b, mobileRatingText: RATING_TO } : b));
  await api('PATCH', `pages/${home.id}?draft=false`, { token, body: { _status: 'published', layout } });
  console.log('Home page updated.');
}
if (ctaDue) {
  const layout = about.layout.map((b, i) => (i === ctaIdx ? { ...b, heading: newCtaHeading } : b));
  await api('PATCH', `pages/${about.id}?draft=false`, { token, body: { _status: 'published', layout } });
  console.log('About page updated.');
}

console.log('\nDone. The site rebuilds by itself after a CMS save; give it a few minutes, then check:');
console.log('  https://flight-experts-web.vercel.app/ (on a phone)');
console.log('  https://flight-experts-web.vercel.app/about/');
