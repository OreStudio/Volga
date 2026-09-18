import { useState, type ReactNode } from 'react';
import { useTranslation } from '../i18n/Provider.js';
import { Button, Dialog, Notice, cx } from '../ui/Primitives.js';
import {
  NON_MATERIAL_REASON,
  reasonsFor,
  type ChangeReason,
  type WriteOperation,
} from '../api/changeReasons.js';

/**
 * Why a change happened.
 *
 * Asked once, after the person has committed to the change and before it is
 * sent, so the flow is: press Save, choose why, done. Collected on every write,
 * including a delete, because a record whose reason is unknown is a record
 * nobody can account for later.
 *
 * The reasons offered depend on whether anything actually changed. That is the
 * rule worth the most care here: a person cannot file a material change as a
 * touch, nor a touch as a material change, and the set is computed from the diff
 * rather than left to judgement.
 */
export interface ChangeReasonResult {
  readonly reasonCode: string;
  readonly commentary: string;
}

export function ChangeReasonDialog({
  operation,
  hasChanges,
  reasons,
  pending,
  onConfirm,
  onCancel,
}: {
  readonly operation: WriteOperation;
  readonly hasChanges: boolean;
  readonly reasons: readonly ChangeReason[];
  readonly pending: boolean;
  readonly onConfirm: (result: ChangeReasonResult) => void;
  readonly onCancel: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const offered = reasonsFor(reasons, operation, hasChanges);

  const [selected, setSelected] = useState<string>(() => offered[0]?.code ?? '');
  const [commentary, setCommentary] = useState('');

  const reason = offered.find((r) => r.code === selected);
  const commentaryRequired = reason?.requiresCommentary === true;
  const commentaryMissing = commentaryRequired && commentary.trim().length === 0;
  const canConfirm = selected.length > 0 && !commentaryMissing && !pending;

  const title =
    operation === 'create'
      ? t('audit.createTitle')
      : operation === 'amend'
        ? t('audit.amendTitle')
        : t('audit.deleteTitle');

  const prompt =
    operation === 'create'
      ? t('audit.createPrompt')
      : operation === 'amend'
        ? t('audit.amendPrompt')
        : t('audit.deletePrompt');

  const commitLabel =
    operation === 'create'
      ? t('audit.create')
      : operation === 'amend'
        ? t('entity.save')
        : t('audit.confirmDelete');

  return (
    <Dialog title={title} onClose={onCancel} wide>
      <p className="mb-4 text-sm text-ink-muted">{prompt}</p>

      {offered.length === 0 ? (
        // Saying so is better than an empty selector, and much better than
        // sending a write with no reason at all.
        <Notice tone="error">{t('audit.noReasons')}</Notice>
      ) : (
        <>
          <ul className="mb-4 space-y-1.5" role="listbox" aria-label={t('audit.reason')}>
            {offered.map((option) => (
              <li key={option.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.code === selected}
                  onClick={() => setSelected(option.code)}
                  className={cx(
                    'w-full rounded-md border px-3 py-2 text-left transition-colors',
                    option.code === selected
                      ? 'border-accent bg-surface-overlay'
                      : 'border-line hover:border-line-strong',
                    // The one reason that means "nothing changed" is marked,
                    // because it is the one most easily chosen by mistake.
                    option.code === NON_MATERIAL_REASON && 'border-dashed',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-ink">{option.code}</span>
                    {option.code === NON_MATERIAL_REASON && (
                      <span className="rounded-full border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-ink-faint">
                        {t('audit.nonMaterial')}
                      </span>
                    )}
                  </span>
                  {option.description.length > 0 && (
                    <span className="mt-0.5 block text-xs italic text-ink-muted">
                      {option.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
              {t('audit.commentary')}
              {commentaryRequired && <span className="text-ink-faint">*</span>}
            </span>
            <textarea
              value={commentary}
              rows={3}
              onChange={(event) => setCommentary(event.target.value)}
              placeholder={t('audit.commentaryPlaceholder')}
              className="w-full rounded-md border border-line bg-bg-secondary px-2.5 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
            />
            <span className="mt-1 block text-xs text-ink-faint">
              {/* Conditionally required, and said plainly either way. */}
              {commentaryRequired ? t('audit.commentaryRequired') : t('audit.commentaryOptional')}
            </span>
          </label>
        </>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={pending}>
          {t('entity.cancel')}
        </Button>
        <Button
          variant={operation === 'delete' ? 'danger' : 'primary'}
          size="md"
          disabled={!canConfirm}
          pending={pending}
          pendingLabel={t('entity.saving')}
          onClick={() => onConfirm({ reasonCode: selected, commentary: commentary.trim() })}
        >
          {commitLabel}
        </Button>
      </div>
    </Dialog>
  );
}
