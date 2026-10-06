// Content comes from Payload (src/lib/cms.ts) with a JSON seed fallback in src/content/seed, read via import.meta.glob.
// The seed folder is declared here only so Astro does not auto-generate a legacy (markdown) collection for it, which
// logs a "[glob-loader] No files found" warning on every build.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

export const collections = {
  seed: defineCollection({
    loader: glob({ pattern: '**/*.json', base: './src/content/seed', generateId: ({ entry }) => entry.replace(/\.json$/, '') }),
  }),
};
