import landingBackground from './landing-background.jpg';

/**
 * The landing page backdrop.
 *
 * One image, one place to change it. It is imported by URL so the bundler
 * fingerprints and serves it, and so a missing file is a build error rather
 * than a broken page.
 */
export const heroBackground: string = landingBackground;
