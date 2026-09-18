import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from './transport.js';

/**
 * The reasons a write may carry.
 *
 * Fetched from the server rather than declared in the interface, because the set
 * is data: it differs per deployment, and one reason means "changed nothing
 * material" while the rest mean the opposite. A hardcoded list would be wrong on
 * the first deployment that added a reason.
 */
const reasonSchema = z.object({
  code: z.string(),
  description: z.string(),
  categoryCode: z.string(),
  appliesToNew: z.boolean(),
  appliesToAmend: z.boolean(),
  appliesToDelete: z.boolean(),
  requiresCommentary: z.boolean(),
  displayOrder: z.int(),
});

export type ChangeReason = z.infer<typeof reasonSchema>;

const reasonListSchema = z.object({ reasons: z.array(reasonSchema) });

export function useChangeReasons(): UseQueryResult<readonly ChangeReason[]> {
  return useQuery({
    queryKey: ['change-reasons'],
    queryFn: async () => {
      const body = await request('/api/change-reasons', { method: 'GET' });
      return reasonListSchema.parse(body).reasons;
    },
    // The set changes when somebody edits it, which is not a per-page concern.
    staleTime: 5 * 60 * 1000,
  });
}

/** Which operation a write is doing, which decides which reasons apply. */
export type WriteOperation = 'create' | 'amend' | 'delete';

/**
 * The reason that means "touched, but nothing changed".
 *
 * It is the one reason whose meaning depends on whether the form actually
 * differs from the record, and getting it wrong records a material change as a
 * touch or the reverse. Named here because both the dialog and its caller need
 * to agree on which one it is.
 */
export const NON_MATERIAL_REASON = 'common.non_material_update';

/**
 * The reasons offered for an operation, given whether anything changed.
 *
 * A create offers every reason the server marks as applying to a new record. An
 * amend or a delete offers the non-material reason only when nothing changed,
 * and every other reason only when something did. That asymmetry is the rule
 * that keeps the audit trail honest: a person cannot file a material change as a
 * touch, or a touch as a material change.
 */
export function reasonsFor(
  reasons: readonly ChangeReason[],
  operation: WriteOperation,
  hasChanges: boolean,
): readonly ChangeReason[] {
  const applies =
    operation === 'create'
      ? (r: ChangeReason) => r.appliesToNew
      : operation === 'amend'
        ? (r: ChangeReason) => r.appliesToAmend
        : (r: ChangeReason) => r.appliesToDelete;

  return reasons
    .filter(applies)
    .filter((reason) => {
      /*
       * The diff decides which reasons apply to an amendment, and only to an
       * amendment.
       *
       * "Nothing material changed" is a statement about an edit, so it is not a
       * reason to delete anything, and the service does not offer it for a
       * delete. Applying the rule to a delete therefore offered *no* reasons at
       * all, and the dialog rendered empty. A create is unaffected for the same
       * reason: nothing has changed yet.
       */
      if (operation !== 'amend') return true;
      const isNonMaterial = reason.code === NON_MATERIAL_REASON;
      return hasChanges ? !isNonMaterial : isNonMaterial;
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);
}
