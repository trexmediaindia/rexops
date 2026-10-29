# Creative Dock landing page

The public early-access page for Creative Dock, served on its own subdomain (for example
`dock.houseoftrex.com`) next to the app.

- `public/index.html` is the page: the motion scenes from the teaser and the request form.
- `server.js` serves the page, saves requests to `/data/requests.jsonl`, and runs the inbox at
  `/admin` (username and password from `LANDING_ADMIN_USER` / `LANDING_ADMIN_PASSWORD`). It has
  no dependencies and runs on plain Node 20+.

It deploys with the rest of RexOps: `docker/Dockerfile.landing` builds it, the `landing` service in
`docker-compose.prod.yml` runs it, and Caddy routes `LANDING_ADDRESS` to it. Setup steps are in
`docs/runbooks/deploy.md` under "Creative Dock landing page".

Run it locally:

```sh
DATA_DIR=.data/landing ADMIN_PASSWORD=dev PORT=3100 node landing/server.js
# open http://localhost:3100 and http://localhost:3100/admin (admin / dev)
```
