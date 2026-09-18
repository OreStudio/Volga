import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { connectionsApi } from '../api/connections.js';
import { ApiFailure } from '../api/transport.js';
import type { ConnectionsCatalog } from '@volga/contracts';

/**
 * The connections store, as the screens use it.
 *
 * One query holds the whole catalogue. The store is small enough that a single
 * read is cheaper and simpler than several, and it means the environments,
 * connections, folders and labels a screen needs are always consistent with
 * each other.
 *
 * Every mutation invalidates that one query, so a change to any part of the
 * store is reflected everywhere without each screen subscribing separately.
 */

export const connectionsKey = ['connections'] as const;

export interface ConnectionsState {
  readonly catalog: ConnectionsCatalog | undefined;
  readonly isLoading: boolean;
  readonly error: ApiFailure | undefined;
  readonly refresh: () => Promise<void>;
}

export function useConnectionsCatalog(): ConnectionsState {
  const query = useQuery({
    queryKey: connectionsKey,
    queryFn: connectionsApi.catalog,
    // The store is local, so a stale catalogue is more likely a bug than a
    // saving, and the screens are the only writer.
    staleTime: 5_000,
  });

  return {
    catalog: query.data,
    isLoading: query.isPending,
    error: query.error instanceof ApiFailure ? query.error : undefined,
    refresh: async () => {
      await query.refetch();
    },
  };
}

/** Every mutation invalidates the one catalogue query. */
function useCatalogMutation<TInput>(
  mutationFn: (input: TInput) => Promise<void | unknown>,
): ReturnType<typeof useMutation<void | unknown, ApiFailure, TInput>> {
  const queryClient = useQueryClient();
  return useMutation<void | unknown, ApiFailure, TInput>({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionsKey }),
  });
}

export function useConnectionsMutations() {
  const queryClient = useQueryClient();

  const settle = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: connectionsKey });
  };

  return {
    unlock: useMutation<void, ApiFailure, string>({
      mutationFn: async (masterPassword) => {
        await connectionsApi.unlock(masterPassword);
      },
      onSuccess: settle,
    }),

    saveEnvironment: useCatalogMutation<Parameters<typeof connectionsApi.saveEnvironment>>(
      ([input, id]) => connectionsApi.saveEnvironment(input, id),
    ),

    deleteEnvironment: useCatalogMutation<string>((id) => connectionsApi.deleteEnvironment(id)),

    saveConnection: useCatalogMutation<Parameters<typeof connectionsApi.saveConnection>>(
      ([input, id]) => connectionsApi.saveConnection(input, id),
    ),

    deleteConnection: useCatalogMutation<string>((id) => connectionsApi.deleteConnection(id)),

    saveFolder: useCatalogMutation<Parameters<typeof connectionsApi.saveFolder>[0]>((input) =>
      connectionsApi.saveFolder(input),
    ),

    deleteFolder: useCatalogMutation<string>((id) => connectionsApi.deleteFolder(id)),
  };
}
