import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { request } from './transport.js';
import { z } from 'zod';

/**
 * Countries, fetched from the BFF.
 *
 * One file per entity on the browser side too, so the screens share nothing but
 * the transport. The response schema is declared here because the page shape is
 * the BFF's, not the service's: the BFF has already dropped the wire names.
 */
const countrySchema = z.object({
  id: z.string(),
  version: z.int().nonnegative(),
  alpha2Code: z.string(),
  alpha3Code: z.string(),
  numericCode: z.string(),
  name: z.string(),
  officialName: z.string(),
  modifiedBy: z.string(),
  recordedAt: z.string(),
  changeReasonCode: z.string(),
  changeCommentary: z.string(),
  performedBy: z.string(),
});

export type Country = z.infer<typeof countrySchema>;

/**
 * A country in the shape the declaration names.
 *
 * The table is driven by column metadata whose `name` is the wire field, because
 * that is the key the row holds, so the row is what has to match. Doing this
 * once here means no screen has to translate between the two.
 */
export type CountryRow = Readonly<Record<string, unknown>>;

export function toRow(country: Country): CountryRow {
  return {
    alpha2_code: country.alpha2Code,
    alpha3_code: country.alpha3Code,
    numeric_code: country.numericCode,
    name: country.name,
    official_name: country.officialName,
    version: country.version,
    modified_by: country.modifiedBy,
    recorded_at: country.recordedAt,
    change_reason_code: country.changeReasonCode,
    change_commentary: country.changeCommentary,
    performed_by: country.performedBy,
    // The record's identity, which for this entity is its natural key.
    id: country.alpha2Code,
  };
}

const countryPageSchema = z.object({
  countries: z.array(countrySchema),
  totalCount: z.int().nonnegative(),
});

export interface CountryQuery {
  readonly page: number;
  readonly pageSize: number;
}

/**
 * One page of countries.
 *
 * The query key carries the paging so a page change is a new cache entry rather
 * than a refetch of the same one, which is what makes going back instant.
 */
export function useCountries(query: CountryQuery): UseQueryResult<{
  rows: readonly CountryRow[];
  totalCount: number;
}> {
  return useQuery({
    queryKey: ['countries', query.page, query.pageSize],
    queryFn: async () => {
      const offset = (query.page - 1) * query.pageSize;
      const body = await request(
        `/api/countries?offset=${offset}&limit=${query.pageSize}`,
        { method: 'GET' },
      );
      const page = countryPageSchema.parse(body);
      // Reshaped here rather than in the screen, so the screen is only layout.
      return { rows: page.countries.map(toRow), totalCount: page.totalCount };
    },
    placeholderData: (previous) => previous,
  });
}
