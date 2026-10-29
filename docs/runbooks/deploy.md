# Deploying Creative Dock

Creative Dock runs on one Linux server with Docker: Postgres, Redis, the API, the media worker, the
web app, and Caddy in front (which gets the HTTPS certificate automatically). GitHub deploys to
it: every merge to `main` that passes CI is copied to the server and restarted by
`.github/workflows/deploy.yml`.

The app's secrets live only on the server, in `/opt/rexops/.env.production`. GitHub holds just
the three values it needs to reach the server.

## 1. Create the server

Any provider works (DigitalOcean, Hetzner, AWS Lightsail). Choose:

- **Ubuntu 24.04** (or 22.04), or **Oracle Linux 9** on Oracle Cloud
- **At least 2 GB RAM**; 4 GB is more comfortable for video processing
- **At least 40 GB disk**: uploaded videos live on this disk unless you set up Cloudflare R2
- Add your SSH key while creating it

Note the server's public IP address.

### Free option: Oracle Cloud "Always Free"

Oracle's free Arm server (2 CPUs, 12 GB RAM) runs Creative Dock at no cost. Setting it up differs from the
others in a few ways:

- **Choose your home region carefully at sign-up** (e.g. India West (Mumbai) or India South
  (Hyderabad)); free resources only exist there and it can't be changed later.
- **Create the instance** with image *Canonical Ubuntu 24.04*, shape *VM.Standard.A1.Flex* set
  to **2 OCPUs / 12 GB**, a boot volume of about 100 GB, and your SSH public key. If it reports
  "out of capacity", try another availability domain or try again later.
- **Open the web ports in the console:** Networking → Virtual cloud networks → your VCN →
  Security Lists → Default Security List → Add Ingress Rules: source `0.0.0.0/0`, TCP,
  destination port `80`; repeat for `443`. (The setup script opens them on the server itself.)
- **The login user is not `root`**: it is `ubuntu` on Ubuntu images and `opc` on Oracle Linux
  (Oracle's default image). Use it in place of `root` below, and as `DEPLOY_USER` in step 4.
  Either image works with the setup script.

Oracle may reclaim a free instance that stays nearly idle (under 20% CPU, network and memory
for 7 days). Upgrading the account to Pay As You Go removes that risk and still costs nothing
within the free limits.

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
ssh-copy-id -i rexops-deploy.pub root@SERVER_IP    # ubuntu@ or opc@SERVER_IP on Oracle
```

In GitHub, open the repo → **Settings → Secrets and variables → Actions → New repository
secret**, and add:

| Secret           | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| `DEPLOY_HOST`    | the server's IP address                                 |
| `DEPLOY_USER`    | `root`, or `ubuntu`/`opc` on Oracle (the user you set up with) |
| `DEPLOY_SSH_KEY` | the full contents of the **private** file `rexops-deploy` |

Then go to the **Actions** tab (enable workflows if GitHub asks), choose **Deploy**, and click
**Run workflow**. The first run builds everything and takes about 10–15 minutes; later ones
are quicker. When it finishes, `https://ops.yourdomain.com` shows the sign-in page.

## 5. Create your login (once)

Nobody can sign up from the website: accounts are created by an owner. Make the first one on
the server:

```sh
ssh root@SERVER_IP        # ubuntu@ or opc@SERVER_IP on Oracle
cd /opt/rexops
sudo docker compose --env-file .env.production -f docker-compose.prod.yml run --rm \
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

## Creative Dock landing page

The public early-access page lives in `landing/` and deploys with everything else. It runs on its
own subdomain (for example `dock.houseoftrex.com`) and keeps the requests people send in the
`rexops_rexops-landing` Docker volume.

Turn it on once:

1. **DNS:** add an A record for the subdomain pointing at this server. For houseoftrex.com that
   is in Wix → **Settings → Domains → houseoftrex.com → Manage DNS records → A (Host) → Add
   record**, with host name `dock` and the server's IP as the value.
2. **Settings:** on the server, add these to `/opt/rexops/.env.production`:

   ```sh
   LANDING_ADDRESS=dock.houseoftrex.com
   LANDING_ADMIN_USER=admin
   LANDING_ADMIN_PASSWORD=a-long-password-of-your-own
   ```

3. **Deploy:** merge to `main`, or run the **Deploy** workflow from the Actions tab. Caddy gets
   the HTTPS certificate for the subdomain on its own.

Then `https://dock.houseoftrex.com` shows the page and `https://dock.houseoftrex.com/admin`
shows the requests (sign in with the login above). The inbox lets you mark people as
contacted and download everything as a CSV.

**Email alerts (optional).** To get an email for every new request, add to
`/opt/rexops/.env.production`, then run the **Deploy** workflow:

```sh
RESEND_API_KEY=re_...                                  # already there if Creative Dock sends email
LANDING_NOTIFY_TO=you@houseoftrex.com,manas@houseoftrex.com
LANDING_NOTIFY_FROM=Creative Dock <dock@houseoftrex.com>   # a domain verified in Resend
```

Each email has the person's details and requirements, a button to the inbox, and replying to it
goes straight to them. Without a verified domain, leave `LANDING_NOTIFY_FROM` blank: Resend's
test sender then delivers only to the email address that owns the Resend account. If an alert
fails, the request is still saved; `logs --tail 50 landing` shows why.

To change the page, edit `landing/public/index.html` and merge. Saved requests are kept.

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
