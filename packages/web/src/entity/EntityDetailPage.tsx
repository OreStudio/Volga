import { useEffect, useState, type ReactNode } from 'react';
import { FieldControl } from './FieldControl.js';
import { useTranslation } from '../i18n/Provider.js';
import { Button, Notice, cx } from '../ui/Primitives.js';
import { MaskIcon } from '../ui/icons/MaskIcon.js';
import type { EntityMeta, FieldGroup } from './contract.js';

/**
 * The detail screen for every entity.
 *
 * Tabs come from the hand-written field grouping, fields from the generated
 * declaration, and the controls from each field's declared type. Nothing here
 * knows what an entity is, which is what makes the hundredth detail screen free.
 *
 * The mode changes what is editable and which actions appear, not the layout:
 * reading and editing render the same form, because a form that rearranges itself
 * when you press Edit is a form you have to read twice.
 */
export interface EntityDetailPageProps<Row> {
  readonly meta: EntityMeta;
  readonly groups: readonly FieldGroup[];
  readonly load: (row: Row) => Readonly<Record<string, unknown>>;
  readonly row: Row | undefined;
  readonly mode: 'read' | 'edit' | 'create';
  /** Reads the entity's own idea of a record's name, for the title. */
  readonly displayName: (row: Row) => string;
}

export function EntityDetailPage<Row>({
  meta,
  groups,
  load,
  row,
  mode,
  displayName,
}: EntityDetailPageProps<Row>): ReactNode {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    row === undefined ? {} : { ...load(row) },
  );
  const [activeGroup, setActiveGroup] = useState(groups[0]?.id ?? 'general');
  const [dirty, setDirty] = useState(false);

  const editable = mode !== 'read';
  const group = groups.find((g) => g.id === activeGroup) ?? groups[0];

  // A record reached through a list arrives after the first render, and a record
  // reached through a route param arrives after its query resolves. Seeding once
  // in useState would leave the form showing placeholders for a record that is
  // right there, so the values follow the record until somebody starts editing.
  useEffect(() => {
    if (row === undefined || dirty) return;
    setValues({ ...load(row) });
  }, [row, dirty, load]);

  function update(name: string, value: unknown): void {
    setValues((current) => ({ ...current, [name]: value }));
    setDirty(true);
  }

  const title =
    mode === 'create'
      ? `${t('entity.add')} ${meta.entity}`
      : row === undefined
        ? meta.entity
        : displayName(row);

  const title2 = title;

  return (
    <div className="mx-auto max-w-[860px] px-5 py-7">
      <header className="mb-5 flex items-start gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title2}</h1>
          {dirty && <p className="mt-1 text-xs text-ink-faint">{t('confirmation.unsavedTitle')}</p>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Save and delete are not rendered in read mode, rather than
              rendered and disabled. */}
          {editable && (
            <Button variant="primary" size="sm" disabled title={t('card.notBuilt')}>
              <MaskIcon name="save" className="size-3.5" />
              {t('entity.save')}
            </Button>
          )}
        </div>
      </header>

      {/* Tabs, one per declared group plus Provenance for every entity. */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === group?.id}
            onClick={() => setActiveGroup(g.id)}
            className={cx(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              g.id === group?.id
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t(g.titleKey)}
          </button>
        ))}
        <span className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-ink-muted">
          {t('entity.provenance')}
        </span>
      </div>

      {group !== undefined && (
        <div className="grid gap-4 sm:grid-cols-2">
          {group.fields.map((name) => {
            const field = meta.fields.find((f) => f.name === name);
            if (field === undefined) return null;
            return (
              <FieldControl
                key={name}
                field={
                  // The key is fixed once the record exists, which is the rule
                  // the Qt client applies to every entity.
                  field.isKey && mode !== 'create'
                    ? { ...field, readOnlyAfterCreate: true }
                    : field
                }
                value={values[name]}
                disabled={!editable}
                onChange={update}
              />
            );
          })}
        </div>
      )}

      {row !== undefined && (
        <Provenance values={load(row)} meta={meta} />
      )}

      {mode === 'create' && (
        <div className="mt-6">
          <Notice tone="info">{t('card.notBuilt')}</Notice>
        </div>
      )}
    </div>
  );
}

/**
 * The read-only audit panel.
 *
 * Six rows, always the same six, always read-only: a record that does not say
 * who changed it and why is a record nobody can account for later.
 */
function Provenance({
  values,
  meta,
}: {
  readonly values: Readonly<Record<string, unknown>>;
  readonly meta: EntityMeta;
}): ReactNode {
  const { t } = useTranslation();
  const rows: readonly (readonly [string, unknown])[] = [
    [t('account.fldVersion'), values['version']],
    [t('account.fldModifiedBy'), values['modified_by']],
    [t('account.fldPerformedBy'), values['performed_by']],
    [t('account.fldRecordedAt'), values['recorded_at']],
    [t('account.fldChangeReason'), values['change_reason_code']],
    [t('account.fldCommentary'), values['change_commentary']],
  ];

  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-medium text-ink-muted">{t('entity.provenance')}</h2>
      <dl className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-bg-secondary">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-4 px-3.5 py-2">
            <dt className="w-36 shrink-0 text-xs text-ink-faint">{label}</dt>
            <dd className="min-w-0 flex-1 text-sm text-ink-muted">
              {/* A blank is said rather than shown, so it is not mistaken for a
                  failure to load. */}
              {value === null || value === undefined || String(value).length === 0 ? (
                <span className="text-ink-faint">{t('account.notRecorded')}</span>
              ) : (
                String(value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
