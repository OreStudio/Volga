import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { initialLanguage, storeLanguage } from './config.js';
import { LANGUAGES, type Language } from './languages.js';
import { createTranslator, flatten, type InterpolationValues, type Translator } from './translate.js';
import { en } from './locales/en.js';

/**
 * The translation context.
 *
 * The translator is rebuilt only when the language changes, so a screen calling
 * `t` on every render is not re-flattening the catalogue on every render.
 */
interface TranslationContextValue {
  readonly language: Language;
  readonly setLanguage: (language: Language) => void;
  readonly languages: readonly Language[];
  readonly t: (key: string, values?: InterpolationValues) => string;
  readonly plural: (key: string, count: number, values?: InterpolationValues) => string;
}

const TranslationContext = createContext<TranslationContextValue | undefined>(undefined);

const source = flatten(en);

/**
 * The catalogues, loaded on demand.
 *
 * They are small, so this is not about size; it is that importing all three at
 * startup would make every language's mistakes fail at load. Each module checks
 * itself against the English key set when it is imported, so importing a
 * language is what verifies it.
 */
const CATALOGUES: Record<Language, () => Promise<Record<string, string>>> = {
  en: () => import('./locales/en.js').then((m) => m.enFlat),
  pt: () => import('./locales/pt.js').then((m) => m.ptFlat),
  fr: () => import('./locales/fr.js').then((m) => m.frFlat),
};

export function TranslationProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [language, setLanguageState] = useState<Language>(() => initialLanguage());
  const [catalogue, setCatalogue] = useState<Record<string, string>>(() => source);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    storeLanguage(next);
  }, []);

  /*
   * Load the catalogue for the active language.
   *
   * This runs on mount as well as on a change, which is the part that is easy to
   * get wrong: a stored choice of Portuguese means the first render is already
   * Portuguese, so loading only on a change leaves the interface in English
   * until somebody switches away and back.
   */
  useEffect(() => {
    let cancelled = false;
    void CATALOGUES[language]()
      .then((loaded) => {
        if (!cancelled) setCatalogue(loaded);
      })
      .catch(() => {
        // A catalogue that will not load, or that fails its own key check,
        // leaves the source language in place, which is readable rather than
        // blank.
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const translator: Translator = useMemo(
    () => createTranslator(language, source, catalogue),
    [language, catalogue],
  );

  const value = useMemo<TranslationContextValue>(
    () => ({
      language,
      setLanguage,
      languages: LANGUAGES,
      t: translator.t,
      plural: translator.plural,
    }),
    [language, setLanguage, translator],
  );

  return <TranslationContext value={value}>{children}</TranslationContext>;
}

export function useTranslation(): TranslationContextValue {
  const value = use(TranslationContext);
  if (value === undefined) {
    throw new Error('useTranslation called outside TranslationProvider');
  }
  return value;
}
