import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import type { AccountList } from '@volga/protocol/browser';

/**
 * Server state for the accounts screen.
 *
 * Reads are keyed by the page request so paging back to a visited page is
 * instant, and `keepPreviousData` holds the current rows on screen while the
 * next page loads instead of flashing an empty table.
 */

export const accountsKey = (input: { readonly offset: number; readonly limit: number }) =>
  ['accounts', input] as const;

export function useAccounts(input: { readonly offset: number; readonly limit: number }) {
  return useQuery<AccountList>({
    queryKey: accountsKey(input),
    queryFn: () => api.accounts(input),
    placeholderData: keepPreviousData,
  });
}

export function useLockAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { readonly accountId: string; readonly locked: boolean }) =>
      api.setAccountLocked(input.accountId, input.locked),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => api.deleteAccount(accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });
}
