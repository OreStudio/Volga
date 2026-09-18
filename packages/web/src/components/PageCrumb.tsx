import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * The name a screen wants to be called in the breadcrumb.
 *
 * The trail is built from the route, so the best it can do on its own is the
 * identifier in the URL — `AR` for a country. A person recognises `Argentina`
 * and does not recognise `AR`, and the record's name is only known to the screen
 * that loaded it, so the screen says it.
 *
 * A screen sets it while it is showing and it goes away with the screen, which
 * is why the setter is called on every render rather than on mount: the name
 * changes when the record does.
 */
interface PageCrumbValue {
  readonly label: string | undefined;
  readonly setLabel: (label: string | undefined) => void;
}

const PageCrumbContext = createContext<PageCrumbValue | undefined>(undefined);

export function PageCrumbProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [label, setLabel] = useState<string | undefined>(undefined);
  const value = useMemo<PageCrumbValue>(() => ({ label, setLabel }), [label]);
  return <PageCrumbContext value={value}>{children}</PageCrumbContext>;
}

/** The name the current screen claimed, if it claimed one. */
export function usePageCrumb(): string | undefined {
  return use(PageCrumbContext)?.label;
}

/**
 * Claims a name for the current screen.
 *
 * Cleared when the screen goes away, so a name cannot outlive the record it
 * described and the next screen starts from the identifier rather than from
 * somebody else's title.
 */
export function usePageCrumbLabel(label: string | undefined): void {
  const context = use(PageCrumbContext);
  const setLabel = context?.setLabel;
  useEffect(() => {
    if (setLabel === undefined) return;
    setLabel(label);
    return () => setLabel(undefined);
  }, [setLabel, label]);
}
