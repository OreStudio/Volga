import { z } from 'zod';

/**
 * The country wire shape.
 *
 * Field names are the C++ member names, because they are the keys `rfl::msgpack`
 * writes. Renaming them breaks the wire silently, so they are not renamed.
 *
 * This file is what the code generator will emit for every entity. It is written
 * by hand once, for one entity, to prove the shape of the generated output and to
 * give the interface something real to render. See
 * `doc/entities/codegen-ts-ui-request.md`.
 */
const text = z.string().default('');

export const wireCountrySchema = z.object({
  version: z.int().nonnegative().default(0),
  tenant_id: text,
  image_id: z.string().nullable().default(null),
  coding_scheme_code: z.string().nullable().default(null),
  alpha2_code: text,
  alpha3_code: text,
  numeric_code: text,
  name: text,
  official_name: text,
  modified_by: text,
  change_reason_code: text,
  change_commentary: text,
  performed_by: text,
  recorded_at: text,
});

export type WireCountry = z.infer<typeof wireCountrySchema>;

/**
 * A page of countries.
 *
 * The list reply carries the total as well as the page, which is what lets the
 * footer say "1 of 4" rather than guessing from the page size.
 */
export const countryPageSchema = z.object({
  success: z.boolean().default(true),
  message: text,
  countries: z.array(wireCountrySchema).default([]),
  total_available_count: z.int().nonnegative().default(0),
});

export type WireCountryPage = z.infer<typeof countryPageSchema>;

/**
 * The request the list call takes.
 *
 * `as_of` has no default, because the C++ struct has none and `rfl::msgpack`
 * requires every member to be present. A field omitted here is a decode failure
 * on the service rather than a validation error here, which is a much harder
 * thing to see.
 */
export const listCountriesRequestSchema = z.object({
  offset: z.int().nonnegative(),
  limit: z.int().positive().max(1000),
  /** Empty means the current version. */
  as_of: z.string(),
});

/**
 * A country, as the interface works with it.
 *
 * camelCase, because this is no longer the wire. The mapping happens once, here,
 * so no screen has to know a snake_case field name.
 */
export interface Country {
  /** The alpha-2 code, which is this entity's identity. */
  readonly id: string;
  readonly version: number;
  readonly alpha2Code: string;
  readonly alpha3Code: string;
  readonly numericCode: string;
  readonly name: string;
  readonly officialName: string;
  readonly modifiedBy: string;
  readonly recordedAt: string;
  readonly changeReasonCode: string;
  readonly changeCommentary: string;
  readonly performedBy: string;
}

export function mapCountry(row: WireCountry): Country {
  return {
    id: row.alpha2_code,
    version: row.version,
    alpha2Code: row.alpha2_code,
    alpha3Code: row.alpha3_code,
    numericCode: row.numeric_code,
    name: row.name,
    officialName: row.official_name,
    modifiedBy: row.modified_by,
    recordedAt: row.recorded_at,
    changeReasonCode: row.change_reason_code,
    changeCommentary: row.change_commentary,
    performedBy: row.performed_by,
  };
}
