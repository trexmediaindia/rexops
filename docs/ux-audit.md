# RexOps UX audit — the 20 biggest sources of user confusion

Audit performed before any code change, against the running app and the full source of
`apps/web`, `apps/api` and `packages/ui`. Three personas: **agency staff** (owner, admin,
member), **client reviewer**, **super admin**.

The governing problem: RexOps is a pipeline product whose pipeline is invisible. Nothing on
screen ever states the one sentence a new user needs — *work is created as a deliverable,
a file version is uploaded to it, it moves through internal review, then client review,
then it is approved and delivered.* Every confusion below is a symptom of that sentence
being missing.

---

## 1. There is no route from "I have an account" to "I have done something"

**Confusing:** After sign-in an agency owner lands on `/agency/dashboard` with five metric
cards reading `—`, an empty activity feed, an empty review queue and an empty client table.
**Why it misleads:** An empty dashboard reads as *broken* or *still loading*, not as
*nothing exists yet*. There is no statement of the required first step, and the required
first step is not guessable: you cannot create a project before a client exists, and you
cannot create a deliverable before a project exists.
**Change:** Replace the dashboard for an empty workspace with a five-step setup guide that
states the chain (client → project → deliverable → version → send for review), shows which
steps are already done from live data, and gives each incomplete step one button. Keep it
dismissible and re-openable.
**Where:** `apps/web/src/routes/agency/dashboard.tsx`, new
`apps/web/src/components/onboarding/setup-guide.tsx`.

## 2. The sign-in screen never says what RexOps is or who signs in here

**Confusing:** A marketing line ("The clean handoff between making and approving"), an
email field, a password field, and a row of "Preview shells" buttons that jump into the app
without authenticating.
**Why it misleads:** A client invited by their agency cannot tell whether they are in the
right place. The preview buttons look like account types, so people click "Client" expecting
to sign in as a client and land in a broken half-session. Pre-filled demo credentials look
like the user's own saved credentials.
**Change:** State what the product does in one sentence, list the two audiences and what each
gets, label the demo credentials as demo, move the preview links behind a clearly marked
"Look around without signing in" disclosure, add "No account? Your agency creates it — here
is how to ask" and a forgotten-password path.
**Where:** `apps/web/src/routes/login.tsx`.

## 3. Sign-in failure gives one message for every cause

**Confusing:** Every failure renders "That email and password don't match."
**Why it misleads:** A network failure, an expired session, a rate limit and a genuinely
wrong password are indistinguishable, so the user retypes a correct password repeatedly.
**Change:** Map the error by cause — wrong credentials, account not found, too many attempts,
server unreachable — and give each a recovery action.
**Where:** `apps/web/src/routes/login.tsx`, reusing `apps/web/src/lib/request.ts`.

## 4. The workspace identity in the sidebar is a hardcoded fiction

**Confusing:** Every agency sees `TR / T-Rex Media / Agency workspace` with a chevron that
does nothing.
**Why it misleads:** Users believe they are in the wrong tenant, or that a workspace switcher
exists and is broken. The chevron is a promise the UI does not keep.
**Change:** Render the real agency name and initials from the API, drop the chevron unless a
switcher exists, and show the signed-in user's role beneath it so people know what they can do.
**Where:** `apps/web/src/components/app-shell.tsx`.

## 5. "Settings" opens Automation

**Confusing:** The account menu's "Workspace settings" and the sidebar's Automation entry both
route to `/agency/settings`, which renders the automation rule builder.
**Why it misleads:** Everything a user expects in settings — workspace name, branding,
defaults, storage, who can do what — is nowhere, so they conclude the product has no settings.
**Change:** Build a real settings panel at `/agency/settings` with four sections (General,
Appearance, Behavior, Advanced), every control named for its effect with help text, current
value, units and range. Move automation to its own `/agency/automation` route.
**Where:** new `apps/web/src/routes/agency/settings.tsx`, `apps/web/src/router.tsx`,
`apps/web/src/components/app-shell.tsx`.

## 6. Navigation groups are labelled but not explained, and one group is a dead end

**Confusing:** Sidebar groups read `Operate` and `Manage`. `/admin/users` renders the same
component as `/admin/agencies`. The admin rail has no icons and no active state.
**Why it misleads:** "Operate" and "Manage" describe the product's internals, not the user's
job. A nav item that renders a different page's content destroys trust in the whole nav.
**Change:** Rename groups to what the user is doing (`Your work`, `Workspace`), give every
nav item a one-line purpose on hover, redirect the duplicate admin route, and give the admin
rail icons plus active states.
**Where:** `apps/web/src/components/app-shell.tsx`, `apps/web/src/router.tsx`.

## 7. Empty states say a region is empty but never what to do

**Confusing:** "Nothing waiting", "No rules yet. Start from a recipe.", "Nothing here yet.",
"Nothing is waiting on you right now.", "No approvals yet."
**Why it misleads:** Each states a fact and stops. A new user cannot tell whether the emptiness
is normal, whether they caused it, or what would fill it.
**Change:** Every empty region states why it is empty, what will appear there, and offers the
action that fills it. `EmptyState` already has an unused `action` slot — use it everywhere.
**Where:** `packages/ui/src/components.tsx` and every route that renders `EmptyState` or a bare
empty sentence: agency dashboard, work, review queue, automation, all four client routes.

## 8. Automation asks users to write JSON

**Confusing:** The create-automation dialog has a field labelled **Kind** (RULE, CARD_BUTTON,
BOARD_BUTTON, SCHEDULED, DUE_DATE), a **Trigger event** list of nine SCREAMING_CASE statuses,
an **Action** list of six raw types, and **Action config** — a free-text JSON textarea.
**Why it misleads:** "Kind" and "Action config" are database column names. A non-technical
producer cannot author a rule, and a typo produces "Action config must be valid JSON."
**Change:** Rephrase as one sentence the user completes — *When a deliverable becomes [status],
[do this]* — with plain-language statuses, an action picker whose options carry hints, and a
per-action typed field instead of JSON. Keep raw JSON behind an "Advanced" disclosure for the
actions that genuinely need a payload.
**Where:** `apps/web/src/routes/agency/automation.tsx`.

## 9. Two of Automation's three tabs are placeholders

**Confusing:** The Intake tab shows prose and a raw `GET /api/public/intake/:slug`. The
Templates tab shows prose only.
**Why it misleads:** Users click a tab, get a paragraph and an API path, and cannot tell
whether the feature is missing, unreleased, or something they have failed to set up.
**Change:** Render real intake submissions from the endpoint that already exists, and mark
Templates explicitly as not yet available rather than describing it as if it works.
**Where:** `apps/web/src/routes/agency/automation.tsx`.

## 10. Toggle buttons show a state where a button should name an action

**Confusing:** Buttons reading `Active only`, `Every status`, `All active`, `Due date`, `Name`.
**Why it misleads:** The user cannot tell whether the label is the current filter or the filter
the click will apply. Both readings are plausible and they are opposites.
**Change:** Use a labelled control that shows the current value and names the change —
"Showing: active clients" with an explicit "Show every status" action, or a real segmented
control where the selected option is visibly selected.
**Where:** `apps/web/src/routes/agency/clients.tsx`, `apps/web/src/routes/agency/projects.tsx`.

## 11. A disabled primary button with no explanation

**Confusing:** On Projects, "New project" is disabled when no clients exist.
**Why it misleads:** Rule 3 of a first-time user's questions: *why is this disabled?* The UI
never answers, so the user assumes a permission problem or a bug.
**Change:** Keep it enabled and explain on click, or disable it with a visible reason and the
unblocking action: "Add a client first — every project belongs to one."
**Where:** `apps/web/src/routes/agency/projects.tsx`.

## 12. Archiving is instant, silent and unrecoverable

**Confusing:** Archive on a client or project fires the mutation on click. No confirmation, no
summary of the consequence, no undo.
**Why it misleads:** A user exploring the interface archives live work while trying to find
out what the button does.
**Change:** A confirmation dialog that names the record, states what archiving does to its
projects and deliverables, and requires an explicit "Archive this client" action.
**Where:** new `apps/web/src/components/ui/confirm-dialog.tsx`, used by
`clients.tsx` and `projects.tsx`.

## 13. The Work screen's primary action is "Save this view"

**Confusing:** The most visually prominent button on the board is `Save this view`.
**Why it misleads:** The primary button teaches the user what the screen is for. Saving a
filter preset is a power-user convenience, not the purpose of a work board.
**Change:** Promote "New deliverable" to primary, demote saving a view to a secondary control
next to the view switcher, and explain what a saved view is.
**Where:** `apps/web/src/routes/agency/work.tsx`.

## 14. Raw enum values leak into the interface

**Confusing:** `WorkList` prints `item.priority` verbatim (`HIGH`, `URGENT`); automation prints
`rule.kind` and `Trigger: INTERNAL_APPROVED`; the rule list says "When INTERNAL_APPROVED".
**Why it misleads:** SCREAMING_SNAKE reads as a bug or as a value the user is supposed to have
configured. `StatusChip` already humanizes — nothing else does.
**Change:** Route every enum through a label map, as `pipeline-editor.tsx` and `team.tsx`
already do.
**Where:** `apps/web/src/routes/agency/work.tsx`, `automation.tsx`,
`packages/ui/src/components.tsx`.

## 15. The deliverable breadcrumb names a screen that does not exist

**Confusing:** The breadcrumb reads `Projects / Production cockpit`.
**Why it misleads:** "Production cockpit" is not the deliverable's name, not its project's
name, and not a page the user can navigate to. The user loses track of where they are in the
client → project → deliverable hierarchy.
**Change:** Breadcrumb the real path — Clients / {client} / {project} / {deliverable} — with
every segment a working link.
**Where:** `apps/web/src/routes/agency/deliverable-detail.tsx`.

## 16. Every status transition is offered with identical weight

**Confusing:** The deliverable header renders one `Move to {status}` button per legal
transition, all `secondary`, beside "Open review room".
**Why it misleads:** Six equal buttons give no indication which one is the normal next step,
so the user picks by guessing and moves work backwards through the pipeline.
**Change:** One primary button for the expected next step ("Send to client review"), the rest
folded into a "Move to another stage" menu with a plain-English consequence per option.
**Where:** `apps/web/src/routes/agency/deliverable-detail.tsx`,
`apps/web/src/lib/deliverable-status.ts`.

## 17. The review room tells the client they cannot act, but not why

**Confusing:** The decision bar renders "No decision is required at this stage."
**Why it misleads:** The client was emailed a link asking them to review, then told no decision
is required. They cannot tell whether they are early, late, lack permission, or are looking at
the wrong version.
**Change:** State the actual reason and who is holding it — "This cut is still with the agency's
internal reviewers. You will be notified when it reaches you." — plus what the user can still
do (comment, view history).
**Where:** `apps/web/src/routes/review-room.tsx`.

## 18. Placeholders are used as labels in the approval signature

**Confusing:** The decision confirm shows an unlabelled input with placeholder
"Type your full name to sign", and a comment box whose placeholder alternates between
"Optional sign-off note" and "Feedback is required".
**Why it misleads:** Placeholder text disappears on focus, so the requirement vanishes exactly
when the user needs it. Whether the comment is required is encoded only in text that is gone
while typing. This is a legally-consequential sign-off.
**Change:** Real persistent labels, an explicit required/optional marker, help text explaining
that the typed name is recorded in the audit trail, and validation on blur.
**Where:** `apps/web/src/routes/review-room.tsx`.

## 19. Forms do not say what is missing, what is optional, or what a field wants

**Confusing:** `FormDialog` disables submit while any required field is empty, with no message.
Optional fields carry no marker. There is no blur validation. The pending label is "Working…".
**Why it misleads:** The user stares at a dead button with no idea which field blocks it,
especially when the form scrolls.
**Change:** Keep submit enabled, validate on blur and on submit, list what is missing above the
button, mark optional fields explicitly, give examples for formats, and make the pending label
name the action ("Creating client…").
**Where:** `apps/web/src/components/ui/form-dialog.tsx`.

## 20. Icon-only and word-only controls with no explanation

**Confusing:** An `Audit` button with a gauge icon in the review room header; the annotation
toolbar's six tools carry only a `title` attribute; the command palette says "Jump to a
workspace…" but only searches nav labels; metric cards carry cryptic notes like "Across the
visible slate" and "Client decision gate".
**Why it misleads:** Each is a control whose purpose can only be learned by clicking it. In the
review room, clicking to find out is a consequential act.
**Change:** Add a reusable help affordance and use it — persistent tooltips with an explanation
of what the tool does and what it produces, honest placeholder copy, metric notes that define
the metric in plain words.
**Where:** new `HelpTip` in `packages/ui/src/components.tsx`,
`apps/web/src/components/review/annotation-toolbar.tsx`,
`apps/web/src/routes/agency/dashboard.tsx`, `apps/web/src/components/app-shell.tsx`.

---

## What is already right and is being propagated, not replaced

Two screens already do what this brief asks, and they are the in-repo model rather than a new
invention:

- `apps/web/src/routes/agency/team.tsx` — every role carries a one-line description, every
  permission flag carries a label and a hint, and permissions inherited by owners render as
  inherited rather than as dead switches.
- `apps/web/src/routes/agency/pipeline-editor.tsx` — option labels carry hints, durations are
  written as "1 working day" rather than a number of hours, and `stageSummary()` renders a
  plain-English sentence describing what the configured stage will actually do.

The visual language (dark surface, tungsten accent, IBM Plex, the named type scale) is
understandable and is left alone. Nothing in this audit is an aesthetic change.

---

## Status — what was built against each item

Every item in this audit has been implemented. The work was done in passes, each verified with
`bunx tsc --noEmit -p apps/web/tsconfig.json` and `bunx biome check`, and finished with a
production build of `apps/web`.

**Shared pieces introduced, then reused everywhere rather than re-solved per screen:**

- `packages/ui/src/components.tsx` — `EmptyState`, `HelpTip`, `Callout`, `Steps`, `Toggle`,
  `SegmentedControl`, `Skeleton`, `SaveState`, `StatusChip`, `MetricCard`, and `humanize()` /
  `statusLabel()` so no enum reaches a screen raw.
- `apps/web/src/components/ui/field.tsx` — `Field`, which refuses to render a control without a
  visible name and a sentence saying what belongs in it, plus `SettingsSection`.
- `apps/web/src/components/ui/page-header.tsx` — `PageHeader`, so every screen states its
  breadcrumbs, name, purpose, and its one primary action.
- `apps/web/src/components/ui/form-dialog.tsx` and `confirm-dialog.tsx` — required/optional
  badges, validation on blur, a "Still needed: …" footer, and a stated consequence before
  anything irreversible.
- `apps/web/src/lib/request.ts` — one request helper that lifts the server's own message onto
  the error, so screens can show what actually went wrong instead of a status code.

**Items closed in the final pass:**

| Item | Where it landed |
| --- | --- |
| 17 — the room says *why* you cannot decide | `components/review/review-session.ts` now derives a `blockedReason` from the six distinct cases it already knew about; `routes/review-room.tsx` prints it |
| 18 — placeholders used as labels in the signature | `routes/review-room.tsx`, rebuilt on `Field`, with the consent sentence shown beside the box rather than implied |
| 20 — icon-only and word-only controls | `components/review/annotation-toolbar.tsx`: every tool carries a sentence about what it does to the file, and the selected one explains itself live |
| 5, 12 — orientation | `PageHeader` adopted across every agency and admin screen; the sidebar link and the page name now agree (`Review stages`) |
| 7, 10, 11 — empty, loading, error, blocked | `Skeleton`, `Callout` with a retry, and an `EmptyState` with an action on every list screen, including both admin screens |
| 14 — raw enums | `humanize()` over statuses, actions, target types and specialities |

**Screens the sweep also reached, which the original 20 did not name separately:**

- `routes/admin/agencies.tsx` and `routes/admin/audit.tsx` — "Provision agency" became "Add an
  agency", the table columns became questions a person would ask (Who / What they did / What it
  was done to), and the standing red banner became an ordinary note, since "this is recorded" is
  something to know, not an error.
- `routes/client/review.tsx` — this and the portal's front door listed the same work under two
  different nav items. It is now the complete list of everything shared with the client, and the
  front door keeps the narrower job of "decide these now".
- `routes/share-review.tsx` — the guest arriving from an email now reads what the link is and
  what it permits; commenting explains that it wants a name rather than greying the button out.
- `routes/intake.tsx` — the public request form gained loading, error and validation states, and
  "Submit request" became "Send this request to the team".
- `routes/review-room.tsx` — a review that fails to load now says so instead of spinning for ever.
