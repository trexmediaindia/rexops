# Demo dataset

`packages/db/src/seed-demo.ts` fills a local database with T-Rex Media in every state the
domain models — each project status, each deliverable status, each file-version status,
review runs mid-flight and finished, approvals of every decision, plus tasks, checklists,
milestones, dependencies, channels, shares, automations, intake submissions, saved views,
upload sessions and audit log entries.

It exists for eyeballing and screenshotting the UI. It is **not** the canonical seed
(`packages/db/src/seed.ts`) that tests depend on — it wipes and rebuilds every row scoped
to `agency_trex`, so do not point it at anything you care about.

## Running it

```bash
bun --env-file=.env packages/db/src/seed-demo.ts
```

It is idempotent: it deletes the rows it owns and re-inserts them, so re-running is safe.
Two details worth knowing:

- `approval` rows carry a trigger making them immutable. The wipe lifts that trigger for
  the length of the delete and restores it immediately.
- `user_root` and `user_outsider` live outside the agency, so the wipe never touches them;
  the script only (re)sets their passwords.

## Media

The version previews point at `apps/web/public/demo/*`, served by the web dev server. The
base URL defaults to `http://localhost:5173/demo` and is overridable:

```bash
DEMO_MEDIA_BASE_URL=http://localhost:4173/demo bun --env-file=.env packages/db/src/seed-demo.ts
```

Regenerate the placeholder media with ImageMagick and ffmpeg if it is ever lost — stills
are flat gradients with a label, videos are one frame per second so the timecode on screen
matches the transport, and each video ships a poster frame and a 5-column sprite sheet.

## Accounts

Every account below uses the password `rexops-demo`.

| Email | Role | What they show |
| --- | --- | --- |
| `manas@trex.test` | Agency owner | Full permissions, internal approver |
| `arjun@trex.test` | Agency admin | Producer across most projects |
| `riya@trex.test` | Agency member (motion) | Assignee on the reels and launch films |
| `neha@trex.test` | Agency member (design) | Assignee on statics and boards |
| `dev@trex.test` | Agency member (photo) | Portrait set, internally approved |
| `tara@trex.test` | Agency member (account) | Client-facing, owns the share links |
| `vikram@trex.test` | Agency member (editor) | **Suspended** — sign-in returns 403 |
| `sara@imperial.test` | Client owner | Approves for Imperial, has signed an approval |
| `rahul@imperial.test` | Client member | Read-only side of the same client |
| `priya@nova.test` | Client owner | First approver on a parallel client stage |
| `karan@nova.test` | Client member | Second, optional approver on that stage |
| `meera@latitude.test` | Client owner | Inactive client |
| `root@rexops.test` | Super admin | `/admin/*` |
| `owner@outside.test` | Agency owner | Separate agency, for tenant-isolation checks |

## Coverage

- **Clients** — `ACTIVE` ×2, `INACTIVE`, `ARCHIVED`
- **Projects** — `DRAFT`, `ACTIVE`, `IN_PROGRESS`, `WAITING_FOR_CLIENT`, `COMPLETED`,
  `ARCHIVED`, plus a parent with two sub-projects
- **Deliverables** — all ten statuses
- **File versions** — all seven statuses, across image, video and PDF, with a
  major/minor pair on one deliverable
- **Review** — runs in `INTERNAL_REVIEW`, `INTERNAL_APPROVED`, `CLIENT_REVIEW`,
  `APPROVED` and `REJECTED`; stages `PENDING`, `ACTIVE`, `PASSED`, `REJECTED`, sequential
  and parallel; approvals of `APPROVE`, `REQUEST_CHANGES` and `REJECT`, one e-signed
- **Comments** — internal and client-visible, threaded, resolved and open, anchored by
  timecode and by region, with mentions and reactions
- **Everything else** — tasks in all four statuses, checklists, reached and pending
  milestones, dependencies, project and deliverable channels with unread state,
  notifications of most types across read/unread, automations of every rule kind
  enabled and disabled, intake submissions in all three statuses, saved views of all four
  view types, upload sessions in all five statuses, attachments, and audit log entries.
