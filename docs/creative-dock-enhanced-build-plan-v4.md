# Creative Dock — Enhanced Build Plan v4 (research-grounded feature spec)

> **What this doc is.** v3 (the greenfield build plan) locked the *decisions*. This v4 does the homework v3
> assumed: a concrete, **sourced** teardown of the advanced features in Asana, Odoo, Trello, Frame.io and
> eleven comparable tools, then maps each extracted feature to a buildable Creative Dock requirement and the
> domain-model / roadmap deltas it forces.
>
> **Ground rules honored here:** no laziness, no assumptions. Every competitor feature in Part A is attributed
> to a real product and a real source (see Sources). Where a line is *our* design choice rather than an
> observed competitor fact, it is labeled **[CD decision]**. Claims taken verbatim from a vendor page are
> marked "per <vendor>" so provenance is never silent.
>
> **Date captured:** 2026-06-19 · **Status:** research complete; supersedes v3's feature breadth, keeps v3's
> locked decisions and `creative-dock-overview-v2.md`'s domain model as the baseline.
> **Out of scope (unchanged):** billing / invoicing / payments / finance; AI in v1; native mobile; email &
> WhatsApp channels; user-defined custom fields (all deferred, schema stays additive).\'


---

## 0. The thesis, restated against the research

The v3 positioning — *Odoo (customizable pipelines + row-level access) + Asana (one dataset, many views +
intake + workload) + Trello (ruthless client-surface simplicity) + Frame.io (frame-accurate review = the
wedge)* — survives the research intact. What the research changes is **depth**: each of those four "borrowed"
pillars has 2–4× more advanced surface area than v3 enumerated, and the dedicated review tools (Ziflow,
Filestage, PageProof, Wrike, Workfront) reveal review/approval mechanics that Frame.io alone does not cover
(sequential-vs-parallel stages, conditional routing, audit trails, audio-waveform / HTML / 3D proofing,
forensic watermarking). Part A captures that surface area; Part B turns it into our build.

---

# PART A — COMPETITIVE FEATURE TEARDOWN (sourced, exhaustive)

Legend for the "Take" column: **STEAL** = build a close analog in v1/v2; **ADAPT** = build a simplified or
agency-specific variant; **LATER** = valuable but post-v1; **SKIP** = out of our scope.

## A1. Asana — the "one dataset, many views + intake + work depth" pillar

### A1.1 Project views (same data, one-click switch — no re-setup)
| View | What it concretely does | Take |
|---|---|---|
| **List** | Spreadsheet-like; tasks grouped into **Sections**; columns do automatic **sum / average / count**; drag tasks between sections; per-view column show/hide. | STEAL |
| **Board (Kanban)** | Columns = workflow stages; cards show due date, assignee, subtask count; drag-drop between columns. | STEAL |
| **Timeline** | Visual plan of start/end/overlap; shows **dependencies**; **flags blocking tasks**; drag to reschedule and **blocked tasks auto-shift**. (Paid tiers.) | STEAL |
| **Calendar** | Tasks by due date; drag to a new date updates the due date. | STEAL |
| **Gantt** | Bird's-eye dependency chains + progress vs target schedule; inherits Timeline drag behavior. | ADAPT |
| **Dashboard** | In-project charts on timeline / completion / task volume. | ADAPT |
| **Overview tab** | Project description, resources, roles, milestones, connected goals in one tab. | ADAPT |
| **Saved View tabs** | Any filtered/grouped/sorted perspective saved as a named tab inside the project. | STEAL |

Key principle (per Asana): **the same task data renders in every view; switching is one click, no setup**, and
each view chooses which fields are visible while data stays synced. This is the Airtable/monday "single source,
many lenses" model and is the backbone of our "four views" decision.

### A1.2 Work-management depth
- **Tasks → Subtasks** (nested work; subtasks can be assigned & due-dated independently).
- **Milestones** — progress markers that surface in Overview, Portfolio list, and Timeline.
- **Dependencies** — task A "blocks/blocked by" B; in Timeline, rescheduling a predecessor flags/shifts dependents.
- **Custom Task Types** — visually distinct work categories within one project (e.g., "Bug" vs "Deliverable").
- **Recurring tasks** — auto-repeat (e.g., weekly review).
- **Multi-homing** — a single task can live in multiple projects at once (one source of truth, many boards). **STEAL** (maps to our cross-project deliverable visibility).
- **Sections** — phases/stages; collapsible when complete.

### A1.3 Custom fields
- Tracked attributes (Status, Priority, Cost, category tags); **single-select** fields are used for grouping by Stage/Status; date / start-date fields drive scheduling + workload; show/hide per view.

### A1.4 Rules / automation (the "When→If→Then" engine)
- **Triggers**: e.g., *task created*, *user assigned*, *field set to value*, *moved to section*, *due date approaching*.
- **Conditions & branching**: "**If / Otherwise if**" with **And/Or** logic — one trigger can fork to different actions per scenario.
- **Actions**: change assignee, update fields, move to section, post a comment, set due date, add subtasks/templates, trigger approvals.
- **Hard limit (per Asana): 50 rules per project**, regardless of tier — a real design constraint to note.

### A1.5 Forms / intake
- **Branching logic**: dependent fields show/hide based on a trigger field's value.
- **Custom-field mapping**: a form answer can populate the task title, due date, or any custom field directly.
- Forms live in the Workflow tab alongside templates, rules, fields, and bundles.

### A1.6 Templates & standardization
- **Project Templates** — repeatable structure with **dynamic roles** and **date offsets** (dates computed relative to start).
- **Task Templates** — pre-filled structures for repeated request types.
- **Bundles** (Enterprise) — **apply the same set of fields + rules + sections + task templates across many projects at once**, and keep them in sync. This is the agency-standardization superpower. **STEAL → our "Pipeline/Template pack".**
- **Duplicate Project** — copies a project including saved tabs/dashboards.

### A1.7 Approvals & Proofing
- **Approval task**: approver picks **Approve / Request changes / Reject** (three explicit outcomes, not a binary).
- **Proofing**: reviewers leave **anchored comments directly on images and PDFs** (feedback pinned to an exact point).
- **Feedback → actionable subtask**: each proofing comment **auto-creates a subtask** for the creator so the revision is tracked to completion. **STEAL** — this "comment becomes a tracked to-do" loop is excellent.
- **Approval status** trackable as a custom field ("Approved" / "Changes Needed") to visualize what's awaiting whom.

### A1.8 Cross-project / personal / portfolio layer
- **My Tasks** — personal cross-project list, organizable into sections.
- **Inbox** — notifications hub (mentions, assignments, approvals to give).
- **Portfolios** — group projects, real-time health roll-up.
- **Goals** — measurable objectives; **tasks and milestones both count toward goal progress**.
- **Workload** — team capacity using effort/dates to spot over-allocation.
- **Capacity plans** — allocate members to whole projects for resource visibility.
- **Status Updates** — narrative project updates that feed Goals/Portfolios/Overview.
- **Critical path** + **native time tracking** (Advanced tier) — note as LATER.

## A2. Odoo — the "customizable pipelines + true row-level access control" pillar

### A2.1 Project app features
- **Kanban view**: stages as columns; drag tasks between stages; stages support **folding** and **sequencing**.
- **List / Calendar / Gantt / Activity / Pivot / Graph** views; List supports **grouping, filtering, and batch operations across multiple projects at once**.
- **Multi-level subtasks** (view a task's subtasks from its Kanban card; blocked indicators).
- **Recurring tasks** — daily/weekly/monthly; **the next task is auto-created when the previous is marked done** (completion-driven recurrence, subtly different from time-driven).
- **Task dependencies** — relationships that trigger **automatic rescheduling** on conflict.
- **Milestones**; **custom property fields** per task; **text shortcuts** at task creation (type to set tags / assignee / hours).
- **Chatter** — per-record activity log unifying notes, emails, calls, meetings, scheduled activities. **ADAPT** (this is a great per-deliverable activity-feed pattern).
- **Customer portal** — external users get **view or edit** access to *their* assigned tasks only. **STEAL** (this is the client surface).
- **Project Updates** — one-click status reports; **burndown charts**; tasks analysis; shareable dashboard filters.
- **Project Templates** — reuse project structures.

### A2.2 The security model — our multi-tenancy blueprint (the real reason Odoo is here)
Odoo's two-layer model is exactly the pattern our tenant-guard should emulate. Precise mechanics (per Odoo dev docs):

1. **Groups (`res.groups`)** — the unit of permission; a user's effective rights are the **union** of all their groups.
2. **Access rights (`ir.model.access`)** — *model-level* CRUD: four flags **`perm_read / perm_write / perm_create / perm_unlink`**. **Additive across groups** (group A read + group B write ⇒ user has read+write). Coarse "can this role touch this table at all".
3. **Record rules (`ir.rule`)** — *row-level* filters via a **`domain_force`** predicate. Two kinds and their combination logic matter:
   - **Global rules** (no group): **AND** together — every global rule must pass. Use for hard tenant isolation.
   - **Group rules**: **OR** together *within* the applicable groups, then that result **ANDs** with the global rules.
   - **Default-allow**: if access rights permit and no rule restricts, access is granted.
4. **Field-level access** — a `groups` attribute on a field hides/locks specific columns from non-members. **STEAL** — this is exactly how we hide INTERNAL-only fields/comments from client users.
5. **Multi-company rules** — records carry `company_id`; rules use `company_id in allowed_company_ids`; a `company_id = False` record is globally visible. **This is the literal template for `agencyId`-scoping.**

> **CD mapping.** Our "tenant-guard on every tRPC procedure" = Odoo global record rules (`agencyId = ctx.agencyId`,
> ANDed, non-bypassable). Our per-project membership visibility = group rules (ORed: owner OR admin OR assigned-member).
> Our INTERNAL-vs-CLIENT comment/field hiding = field-level groups. Our Super Admin = the only principal exempt from
> the global rule (audit-logged). Build the guard as a single composable layer, not per-endpoint checks.

## A3. Trello + Butler — the "ruthless simplicity + accessible automation" pillar

### A3.1 Core
- Boards → Lists → Cards; **checklists** (with assignees + due dates), **labels**, **members**, **due dates**, **attachments**, **Custom Fields** (Power-Up).
- **Power-Ups** = integrations/extensions (Slack, Google Drive, Jira, GitHub, Confluence, Dropbox, Salesforce, **Card Repeater**, etc.).

### A3.2 Butler automation — five command types (the lesson: make automation *legible*)
1. **Rules** — trigger + action(s), fire automatically on board events.
2. **Card Buttons** — one-click actions on an individual card (can chain multiple sequential actions).
3. **Board Buttons** — one-click actions across the whole board (rearrange lists, generate lists).
4. **Scheduled / Calendar commands** — run on an interval ("every day", "first Tuesday of every month").
5. **Due-Date commands** — fire relative to a card's due date.

**Triggers** (per Atlassian/Butler): card moved to a list, label added, task marked complete, checklist items
checked, **Custom Field changes** (field set/cleared, text/list set to a value, **number above/below/in-range**,
**date within N days / this week / this month**), "when I'm added to a card".
**Actions**: move/copy/create card, add/remove members, set/complete due date, add/remove labels, add comments,
add checklists, archive, **sort a list**, **send email reports** (four prebuilt types), and **HTTP requests
(GET/POST/PUT)** to external systems. **Variables** like `{date}` interpolate into actions.
**Limits**: Butler is available to **all plans including Free**, with **per-plan run quotas** (command-run caps
scale with tier).

> **CD lesson.** Trello's win is *plain-language, in-context* automation with **buttons** (manual one-click
> automations), not just background rules. Our visual When→If→Then builder should ship **card/board-button-style
> manual actions** too (e.g., a "Send to client" button on a deliverable), and an **HTTP-request action** for
> escape-hatch integrations. **STEAL the five-command taxonomy.**

## A4. Frame.io V4 — the review/asset pillar (the wedge benchmark)

### A4.1 Metadata model (replaces folders-as-truth)
- A **field-based metadata layer** sits on every asset; per Frame.io V4 beta, **~32 default fields** (Status,
  Date Uploaded, File Type, Take, Select Take, star rating, due date, media type, assignee…).
- **Custom fields**, with types: **text, single-select, multi-select, date, toggle (boolean), number.**
- **CD mapping**: this is our "built-in custom fields now, user-defined later" decision — Frame.io proves the
  field-type set we need (text / select / multi-select / date / boolean / number / rating).

### A4.2 Collections (smart, real-time saved views)
- A **Collection** = a saved, **real-time** view that **filters / groups / sorts** assets by metadata, **without
  duplicating files**; auto-includes new assets matching its criteria; supports custom **name / cover image /
  description**; you can make **unlimited** Collections over the same assets.
- **Sharing a Collection** preserves its filters/groups/sorts and **updates live** for recipients as new assets land.
- **CD take**: ADAPT — our "Saved View tabs" + client share links should behave like Collections (live, filter-preserving).

### A4.3 Review, versions, comments
- **Version stacks** — drag a new version onto an asset to stack iterations together for easy reference.
- **Streaming player** — frame-accurate **hover scrub previews** + high-res scrubbing, minimal buffering.
- **Comparison viewer** — side-by-side asset evaluation.
- **Comments/annotations** — **point-and-click annotations**, **emojis**, **comment attachments**, **hashtags**,
  smarter **@mentions**, and comments **anchored anywhere on an asset** (frame-accurate on video).
- **Multi-panel customizable UI**; **bulk uploads** while you keep working; broad file support incl. **RAW photos**, design, docs.

### A4.4 Shares & content security (the agency↔client trust boundary — richer than v3 assumed)
- **Share links** with per-link controls: **passphrase**, **expiration date/time**, **permission toggles
  (allow comment / allow download)**.
- **Watermarking**: standard watermark controls at workspace + share level; **forensic watermarking (DRM)** per
  share link — *tradeoff (per Frame.io): downloads limited to forensically-watermarked proxies (no originals) +
  added playback latency*.
- **Download governance**: downloads **default on/off** for new share links, with **named roles allowed to
  override**.
- **Internal vs external defaults**: "Default on Internal Playback & Downloads" vs "Default on All Share Links"
  apply watermarking policy to internal viewing vs every external share.
- **Camera to Cloud (C2C)** — upload footage *while recording*; Canon/Nikon/Leica hardware; Lightroom round-trip. **SKIP** (production-ingest, not our problem) but note as a "link external source" pattern.
- **Certifications**: TPN Gold Shield, SOC 2 Type 2, ISO 27001 — the enterprise bar for media trust.

> **CD take**: our `Share`/review-link surface must have **passphrase + expiration + comment/download toggles +
> watermark option** as first-class fields, and an **internal-vs-client default policy** — v3's FileVersion
> `visibility` flag is necessary but **not sufficient**; share-link governance is its own model. **STEAL.**

## A5. monday.com — automation-recipe + flexible-columns benchmark

- **Structure**: Board → Groups → Items → **Subitems**; 200+ templates.
- **Column types** (36+): **Status**, **People**, **Timeline**, **Date**, **Files**, **Dependency**,
  **Formula** (compute across a row), **Mirror** (pull a column's live value from a *connected board*), and more.
  **Mirror + Connect-boards** is how monday does cross-board roll-ups without duplication — **ADAPT** for our
  cross-project deliverable roll-ups.
- **Views** (27+): Kanban, Gantt, Calendar, Timeline, **Workload**, Chart, **Map**.
- **Automations / "recipes"**: prebuilt **"When [trigger], then [action]"** recipes + fully custom; **per-tier
  monthly run limits**. The recipe library (suggested from what teams commonly automate) is the UX to copy.
- **Dependencies** — **four types**: Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish (a link
  prevents a task progressing until predecessors complete). v3 only implied FS — **STEAL all four** (or at least FS+SS).
- **Dashboards**: 25+ **widgets** (charts, numbers, time-tracking) aggregating **multiple boards**.
- **WorkForms** (intake forms into a board), **monday Docs** (real-time collaborative docs), **Whiteboards**,
  **Baselines** (track against original plan), Milestones, 200+ integrations, built-in time tracking.

## A6. ClickUp — work-depth + "feature density" benchmark

- **Hierarchy**: Workspace → Space → Folder → List → Task → **Subtask**, nesting **up to 7 levels** (per ClickUp).
- **Custom Statuses** definable per **Space / Folder / List** (workflow stages match each team's process).
- **Custom Fields** (dropdown, currency, text, **formula**, **progress bar**…), **Custom Task Types**.
- **15+ views**: List, Board, Gantt, Calendar, **Table**, **Mind Map**, **Whiteboard**, **Canvas**, **Map**,
  **Workload**, **Portfolios**, Activity/Timeline.
- **Multiple assignees** on one task; **Checklists**; **Priorities**; **Dependencies / task relationships**;
  **Recurring tasks**; **Sprint points**.
- **Assign Comments** — turn a comment into an owned action item. **STEAL** (pairs with Asana's proofing→subtask).
- **Clips** — record **screen + voice** to leave feedback/bug reports without a meeting. **ADAPT** (a "record a
  screen note on this version" feature is gold for creative review).
- **Docs / Wikis / Notepad**, **Chat**, **Dashboards** (editable cards: change status/owner/fields from the dashboard),
  **Goals / Targets**, **Milestones**, **Time tracking / estimates / timesheets**.
- **Proofing** — annotate **images and PDFs** with comments (ClickUp's native proofing). **ADAPT.**

> **CD lesson.** ClickUp shows the *ceiling* of feature density and the cost of it (notoriously heavy UI).
> Our Trello-pillar mandate (ruthless client simplicity) is the counterweight: build ClickUp-depth for the
> **agency** surface, Trello-simplicity for the **client** surface. Same data, two opinionated skins.

## A7. Wrike — agency-grade intake + proofing + reuse

- **Proofing** for **30+ file types**; annotate with arrows/comments; request approvals; **automated status
  transitions** on approval.
- **Dynamic Request Forms** (space or account level): forms that **change questions based on answers** and then
  **auto-configure the created work** — assignees, target location, **blueprint**, status, **approvals**,
  subtasks. **STEAL** — this is Asana branching forms + auto-provisioning, exactly our "intake → auto-creates work" need.
- **Blueprints** — reusable templates for work items (and you can pull blueprints/custom fields/custom item
  types from *other spaces*).
- **Custom Item Types** — define domain-specific work objects (e.g., "Campaign", "Shoot"). **ADAPT** (our
  Deliverable/contentType is a fixed version of this; user-defined item types = LATER).
- **Cross-tagging** — one task appears in **multiple projects without duplication** (= Asana multi-homing).
- **Automation engine** — multi-step: trigger actions, assign tasks/due dates, **set approvals** for any project type.

## A8. Adobe Workfront — the enterprise creative-ops benchmark

- **Request Queues** — standardized, transparent **intake** that captures reportable details and feeds **review
  & approval** + templated project creation. (Our intake-forms feature should produce a *queue*, not just a task.)
- **Custom Forms** — structured data capture attached to work.
- **Approval workflows + native Proofing** — upload asset, invite reviewers, run **version-controlled, automated
  approval workflows**; **natively integrates with Frame.io** to unify review/approval. (Validation that the
  PM-tool + Frame.io-review combination *is* the enterprise pattern — which is exactly what Creative Dock unifies in one product.)
- **Blueprints / templates** for fast project initiation.
- **Workfront Fusion** — low-code/codeless **"scenarios"** connecting Workfront to hundreds of apps (the
  enterprise version of Trello's HTTP-request action). **LATER** (our automation HTTP action covers the v1 need).

## A9. Dedicated review/proofing tools — the wedge, in depth

These are the tools that do *only* review/approval, so they reveal the mechanics Frame.io (a broader platform)
under-documents. This is the most important section for our "wedge".

### A9.1 Ziflow (enterprise proofing) — *deepened from ziflow.com/product + /online-proofing-automated-workflow*
- **1,200+ file types**; product page states "documents, images, videos, audio, **live websites**, and more" (plus .TIF, .INDD, .AI per comparisons).
- **Collaborative viewer** — one review surface across every asset type (video/image/PDF/audio/web).
- **Frame-accurate markup + annotation**; **side-by-side version comparison**.
- **Version control with explicit minor *and* major version labels** (not just an incrementing number). **STEAL** — confirms our `label`/`tag` design should carry minor/major semantics.
- **Campaign-level review** — review & approve **all elements of a cross-channel campaign in a single workflow**. **ADAPT** (our project/sub-project can hold a multi-deliverable campaign review).
- **Automated workflow routing** with **conditional logic** (route by project type / team / deadline); auto-route projects while keeping **internal *and* external** reviewers in the loop; **"never skip a review step"** enforcement (submission → final sign-off).
- **Sequential *and* parallel review stages** — *you choose whether approvals happen in order or simultaneously.* **STEAL.**
- **Multi-stage vs single-stage** paths (heavy regulated review vs expedited simple review); **reusable proof templates** ("step-by-step sequences for each project").
- **Proactive alerts when a project gets stuck** (stalled-review escalation). **STEAL** (pairs with our reminder automations).
- **Decision capture** pushed back to the project record; **full audit trail + comment history**; **electronic signatures** for compliant sign-off. **STEAL the e-signature sign-off** for client final approval.
- **Real-time project dashboards** (status + trends).
- **Security**: **granular permissions at project *and* file level**, **SOC 2 + ISO 27001**, **SSO, 2FA, IP-based access controls**; native **DAM** integrations.

### A9.2 Filestage
- **Step-by-step approval process**: define **review steps / approval gates** controlling **who reviews what, in
  what order** (sequential sign-off for creative → legal → brand).
- **On-file annotations**; **tap-to-comment** on video/image/files; **threaded replies**; **team-only (private)
  comments**. **STEAL the private/internal-vs-shared comment toggle** (our INTERNAL vs CLIENT_VISIBLE).
- **Version management** with **side-by-side comparison**.
- **Due dates + automated reminders**; **guest reviewers without an account**; supports docs/images/audio/video.

### A9.3 Wipster
- Frame-accurate commenting on video frames; **built-in approval stages**; version comparison;
  **comment-to-task** workflow; unlimited free reviewers.

### A9.4 Vimeo Review
- **Time-stamped comments + approvals**; version tracking; **password-protected / secure links**; review and
  publish on the same platform. (Noted as *lacking frame-accurate annotation depth* vs Frame.io — i.e., timecode
  comments without precise drawn annotation is a *weaker* product; we must do both.)

### A9.5 GoProof
- Feedback **inside Adobe apps** (no export step); multi-stage proof routing; frame-level markup; real-time client/team collaboration.

### A9.6 PageProof — the file-type breadth + medium-specific review benchmark
- **Audio proofing**: markup + comments placed **directly on the waveform** (mp3/wav); **comments span time
  ranges** and **state the timecode**. **STEAL** — this grounds v3's "audio waveform comments" (use wavesurfer.js).
- **3D model review**: reviewers **rotate/zoom/change eye-level**; **measurement tools** for precise feedback on
  physical prototypes. **LATER** (matches v3's Online3DViewer/`<model-viewer>` plan).
- **Web / HTML / email** proofing; **prototype proofing** for **Figma / Adobe XD / Sketch**; plus video, images,
  PDF, Microsoft Office, Adobe CC files.

### A9.7 QuickReviewer
- **Live, interactive website proofing**: comment on **live URLs** and **zipped HTML**, incl. password-protected /
  basic-auth / staging sites and **WordPress / Shopify / Squarespace / Wix**; **HTML5 ads**, animated banners,
  responsive pages. **LATER** (web/interactive proofing is a strong differentiator once core review ships).

### A9.8 Proofing-tool synthesis (what *every* serious review tool has, that v3 under-specified)
1. **Per-medium comment anchoring**: timecode (video), region/point (image, PDF, web), **waveform/time-range (audio)**, 3D viewpoint.
2. **Review *stages* with sequencing choice**: sequential **or** parallel approvers per stage (not just "internal then client").
3. **Decisions are explicit + recorded**: Approve / Request-changes / Reject, captured to an **audit trail** with who/when.
4. **Internal-only vs shared comments** toggle.
5. **Version compare** with synced navigation.
6. **Deadlines + automated reminders** to reviewers.
7. **Guest reviewers without accounts** (link + optional passphrase).
8. **Proof/review templates** so the path is repeatable.
9. **Comment → task/subtask** so revisions are tracked, not lost.
10. **Electronic-signature sign-off** on the final decision for a compliant, attributable approval record *(Ziflow)*.
11. **Stalled-review escalation** — proactive alerts when an asset is stuck awaiting a reviewer *(Ziflow)*.
12. **Minor vs major version labels** alongside the auto-incrementing number *(Ziflow)*.

## A10. Airtable / Notion — the "single dataset, many views, build-your-own-screens" pattern

- **Airtable**: one table → **Grid / Kanban / Calendar / Gallery / Timeline / List / Gantt / Form** views, **no
  data duplication**; **Interface Designer** = drag-drop builder for dashboards, data-entry screens, and
  lightweight internal apps on the same data. **ADAPT** (our client portal = a purpose-built "interface" over the
  agency's data).
- **Notion**: database → Table / Board / Calendar / Timeline / Gallery, each with independent filter/sort.
- **CD lesson**: validates the "four views over one dataset" decision and points at a v2+ feature — **per-client
  custom interfaces** (a curated screen of just their projects/deliverables), which is the white-label portal.

---

# PART B — SYNTHESIZED REQUIREMENTS FOR CREATIVE DOCK

Each requirement is tagged with the source platform(s) it is adapted from, so nothing here is unattributed. These
**extend** v3's locked decisions; they do not replace them.

## B1. Workflow & pipeline engine  *(Odoo + Trello + ClickUp + monday)*
- Pipelines are **data, not code**: agency defines **ordered stages per project type**, each stage with flags:
  `requiresInternalApproval`, `requiresClientApproval`, `requiredFields[]`, `wipLimit?`, `isFolded` (collapse in
  board), `sequence`. *(Odoo stage folding/sequencing; ClickUp per-list custom statuses.)*
- **Board columns = stages**; moving a card sets stage and can fire automations / open an approval gate. *(Trello/Asana.)*
- **Stage-entry / stage-exit automation hooks** so rules can react to stage changes. *(monday recipes.)*

## B2. The four views over one dataset  *(Asana + monday + Airtable)*
- One deliverable/task dataset renders as **Board / List / Calendar / Timeline**, switchable with no setup; each
  view persists its own **filter / sort / group / visible-fields**, savable as a **named view tab**. *(Asana saved views.)*
- **List view** gets spreadsheet **roll-up columns** (count / sum / avg) per section. *(Asana.)*
- **Timeline/Gantt** shows dependencies and **auto-shifts dependents** when a predecessor moves; flags blockers. *(Asana/Odoo/monday.)*
- **Calendar** drag-to-reschedule updates due dates. *(Asana.)*
- **[CD decision]** Client surface defaults to a **stripped Board+List** only (Trello-simplicity); agency surface exposes all four + dashboards.

## B3. Work-management depth  *(Asana + ClickUp + monday + Odoo)*
- **Subtasks** (multi-level), **checklists** (with per-item assignee + due date), **per-item assignees**,
  **multiple assignees** allowed *(ClickUp)*, **priorities**, **recurring** deliverables.
- **Dependencies**: support at least **Finish-to-Start + Start-to-Start** with auto-reschedule; model the full
  four types in schema *(monday)*; show "blocked/blocking" badges *(Odoo/Asana)*.
- **Recurrence two ways**: time-driven (cron) **and** completion-driven (new instance on done) *(Odoo)*.
- **Multi-homing / cross-tagging**: a deliverable can surface in multiple projects/views without duplication *(Asana/Wrike)*.

## B4. Custom fields  *(Frame.io + Asana + ClickUp + monday)*
- v1 **built-in** fields: Content Type, Platform, Aspect Ratio, Campaign, Priority, plus **Status / Rating / Due**.
- Field **types to support in the engine now** (so user-defined fields slot in later): **text, number, single-select,
  multi-select, date, boolean/toggle, rating** *(Frame.io's exact type set)*; later **formula** and **mirror/lookup**
  *(monday/ClickUp)* for roll-ups.
- Fields are **groupable / filterable / sortable** in every view and usable as **automation conditions**.

## B5. Templates, blueprints & recurring generation  *(Asana bundles + Wrike blueprints + Odoo recurring)*
- **Project/Deliverable templates** with **dynamic roles** + **date offsets** (dates relative to project start). *(Asana.)*
- **Template packs ("Bundles")**: apply a set of **fields + stages + rules + task templates** across many projects
  at once and keep them synced. *(Asana Bundles — high-value for agency standardization.)*
- **RecurringSchedule** → worker auto-generates the month's deliverables for a retainer, with correct team/dates. *(Odoo + monday.)*

## B6. Automation — visual When→If→Then  *(Trello Butler + monday + Asana + Workfront)*
- **Command taxonomy (steal Trello's five):** background **Rules**, manual **Buttons** (card-level + board-level
  one-click), **Scheduled** commands, **Due-date** commands.
- **Triggers**: stage change, field set/cleared/equals/threshold/in-range, date-relative, version uploaded,
  approval decided, assignee changed, intake submitted.
- **Conditions/branching**: **And/Or + "Otherwise-if"** forks. *(Asana.)*
- **Actions**: move stage, set field, assign, notify (role/contentType-routed), create task/subtask from template,
  request approval, post comment, **send email/report**, **HTTP request (GET/POST/PUT)** escape hatch. *(Trello.)*
- **[CD decision]** Compile the visual builder to a `Rule(trigger, conditions[], actions[])` row executed by the
  worker off the Postgres event bus; expose a **recipe gallery** of prebuilt rules *(monday)*; note Asana's
  **per-project rule cap** as a sanity limit to prevent runaway automation.

## B7. Client intake  *(Asana branching forms + Wrike dynamic forms + monday WorkForms + Workfront request queues)*
- **Intake forms** with **branching/conditional fields** and **answer→field mapping** (answer populates title/
  due/custom field). *(Asana.)*
- Submission **auto-creates work and auto-configures it**: assignees, target project/stage, template/blueprint,
  initial approvals, reference uploads. *(Wrike dynamic request forms.)*
- Intake lands in a **Request Queue** view (triage lane), not just a loose task. *(Workfront.)*

## B8. Review & approval engine — THE WEDGE  *(Frame.io + Ziflow + Filestage + PageProof + Asana + ClickUp)*
- **Viewer registry by file type** *(v3)* with **per-medium comment anchoring**:
  - Video → **timecode + drawn annotation on frame** *(Frame.io)*.
  - Image → **point/region annotation** *(Frame.io/Annotorious)*.
  - PDF/doc → **region markup** *(Filestage/PDF.js)*.
  - Audio → **waveform / time-range comments stating timecode** *(PageProof → wavesurfer.js)*.
  - 3D → **rotate/zoom/eye-level + measurement** *(PageProof → Online3DViewer)* — LATER.
  - Web/HTML → **live-URL / zipped-HTML commenting** *(QuickReviewer)* — LATER.
- **Review stages with sequencing choice**: per pipeline, configure stages as **sequential or parallel**, each
  with **1..n approvers** and a **required** flag for multi-approver sign-off. *(Ziflow sequential/parallel — this
  upgrades v3's fixed "internal→client" into a configurable multi-stage routing engine.)*
- **Explicit decisions recorded to an audit trail**: **Approve / Request-changes / Reject** with who + when +
  feedback. *(Asana three-outcome + Ziflow audit trail.)*
- **Internal-only vs client-visible comments** toggle on every comment. *(Filestage team-only comments.)*
- **Comment → tracked subtask**: a requested change spawns an actionable subtask on the editor. *(Asana proofing /
  ClickUp assign-comment.)*
- **Comment attachments, @mentions, hashtags, emoji reactions, threads.** *(Frame.io.)*
- **Screen+voice "clip" comments** on a version. *(ClickUp Clips)* — ADAPT/LATER.
- **Deadlines + automated reminders** to assigned reviewers. *(Filestage/Ziflow.)*
- **Guest reviewers without accounts** via share link. *(Filestage/Vimeo.)*
- **Electronic-signature sign-off** captured on the final decision for an attributable, compliant approval record. *(Ziflow.)*
- **Stalled-review escalation**: if a stage sits unactioned past its SLA, fire a proactive alert (and optional reassign). *(Ziflow.)*

## B9. Versioning, compare & shares  *(Frame.io + Ziflow/Filestage)*
- **Version stacks**: auto-increment `versionNumber` + **labels/tags** carrying **minor/major** semantics (e.g., v1.0 → v1.1 minor, → v2.0 major); drag-to-stack; **@-version references**
  in comments/chat. *(Frame.io version stacks + Ziflow minor/major labels + v3.)*
- **Side-by-side compare with synced scrub** for video, synced zoom/pan for image. *(Frame.io comparison viewer.)*
- **Share links are a first-class model** (`Share`), not just a `visibility` flag: per-link **passphrase,
  expiration, allow-comment, allow-download, watermark (standard | forensic/DRM proxy-only), internal-vs-external
  default policy.** *(Frame.io shares — this is the agency↔client security boundary and was under-modeled in v3.)*

## B10. Collaboration / chat / presence  *(Liveblocks + Odoo Chatter + ClickUp)*
- **Per-record activity feed (Chatter-style)** on each deliverable/version unifying comments, status changes,
  approvals, uploads. *(Odoo Chatter.)*
- Full **chat**: project/sub-project channels + 1:1 DMs + threads, with **drag-a-version-into-chat to tag it**. *(v3.)*
- **Liveblocks** rooms per board + per review surface for **presence + live updates** (Figma feel). *(v3.)*

## B11. Notifications  *(v3 + Frame.io/monday routing)*
- Single pipeline: domain event → `Notification` row (in-app) + **Web Push** fan-out, routed by **role +
  contentType** (MOTION→motion editors/leads, STATIC→designers). *(v3.)*
- **Per-event reminder automations** (review due in 24h, approval pending N days). *(Ziflow/Filestage reminders.)*

## B12. My Work + Inbox  *(Asana)*
- **My Work**: cross-client assigned deliverables/tasks, grouped by due date, organizable into personal sections. *(Asana My Tasks.)*
- **Inbox**: unified mentions + approvals-to-give + changes-to-action + assignments. *(Asana Inbox.)*

## B13. Analytics  *(v3 + Odoo burndown + Asana workload/portfolio)*
- Turnaround (submit→approve), **revision rounds**, on-time/overdue %, team **workload/capacity**. *(v3.)*
- Add **burndown per project** *(Odoo)*, **portfolio health roll-up** across clients *(Asana portfolios)*,
  editable **dashboard cards** *(ClickUp/monday widgets)*.

## B14. Multi-tenancy & RBAC — implemented as Odoo's model  *(Odoo security)*
- **Global tenant rule** (`agencyId = ctx.agencyId`), **ANDed**, non-bypassable, in one composable guard layer.
- **Group/role rules ORed** for per-resource visibility (owner OR admin OR assigned member OR client-of-record).
- **Field-level groups** to hide INTERNAL-only fields/comments/versions from client users.
- **Additive CRUD access rights** per role per model (read/write/create/delete).
- **Super Admin** = sole principal exempt from the global rule; **every cross-tenant action audit-logged**;
  read-only "view-as" impersonation. *(v3 + Odoo company_id pattern.)*

---

# PART C — DOMAIN-MODEL DELTAS the research forces (vs v3 / v2 schema)

These are additions/changes the teardown justifies. (Baseline schema = `creative-dock-overview-v2.md` §2.2.)

1. **`CustomFieldDef` + `CustomFieldValue`** *(Frame.io/Asana/monday)* — even for "built-in" fields, model them as
   typed definitions (type ∈ text/number/select/multiselect/date/boolean/rating) + values, so user-defined fields
   slot in later with zero migration. Fields carry `groupable/filterable/sortable` and `visibility(INTERNAL|CLIENT)`.
2. **`SavedView`** *(Asana/Airtable)* — `{ scope, viewType(BOARD|LIST|CALENDAR|TIMELINE), filterJson, sortJson,
   groupBy, visibleFieldIds[], name }`.
3. **`ReviewStage` + `Approval` upgrade** *(Ziflow/Filestage)* — pipeline-configurable stages with
   `mode(SEQUENTIAL|PARALLEL)`, `approvers[]`, `requiredCount`, `order`; `Approval.decision ∈
   APPROVE|REQUEST_CHANGES|REJECT` with `decidedBy/at/feedback`; immutable audit rows.
4. **`Share`** *(Frame.io)* — `{ resourceRef, passphraseHash?, expiresAt?, allowComment, allowDownload,
   watermark(NONE|STANDARD|FORENSIC), audience(INTERNAL|CLIENT|GUEST), createdBy }`. Distinct from FileVersion.visibility.
5. **`Comment` extensions** *(PageProof/Frame.io/Filestage)* — add `mediaAnchor` (timecodeMs | region | waveformRange{startMs,endMs} | viewpoint3D | webSelector), `attachments[]`, `reactions[]`, keep `visibility` + `refVersionIds[]`.
6. **`Rule` / automation** *(Trello/monday/Asana)* — `{ kind(RULE|CARD_BUTTON|BOARD_BUTTON|SCHEDULED|DUE_DATE),
   trigger, conditions[](and/or + otherwise-if), actions[] }`; actions include `HTTP_REQUEST`. Worker-executed off the outbox.
7. **`IntakeForm` + `FormField` + `FormSubmission`** *(Asana/Wrike)* — fields with **branching rules** + **answer→
   field mapping** + **auto-provision config** (assignees/template/stage/approvals). Submissions enter a **request queue**.
8. **`TemplatePack`/Bundle** *(Asana Bundles)* — a syncable set of {fields, stages, rules, task templates} applied across projects.
9. **`Dependency`** *(monday)* — `{ fromId, toId, type(FS|SS|FF|SF) }` (not just a boolean blocks flag).
10. **`ActivityEvent`** *(Odoo Chatter)* — per-deliverable/version unified feed (comment/status/approval/upload), separate from chat `Message`.
11. **`Checklist` + `ChecklistItem`** *(ClickUp/Trello)* — items with assignee + due date, on Task/Deliverable.

---

# PART D — ROADMAP DELTAS (folded into v3's phases)

- **Phase 1 (Work core):** add **SavedView** model + per-view persisted filter/sort/group; **four dependency
  types** (at least FS+SS); **multi-homing**; **checklists w/ assignees**; **request-queue** intake landing.
- **Phase 2 (Review wedge):** elevate to **configurable sequential/parallel ReviewStages**; **three-outcome
  decisions + audit trail**; **internal-vs-client comment toggle**; **comment→subtask**; **waveform/audio**
  comments; **Share model** (passphrase/expiry/download/watermark); **comment attachments + reactions**.
  *(3D + web/HTML proofing = Phase 5.)*
- **Phase 3 (Collab/notify):** **Chatter-style activity feed** per record; reminder automations.
- **Phase 4 (Automation/templates/intake/analytics):** **five-command automation** (rules + buttons + scheduled
  + due-date) with **HTTP action** + **recipe gallery**; **Bundles/Template packs**; **dynamic intake forms**
  (branching + auto-provision); **burndown + portfolio roll-up** dashboards.
- **Phase 5 (Polish/scale):** **per-client custom interfaces** (Airtable Interface Designer pattern = white-label
  portal); **user-defined custom fields** (the `CustomFieldDef` engine is already there); **3D + live-web
  proofing**; **forensic watermarking**; **formula/mirror fields**.

---

# PART E — OPEN DECISIONS / RISKS (updated from v3)

1. **Review engine: build vs. integrate.** Workfront *integrates* Frame.io rather than rebuilding it. We're
   building the wedge ourselves — confirm we accept the cost of matching Ziflow/Frame.io review depth
   (per-medium anchoring + sequential/parallel stages + audit trail) as our core differentiator. *(Recommendation:
   yes — it's the wedge; but scope v1 to video+image+PDF+audio, defer 3D/web.)*
- 2. **Forensic watermarking** is enterprise-heavy (proxy-only downloads + latency tradeoff per Frame.io). Ship
   **standard watermark + passphrase + expiry + download toggle** in v1; forensic/DRM as Phase 5.
3. **Automation runaway.** Asana caps 50 rules/project for a reason. Set a per-pipeline rule cap + execution
   observability before opening the builder to agencies.
4. **Field engine now vs later.** Building `CustomFieldDef` typed-engine up front (even for "built-in" fields)
   costs more in Phase 1 but removes a painful migration when user-defined fields land. *(Recommendation: build the
   engine, expose only built-ins.)*
5. **Chat build vs Stream Chat** *(carried from v3)* — unchanged open item; decide before Phase 3.
6. **Inherited v3 risks** — Postgres host (Neon/Supabase/RDS), long-tail doc preview (Box vs kkFileView),
   transcode scale, iOS PWA push limits, Liveblocks/R2 cost modeling — all still open.

---

## Sources (research, 2026-06)

**Asana** — [Project features overview](https://www.richardsather.com/post/asana-project-features-overview) · [Project views](https://asana.com/features/project-management/project-views) · [Advanced plan](https://asana.com/plan/advanced) · [Giving feedback & approvals](https://help.asana.com/s/article/giving-feedback-and-approvals) · [Forms branching](https://asana.com/inside-asana/forms-branching-customization) · [Approvals feature](https://asana.com/inside-asana/new-approvals-feature) · [Rules / conditions & branching](https://help.asana.com/s/article/conditions-and-branching-in-rules)

**Odoo** — [Project features](https://www.odoo.com/app/project-features) · [Project docs (19.0)](https://www.odoo.com/documentation/19.0/applications/services/project.html) · [Security: access rights & record rules (19.0)](https://www.odoo.com/documentation/19.0/developer/reference/backend/security.html)

**Trello / Butler** — [Automation overview](https://support.atlassian.com/trello/docs/automation-overview/) · [Butler power-up](https://blog.trello.com/butler-power-up-trello-automation) · [Issuing HTTP requests](https://support.atlassian.com/trello/docs/issuing-http-requests/) · [Quotas & limits](https://support.atlassian.com/trello/docs/butler-quotas-and-limits/)

**Frame.io V4** — [V4 launch](https://blog.frame.io/2024/10/14/frame-io-v4-the-fully-reimagined-platform-is-now-available-for-all/) · [Metadata & Collections](https://blog.frame.io/2024/04/23/frame-io-v4-beta-metadata-collections/) · [PetaPixel V4 review](https://petapixel.com/2024/10/14/frame-io-v4-arrives-delivering-huge-cloud-workflow-improvements-for-photo-and-video/) · [Shares](https://help.frame.io/en/articles/9105232-shares-in-frame-io) · [Watermarking in V4](https://help.frame.io/en/articles/9948588-watermarking-in-v4) · [Content security](https://help.frame.io/en/articles/9859752-content-security)

**monday.com** — [Features overview](https://stackby.com/blog/monday-com-features/) · [Dependencies](https://support.monday.com/hc/en-us/articles/360007402599-Dependencies-on-monday-com)

**ClickUp** — [Product features](https://clickup.com/features) · [Customizable features/ClickApps](https://help.clickup.com/hc/en-us/articles/9559764679831-Customizable-ClickUp-features) · [Custom fields](https://help.clickup.com/hc/en-us/articles/6303536766231-Intro-to-Custom-Fields)

**Wrike** — [Approvals](https://www.wrike.com/features/approvals/) · [Dynamic request forms](https://help.wrike.com/hc/en-us/articles/115003404345-Dynamic-Request-Forms) · [Custom request forms](https://www.wrike.com/features/custom-request-forms/)

**Adobe Workfront** — [Work automation](https://business.adobe.com/products/workfront/work-automation.html) · [Fusion](https://business.adobe.com/products/workfront/integrations/fusion.html) · [Request queues guide (PDF)](https://cdn.experience.workfront.com/Training/Guides/Customer+Success+at+Scale/Adobe+Workfront+Learn+-+Using+Request+Queues+to+Manage+Intake+Processes+082124.pdf)

**Review / proofing tools** — [Ziflow product](https://www.ziflow.com/product) · [Ziflow automated workflow](https://www.ziflow.com/online-proofing-automated-workflow) · [Ziflow video review comparison](https://www.ziflow.com/blog/video-review-software) · [Filestage: online proofing](https://filestage.io/blog/online-proofing/) · [Filestage: what is online proofing](https://filestage.io/blog/what-is-online-proofing/) · [PageProof supported files](https://pageproof.com/learn/supported-files) · [PageProof video & audio](https://pageproof.com/learn/proofing-video-and-audio) · [PageProof: what is online proofing](https://blog.pageproof.com/what-is-online-proofing/) · [QuickReviewer website proofing](https://www.quickreviewer.com/website-proofing-software/)

**Airtable / Notion** — [Airtable Kanban views](https://support.airtable.com/docs/getting-started-with-airtable-kanban-views) · [Airtable views guide](https://www.softr.io/blog/airtable-views)
