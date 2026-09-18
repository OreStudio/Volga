import type { ReactNode } from 'react';
import { useTranslation } from '../i18n/Provider.js';
import { Button, Dialog } from '../ui/Primitives.js';

/**
 * Confirming a destructive action.
 *
 * Says what will be lost and names the record, because "are you sure" without
 * the name is a question a person cannot answer.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly pending: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <Dialog title={title} onClose={onCancel}>
      <p className="text-sm text-ink-muted">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={pending}>
          {t('entity.cancel')}
        </Button>
        <Button variant="danger" size="md" onClick={onConfirm} pending={pending} pendingLabel={t('entity.saving')}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
