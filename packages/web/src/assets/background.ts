import landingBackground from './landing-background.jpg';

/**
 * The landing page backdrop.
 *
 * One image, one place to change it. It is imported by URL so the bundler
 * fingerprints and serves it, and so a missing file is a build error rather
 * than a broken page.
 */
export const heroBackground: string = landingBackground;

/** Shown behind the hero while the image loads, and behind translucent panels. */
export const heroFallback =
  'radial-gradient(120% 90% at 78% 8%, rgba(79,142,247,0.20), transparent 55%),' +
  'linear-gradient(160deg, #0b0e14 0%, #0e1320 55%, #0b0e14 100%)';
