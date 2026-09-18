# Change notification

What the interface does when the data underneath it moves.

A list shows records somebody else may be editing. A form shows a record that may
already have changed. Neither can be allowed to say something untrue, and neither
may be reloaded out from under a person mid-sentence. This is the language for
that, derived from what the Qt client does, written down so it is not reinvented
per entity.

---

## 1. What the Qt client does

Worth stating because it is the accumulated answer, and because two of its three
parts are right and the third is a gap.

**The list marks itself stale.** When the server reports a change to the
collection, the Reload action begins to pulse and its tooltip becomes "Data
changed on server - click to reload". Nothing reloads on its own.

**Changed rows are highlighted.** After a reload, rows whose `recorded_at` is
newer than the previous reload are drawn in gold, and the highlight pulses six
times at 500 ms. On the first load there is no baseline, so nothing is
highlighted. The point is that a person watching a live system sees what changed
without re-reading the table.

**The detail form is not told.** A Qt dialog holding a record does not learn that
the record changed elsewhere. Saving then either fails on the optimistic lock or,
worse, overwrites. That is the gap, and this document closes it.

---

## 2. The rules

**Never reload on notification.** No screen refreshes because the server said
something changed. A list that jumps while somebody is reading it is worse than a
list that is briefly out of date, and a form that reloads discards what has been
typed. The person decides when to bring changes in.

**Notification is quiet, and it is in one place per screen.** A pulse on the
reload affordance, and a mark on the records that moved. Not a toast, not a
badge, not a sound. If a screen has a reload action, that action is where the news
appears, because that is where the person would go to act on it.

**A changed record is marked where it is.** In a list, the row is highlighted. In
a detail screen, the record says that a newer version exists, and offers to load
it. The mark is on the thing that changed, so a person does not have to work out
which of forty rows is the one that moved.

**A form that is being edited is never overwritten.** If the record changed while
somebody was typing, the offer to load is visible but is not taken for them. What
they typed is theirs until they discard it.

**Saving into a stale record is refused, visibly.** The optimistic lock already
refuses it. The screen's job is to have said so *before* the save, so the refusal
is a confirmation rather than a surprise.

---

## 3. The three states

| State | What it means | What the screen shows |
|---|---|---|
| **Current** | Nothing has changed since the data was fetched | Nothing. Silence is the normal state |
| **Stale** | Something in this collection changed | The reload action pulses; its tooltip says what happened |
| **Stale rows** | These particular records changed | The rows are highlighted, and the highlight fades after a moment |

A screen moves from current to stale, and stays there until the person reloads.
It does not move back on its own, because the point of the mark is that it is
still there when they look up.

---

## 4. The TypeScript shape

The parts, in the order data flows.

### The events exist already

The generator emits a changed event per entity — `country_changed_event` and its
siblings — and the services publish them. They are not something the interface
invents.

### A channel to the browser

The browser never reaches NATS, so the BFF carries the news. One long-lived
stream per session, not one per screen: a screen opening and closing must not
churn connections, and a person with six lists open wants one stream.

```
GET /api/events           text/event-stream
```

The envelope already exists in the protocol package:

```ts
{ event: 'entity-changed', data: { component, entity, ids } }
```

The `entity-changed` kind is the addition. `session-expired` and `party-changed`
are already defined and are the same channel's business, because they are the same
question asked by different parts of the interface.

### Subscribing per entity

```ts
// The list and the detail screen both use this, so both learn the same way.
const { stale, changedIds, reload, clear } = useEntityChanges('refdata', 'country');
```

`stale` is true once any change has been reported and stays true until `reload()`
or `clear()`. `changedIds` holds the records named by the events since the last
reload, so the rows that moved can be marked.

### What the screen does with it

```tsx
// The reload affordance carries the news.
<Button pending={stale} onClick={reload} title={stale ? t('entity.changed') : t('entity.refresh')}>
  {t('entity.refresh')}
</Button>

// The rows that moved are marked.
<DataTable columns={meta.columns} rows={rows} changed={changedIds} ... />
```

`changed` on the table is a set of row keys, not a flag. A whole table flashing
says nothing; the four rows that changed say everything.

---

## 5. The visual language

Small, and the same everywhere, because a notification language that varies by
screen is not a language.

| Element | Treatment | Why |
|---|---|---|
| Reload affordance, stale | A slow pulse of its colour, repeating while stale | It is always in the same place, so a person learns one location |
| Reload tooltip, stale | The words change to say what happened | A pulse says "look here"; the tooltip says why |
| A changed row | Its background tinted for a few seconds, then faded | A permanent highlight becomes decoration; a fading one stays news |
| A changed row, still stale | A left border in the same colour | The fade is for the moment; the border is for as long as it is true |
| A detail screen whose record moved | A line above the form saying a newer version exists, with Load | The form cannot tint itself without hiding the fields |

**Colour.** One accent for "changed", used only for this. It is not the colour
used for errors, not the colour used for warnings, and not the accent used for
primary actions, because a thing that means one thing must not mean four.

**Motion.** A pulse is slow — around two seconds a cycle — and stops. A fast pulse
reads as an error, and a pulse that never stops becomes wallpaper within a day.

**Reduced motion.** A person who has asked their system for less motion gets the
colour and the border and no pulse. The information is the same; only the
movement is dropped.

---

## 6. What the interface must not do

Recorded because each is the tempting shortcut.

**Reload the list automatically.** Discards scroll position, and any selection.
The Qt client got this right by not doing it.

**Show a toast per change.** A busy system produces a stream of them, and a toast
that cannot be dismissed is a toast that is ignored.

**Reload the detail form.** It discards what has been typed, and there is no
undo.

**Reload the list while a row's menu is open**, or while a dialog is up. The
person is mid-action on a specific record, and the row under their cursor moving
is the worst moment to move it. Deferred, not dropped: the news is still there
when the dialog closes.

**Mark a row that did not change.** A whole-table flash is the same as no flash,
and it teaches people to ignore the mark.

---

## 7. Open questions

Named rather than assumed, because they change the shape.

**Does the BFF subscribe per session, or once per deployment?** One subscription
per session is simpler and costs a fan-out; one per deployment needs a registry of
who is watching what. The first is right until the number of sessions is large.

**How are changes to something a screen is not showing handled?** A country that
is referenced by a book, changed while somebody is editing the book. The event
names a country; the book screen is affected but is not watching countries. This
is the hard case and it is not solved here.

**What is the ceiling on `changedIds`?** A bulk import changes ten thousand
records, and a set of ten thousand row keys is not a mark on a row, it is a
different state — probably "this whole collection changed". The rule is that the
set has a ceiling and past it the screen goes stale without naming rows.
