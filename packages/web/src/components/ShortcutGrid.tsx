import type { ReactNode } from 'react';
import { ShortcutCard } from './ShortcutCard.js';
import { humanise } from './labels.js';
import { useTranslation } from '../i18n/Provider.js';
import type { ShortcutDefinition } from './types.js';

/** A responsive grid of shortcut cards. */
export function ShortcutGrid({
  shortcuts,
  basePath,
}: {
  readonly shortcuts: readonly ShortcutDefinition[];
  readonly basePath: string;
}): ReactNode {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {shortcuts.map((shortcut) => (
        <ShortcutCard
          key={shortcut.id}
          // A shortcut is component-relative, but one may be given absolute to
          // point outside its component, so only join relative paths.
          to={shortcut.to.startsWith('/') ? shortcut.to : `${basePath}/${shortcut.to}`}
          icon={shortcut.icon}
          title={
            shortcut.titleKey === undefined
              ? humanise(shortcut.id)
              : t(shortcut.titleKey)
          }
          {...(shortcut.descriptionKey === undefined
            ? {}
            : { description: t(shortcut.descriptionKey) })}
          planned={shortcut.planned === true}
          plannedLabel={t('card.planned')}
          comingSoonLabel={t('card.notBuilt')}
        />
      ))}
    </div>
  );
}
