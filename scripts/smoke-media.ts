const apiUrl = process.env.API_URL ?? "http://localhost:3000";
const sourcePath = process.argv[2] ?? ".data/smoke/rexops-smoke.mov";
const source = Bun.file(sourcePath);
if (!(await source.exists())) {
  throw new Error(`Smoke source does not exist: ${sourcePath}`);
}

async function json<T>(response: Response) {
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

const login = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "manas@trex.test",
    password: "rexops-demo",
  }),
});
if (!login.ok) throw new Error(`Login failed: ${login.status} ${await login.text()}`);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Login returned no session cookie.");

const authenticatedFetch = (path: string, init?: RequestInit) =>
  fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      cookie,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

const initiated = await json<{ sessionId: string; partCount: number }>(
  await authenticatedFetch("/api/file-versions/uploads/initiate", {
    method: "POST",
    body: JSON.stringify({
      deliverableId: "deliverable_beach_vibe",
      fileName: "rexops-smoke.mov",
      fileType: "video/quicktime",
      fileSizeBytes: source.size,
      label: `Local ffmpeg smoke ${new Date().toISOString()}`,
      tags: ["smoke", "local"],
    }),
  }),
);

const partNumbers = Array.from({ length: initiated.partCount }, (_, index) => index + 1);
const signed = await json<{ parts: Array<{ partNumber: number; url: string }> }>(
  await authenticatedFetch(`/api/file-versions/uploads/${initiated.sessionId}/parts`, {
    method: "POST",
    body: JSON.stringify({ partNumbers }),
  }),
);

const partSize = 10 * 1024 * 1024;
const completed = [];
for (const part of signed.parts) {
  const start = (part.partNumber - 1) * partSize;
  const response = await fetch(part.url, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: source.slice(start, Math.min(start + partSize, source.size)),
  });
  const body = (await response.json()) as { eTag: string };
  if (!response.ok || !body.eTag) throw new Error(`Part ${part.partNumber} failed.`);
  completed.push({ partNumber: part.partNumber, eTag: body.eTag });
}

const version = await json<{ id: string; versionNumber: number }>(
  await authenticatedFetch(`/api/file-versions/uploads/${initiated.sessionId}/complete`, {
    method: "POST",
    body: JSON.stringify({ parts: completed }),
  }),
);

let previewUrl = "";
for (let attempt = 0; attempt < 30; attempt += 1) {
  const response = await authenticatedFetch(`/api/file-versions/${version.id}/preview`);
  if (response.ok) {
    previewUrl = ((await response.json()) as { url: string }).url;
    break;
  }
  await Bun.sleep(500);
}
if (!previewUrl) throw new Error("Media worker did not produce a preview within 15 seconds.");

const preview = await fetch(previewUrl);
if (!preview.ok || preview.headers.get("content-type") !== "video/mp4") {
  throw new Error(`Generated preview was not readable: ${preview.status}`);
}
const previewBytes = (await preview.arrayBuffer()).byteLength;
if (previewBytes === 0) throw new Error("Generated preview was empty.");

console.log(
  JSON.stringify({
    ok: true,
    versionId: version.id,
    versionNumber: version.versionNumber,
    sourceBytes: source.size,
    previewBytes,
  }),
);
