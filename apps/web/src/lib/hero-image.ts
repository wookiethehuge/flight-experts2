/**
 * Art-directed hero photos (HomeHero, ContactHero): responsive AVIF/WebP srcsets for a <picture>, plus matching
 * <link rel="preload"> hints so the LCP photo starts downloading from the top of <head> (BaseLayout `preload` prop).
 * The widths/sizes here are the single source for both the <picture> and its preload, so they always agree.
 */
import { getImage } from 'astro:assets';
import type { Media, PageBlock } from './types';
import { seedAsset } from './cms';

export interface ImagePreload { srcset: string; sizes: string; type: string; media?: string }

export const MOBILE_MQ = '(max-width: 47.99rem)';
export const DESKTOP_MQ = '(min-width: 48rem)';

/** Per-hero candidate widths and the mobile `sizes` (the portrait crop is drawn wider than the viewport). */
export const HERO_IMAGES = {
  homeHero: { desk: [768, 1080, 1440, 1920, 2560], mob: [480, 640, 800, 1051, 1400], mobSizes: '161vw' },
  contactHero: { desk: [768, 1024, 1440, 1920, 2880], mob: [480, 640, 800, 1051], mobSizes: '129vw' },
} as const;

/** Responsive srcsets for one image (seed asset or CMS URL), like Img.astro but for <source> elements. */
export async function heroVariants(media: Media, widths: readonly number[]) {
  const local = seedAsset(media.url);
  const isLocal = typeof local === 'object';
  const intrinsic = (isLocal ? (local as ImageMetadata).width : media.width) ?? 1600;
  const w = widths.filter((x) => x <= intrinsic);
  if (!w.length || w[w.length - 1] < intrinsic) w.push(intrinsic);
  const base: any = isLocal ? { src: local } : { src: media.url, ...(media.width ? { width: media.width, height: media.height } : { inferSize: true }) };
  const [avif, webp] = await Promise.all([
    getImage({ ...base, widths: w, format: 'avif' }),
    getImage({ ...base, widths: w, format: 'webp' }),
  ]);
  const width = isLocal ? (local as ImageMetadata).width : media.width;
  const height = isLocal ? (local as ImageMetadata).height : media.height;
  return { avif: avif.srcSet.attribute, webp: webp.srcSet.attribute, src: webp.src, width, height };
}

/** Preload hints for a page whose first block is a photo hero (AVIF only: browsers skip unsupported types). */
export async function heroPreloads(block: PageBlock | undefined): Promise<ImagePreload[]> {
  if (!block || (block.blockType !== 'homeHero' && block.blockType !== 'contactHero')) return [];
  const cfg = HERO_IMAGES[block.blockType];
  const { image, mobileImage } = block as { image?: Media | null; mobileImage?: Media | null };
  const desk = image ? await heroVariants(image, cfg.desk) : null;
  const mob = mobileImage ? await heroVariants(mobileImage, cfg.mob) : null;
  if (desk && mob) {
    return [
      { srcset: mob.avif, sizes: cfg.mobSizes, type: 'image/avif', media: MOBILE_MQ },
      { srcset: desk.avif, sizes: '100vw', type: 'image/avif', media: DESKTOP_MQ },
    ];
  }
  const only = desk ?? mob;
  return only ? [{ srcset: only.avif, sizes: mob ? cfg.mobSizes : '100vw', type: 'image/avif' }] : [];
}
