#!/usr/bin/env node
/**
 * Creates the first ad landing page on the live CMS: "Europe" at /lp/europe/ (texts from
 * apps/web/src/content/seed/landing/europe.json), published. Asks for a CMS admin login; does nothing if a landing page
 * with slug "europe" already exists. The site rebuilds by itself after the save.
 *
 *   node scripts/create-cms-landing-europe.mjs
 */
import fs from 'node:fs';
import readline from 'node:readline';

const CMS = (process.env.CMS_URL || 'https://flight-experts-cms.vercel.app').replace(/\/$/, '');
const data = JSON.parse(fs.readFileSync(new URL('../apps/web/src/content/seed/landing/europe.json', import.meta.url), 'utf8'));

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
  if (!res.ok) throw new Error(`${method} /api/${p} failed (${res.status}): ${json?.errors?.map((e) => e.message + (e.data?.errors ? ' ' + JSON.stringify(e.data.errors) : '')).join('; ') || res.statusText}`);
  return json;
}

const email = await ask('CMS admin email: ');
const password = await ask('CMS admin password: ', { hidden: true });
const { token } = await api('POST', 'users/login', { body: { email, password } });
console.log('Logged in.\n');

const existing = await api('GET', `landing-pages?where[slug][equals]=${data.slug}&draft=true&limit=1&depth=0`, { token });
if (existing.docs?.length) { console.log(`A landing page "${data.slug}" already exists (id ${existing.docs[0].id}). Nothing changed.`); process.exit(0); }

console.log(`Will create the landing page "${data.name}" at /lp/${data.slug}/ (published).`);
if ((await ask('Type yes to create it: ')).toLowerCase() !== 'yes') { console.log('Nothing changed.'); process.exit(0); }
const { doc } = await api('POST', 'landing-pages?draft=false', { token, body: { ...data, _status: 'published' } });
console.log(`Created (id ${doc.id}). The site rebuilds by itself; in a few minutes open:\n  https://flight-experts-web.vercel.app/lp/${data.slug}/`);
