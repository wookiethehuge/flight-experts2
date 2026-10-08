#!/usr/bin/env node
/**
 * One-off content update on the live CMS (flight-experts-cms.vercel.app):
 *   1. Author: Sarah Smith (placeholder) -> Mike Chirilenco: name, slug, photo, LinkedIn, SEO title/description.
 *      Role, bio, expertise and X link are left as they are.
 *   2. Privacy Policy (page 5) and Terms (page 6): the rich-text block is replaced with the text from
 *      flight-experts.com/privacy-policy/ and /terms-of-use/ (converted to Lexical in scripts/data/*.lexical.json).
 *      The terms page heading becomes "Terms of Use"; its slug stays terms-and-conditions.
 *
 * Asks for a CMS admin login, saves a backup of everything it will change, shows the plan, and only writes after
 * you type "yes". Safe to run twice: the photo is reused if it was already uploaded.
 *
 *   node scripts/update-cms-mike-and-legal.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const CMS = (process.env.CMS_URL || 'https://flight-experts-cms.vercel.app').replace(/\/$/, '');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const data = (f) => path.join(HERE, 'data', f);

const AUTHOR_ID = 1;
const NAME = 'Mike Chirilenco';
const SLUG = 'mike-chirilenco';
const LINKEDIN = 'https://www.linkedin.com/in/mihail-chirilenco';
const PAGES = [
  { id: 5, slug: 'privacy-policy', file: 'privacy-policy.lexical.json' },
  { id: 6, slug: 'terms-and-conditions', file: 'terms-and-conditions.lexical.json', heading: 'Terms of Use', seoTitle: 'Terms of Use | Flight Experts' },
];

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

const email = await ask('CMS admin email: ');
const password = await ask('CMS admin password: ', { hidden: true });
const { token } = await api('POST', 'users/login', { body: { email, password } });
if (!token) throw new Error('Login returned no token.');
console.log('Logged in.\n');

// Backup of everything this script touches.
const author = await api('GET', `authors/${AUTHOR_ID}?depth=0`, { token });
const pages = [];
for (const p of PAGES) pages.push(await api('GET', `pages/${p.id}?depth=0&draft=false`, { token }));
for (const [i, p] of PAGES.entries()) {
  if (pages[i].slug !== p.slug) throw new Error(`Page ${p.id} is "${pages[i].slug}", expected "${p.slug}". Nothing changed.`);
  const types = pages[i].layout.map((b) => b.blockType).join(',');
  if (types !== 'richText') throw new Error(`Page ${p.slug} has blocks [${types}], expected one richText block. Nothing changed.`);
}
fs.mkdirSync(path.join(HERE, 'backups'), { recursive: true });
const backup = path.join(HERE, 'backups', `cms-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(backup, JSON.stringify({ author, pages }, null, 2));
console.log(`Backup saved: ${backup}\n`);

console.log('Planned changes:');
console.log(`  Author #${AUTHOR_ID}: "${author.name}" -> "${NAME}", slug ${author.slug} -> ${SLUG}, new photo, LinkedIn -> ${LINKEDIN}`);
for (const [i, p] of PAGES.entries()) {
  const blocks = JSON.parse(fs.readFileSync(data(p.file), 'utf8')).root.children.length;
  console.log(`  Page ${p.slug}: text replaced (${blocks} paragraphs/headings/lists)${p.heading ? `, heading "${pages[i].heading}" -> "${p.heading}"` : ''}`);
}
if ((await ask('\nType yes to apply: ')).toLowerCase() !== 'yes') { console.log('Nothing changed.'); process.exit(0); }

// Photo: reuse an earlier upload if there is one.
let photoId;
const existing = await api('GET', `media?where[alt][equals]=${encodeURIComponent(NAME)}&limit=1&depth=0`, { token });
if (existing.docs?.length) {
  photoId = existing.docs[0].id;
  console.log(`Photo already uploaded (media #${photoId}), reusing it.`);
} else {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(data('mike-chirilenco.jpg'))], { type: 'image/jpeg' }), 'mike-chirilenco.jpg');
  form.append('_payload', JSON.stringify({ alt: NAME }));
  photoId = (await api('POST', 'media', { token, form })).doc.id;
  console.log(`Photo uploaded (media #${photoId}).`);
}

await api('PATCH', `authors/${AUTHOR_ID}`, {
  token,
  body: {
    name: NAME,
    slug: SLUG,
    photo: photoId,
    linkedin: LINKEDIN,
    seo: {
      ...author.seo,
      title: `${NAME}, ${author.role} | Flight Experts`,
      description: `${NAME} writes for the Flight Experts blog on ${author.expertise.map((e) => e.label.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1')}.`,
    },
  },
});
console.log(`Author updated: ${NAME}.`);

for (const [i, p] of PAGES.entries()) {
  const content = JSON.parse(fs.readFileSync(data(p.file), 'utf8'));
  const body = { _status: 'published', layout: [{ blockType: 'richText', content }] };
  if (p.heading) body.heading = p.heading;
  if (p.seoTitle) body.seo = { ...pages[i].seo, title: p.seoTitle };
  await api('PATCH', `pages/${p.id}?draft=false`, { token, body });
  console.log(`Page updated: ${p.slug}.`);
}

console.log('\nDone. The site rebuilds by itself after a CMS save; give it a few minutes, then check:');
console.log('  https://flight-experts-web.vercel.app/author/mike-chirilenco/');
console.log('  https://flight-experts-web.vercel.app/privacy-policy/');
console.log('  https://flight-experts-web.vercel.app/terms-and-conditions/');
