# 00 — Product Overview

> The "why" and the "what." Read this before anything else. Every later doc assumes the vocabulary,
> personas, and scope boundaries defined here.

---

## 1. Vision

RexOps is the **operating system for creative agencies**. An agency should be able to answer, at any moment and
without a meeting:

- Which client has pending work? Which project is delayed?
- Which deliverable is waiting for client approval? Which has revisions?
- Which file version was approved, and what feedback was given on which version?
- Who uploaded what? What's pending on *our* side vs the *client's* side?

The product is **simple for clients and powerful for agencies** — the same dataset rendered through two
opinionated surfaces.

## 2. The problem

Creative work is scattered across WhatsApp, Google Drive, email, calls, and untracked revisions. Generic tools
(Trello, Notion, Asana, Drive) don't model the real creative loop:

```
brief → project → deliverables → upload → internal review → client review
      → approve / request changes → revised version → final approval → delivery
```

Feedback gets lost between versions. Nobody can prove which cut was signed off. The agency↔client boundary is
enforced by hope, not software.

## 3. Positioning — what we borrow, and the wedge

RexOps is deliberately a synthesis of four proven models, plus one thing it does better than all of them:

| Borrowed from | What we take |
|---|---|
| **Odoo** | Customizable pipelines + **true row-level access control** (record rules + field-level visibility) → our multi-tenancy blueprint |
| **Asana** | One dataset, many views (Board/List/Calendar/Timeline) + intake forms + work-depth (subtasks, dependencies, templates) |
| **Trello** | Ruthless client-surface simplicity + **legible** automation (manual buttons, not just background rules) |
| **Frame.io** | **Frame-accurate review** — timecode-anchored comments, version stacks, share governance |

**The wedge = the review & approval engine.** This is the one thing RexOps must do better than a project tool
and at least as well as a dedicated proofing tool (Ziflow / Filestage / PageProof). Concretely:

- Per-medium comment anchoring: **video timecode**, **image region**, **PDF markup**, **audio waveform/time-range**.
- Configurable **sequential *or* parallel** review stages (not just "internal then client").
- Three explicit, audited outcomes: **Approve / Request changes / Reject**.
- The agency↔client trust boundary: clients **never** see internal versions, comments, notes, or other clients.
- A first-class **Share** model (passphrase, expiry, download/comment toggles, watermark) for guest review.

If RexOps wins, it wins because the review room is the best place a client has ever given feedback, and the best
place an agency has ever tracked it.

## 4. Core hierarchy

```
Platform
└── Agency  (tenant root — everything is scoped by agencyId)        ← Super Admin sees ALL agencies
    ├── Members          agency staff: owner / admin / member(+specialty)
    ├── Clients          the client ORGANIZATION (a first-class entity, not a loose user)
    │   └── Client Users client owner + review-only team (e.g. community manager)
    └── Projects
        └── Sub-projects (optional, 1 level; teams assigned here)
            └── Deliverables                (contentType: MOTION | STATIC | OTHER)
                └── File Versions           (v1, v2… auto-incremented, labels + tags)
                    ├── Reviews / Approvals (internal chain → client)
                    └── Comments            (threaded; per-medium anchored; @-reference versions)
```

Example (the canonical demo dataset, used in seeds and tests):

```
Agency:  T-Rex Media
Client:  Imperial Living
Project: June Content Retainer  (Social Media Retainer)
  Deliverables: Beach Vibe Reel, Room Tour Reel, Static Post, Founder Video
    Beach Vibe Reel: v1 (changes requested) → v2 (approved)
```

## 5. Personas & roles

Canonical role enum (used verbatim everywhere — see 02 §Enums):
`SUPER_ADMIN · AGENCY_OWNER · AGENCY_ADMIN · AGENCY_MEMBER · CLIENT_OWNER · CLIENT_MEMBER`

| Role | Who | Can | Cannot |
|---|---|---|---|
| **SUPER_ADMIN** | Platform operator (you) | God mode across all agencies; provision agencies; read-only "view-as" impersonation. **Every cross-tenant action audit-logged.** `agencyId = null`. | — (the only principal exempt from the tenant rule) |
| **AGENCY_OWNER** | Agency principal | Full control of *one* agency: members, clients, projects, settings, billing-later. | Cross into other agencies |
| **AGENCY_ADMIN** | Head of agency / ops lead | Manage members/clients/projects; usually the **internal approver** in the chain. | Delete the agency |
| **AGENCY_MEMBER** | Editor, motion, designer, PM, photographer, account | See *assigned* projects/sub-projects; upload versions; comment; respond to revisions. Carries a `specialty` (drives notification routing) + granular permission flags. | See unrelated clients/projects, manage team/settings, unless granted |
| **CLIENT_OWNER** | Client primary contact | View *their* projects/deliverables; approve; request changes; comment; upload references; invite their own team. **Final approval authority by default.** | See internal versions/comments/notes, other clients, agency internals |
| **CLIENT_MEMBER** | Client team (e.g. community manager) | **Review-only by default**: view + comment + request changes. `canApprove` off unless owner/agency enables it. | Approve (unless granted), see internal data |

> RBAC is **coarse role enum + fine-grained permission flags** (`canApprove`, `canInviteClients`, `canManageTeam`,
> `canUploadFinal`, `canViewAllClients`). This avoids enum explosion and matches the "custom team permissions"
> future requirement. See 03 §Capability matrix for the full grid.

## 6. The two surfaces

- **Agency surface — powerful.** Sidebar nav, data tables, four views over the work dataset, dashboards
  (pending internal reviews, waiting-on-client, revisions, deadlines, per-client roll-up, team workload),
  command palette, the full review room.
- **Client surface — ruthlessly simple.** Answers exactly three questions: *What needs my review? What did I
  approve? What's new?* No project-management chrome. A stripped board/list + the review surface.

Same data, two skins. (See 04 for the UI realization.)

## 7. Scope & non-goals

### In scope for v1 (Blocks 1–7)
Multi-tenant foundation; auth + RBAC + tenant isolation; agency/client/project/sub-project/deliverable
management; file upload + versioning; the review & approval wedge (video + image + PDF + audio); internal
approval chain; client review/revision loop; comments/annotations; in-app + Web Push notifications; activity
feed + real-time chat; the four views + saved views; custom-field engine (built-ins exposed); automation;
intake forms; templates; analytics; observability.

### Explicitly deferred (designed-for, not built)
| Deferred | Until | Why kept in mind now |
|---|---|---|
| **Billing / invoicing / payments / finance** | post-v1 | Schema stays additive so a finance module slots in without rework |
| **Self-serve agency signup** | Block 8 | v1 is single-agency dogfood (Super-Admin provisions). Multi-tenant arch already supports it |
| **AI features** | post-v1 | No AI in the core loop yet |
| **Native mobile apps** | post-v1 | PWA (installable, Web Push) covers mobile in v1 |
| **Email / WhatsApp notification channels** | post-v1 | Notification model is channel-agnostic; in-app + push first |
| **3D model + live-web/HTML proofing** | Block 8 | Viewer registry is extensible; video/image/PDF/audio first |
| **Forensic/DRM watermarking** | Block 8 | Standard watermark + passphrase + expiry + download toggle ship earlier |
| **User-defined custom fields** | Block 8 | The typed `CustomFieldDef` engine is built in Block 1/5; only built-ins exposed at first |

### Hard non-goals
Not a generic PM tool (the creative review loop is the point). Not a DAM. Not a storage product (R2 is plumbing).
Not a marketing-site builder (the existing Next.js pitch deck stays separate).

## 8. What "v1 done" means (north-star acceptance)

1. Super-Admin provisions T-Rex Media + its members and clients.
2. Agency creates a project → sub-project → deliverables, assigns a team by specialty.
3. Editor uploads v1 (multi-GB video, resumable) → it's INTERNAL only.
4. Internal approver (head of agency) approves → version is promoted to the client.
5. Client opens the **review room**, leaves a timecode-anchored comment, requests changes.
6. Editor sees the change as a tracked subtask, uploads v2.
7. Client approves v2 with an audited decision; agency is notified (in-app + push).
8. At no point can the client see internal versions/comments or any other client's data; id-guessing returns 404.
9. The whole team sees live presence/activity; the agency dashboard reflects reality without a refresh.

If a stranger can run `bun run setup` and reproduce that loop locally in under ten minutes, v1 is real.

## 9. Glossary (canonical terms — use verbatim)

| Term | Meaning |
|---|---|
| **Agency** | The tenant root. Everything is scoped by `agencyId`. |
| **Client** | A client *organization* belonging to one agency (first-class entity). |
| **Client User** | A person who logs in on the client side (`CLIENT_OWNER`/`CLIENT_MEMBER`). |
| **Member** | Agency staff user. |
| **Specialty** | An agency member's craft (EDITOR/MOTION/DESIGNER/…). Routes notifications. |
| **Project / Sub-project** | A body of work for a client; sub-project is one optional nesting level. |
| **Deliverable** | A single reviewable output (a reel, a post, a video). Has a `contentType`. |
| **File Version** | An immutable iteration of a deliverable (v1, v2…). Carries label + tags. |
| **Review / Approval** | A recorded decision (Approve/Request-changes/Reject) on a version at a stage. |
| **Review Stage** | A configurable approval gate; sequential or parallel; 1..n approvers. |
| **Internal approval chain** | Agency-internal review (editor → head of agency) before client sees anything. |
| **Promote to client** | The moment an internally-approved version becomes visible to the client. |
| **Share** | A governed link (passphrase/expiry/watermark/toggles) for guest/client review. |
| **The wedge** | The review & approval engine — our core differentiator. |
| **Seam** | An architectural interface Block 1 lays down and a later block fills (01 §Seams). |
| **Block** | A self-contained build unit, one per Claude session (05). |
| **Trust boundary** | The rule that clients never see internal/other-tenant data. |
