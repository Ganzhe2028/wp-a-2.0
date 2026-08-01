import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";

let s3: S3Client | null = null;

function getS3(): S3Client {
  if (!s3) {
    const required = [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
      "R2_PUBLIC_BASE_URL",
    ];
    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Missing environment variable: ${key}`);
      }
    }

    const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    s3 = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3;
}

export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
  contentLength?: number,
): Promise<string> {
  if (process.env.LOCAL_UPLOAD_DIR) {
    return `/api/local-upload?key=${encodeURIComponent(key)}`;
  }
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    ContentType: contentType,
    ...(contentLength !== undefined && { ContentLength: contentLength }),
  });

  return getSignedUrl(getS3(), command, { expiresIn: 300 });
}

export function getPublicUrl(key: string): string {
  if (process.env.LOCAL_UPLOAD_DIR) {
    return `/api/local-upload?key=${encodeURIComponent(key)}`;
  }
  const base = process.env.R2_PUBLIC_BASE_URL!.replace(/\/$/, "");
  return `${base}/${key}`;
}

export function getThumbnailUrl(key: string): string {
  if (process.env.LOCAL_UPLOAD_DIR || !key.startsWith("processed/")) return getPublicUrl(key);
  return getPublicUrl(`_derived/${key}.thumb.webp`);
}

export function getKeyFromPublicUrl(url: string): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base || !url.startsWith(`${base}/`)) return null;
  return url.slice(base.length + 1).split("?")[0] || null;
}

export async function deleteFromR2(key: string): Promise<void> {
  if (process.env.LOCAL_UPLOAD_DIR) {
    await unlink(path.join(process.env.LOCAL_UPLOAD_DIR, key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }
  const command = new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
  });
  await getS3().send(command);
}

export async function headR2Object(key: string): Promise<{ contentType?: string; contentLength?: number }> {
  if (process.env.LOCAL_UPLOAD_DIR) {
    return {};
  }
  const result = await getS3().send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }));
  return { contentType: result.ContentType, contentLength: result.ContentLength };
}

export async function readR2Object(key: string, maxBytes: number): Promise<{ bytes: Buffer; contentType?: string }> {
  if (process.env.LOCAL_UPLOAD_DIR) {
    const bytes = await readFile(path.join(process.env.LOCAL_UPLOAD_DIR, key));
    if (bytes.length > maxBytes) throw new Error("OBJECT_TOO_LARGE");
    return { bytes };
  }
  const result = await getS3().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }));
  if (!result.Body) throw new Error("OBJECT_BODY_MISSING");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of result.Body as unknown as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error("OBJECT_TOO_LARGE");
    chunks.push(buffer);
  }
  return { bytes: Buffer.concat(chunks), contentType: result.ContentType };
}
