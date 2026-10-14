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
worker are running. Both read a sample video from `.data/smoke/rexops-smoke.mov`, which is not committed;
create one with:

```sh
mkdir -p .data/smoke && ffmpeg -f lavfi -i testsrc2=size=1280x720:rate=25 -f lavfi -i sine=frequency=440 \
  -t 6 -c:v libx264 -pix_fmt yuv420p -c:a aac .data/smoke/rexops-smoke.mov
```

Live presence (cursors, who's viewing) needs `LIVEBLOCKS_SECRET_KEY`. Without it the app runs normally and the
browser console notes once per room that live presence is off. The canonical smoke drives v1 → revision → v2 → signed approval → delivery and asserts the
internal/client trust boundary.
