import type { FieldGroup } from '../../../../entity/contract.js';

/**
 * How a country's fields are grouped into tabs.
 *
 * The only hand-written part of an entity. Which fields belong together is a
 * domain judgement the model does not carry, and deriving it from table order
 * would produce arbitrary groups.
 */
export const countryFieldGroups: readonly FieldGroup[] = [
  {
    id: 'general',
    titleKey: 'entity.general',
    fields: ['alpha2_code', 'alpha3_code', 'numeric_code', 'name', 'official_name'],
  },
];
