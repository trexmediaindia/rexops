const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/** Asks the API for a short-lived link to an attachment and opens it. */
export async function downloadAttachment(attachmentId: string) {
  const response = await fetch(`${apiUrl}/api/attachments/${attachmentId}/download`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("That file could not be opened.");
  const { url } = (await response.json()) as { url: string };
  window.open(url, "_blank", "noopener,noreferrer");
}
