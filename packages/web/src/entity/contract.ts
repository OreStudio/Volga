/**
 * What a generated entity declaration looks like.
 *
 * This is the contract the code generator emits against, written here so the
 * consuming code and the generator cannot drift. See
 * `doc/entities/codegen-ts-ui-request.md` for the generator's side.
 */

/** How a cell is rendered. Closed set, matching the C++ column styles. */
export type ColumnStyle =
  | 'text_left'
  | 'text_center'
  | 'mono_left'
  | 'mono_center'
  | 'mono_bold_left'
  | 'mono_right'
  | 'mono_bold_center'
  | 'icon_centered'
  | 'icon_text_left'
  | 'badge_centered';

/** How a field is edited. Closed set, matching the model's widget types. */
export type FieldControl =
  | 'line_edit'
  | 'text_edit'
  | 'static_combo'
  | 'dynamic_combo'
  | 'flagged_combo'
  | 'check_box'
  | 'spin_box'
  | 'colour'
  | 'date';

export interface ColumnMeta {
  /** The wire field name, in snake_case, which is the key the row holds. */
  readonly name: string;
  /** Translation key for the header. */
  readonly headerKey: string;
  readonly style: ColumnStyle;
  /** Hidden by default, available through the column menu. */
  readonly hidden: boolean;
  /** A width hint in pixels; the user's own resize wins. */
  readonly width?: number;
  /** The code domain a pill resolves against, for `badge_centered`. */
  readonly codeDomain?: string;
  readonly flag?: boolean;
  readonly temporal?: boolean;
}

export interface FieldOption {
  readonly value: string;
  readonly labelKey: string;
}

export interface LookupSource {
  readonly collection: string;
  readonly valueField: string;
  readonly labelField: string;
}

export interface FieldMeta {
  readonly name: string;
  readonly labelKey: string;
  readonly control: FieldControl;
  readonly required: boolean;
  readonly isKey: boolean;
  readonly nullable: boolean;
  readonly placeholderKey?: string;
  readonly hintKey?: string;
  readonly readOnlyAfterCreate?: boolean;
  readonly triState?: boolean;
  readonly options?: readonly FieldOption[];
  readonly lookup?: LookupSource;
  readonly min?: number;
  readonly max?: number;
  readonly codeDomain?: string;
  readonly maxLength?: number;
}

/** One tab of a detail screen. Hand-written: grouping is a domain judgement. */
export interface FieldGroup {
  readonly id: string;
  /** Translation key for the tab. */
  readonly titleKey: string;
  readonly fields: readonly string[];
}

/** The whole declaration for one entity. */
export interface EntityMeta {
  readonly entity: string;
  readonly collection: string;
  /** The field a person recognises a record by. */
  readonly displayField: string;
  /** The natural key. */
  readonly keyField: string;
  readonly columns: readonly ColumnMeta[];
  readonly fields: readonly FieldMeta[];
}
