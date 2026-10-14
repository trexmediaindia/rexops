# Deploying RexOps

RexOps runs on one Linux server with Docker: Postgres, Redis, the API, the media worker, the
web app, and Caddy in front (which gets the HTTPS certificate automatically). GitHub deploys to
it: every merge to `main` that passes CI is copied to the server and restarted by
`.github/workflows/deploy.yml`.

The app's secrets live only on the server, in `/opt/rexops/.env.production`. GitHub holds just
the three values it needs to reach the server.

## 1. Create the server

Any provider works (DigitalOcean, Hetzner, AWS Lightsail). Choose:

- **Ubuntu 24.04** (or 22.04)
- **At least 2 GB RAM**; 4 GB is more comfortable for video processing
- **At least 40 GB disk**: uploaded videos live on this disk unless you set up Cloudflare R2
- Add your SSH key while creating it

Note the server's public IP address.

## 2. Point your subdomain at it

In your domain's DNS settings, add an **A record**:

| Type | Name  | Value             |
| ---- | ----- | ----------------- |
| A    | `ops` | the server's IP   |

That makes `ops.yourdomain.com` reach the server. It can take a few minutes to take effect.

## 3. Prepare the server (once)

SSH in and run the setup script with your subdomain:

```sh
ssh root@SERVER_IP
curl -fsSLO https://raw.githubusercontent.com/trexmediaindia/rexops/main/scripts/server-setup.sh
sudo bash server-setup.sh ops.yourdomain.com
```

It installs Docker, opens ports 22/80/443, adds swap, and writes
`/opt/rexops/.env.production` with freshly generated secrets. Re-running it never overwrites
that file. (If the repo is private, copy `scripts/server-setup.sh` to the server with `scp`
instead of `curl`.)

## 4. Let GitHub deploy to the server

Create a key just for deploys, on your own computer:

```sh
ssh-keygen -t ed25519 -f rexops-deploy -N "" -C "github-deploy"
ssh-copy-id -i rexops-deploy.pub root@SERVER_IP
```

In GitHub, open the repo → **Settings → Secrets and variables → Actions → New repository
secret**, and add:

| Secret           | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| `DEPLOY_HOST`    | the server's IP address                                 |
| `DEPLOY_USER`    | `root` (or the user you ran the setup script as)        |
| `DEPLOY_SSH_KEY` | the full contents of the **private** file `rexops-deploy` |

Then go to the **Actions** tab (enable workflows if GitHub asks), choose **Deploy**, and click
**Run workflow**. The first run builds everything and takes about 10–15 minutes; later ones
are quicker. When it finishes, `https://ops.yourdomain.com` shows the sign-in page.

## 5. Create your login (once)

Nobody can sign up from the website: accounts are created by an owner. Make the first one on
the server:

```sh
ssh root@SERVER_IP
cd /opt/rexops
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm \
  -e AGENCY_NAME="T-Rex Media" \
  -e OWNER_NAME="Your Name" \
  -e OWNER_EMAIL="you@yourdomain.com" \
  -e OWNER_PASSWORD="a long password of your own" \
  api bun packages/db/src/bootstrap.ts
```

Sign in with that email and password. From inside the app:

- **Team → Invite** adds colleagues.
- **Clients → People** gives someone at a client company a portal login. "Can approve" people
  give the final sign-off; "View and comment" people cannot approve.

Both show a temporary password once, for you to pass on. Nothing is emailed.

## Day to day

- **Ship a change:** merge it into `main`. CI runs, then Deploy runs automatically.
- **See what's running:** `docker compose --env-file .env.production -f docker-compose.prod.yml ps`
- **Read logs:** same command with `logs --tail 100 api` (or `worker`, `caddy`).
- **Back up the database:**
  `docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres pg_dump -U rexops rexops > backup.sql`
  Uploaded media is in the `rexops_rexops-media` Docker volume. Turning on your provider's
  server backups covers both.

## Optional services

Everything works without these. Each needs **your own** account; add the values to
`/opt/rexops/.env.production`, then run the Deploy workflow again.

| Feature                                  | Settings                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Inbox, chat, live "who's viewing"        | `LIVEBLOCKS_SECRET_KEY`, then `FEATURE_COLLABORATION_LIVE=true`          |
| Browser push notifications               | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `VITE_VAPID_PUBLIC_KEY` |
| Media on Cloudflare R2 instead of disk   | the `R2_*` values                                                        |
| Error reports                            | `SENTRY_DSN`, `VITE_SENTRY_DSN`                                          |
| Work views, automation, analytics        | `FEATURE_WORK_VIEWS`, `FEATURE_AUTOMATION`, `FEATURE_ANALYTICS` (unreleased; try them first) |
