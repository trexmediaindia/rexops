# Local development

1. Install Bun 1.3.5+, Docker, and Docker Compose.
2. Run `bun run setup`.
3. Run `bun run dev`.
4. Open `http://localhost:5173`.

The canonical seed creates T-Rex Media, Imperial Living, June Content Retainer, Reels, and Beach Vibe Reel.

Demo credentials use password `rexops-demo`:

- `manas@trex.test` — agency owner
- `riya@trex.test` — motion editor
- `sara@imperial.test` — client owner

Health probes:

- API liveness: `GET http://localhost:3000/healthz`
- API readiness: `GET http://localhost:3000/readyz`

Before a pull request, run `bun run check && bun run test && bun run build`.

For end-to-end verification, run `bun run smoke:media` and `bun run smoke:canonical` while the API and ffmpeg
worker are running. The canonical smoke drives v1 → revision → v2 → signed approval → delivery and asserts the
internal/client trust boundary.
