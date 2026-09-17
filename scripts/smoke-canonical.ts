const apiUrl = process.env.API_URL ?? "http://localhost:3000";
const sourcePath = process.argv[2] ?? ".data/smoke/rexops-smoke.mov";
const source = Bun.file(sourcePath);
if (!(await source.exists())) throw new Error(`Canonical smoke source is missing: ${sourcePath}`);

async function json<T>(response: Response) {
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function signIn(email: string) {
  const response = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "rexops-demo" }),
  });
  if (!response.ok) throw new Error(`Login failed for ${email}: ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`No session cookie for ${email}.`);
  return cookie;
}

function client(cookie: string) {
  return async <T>(path: string, init?: RequestInit) =>
    json<T>(
      await fetch(`${apiUrl}${path}`, {
        ...init,
        headers: {
          cookie,
          ...(init?.body ? { "content-type": "application/json" } : {}),
          ...init?.headers,
        },
      }),
    );
}

const [ownerCookie, editorCookie, clientCookie] = await Promise.all([
  signIn("manas@trex.test"),
  signIn("riya@trex.test"),
  signIn("sara@imperial.test"),
]);
const owner = client(ownerCookie);
const editor = client(editorCookie);
const clientOwner = client(clientCookie);

const deliverable = await owner<{ id: string }>("/api/deliverables", {
  method: "POST",
  body: JSON.stringify({
    projectId: "project_reels",
    title: `Canonical smoke ${new Date().toISOString()}`,
    contentType: "MOTION",
    priority: "HIGH",
    assignedToUserId: "user_riya",
  }),
});
await editor(`/api/deliverables/${deliverable.id}/transition`, {
  method: "POST",
  body: JSON.stringify({ to: "IN_PROGRESS" }),
});

async function uploadVersion(label: string) {
  const initiated = await editor<{ sessionId: string; partCount: number }>(
    "/api/file-versions/uploads/initiate",
    {
      method: "POST",
      body: JSON.stringify({
        deliverableId: deliverable.id,
        fileName: `${label.toLowerCase().replaceAll(" ", "-")}.mov`,
        fileType: "video/quicktime",
        fileSizeBytes: source.size,
        label,
        tags: ["canonical-smoke"],
      }),
    },
  );
  const partNumbers = Array.from({ length: initiated.partCount }, (_, index) => index + 1);
  const signed = await editor<{ parts: Array<{ partNumber: number; url: string }> }>(
    `/api/file-versions/uploads/${initiated.sessionId}/parts`,
    {
      method: "POST",
      body: JSON.stringify({ partNumbers }),
    },
  );
  const parts = [];
  for (const part of signed.parts) {
    const start = (part.partNumber - 1) * 10 * 1024 * 1024;
    const uploaded = await json<{ eTag: string }>(
      await fetch(part.url, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: source.slice(start, Math.min(start + 10 * 1024 * 1024, source.size)),
      }),
    );
    parts.push({ partNumber: part.partNumber, eTag: uploaded.eTag });
  }
  const version = await editor<{ id: string; versionNumber: number }>(
    `/api/file-versions/uploads/${initiated.sessionId}/complete`,
    { method: "POST", body: JSON.stringify({ parts }) },
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${apiUrl}/api/file-versions/${version.id}/preview`, {
      headers: { cookie: editorCookie },
    });
    if (response.ok) return version;
    await Bun.sleep(500);
  }
  throw new Error(`Preview did not appear for ${label}.`);
}

const v1 = await uploadVersion("V1");
const hiddenVersions = await clientOwner<unknown[]>(
  `/api/file-versions/deliverable/${deliverable.id}`,
);
if (hiddenVersions.length !== 0) throw new Error("Client saw v1 before promotion.");

await editor(`/api/reviews/deliverables/${deliverable.id}/submit-internal`, {
  method: "POST",
});
await owner(`/api/reviews/deliverables/${deliverable.id}/comments`, {
  method: "POST",
  body: JSON.stringify({
    fileVersionId: v1.id,
    message: "Internal note: verify the first frame.",
    visibility: "INTERNAL",
    anchorType: "TIMECODE",
    anchor: { milliseconds: 0 },
  }),
});
await owner(`/api/reviews/deliverables/${deliverable.id}/decisions`, {
  method: "POST",
  body: JSON.stringify({ fileVersionId: v1.id, decision: "APPROVE" }),
});
await owner(`/api/reviews/deliverables/${deliverable.id}/promote`, { method: "POST" });

const clientComments = await clientOwner<unknown[]>(
  `/api/reviews/deliverables/${deliverable.id}/comments`,
);
if (clientComments.length !== 0) throw new Error("Client saw an internal comment.");
await clientOwner(`/api/reviews/deliverables/${deliverable.id}/comments`, {
  method: "POST",
  body: JSON.stringify({
    fileVersionId: v1.id,
    message: "Please tighten the opening beat.",
    anchorType: "TIMECODE",
    anchor: { milliseconds: 12040 },
  }),
});
await clientOwner(`/api/reviews/deliverables/${deliverable.id}/decisions`, {
  method: "POST",
  body: JSON.stringify({
    fileVersionId: v1.id,
    decision: "REQUEST_CHANGES",
    feedback: "Please tighten the opening beat.",
  }),
});

const v2 = await uploadVersion("V2");
await editor(`/api/reviews/deliverables/${deliverable.id}/submit-internal`, {
  method: "POST",
});
await owner(`/api/reviews/deliverables/${deliverable.id}/decisions`, {
  method: "POST",
  body: JSON.stringify({ fileVersionId: v2.id, decision: "APPROVE" }),
});
await owner(`/api/reviews/deliverables/${deliverable.id}/promote`, { method: "POST" });
await clientOwner(`/api/reviews/deliverables/${deliverable.id}/decisions`, {
  method: "POST",
  body: JSON.stringify({
    fileVersionId: v2.id,
    decision: "APPROVE",
    eSignature: "Sara Imperial",
  }),
});
const delivered = await owner<{ status: string }>(
  `/api/deliverables/${deliverable.id}/transition`,
  { method: "POST", body: JSON.stringify({ to: "DELIVERED" }) },
);
if (delivered.status !== "DELIVERED") throw new Error("Deliverable did not reach DELIVERED.");

console.log(
  JSON.stringify({
    ok: true,
    deliverableId: deliverable.id,
    versions: [v1.versionNumber, v2.versionNumber],
    finalStatus: delivered.status,
    internalCommentHidden: true,
    prePromotionVersionHidden: true,
  }),
);
