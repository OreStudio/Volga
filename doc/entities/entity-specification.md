# The entity specification

What it means to be an entity in this interface, written so that implementing
entity number one hundred is the same process as entity number one.

Read this before writing any entity code. When asked to implement an entity,
this document is the checklist, and the answer to "what should this screen do"
is in here rather than in a decision made again each time.

---

## 1. Vocabulary

Fixed terms, used consistently in code, in the interface, and in conversation.

| Term | Meaning |
|---|---|
| **Entity** | A domain record with identity, a version history, and an audit trail. Accounts, books, currencies, parties. |
| **Collection** | The plural noun for the set. The entity is `book`, the collection is `books`. |
| **List screen** | The table of an entity's records with its toolbar and paging. |
| **Detail screen** | The form for reading, creating, editing and deleting one record. |
| **History screen** | The read-only list of every version of one record. |
| **Reference data** | A short, stable set that other entities point at. Currencies, countries, business centres. |
| **Transactional data** | Records that accumulate and are rarely edited. Trades, sessions, samples. |
| **Lookup entity** | A reference-data entity whose code is natural and memorable, such as `GBP`. |
| **Child entity** | A record that only exists within a parent. An account's contact details. |
| **Junction entity** | A record joining two entities, such as account to party. |
| **Temporal** | A record carrying validity dates, so the past can be reconstructed. |
| **Audit fields** | The who and why of a change: reason code, commentary, and the actors. |
| **Provenance** | What wrote the record and when: version, recorded time, source. |

Naming in code follows the table in §11. Never invent a synonym.

---

## 2. What makes a record an entity

An entity is a record that has all six of these. If it lacks one, it is not a
regular entity and needs a deliberate exception rather than a shortcut.

1. **Identity.** A stable primary key, almost always a UUID. The key never
   changes.
2. **A display name.** One field that a person recognises the record by, unique
   within its scope. The username, the book code, the currency code.
3. **A version.** An integer that increments on every accepted change, used for
   optimistic locking.
4. **An audit trail.** Who made the change and why, on every accepted write.
5. **Tenancy.** A tenant identifier, even when only one tenant exists, so the
   scoping rule is uniform.
6. **A lifecycle.** Created, read, amended, deleted. Deletion is soft where the
   record is referenced by anything else.

### Properties every entity carries

| Property | Type | Purpose |
|---|---|---|
| `id` | UUID | Identity. |
| `version` | integer | Optimistic locking. Increments per accepted write. |
| `tenant_id` | UUID | Tenancy scope. |
| `change_reason_code` | string | Why the change happened. References the change-reason lookup. |
| `change_commentary` | string | Free text, may be empty. |
| `modified_by` | string | The account whose change produced this version. |
| `performed_by` | string | The account that asked for it. Differs from `modified_by` only when a service acts on a person's behalf. |
| `recorded_at` | timestamp | When this version was written. |

### Properties some entities carry

| Property | When |
|---|---|
| `valid_from`, `valid_to` | Temporal entities. A version's own validity window. |
| `folder_id` or a parent reference | Entities organised in a hierarchy |
| `image_id` | Entities that show a picture |
| `status` | Entities with a lifecycle beyond existing or not |

---

## 3. The layers

Five layers, each with one job. Every entity has all five, and nothing is
skipped because an entity "is simple".

```
  ┌─────────────────────────────────────────────────────┐
  │  Screen        list, detail, history                │  React
  │  ─────────────────────────────────────────────────  │
  │  Query         server state, cache, mutations       │  React Query
  │  ─────────────────────────────────────────────────  │
  │  Endpoint      HTTP, validated at the boundary      │  BFF
  │  ─────────────────────────────────────────────────  │
  │  Protocol      subjects, request and reply shapes   │  @volga/protocol
  └─────────────────────────────────────────────────────┘
```

**Screen.** Presentation only. No fetching, no business rules, no knowledge of
subjects or field names.

**Query.** One hook per read, one mutation per write. Owns caching, invalidation
and the loading and error states each screen renders.

**Endpoint.** Validates input, calls the protocol layer, maps failures to status
codes. Knows the protocol; the screen never does.

**Protocol.** The subjects, the request and reply schemas, and the wire encoding.
This is the only layer that knows a wire field name.

### What that buys

Adding an entity touches the protocol for its operations, the endpoint for its
routes, and the screens. It never touches another entity's code. If adding an
entity requires editing shared, unrelated code, the shared code is missing an
abstraction and that is the bug to fix first.

---

## 4. The four screens

| Screen | Route | Purpose |
|---|---|---|
| List | `/<collection>` | Browse, search, select, and act |
| Detail | `/<collection>/:id` | Read one record |
| Detail, new | `/<collection>/new` | Create one record |
| Detail, edit | `/<collection>/:id/edit` | Amend one record |
| History | `/<collection>/:id/history` | Every version of one record |

Read and edit share the detail screen because they render the same fields. The
mode changes which are editable and which actions appear, not the layout.

---

## 5. The list screen

```
┌───────────────────────────────────────────────────────────────────────┐
│  <Plural>                                             [Add] [Delete]  │
│  A sentence saying what this collection is.                           │
├───────────────────────────────────────────────────────────────────────┤
│  [ Search…            ]  [ Filter by type ▾ ]   [ Label ▾ ]   42 of 380│
├───────────────────────────────────────────────────────────────────────┤
│  ▏ Name         Type      Code       Status     Modified    Recorded  │
│  ├─────────────────────────────────────────────────────────────────── │
│  │  …                                                              …  │
├───────────────────────────────────────────────────────────────────────┤
│  [⟲ Refresh]                    ‹ 1 of 4 ›  [100 ▾]  [Load all]       │
└───────────────────────────────────────────────────────────────────────┘
```

### Header

- The plural noun as the page title, sentence case.
- One sentence saying what the collection is. Not a tooltip, not a paragraph.
- Actions at the right: **Add** (primary), and **Delete** (danger, enabled only
  with a selection).

### Toolbar

| Control | Behaviour |
|---|---|
| Search | Filters on the entity's searchable fields. The display name always, plus any field a person would reasonably type. Debounced by about 250 ms. |
| Type filter | A dropdown of the entity's classification field, when it has one. Includes an "All" entry. |
| Label filter | A dropdown of labels, when the entity carries them. Hidden entirely when no record has a label, so a control that does nothing is never shown. |
| Count | `"<shown> of <total>"` at the right, updating as filters change. |

Search and filters run in the browser over the loaded page. When the server
applies them, the same controls drive the query instead, and the layout does not
change.

### Toolbar and row actions

| Action | Icon | Enabled when | Behaviour |
|---|---|---|---|
| Add | `add` | Always | Opens the detail screen in create mode |
| Delete | `delete` | One or more rows selected | Confirms, then deletes |
| Refresh | `arrow_sync` | Not already loading | Reloads the page |
| Edit | `edit` | Exactly one row selected | Opens the detail screen in edit mode |

Opening a record is a click on the row. A separate Edit action exists for
discoverability but the row is the primary affordance.

### Table

- Columns come from a single declaration per entity, which is also what the
  delegate uses to render cells. One source, so a column cannot be styled
  differently from how it is defined.
- The display name is always the first column and is the row's identity to a
  person.
- Audit columns — version, modified by, recorded at — are **hidden by default**.
  They are available through the column menu rather than shown to everyone.
- Column widths and visibility are remembered per user, and the saved state is
  versioned so a change to the column set does not restore an incompatible
  layout.
- Sorting is available on every column. The default is the entity's natural
  order: name for reference data, most recent first for transactional data.

### Footer

- Refresh on the left, paging on the right. The reference implementation put
  refresh in the toolbar and paging in the footer; keep them together in the
  footer so the toolbar holds only actions that act on a selection.
- Page size is 100 by default, with 25, 50, 100, 250 and 500 offered.
- **Load all** loads the complete set. Only offered when the total is below a
  reasonable ceiling, because offering it for a hundred thousand records is a
  trap.

### States

| State | Presentation |
|---|---|
| Loading, first time | A skeleton or a quiet "Loading…". Never an empty table with no explanation. |
| Loading, with data | Keep the current rows, dim them slightly, mark the count as refreshing. Never blank the table. |
| Empty, no records | The display name of the collection and a line saying how to create the first one, with the Add action. |
| Empty, filtered | "No <collection> match the current filter." with a way to clear the filter. Distinguished from genuinely empty. |
| Error | A message with the server's own words where it gave any, and a Retry action. |
| Stale | The refresh action pulses when the server reports a change to this collection. |

---

## 6. The detail screen

### Layout

```
┌───────────────────────────────────────────────────────────────┐
│  <Name of the record>                       [Delete] [Save]   │
├───────────────────────────────────────────────────────────────┤
│  [ General ] [ Security ] [ Related ] [ Provenance ]          │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│   Field                Field                                  │
│   Label                Label                                  │
│   ┌────────────────┐   ┌────────────────┐                     │
│   │                │   │                │                     │
│   └────────────────┘   └────────────────┘                     │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Tabs, and when each applies

| Tab | Applies to | Contents |
|---|---|---|
| **General** | Every entity | The entity's own fields. Always first, always present. |
| **Security** | Entities with credentials | Passwords and their confirmation. Never shown for others. |
| **Related** | Entities with child or junction records | One section per relationship, each a compact table with its own add and remove. |
| **Provenance** | Every entity | Read-only. Version, recorded time, actors, and the reason for the last change. |

A tab that would be empty is not rendered. A tab that is rendered but empty
says so rather than showing blank space.

Fields with nothing to show display "not recorded" rather than an empty cell, so
a blank is never mistaken for a failure to load.

### The form

- One label per field, above the control. Sentence case, no trailing colon.
- A hint below the control when the field needs explaining. One short sentence.
- Required fields are marked, and the mark is described in words for a screen
  reader rather than being a bare asterisk.
- Read-only fields are visibly read-only, not merely disabled: disabling makes
  text hard to read and implies it might become editable.
- Validation runs on blur, not on every keystroke, and never clears a message
  while the person is still typing the fix.
- A field with an error shows the message beneath it, and focus moves to the
  first field with an error on a failed submit.

### Actions

| Action | Placement | Behaviour |
|---|---|---|
| Save | Primary, top right | Validates, prompts for the audit reason, submits |
| Delete | Danger, top right | Confirms, prompts for the audit reason, deletes |
| Cancel | Secondary | Leaves without saving, confirming if anything changed |

Delete appears only in edit mode. Save appears in create and edit mode.

### The audit prompt

Every accepted write carries a reason. It is collected once, after the person
has committed to the change and before it is sent, so the flow is: press Save,
choose why, done.

One dialog serves all three operations, and its wording follows the operation:

| Operation | Title | Prompt | Commit button |
|---|---|---|---|
| Create | New Record Reason | Please select a reason for creating this record: | Create |
| Amend | Change Reason Required | Please select a reason for this change: | Save |
| Delete | Deletion Reason Required | Please select a reason for this deletion: | Confirm Delete |

The dialog is at least 450px wide, offers the reason codes the server provides,
and shows the selected reason's full description beneath the selector in muted
italic. The commit button is disabled until a reason is chosen.

**Reasons are filtered by whether anything actually changed.** This is the rule
that matters most and the one easiest to get wrong. One reason code,
`common.non_material_update`, means "touched but nothing changed". For a create
every reason is offered. For an amend or a delete:

- If fields were modified, the non-material reason is **disabled**, with the
  tooltip "Not available when fields have been modified".
- If no fields were modified, every other reason is **disabled**, with the
  tooltip "Only available when fields have been modified".

So a person cannot record a material change as a touch, nor a touch as a
material change. The set of enabled reasons is a function of the diff, and the
dialog computes it rather than trusting the person to choose honestly.

**Commentary is conditionally required.** Some reason codes require an
explanation; the label reads "Commentary is required for this reason." and the
field is marked required. For the rest it reads "Commentary is optional for this
reason."

This is never optional and never hidden. A record whose reason is unknown is a
record nobody can account for later.

---

## 7. The history screen

- Read-only. It is a record of what happened.
- One row per version, most recent first.
- Columns: version, the entity's display name as it was, the audit fields, and
  the validity window for temporal entities.
- A version that differs from its predecessor is marked, so a scan finds the
  change without reading every row.
- The current version is marked as current.

---

## 8. Icons

Every icon comes from Microsoft Fluent UI System Icons, named
`ic_fluent_<concept>_<size>_<variant>`. Regular variants are for passive and
secondary actions; filled for active and primary. Sizes are 16px inline and in
dense tables, 20px in buttons and navigation, 32px in headers, 48px for empty
states.

This table is normative. When an entity needs an action not listed, find the
concept in the icon guidelines and add it here rather than choosing freely at
the call site, because two entities using different icons for the same idea is
the inconsistency this document exists to prevent.

### Actions

| Concept | Icon | Used for |
|---|---|---|
| Add | `add` | Creating a record |
| Edit | `edit` | Opening a record for change |
| Delete | `delete` | Removing a record |
| Delete, destructive | `delete_dismiss` | Purge and bulk delete |
| Save | `save` | Committing a change |
| Copy | `copy` | Duplicating a record |
| Refresh | `arrow_sync` | Reloading |
| Undo | `arrow_undo` | Reverting an edit |
| Redo | `arrow_redo` | Reapplying an edit |
| Search | `search` | Search fields |
| Filter | `filter` | Filter controls |
| Settings | `settings` | Configuration |
| History | `history` | Opening the version history |
| Confirm | `checkmark` | Confirmation, selected state |
| Dismiss | `dismiss` | Closing, cancelling |
| Star | `star` | Favourited, with its filled variant for the active state |
| Generate | `wand` | Generating synthetic or sample data |
| Publish | `publish` | Uploading to production tables |
| Export | `arrow_download` | Writing a file |
| Import | `arrow_upload` | Reading a file |
| Lock | `lock_closed` | Locking a record |
| Unlock | `lock_open` | Unlocking a record |
| Password reset | `password_reset` | Forcing a password change |
| Terminal | `terminal` | Shell and console surfaces |
| Record | `record` | Recording controls |

### Columns and cells

| Concept | Icon or treatment |
|---|---|
| Boolean true | `checkmark`, or the words "Yes" |
| Boolean false | `dismiss`, or the words "No" |
| Status or classification | A badge, coloured by meaning, text only |
| Country | A flag |
| Currency | The code, monospace |
| An identifier | Monospace, left aligned |
| A quantity or amount | Monospace, right aligned, tabular figures |
| A timestamp | Monospace, local time, with the exact value on hover |

An icon never appears alone where its meaning is not obvious. If removing an
icon loses no meaning, remove it.

---

## 9. Feedback

| Situation | Presentation |
|---|---|
| A save succeeded | A brief confirmation naming the record, then return to the list. |
| A save failed validation | Field messages where the problem is, and a summary at the top. |
| A save failed on the server | The server's own message, verbatim, because it knew something we did not. |
| A name is already taken | The conflict says which name, and the field is highlighted. |
| A session expired | A clear statement that the session ended and a way to sign in again. Never a silent failure. |
| The server is unreachable | Said plainly, with a Retry. Never a spinner that never resolves. |
| A delete succeeded | A confirmation that names the record. |

Every message says what happened and what to do next. "Error" alone is not a
message.

---

## 10. Access

- Actions the person is not permitted to perform are **not rendered**, rather
  than rendered and disabled. A disabled button invites a question that a
  missing one does not.
- Permissions are decided by the server. The interface hides what the server
  would refuse, and does not attempt to be the authority.
- A refusal from the server is shown as a refusal, not as a failure, because
  the person did nothing wrong.

---

## 11. Naming

For an entity named `book`, in a component named `refdata`:

| Thing | Convention | Example |
|---|---|---|
| Domain type | PascalCase singular | `Book` |
| Screen components | PascalCase, suffixed | `BookListPage`, `BookDetailPage`, `BookHistoryPage` |
| Query hooks | `use` plus the operation | `useBooks`, `useSaveBook`, `useDeleteBook` |
| Protocol file | singular | `book_protocol.ts` |
| HTTP routes | plural, kebab | `/api/books`, `/api/books/:id` |
| NATS subjects | component, version, plural, verb | `refdata.v1.books.list` |
| Wire fields | the server's C++ names | `modified_by`, never `modifiedBy` |
| Domain fields | camelCase | `modifiedBy` |
| Labels in the interface | Sentence case | "Job title", not "Job Title" |

The interface says "Delete" and "Add", not "Remove" and "Create", except where a
record is detached from a parent rather than deleted, where it says "Remove".

---

## 12. The default column set

Independent of the entity, these are hidden by default and available through the
column menu:

`version`, `modified_by`, `performed_by`, `recorded_at`, `change_reason_code`,
`change_commentary`, `tenant_id`

`id` is never shown by default and never offered, because nobody reads a UUID.
It is available through a copy action on the detail screen.

---

## 13. Implementing a new entity

Work through this in order. Each step ends in something checkable, so a mistake
is caught where it was made rather than three steps later.

### Before writing code

1. **Confirm it is an entity.** It has all six properties in §2. If it does not,
   say so and agree the exception before proceeding.
2. **Classify it.** Reference data or transactional. Lookup or free-form.
   Temporal or not. Its classification decides its columns, its sort order and
   whether history is offered.
3. **Find its collection name** and its display field.

### Protocol

4. Add the request and reply schemas for list, save, delete and history.
5. Add the subjects.
6. Test that a real round trip against the running service parses, using a
   rejected or empty case to prove the wire format rather than the happy path
   alone.

### Endpoint

7. Add the routes: list, get, create, update, delete, history where applicable.
8. Validate every input at the boundary and map every failure to a status.
9. Assert that no field the entity marks as secret appears in any response.

### Screens

10. Declare the columns once.
11. Build the list screen from the shared shell.
12. Build the detail screen with the General tab and, where they apply, the
    security, related and provenance tabs.
13. Build the history screen when the entity is temporal.
14. Wire the audit prompt into save and delete.

### Verification

15. Drive the real screens in a browser: list, search, filter, open, create,
    edit, delete, and the history where it exists.
16. Assert the states that are easy to forget: empty, filtered-empty, error,
    loading with existing data, and unauthorized.

### Finish

17. Add the entity to the navigation.
18. Document anything about this entity that would surprise the next person.

---

## 14. Exceptions

Some entities genuinely are not regular, and the exception has to be named and
justified rather than discovered later by someone wondering why this one is
different.

| Kind | What differs |
|---|---|
| **Lookup** | Few fields, may be edited inline rather than on a detail screen, no history |
| **Junction** | No detail screen of its own; managed from one of its parents |
| **Child** | Never listed independently; always a section of its parent |
| **Singleton** | One record by definition, so no list and no add or delete |
| **Read-only** | Derived or imported, so no save or delete |
| **Transactional** | Sorted most recent first, and deletion is usually prohibited |

An exception changes which screens exist and which actions appear. It never
changes the layout of the screens that do exist, and it never introduces a new
icon for an existing concept.
