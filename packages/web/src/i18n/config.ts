import { detectLanguage, type Language } from './languages.js';

/**
 * Remembering which language a person chose.
 *
 * Stored per browser rather than per account, because the choice is about the
 * person reading the screen and not about the record they are looking at. A
 * signed-out visitor has a language too.
 */
const STORAGE_KEY = 'volga.language';

export function readStoredLanguage(): Language | undefined {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return stored === null || stored === undefined ? undefined : detectLanguage([stored]);
  } catch {
    // Storage can be unavailable, in a private window or with a policy against
    // it. A missing preference is not worth failing over.
    return undefined;
  }
}

export function storeLanguage(language: Language): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, language);
  } catch {
    // As above: the choice simply does not persist.
  }
}

/** The language to start in: the stored choice, then the browser's, then English. */
export function initialLanguage(): Language {
  const stored = readStoredLanguage();
  if (stored !== undefined) {
    return stored;
  }
  const preferred =
    globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? 'en'];
  return detectLanguage(preferred);
}
