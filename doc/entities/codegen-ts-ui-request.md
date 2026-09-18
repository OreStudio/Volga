# Codegen request: TypeScript UI metadata

A specification to hand to whoever works on `ores.codegen`, for a new facet that
emits the presentation metadata the TypeScript interface needs.

Written from the consuming side. It states what the output must contain and why,
and leaves the template mechanics to the implementer, who knows the codegen
better than this document does.

---

## 1. Why

The TypeScript interface describes each entity's table columns and detail form
fields as data, so that one shared `DataTable` and one shared `FieldControl`
render every entity. That is what makes adding an entity cheap: a declaration
plus the protocol schemas, and no new screens.

Those declarations are currently hand-written. For one entity that is reasonable;
for the hundred and two entities that already have the metadata in their org
models, it is a great deal of typing that will drift. A style chosen slightly
differently on the fortieth entity is a table that looks unlike the others, and
nobody will notice for a year.

The org models already carry the metadata. The codegen already derives the
variables. What is missing is the output.

---

## 2. What already exists

Established by reading `projects/ores.codegen/library/templates/` as of this
writing.

**The template system.** Facets are literate org documents under
`library/templates/`, each with `#+title:` naming its address, `#+type: facet` or
`#+type: archetype`, and an `#+output:` line giving the generated path with
`{component}` and `{entity}` placeholders. A facet page collects its
archetypes in a table. Mustache source lives inside `#+begin_src mustache
:tangle <file>.mustache` blocks and is extracted by
`compass build --direct tangle_codegen_templates`.

**The TypeScript technical space.** `ores.ts` is a `technical_space` page with
`filetags: :codegen:physical-space:typescript:`. Its shared conventions are:

- `{{{ts_license}}}` injects the licence header and the generated-file marker.
- Field names stay `snake_case`, because they are the JSON keys `rfl::json`
  writes from the C++ member names, so the TypeScript field name and the wire key
  are one string.
- Type names take PascalCase, because a type name never crosses the wire.

**One facet already exists:** `ores.ts.protocol`, with one archetype,
`ores.ts.protocol.protocol_types`, whose `#+output:` is
`projects/ores.typescript/src/{component}/protocol/{entity}_protocol.ts`.

**Most of the inputs are already derived.** They come from three places, and the
distinction matters because only the first is ready to use as-is.

*One: documented codegen variables*, in `template_variables.org`, already derived
and reachable from a template:

| Group | Variables |
|---|---|
| Column identity | `column`, `name`, `description`, `column_index`, `column_style` |
| Types | `cpp_type`, `is_uuid`, `is_string`, `is_int`, `is_bool`, `is_timestamp`, `is_optional`, `nullable` |
| Keys | `is_pk`, `is_fk`, `is_key`, `is_unique` |
| Control | `widget`, `is_line_edit`, `is_text_edit`, `is_spin_box`, `is_check_box`, `is_tristate` |
| Selects | `is_static_combo`, `is_dynamic_combo`, `combo_values`, `combo_is_optional`, `combo_type` |
| Bounds | `spin_min`, `spin_max` |
| Display | `is_badge`, `badge_key`, `placeholder`, `placeholder_key` |
| Entity | `entity_singular`, `entity_plural`, `component`, `icon` |

*Two: authored values in the model's Qt property block*, not codegen variables.
They are properties the org model declares and the archetypes read, so a facet can
reach them, but they are hand-written input rather than derived output:

| Property | Where | Wanted for |
|---|---|---|
| `domain_class` | the `** Qt` property block | referring to the domain type |
| `collection_name` | the same block | the list request and the `lookup` targets |
| `key_field` | the same block | `isKey` when the table does not mark one |
| `window_title` | the same block | the sidebar title, as a fallback |

*Three: columns of the model's own tables*, which is where the two inputs this
facet most needs live, and which are **not** currently plumbed through to this
facet. Confirming or adding that plumbing is explicitly part of the work:

| Input | Table | Wanted for |
|---|---|---|
| `field`, `label`, `widget`, `type`, `placeholder` | `*** Detail fields` | the field declaration |
| `enum_name`, `field`, `header`, `type`, `width` | `*** Columns` | the column declaration |
| `is_required` | `*** Detail fields` | `required` |
| `is_key` | `*** Detail fields` | `isKey`, `readOnlyAfterCreate` |

The information exists and the Qt archetypes already read it. What may not exist
is the route from those tables to this facet, and finding out is the first task.

If any of these turns out not to be derived for the entity model types this facet
targets, deriving it is part of the work; the list is the requirement.

---

## 3. What to emit

One new archetype under a new facet `ores.ts.ui`, emitting one file per entity
at:

```
projects/ores.typescript/src/{component}/ui/{entity}_ui.ts
```

One file per entity, containing pure data and no imports, so the declaration can
be consumed anywhere without pulling a dependency.

### 3.1 The shape

```ts
/**
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * Template: ts_ui.ts.mustache
 * To modify, update the template and regenerate.
 */

/**
 * Every field of an account, in the order the model declares them.
 *
 * Labels are translation keys, not English. The catalogue holds the words.
 */
export const accountFields = [
  {
    /** The wire field name. Also the key in the domain type. */
    name: 'username',
    /** Translation key for the label. */
    labelKey: 'account.fldUsername',
    /** Which control renders it. */
    control: 'line_edit',
    /** Whether a value must be supplied. */
    required: true,
    /** The natural key: editable when creating, read-only afterwards. */
    isKey: true,
    /** Translation key for the placeholder, when the model gives one. */
    placeholderKey: 'account.username.ph',
    /** Whether the field can hold no value. */
    nullable: false,
  },
  {
    name: 'account_type',
    labelKey: 'account.fldType',
    control: 'static_combo',
    required: true,
    isKey: false,
    nullable: false,
    options: [
      { value: 'user', labelKey: 'account.type.user' },
      { value: 'service', labelKey: 'account.type.service' },
    ],
  },
  {
    name: 'reports_to_account_id',
    labelKey: 'account.fldReportsTo',
    control: 'dynamic_combo',
    required: false,
    isKey: false,
    nullable: true,
    /** The collection the options come from, when the model names one. */
    lookup: 'accounts',
  },
  {
    name: 'is_admin',
    labelKey: 'account.fldIsAdmin',
    control: 'check_box',
    required: false,
    isKey: false,
    nullable: false,
    triState: false,
  },
] as const;

/**
 * The table columns, in display order.
 *
 * Audit columns are marked hidden so the shared table can offer them through the
 * column menu without showing them by default.
 */
export const accountColumns = [
  {
    /** The wire field name, which is what the row object holds. */
    name: 'username',
    headerKey: 'account.colUsername',
    style: 'text_left',
    hidden: false,
    /** A width hint, not a constraint; the user's own resize wins. */
    width: 200,
  },
  {
    name: 'recorded_at',
    headerKey: 'account.colRecorded',
    style: 'mono_left',
    hidden: true,
    width: 150,
  },
] as const;
```

### 3.2 The TypeScript contract

Written here so the emitted shape and the consuming code agree. The consuming
side will declare these; the generator must produce values assignable to them.

```ts
/** How a cell is rendered. The set is closed. */
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

/** How a field is edited. The set is closed. */
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
  readonly name: string;
  readonly headerKey: string;
  readonly style: ColumnStyle;
  readonly hidden: boolean;
  readonly width?: number;
  /** Set when the column renders as a pill, so the table knows the domain. */
  readonly badgeKey?: string;
  /** Set when the column renders a flag. */
  readonly flag?: boolean;
}

export interface FieldOption {
  readonly value: string;
  readonly labelKey: string;
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
  readonly options?: readonly FieldOption[];
  readonly lookup?: string;
  readonly triState?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly badgeKey?: string;
  readonly readOnlyAfterCreate?: boolean;
  readonly maxLength?: number;
}
```

### 3.3 The derivation rules

These are the rules the generator applies. Each is decidable from the model, so
none of them is a judgement call at generation time.

**Columns**

| Input | Output |
|---|---|
| One row per `*** Columns` entry, in table order | One `accountColumns` entry, in the same order |
| `field` | `name` |
| `header` | `headerKey`, derived as `<entityCamel>.<enumNameCamel>` for now, see §4 |
| `type` string / `column_style` | `style`, using the mapping in §3.4 |
| `width` | `width` |
| The entity's hidden-by-default set | `hidden` |

**Fields**

| Input | Output |
|---|---|
| One row per `*** Detail fields` entry, in table order | One `accountFields` entry, in the same order |
| `field` | `name` |
| `label` | `labelKey`, see §4 |
| `widget` / `type` | `control`, using the mapping in §3.4 |
| `is_required` | `required` |
| `is_key` | `isKey`, and `readOnlyAfterCreate: true` |
| `nullable` | `nullable` |
| `placeholder` | `placeholderKey`, see §4 |
| A `dynamic_combo` field | `lookup`, from the model's fetch or collection |
| A `static_combo` field | `options`, from the model's enum or item list |

**Members that are always present.** `id`, `version`, `tenant_id`,
`change_reason_code`, `change_commentary`, `modified_by`, `performed_by` and
`recorded_at` are part of every entity. They must not be emitted as editable
fields; `version`, `modified_by`, `performed_by`, `recorded_at` and the audit pair
belong in the columns, hidden by default, and in the read-only Provenance panel,
which the shared code renders from the protocol type rather than from this file.

### 3.4 The mappings

The C++ side has these mappings already, in the Qt archetypes and in the codegen's
own style derivation. The generator must use the same ones so the two projections
agree.

| Column type or style | Emitted `style` |
|---|---|
| Integer | `mono_center` |
| Badge, or a column with a self colour | `badge_centered` |
| A column with an icon or flag | `icon_text_left` |
| A UUID | `mono_left` |
| A timestamp | `mono_left` |
| A string | `text_left` |

| Widget or type | Emitted `control` |
|---|---|
| `line_edit` | `line_edit` |
| `text_edit` | `text_edit` |
| `static_combo` | `static_combo` |
| `dynamic_combo` | `dynamic_combo` |
| `flagged_combo` | `flagged_combo` |
| `check_box` | `check_box` |
| `spin_box` | `spin_box` |
| `colour` | `colour` |
| `date` | `date` |

---

## 4. Labels are keys, and that is the hard part

**The decision.** The generator emits translation keys rather than English
labels, because the interface ships in English, Portuguese and French from the
beginning, and a generated English label cannot be translated without being
overwritten on the next generation.

**The consequence.** The key set must be derivable, so that regeneration does not
invent new keys. Two options, in order of preference.

**Preferred: derive the key from the model.** The codegen already has
`placeholder_key`, which means keys are a concept it understands. If a
`label_key` and `header_key` can be derived the same way, the model needs no
change beyond supplying the base, and the emitted keys are stable forever.

The convention to emit is:

```
<entityCamel>.<memberCamel>
```

with a small set of well-known prefixes:

| Member kind | Key shape | Example |
|---|---|---|
| A field label | `<entity>.fld<Member>` | `account.fldFullName` |
| A column header | `<entity>.col<Member>` | `account.colFullName` |
| A placeholder | `<entity>.<member>Ph` | `account.fullNamePh` |
| A combo option | `<entity>.type.<value>` | `account.type.service` |

**Fallback: emit the English label alongside the key.** If deriving the key is
not possible without guessing, emit both:

```ts
{ name: 'full_name', labelKey: 'account.fldFullName', label: 'Full name', … }
```

The consuming side then has the English text the model already had, and the key
set can be extracted from the generated files by a script rather than by hand.
This is worse, because two sources of truth exist for a moment, but it is better
than blocking on key derivation.

**Whichever is chosen must be stated in the emitted file's header comment**, so
the next person does not have to infer it.

---

## 5. What must not be generated

Stated explicitly, because a generator that overreaches is harder to work with
than one that underreaches.

**Field groups.** Which fields belong together in a named tab, and the group's
heading, is a domain judgement. The org models do not carry it, and deriving it
from the table order would produce arbitrary groups. It stays hand-written in a
small overlay file per entity.

**The entity's one-sentence description.** It is prose. If a `description` exists
on the entity in the model, emit it as `descriptionKey`; otherwise the consuming
side writes it.

**Anything requiring a decision.** If the generator would have to choose, it
should emit nothing and let the overlay supply it, rather than choosing a default
that a hundred entities then inherit.

---

## 6. Constraints on the output

**Purely additive.** A new facet page and one archetype. No change to
`ores.ts.protocol`, to the C++ facets, or to the Qt facets. The TypeScript UI
and the Qt UI may coexist while the port is in progress, and neither may disturb
the other.

**Deterministic.** Regenerating an unchanged model must produce a byte-identical
file, so a regeneration with no model change shows no diff.

**No imports.** The file is data. It must not import the protocol types, because
the declaration is consumed by the registry and by tests that have no transport.

**Both model shapes.** The facet declares `#+model_types:` matching whatever the
existing TypeScript facet targets, plus the entity shapes that have `Columns` and
`Detail fields` tables, which is 110 and 87 models respectively at this writing.
Whether a model lacking those tables fails loudly or emits an empty declaration is
the implementer's call; silently emitting nothing is the one wrong answer.

**The output path is the contract.** `{component}` and `{entity}`, matching the
existing protocol facet's `{component}/protocol/{entity}_protocol.ts`, landing
beside it:

```
projects/ores.typescript/src/{component}/ui/{entity}_ui.ts
```

---

## 7. How it will be verified

From the consuming side, three checks. They are stated so the implementer knows
what will be run against the output rather than discovering it later.

1. **The generated TypeScript compiles** under the strict settings the existing
   `ores.typescript` package already uses: `strict`, `noUncheckedIndexedAccess`,
   `noEmit`.
2. **Every `labelKey`, `headerKey`, `placeholderKey` and option `labelKey` is a
   key that exists in the English catalogue**, and every catalogue key that names
   a field corresponds to a generated field. This is the check that keeps
   translation honest, and it only works if the keys are derived rather than
   invented.
3. **Two regenerations produce no diff**, proving determinism.

An entity from the generated standard is the test case, not accounts. Accounts is
the legacy hand-written screen with a six-tab dialog that does not map onto field
groups, so it is a misleading sample. Country is the reference the C++ side
already uses.

---

## 8. What the consuming side does with it

So the shape can be judged against its use, and changed now rather than after it
is built on.

```ts
// The registry entry refers to the generated declaration.
import { accountColumns, accountFields } from '@volga/protocol/generated/iam/ui/account_ui.js';

// The shared table is driven by the columns.
<DataTable columns={accountColumns} rows={accounts} />

// The shared form is driven by the fields, with the overlay supplying grouping.
<EntityForm fields={accountFields} groups={accountFieldGroups} />
```

`accountFieldGroups` is the hand-written overlay: an ordered list of group keys,
each naming the fields it contains. That is the whole of what remains manual, and
it is about five lines per entity.
