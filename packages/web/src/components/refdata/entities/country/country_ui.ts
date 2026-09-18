/**
 * The country declaration.
 *
 * THIS FILE IS WHAT THE GENERATOR WILL EMIT. It is written by hand, once, from
 * `projects/ores.refdata/modeling/ores.refdata.country.org`, so that the shape
 * can be tested against a real screen before the template exists. When the
 * template lands this file is replaced and nothing else changes.
 *
 * Labels and headers are translation keys, not English. See labels.ts for how a
 * missing one falls back.
 */
import type { ColumnMeta, FieldMeta, EntityMeta } from '../../../../entity/contract.js';

/**
 * The fields of a country, in the order the model declares them.
 *
 * `alpha2_code` is the natural key, so it is editable when creating and
 * read-only afterwards.
 */
export const countryFields: readonly FieldMeta[] = [
  {
    name: 'alpha2_code',
    labelKey: 'country.fldAlpha2Code',
    control: 'line_edit',
    required: true,
    isKey: true,
    readOnlyAfterCreate: true,
    nullable: false,
    placeholderKey: 'country.alpha2CodePh',
    maxLength: 2,
  },
  {
    name: 'alpha3_code',
    labelKey: 'country.fldAlpha3Code',
    control: 'line_edit',
    required: true,
    isKey: false,
    nullable: false,
    placeholderKey: 'country.alpha3CodePh',
    maxLength: 3,
  },
  {
    name: 'numeric_code',
    labelKey: 'country.fldNumericCode',
    control: 'line_edit',
    required: true,
    isKey: false,
    nullable: false,
    placeholderKey: 'country.numericCodePh',
    maxLength: 3,
  },
  {
    name: 'name',
    labelKey: 'country.fldName',
    control: 'line_edit',
    required: true,
    isKey: false,
    nullable: false,
    placeholderKey: 'country.namePh',
  },
  {
    name: 'official_name',
    labelKey: 'country.fldOfficialName',
    control: 'line_edit',
    required: true,
    isKey: false,
    nullable: false,
    placeholderKey: 'country.officialNamePh',
  },
];

/**
 * The table columns, in display order.
 *
 * `alpha2_code` carries the flag. The audit columns are hidden by default and
 * offered through the column menu.
 */
export const countryColumns: readonly ColumnMeta[] = [
  { name: 'alpha2_code', headerKey: 'country.colAlpha2Code', style: 'icon_text_left', hidden: false, width: 80, flag: true },
  { name: 'alpha3_code', headerKey: 'country.colAlpha3Code', style: 'text_left', hidden: false, width: 80 },
  { name: 'numeric_code', headerKey: 'country.colNumericCode', style: 'mono_left', hidden: false, width: 80 },
  { name: 'name', headerKey: 'country.colName', style: 'text_left', hidden: false, width: 200 },
  { name: 'official_name', headerKey: 'country.colOfficialName', style: 'text_left', hidden: false, width: 200 },
  { name: 'version', headerKey: 'country.colVersion', style: 'mono_center', hidden: true, width: 80 },
  { name: 'modified_by', headerKey: 'country.colModifiedBy', style: 'text_left', hidden: true, width: 120 },
  { name: 'recorded_at', headerKey: 'country.colRecordedAt', style: 'mono_left', hidden: true, width: 150, temporal: true },
];

export const countryMeta: EntityMeta = {
  entity: 'country',
  collection: 'countries',
  displayField: 'name',
  keyField: 'alpha2_code',
  columns: countryColumns,
  fields: countryFields,
};
