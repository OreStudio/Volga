import { useQuery } from '@tanstack/react-query';
import { siteStateSchema, type SiteState } from '@volga/contracts';
import { request } from './transport.js';

/**
 * The site's own state.
 *
 * Which environment this deployment serves, and whether the developer surface
 * exists. It is read once and does not change: the environment is fixed when
 * the process starts.
 */
export const siteKey = ['site'] as const;

export function useSiteState(): { readonly site: SiteState | undefined; readonly isLoading: boolean } {
  const query = useQuery({
    queryKey: siteKey,
    queryFn: async () => siteStateSchema.parse(await request('/api/site', { method: 'GET' })),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return { site: query.data, isLoading: query.isPending };
}
