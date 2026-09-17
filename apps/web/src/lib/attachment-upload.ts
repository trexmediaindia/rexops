import { batches, concurrentMap, partBounds, partNumbersForSize } from "./multipart-upload";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function json<T>(path: string, body: unknown) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? `Attachment upload failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

async function uploadParts(
  file: File,
  partSizeBytes: number,
  sign: (partNumbers: number[]) => Promise<Array<{ partNumber: number; url: string }>>,
) {
  const signed: Array<{ partNumber: number; url: string }> = [];
  for (const group of batches(partNumbersForSize(file.size, partSizeBytes), 100)) {
    signed.push(...(await sign(group)));
  }
  return concurrentMap(signed, 3, async (part) => {
    const bounds = partBounds(part.partNumber, file.size, partSizeBytes);
    const response = await fetch(part.url, {
      method: "PUT",
      body: file.slice(bounds.start, bounds.end),
      headers: { "content-type": "application/octet-stream" },
    });
    if (!response.ok) throw new Error(`Attachment part ${part.partNumber} failed.`);
    const body = (await response.json().catch(() => null)) as { eTag?: string } | null;
    const eTag = response.headers.get("etag") ?? body?.eTag;
    if (!eTag) throw new Error("Attachment upload returned no integrity tag.");
    return { partNumber: part.partNumber, eTag };
  });
}

export async function uploadAttachment(file: File) {
  const initiated = await json<{ attachmentId: string; partSizeBytes: number }>(
    "/api/attachments/initiate",
    {
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSizeBytes: file.size,
    },
  );
  const parts = await uploadParts(file, initiated.partSizeBytes, async (partNumbers) => {
    const signed = await json<{ parts: Array<{ partNumber: number; url: string }> }>(
      `/api/attachments/${initiated.attachmentId}/parts`,
      { partNumbers },
    );
    return signed.parts;
  });
  await json(`/api/attachments/${initiated.attachmentId}/complete`, { parts });
  return initiated.attachmentId;
}

export async function uploadGuestAttachment(
  token: string,
  passphrase: string,
  guestName: string,
  file: File,
) {
  const initiated = await json<{ attachmentId: string; partSizeBytes: number }>(
    `/api/public/shares/${token}/attachments`,
    {
      passphrase: passphrase || undefined,
      guestName,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSizeBytes: file.size,
    },
  );
  const parts = await uploadParts(file, initiated.partSizeBytes, async (partNumbers) => {
    const signed = await json<{ parts: Array<{ partNumber: number; url: string }> }>(
      `/api/public/shares/${token}/attachments/${initiated.attachmentId}/parts`,
      { passphrase: passphrase || undefined, guestName, partNumbers },
    );
    return signed.parts;
  });
  await json(`/api/public/shares/${token}/attachments/${initiated.attachmentId}/complete`, {
    passphrase: passphrase || undefined,
    guestName,
    parts,
  });
  return initiated.attachmentId;
}
