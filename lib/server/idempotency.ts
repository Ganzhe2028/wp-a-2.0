import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const REPLAY_WINDOW_MS = 15 * 60 * 1000;

export interface IdempotencyContext {
  eventId: string;
  actorUserId: string;
  scope: string;
  keyHash: string;
  requestHash: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key, item]) => key !== "idempotencyKey" && item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("IDEMPOTENCY_SECRET_MISSING");
  return createHash("sha256").update(`owk-idempotency-v1\0${secret}`).digest();
}

function encryptResult(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptResult<T>(value: string): T {
  const [ivValue, tagValue, encryptedValue, ...extra] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue || extra.length) throw new Error("IDEMPOTENCY_RESULT_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted) as T;
}

export function createIdempotencyContext(input: {
  request: Request;
  body: unknown;
  eventId: string;
  actorUserId: string;
  scope: string;
}): IdempotencyContext {
  const bodyKey = input.body && typeof input.body === "object" && !Array.isArray(input.body)
    ? (input.body as Record<string, unknown>).idempotencyKey
    : undefined;
  const key = (input.request.headers.get("idempotency-key") || (typeof bodyKey === "string" ? bodyKey : "")).trim();
  if (!key || key.length > 200 || !input.scope || input.scope.length > 120) throw new Error("IDEMPOTENCY_KEY_INVALID");
  return {
    eventId: input.eventId,
    actorUserId: input.actorUserId,
    scope: input.scope,
    keyHash: sha256(key),
    requestHash: sha256(JSON.stringify(canonicalize(input.body))),
  };
}

function uniqueWhere(context: IdempotencyContext) {
  return {
    eventId_actorUserId_scope_keyHash: {
      eventId: context.eventId,
      actorUserId: context.actorUserId,
      scope: context.scope,
      keyHash: context.keyHash,
    },
  };
}

export async function readIdempotentResult<T>(tx: Prisma.TransactionClient, context: IdempotencyContext): Promise<T | null> {
  const record = await tx.idempotencyRecord.findUnique({ where: uniqueWhere(context) });
  if (!record) return null;
  if (record.requestHash !== context.requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
  if (record.expiresAt <= new Date()) throw new Error("IDEMPOTENCY_EXPIRED");
  return decryptResult<T>(record.responseCiphertext);
}

export async function saveIdempotentResult(
  tx: Prisma.TransactionClient,
  context: IdempotencyContext,
  result: unknown,
): Promise<void> {
  await tx.idempotencyRecord.create({
    data: {
      ...context,
      responseCiphertext: encryptResult(result),
      expiresAt: new Date(Date.now() + REPLAY_WINDOW_MS),
    },
  });
}

export async function readCommittedIdempotentResult<T>(context: IdempotencyContext): Promise<T | null> {
  const record = await prisma.idempotencyRecord.findUnique({ where: uniqueWhere(context) });
  if (!record || record.requestHash !== context.requestHash || record.expiresAt <= new Date()) return null;
  return decryptResult<T>(record.responseCiphertext);
}

export function isIdempotencyRace(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034");
}

export async function runIdempotentTransaction<T>(
  context: IdempotencyContext,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ data: T; replayed: boolean }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const replay = await readIdempotentResult<T>(tx, context);
      if (replay !== null) return { data: replay, replayed: true };
      const data = await operation(tx);
      await saveIdempotentResult(tx, context, data);
      return { data, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isIdempotencyRace(error)) {
      const replay = await readCommittedIdempotentResult<T>(context);
      if (replay !== null) return { data: replay, replayed: true };
    }
    throw error;
  }
}
