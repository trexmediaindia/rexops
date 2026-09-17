import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, resolve, sep } from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { db, fileVersions } from "@rexops/db";
import type { MediaJobPayload } from "@rexops/jobs";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";

export type MediaPlan = {
  extension: ".mp4" | ".jpg" | ".png";
  contentType: "video/mp4" | "image/jpeg" | "image/png";
  arguments(input: string, output: string): string[];
};

export function mediaPlanForType(fileType: string | null): MediaPlan | null {
  if (fileType?.startsWith("video/")) {
    return {
      extension: ".mp4",
      contentType: "video/mp4",
      arguments: (input, output) => [
        "-y",
        "-i",
        input,
        "-vf",
        "scale='min(1280,iw)':-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output,
      ],
    };
  }
  if (fileType?.startsWith("image/")) {
    return {
      extension: ".jpg",
      contentType: "image/jpeg",
      arguments: (input, output) => [
        "-y",
        "-i",
        input,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(1280,iw)':-2",
        output,
      ],
    };
  }
  if (fileType?.startsWith("audio/")) {
    return {
      extension: ".png",
      contentType: "image/png",
      arguments: (input, output) => [
        "-y",
        "-i",
        input,
        "-filter_complex",
        "showwavespic=s=1280x240:colors=white",
        "-frames:v",
        "1",
        output,
      ],
    };
  }
  return null;
}

function safeLocalPath(baseDirectory: string, ...segments: string[]) {
  const base = resolve(baseDirectory);
  const path = resolve(base, ...segments);
  if (path !== base && !path.startsWith(`${base}${sep}`)) {
    throw new Error("Invalid media object path.");
  }
  return path;
}

function r2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function runFfmpeg(arguments_: string[]) {
  const process = Bun.spawn(["ffmpeg", ...arguments_], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`ffmpeg failed with exit code ${exitCode}: ${stderr.slice(-2000)}`);
  }
}

async function probeDurationMs(input: string) {
  const process = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      input,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stdout] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
  ]);
  if (exitCode !== 0) return null;
  const seconds = Number(stdout.trim());
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
}

export function spriteGeometry(durationMs: number) {
  const intervalMs = Math.max(1000, Math.min(5000, Math.round(durationMs / 60)));
  const cells = Math.max(1, Math.ceil(durationMs / intervalMs));
  const columns = Math.min(10, cells);
  return {
    intervalMs,
    columns,
    rows: Math.ceil(cells / columns),
    cellWidth: 240,
    cellHeight: 135,
  };
}

async function materializeSource(sourceKey: string, target: string) {
  const client = r2Client();
  if (!client) {
    return safeLocalPath(
      process.env.LOCAL_STORAGE_DIRECTORY ?? ".data/object-storage",
      "objects",
      sourceKey,
    );
  }
  const response = await client.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET ?? "rexops-media",
      Key: sourceKey,
    }),
  );
  if (!response.Body) throw new Error("R2 source object had no body.");
  await writeFile(target, await response.Body.transformToByteArray());
  return target;
}

async function publishPreview(key: string, sourcePath: string, contentType: string) {
  const client = r2Client();
  if (client) {
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET ?? "rexops-media",
        Key: key,
        Body: createReadStream(sourcePath),
        ContentType: contentType,
      }),
    );
    return;
  }
  const baseDirectory = process.env.LOCAL_STORAGE_DIRECTORY ?? ".data/object-storage";
  const target = safeLocalPath(baseDirectory, "objects", key);
  await mkdir(dirname(target), { recursive: true });
  await Bun.write(target, Bun.file(sourcePath));
  await writeFile(`${target}.metadata.json`, JSON.stringify({ contentType }), "utf8");
}

export async function processMedia(job: Job<MediaJobPayload>) {
  const [version] = await db
    .select()
    .from(fileVersions)
    .where(eq(fileVersions.id, job.data.fileVersionId))
    .limit(1);
  if (
    !version ||
    version.agencyId !== job.data.agencyId ||
    version.fileUrl !== job.data.sourceKey
  ) {
    return { generated: false, reason: "version-not-found" };
  }
  if (version.previewUrl) return { generated: false, reason: "preview-exists" };
  if (version.isSource) return { generated: false, reason: "companion-preview-required" };
  const plan = mediaPlanForType(version.fileType);
  if (!plan) {
    await db
      .update(fileVersions)
      .set({
        previewStatus: "FAILED",
        previewError: `Unsupported preview format: ${version.fileType ?? "unknown"}`,
      })
      .where(eq(fileVersions.id, version.id));
    return { generated: false, reason: "unsupported-media-type" };
  }

  const workspace = await mkdtemp(`${tmpdir()}/rexops-media-`);
  const sourceExtension = extname(version.fileName ?? "") || ".source";
  const temporarySource = resolve(workspace, `source${sourceExtension}`);
  const temporaryOutput = resolve(workspace, `preview${plan.extension}`);
  const previewKey = `derived/${version.agencyId}/${version.id}/preview${plan.extension}`;
  try {
    await db
      .update(fileVersions)
      .set({ previewStatus: "PROCESSING", previewError: null })
      .where(eq(fileVersions.id, version.id));
    const source = await materializeSource(job.data.sourceKey, temporarySource);
    await runFfmpeg(plan.arguments(source, temporaryOutput));
    await publishPreview(previewKey, temporaryOutput, plan.contentType);
    const derived: Partial<typeof fileVersions.$inferInsert> = {};
    if (version.fileType?.startsWith("image/")) {
      derived.posterFrameUrl = previewKey;
    } else if (version.fileType?.startsWith("video/")) {
      const durationMs = await probeDurationMs(temporaryOutput);
      if (durationMs) {
        const posterPath = resolve(workspace, "poster.jpg");
        const posterKey = `derived/${version.agencyId}/${version.id}/poster.jpg`;
        try {
          await runFfmpeg([
            "-y",
            "-ss",
            String((durationMs * 0.1) / 1000),
            "-i",
            temporaryOutput,
            "-frames:v",
            "1",
            "-vf",
            "scale=640:-2",
            posterPath,
          ]);
          await publishPreview(posterKey, posterPath, "image/jpeg");
          derived.posterFrameUrl = posterKey;
        } catch {
          // Poster generation is non-blocking; the review proxy remains usable.
        }
        derived.durationMs = durationMs;
        if (durationMs >= 4000) {
          const geometry = spriteGeometry(durationMs);
          const spritePath = resolve(workspace, "sprite.jpg");
          const spriteKey = `derived/${version.agencyId}/${version.id}/sprite.jpg`;
          try {
            await runFfmpeg([
              "-y",
              "-i",
              temporaryOutput,
              "-vf",
              `fps=1/${geometry.intervalMs / 1000},scale=${geometry.cellWidth}:${geometry.cellHeight}:force_original_aspect_ratio=decrease,pad=${geometry.cellWidth}:${geometry.cellHeight}:(ow-iw)/2:(oh-ih)/2,tile=${geometry.columns}x${geometry.rows}`,
              "-frames:v",
              "1",
              spritePath,
            ]);
            await publishPreview(spriteKey, spritePath, "image/jpeg");
            Object.assign(derived, {
              thumbnailSpriteUrl: spriteKey,
              spriteIntervalMs: geometry.intervalMs,
              spriteColumns: geometry.columns,
              spriteRows: geometry.rows,
              spriteCellWidth: geometry.cellWidth,
              spriteCellHeight: geometry.cellHeight,
            });
          } catch {
            // Sprite generation is an enhancement and must not fail the proxy job.
          }
        }
      }
    }
    await db
      .update(fileVersions)
      .set({
        previewUrl: previewKey,
        previewStatus: "READY",
        previewError: null,
        previewGeneratedAt: new Date(),
        ...derived,
      })
      .where(eq(fileVersions.id, version.id));
    return { generated: true, previewKey };
  } catch (error) {
    await db
      .update(fileVersions)
      .set({
        previewStatus: "FAILED",
        previewError:
          error instanceof Error ? error.message.slice(0, 4000) : "Preview generation failed.",
      })
      .where(eq(fileVersions.id, version.id));
    throw error;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
