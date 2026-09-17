import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, open, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type CompletedUploadPart = {
  partNumber: number;
  eTag: string;
};

export type MultipartUpload = {
  uploadId: string;
  key: string;
};

export interface ObjectStorage {
  initiate(key: string, contentType: string): Promise<MultipartUpload>;
  signPart(upload: MultipartUpload, partNumber: number): Promise<string>;
  listParts(upload: MultipartUpload): Promise<CompletedUploadPart[]>;
  complete(upload: MultipartUpload, parts: CompletedUploadPart[]): Promise<void>;
  abort(upload: MultipartUpload): Promise<void>;
  signDownload(key: string): Promise<string>;
}

export class DevelopmentObjectStorage implements ObjectStorage {
  readonly #baseDirectory: string;
  readonly #baseUrl: string;
  readonly #signingSecret: string;

  constructor(options?: { baseDirectory?: string; baseUrl?: string; signingSecret?: string }) {
    this.#baseDirectory = resolve(
      options?.baseDirectory ?? process.env.LOCAL_STORAGE_DIRECTORY ?? ".data/object-storage",
    );
    this.#baseUrl = (options?.baseUrl ?? process.env.API_URL ?? "http://localhost:3000").replace(
      /\/$/,
      "",
    );
    this.#signingSecret =
      options?.signingSecret ??
      process.env.LOCAL_STORAGE_SIGNING_SECRET ??
      process.env.BETTER_AUTH_SECRET ??
      "rexops-local-development-only";
  }

  #safePath(...segments: string[]) {
    const path = resolve(this.#baseDirectory, ...segments);
    if (path !== this.#baseDirectory && !path.startsWith(`${this.#baseDirectory}${sep}`)) {
      throw new Error("Invalid local object storage path.");
    }
    return path;
  }

  #capability(resource: string, expiresAt: number) {
    return createHmac("sha256", this.#signingSecret)
      .update(`${resource}:${expiresAt}`)
      .digest("hex");
  }

  verifyCapability(resource: string, expiresAt: number, token: string) {
    if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
    const expected = this.#capability(resource, expiresAt);
    const provided = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    return provided.length === expectedBuffer.length && timingSafeEqual(provided, expectedBuffer);
  }

  async initiate(key: string, contentType: string): Promise<MultipartUpload> {
    const upload = { uploadId: crypto.randomUUID(), key };
    const directory = this.#safePath("multipart", upload.uploadId);
    await mkdir(directory, { recursive: true });
    await writeFile(
      this.#safePath("multipart", upload.uploadId, "metadata.json"),
      JSON.stringify({ key, contentType }),
      "utf8",
    );
    return upload;
  }

  async signPart(upload: MultipartUpload, partNumber: number) {
    const resource = `upload:${upload.uploadId}:${partNumber}`;
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = this.#capability(resource, expiresAt);
    return `${this.#baseUrl}/api/dev-uploads/${upload.uploadId}/parts/${partNumber}?expires=${expiresAt}&token=${token}`;
  }

  async writePart(uploadId: string, partNumber: number, bytes: ArrayBuffer) {
    const metadata = await this.#readUploadMetadata(uploadId);
    const part = Buffer.from(bytes);
    await writeFile(this.#safePath("multipart", uploadId, `${partNumber}.part`), part);
    return {
      eTag: createHash("sha256").update(part).digest("hex"),
      key: metadata.key,
      bytes: part.byteLength,
    };
  }

  async listParts(upload: MultipartUpload) {
    const directory = this.#safePath("multipart", upload.uploadId);
    const entries = await readdir(directory).catch(() => []);
    const parts: CompletedUploadPart[] = [];
    for (const entry of entries) {
      const match = /^(\d+)\.part$/.exec(entry);
      if (!match) continue;
      const partNumber = Number(match[1]);
      const path = this.#safePath("multipart", upload.uploadId, entry);
      const bytes = await readFile(path);
      const size = await stat(path);
      if (size.size === 0) continue;
      parts.push({
        partNumber,
        eTag: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    return parts.sort((left, right) => left.partNumber - right.partNumber);
  }

  async complete(upload: MultipartUpload, parts: CompletedUploadPart[]) {
    const metadata = await this.#readUploadMetadata(upload.uploadId);
    if (metadata.key !== upload.key) throw new Error("Upload object key mismatch.");
    const objectPath = this.#safePath("objects", upload.key);
    await mkdir(dirname(objectPath), { recursive: true });
    const output = await open(objectPath, "w");
    try {
      for (const part of [...parts].sort((left, right) => left.partNumber - right.partNumber)) {
        const partPath = this.#safePath("multipart", upload.uploadId, `${part.partNumber}.part`);
        const bytes = await readFile(partPath);
        const actualETag = createHash("sha256").update(bytes).digest("hex");
        if (part.eTag.replaceAll('"', "") !== actualETag) {
          throw new Error(`Upload part ${part.partNumber} failed integrity validation.`);
        }
        await output.write(bytes);
      }
    } finally {
      await output.close();
    }
    await writeFile(
      `${objectPath}.metadata.json`,
      JSON.stringify({ contentType: metadata.contentType }),
      "utf8",
    );
    await this.abort(upload);
  }

  async abort(upload: MultipartUpload) {
    await rm(this.#safePath("multipart", upload.uploadId), { recursive: true, force: true });
  }

  async signDownload(key: string) {
    const resource = `download:${key}`;
    const expiresAt = Math.floor(Date.now() / 1000) + 900;
    const token = this.#capability(resource, expiresAt);
    return `${this.#baseUrl}/api/dev-uploads/object?key=${encodeURIComponent(key)}&expires=${expiresAt}&token=${token}`;
  }

  async readObject(key: string) {
    const objectPath = this.#safePath("objects", key);
    const metadata = JSON.parse(await readFile(`${objectPath}.metadata.json`, "utf8")) as {
      contentType: string;
    };
    return {
      file: Bun.file(objectPath),
      contentType: metadata.contentType,
    };
  }

  async #readUploadMetadata(uploadId: string) {
    return JSON.parse(
      await readFile(this.#safePath("multipart", uploadId, "metadata.json"), "utf8"),
    ) as { key: string; contentType: string };
  }
}

export class R2ObjectStorage implements ObjectStorage {
  readonly #client: S3Client;

  constructor(
    private readonly bucket: string,
    options: {
      endpoint: string;
      accessKeyId: string;
      secretAccessKey: string;
    },
  ) {
    this.#client = new S3Client({
      region: "auto",
      endpoint: options.endpoint,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async initiate(key: string, contentType: string): Promise<MultipartUpload> {
    const result = await this.#client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!result.UploadId) throw new Error("R2 did not return a multipart upload id.");
    return { uploadId: result.UploadId, key };
  }

  signPart(upload: MultipartUpload, partNumber: number) {
    return getSignedUrl(
      this.#client,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 3600 },
    );
  }

  async listParts(upload: MultipartUpload) {
    const result = await this.#client.send(
      new ListPartsCommand({
        Bucket: this.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
      }),
    );
    return (result.Parts ?? [])
      .filter((part) => part.PartNumber && part.ETag)
      .map((part) => ({ partNumber: part.PartNumber as number, eTag: part.ETag as string }));
  }

  async complete(upload: MultipartUpload, parts: CompletedUploadPart[]) {
    await this.#client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
        MultipartUpload: {
          Parts: parts
            .sort((left, right) => left.partNumber - right.partNumber)
            .map((part) => ({ ETag: part.eTag, PartNumber: part.partNumber })),
        },
      }),
    );
  }

  async abort(upload: MultipartUpload) {
    await this.#client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
      }),
    );
  }

  signDownload(key: string) {
    return getSignedUrl(this.#client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 900,
    });
  }
}

export function createObjectStorage(): ObjectStorage {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (endpoint && accessKeyId && secretAccessKey) {
    return new R2ObjectStorage(process.env.R2_BUCKET ?? "rexops-media", {
      endpoint,
      accessKeyId,
      secretAccessKey,
    });
  }
  return new DevelopmentObjectStorage();
}

export const objectStorage = createObjectStorage();
