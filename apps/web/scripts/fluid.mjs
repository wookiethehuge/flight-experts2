// Print a fluid clamp() that equals <mobilePx> at a 390px viewport and <desktopPx> at 1440px.
// usage: node scripts/fluid.mjs 40 80   ->  clamp(2.5rem, calc(2.5rem + 40 * (100vw - 24.375rem) / 1050), 5rem)
const [a, b] = process.argv.slice(2).map(Number);
if (Number.isNaN(a) || Number.isNaN(b)) { console.error('usage: node scripts/fluid.mjs <mobilePx> <desktopPx>'); process.exit(1); }
const rem = (px) => `${+(px / 16).toFixed(4)}rem`;
const lo = Math.min(a, b), hi = Math.max(a, b);
console.log(`clamp(${rem(lo)}, calc(${rem(a)} + ${+(b - a).toFixed(3)} * (100vw - 24.375rem) / 1050), ${rem(hi)})`);
