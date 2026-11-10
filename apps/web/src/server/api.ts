import { z } from "zod";
import { getDb } from "./db/client";
import { DEFAULT_USER_ID } from "./constants";
import { NotFoundError, ValidationError } from "./services/songs";
import type { Db } from "./db/client";

export interface RequestContext {
  db: Db;
  userId: string;
}

/**
 * The current user. Single-user for now; when hosting, this is where Auth.js / the extension
 * API token gets checked (plan section 9).
 */
export async function getRequestContext(): Promise<RequestContext> {
  return { db: await getDb(), userId: DEFAULT_USER_ID };
}

export function jsonError(status: number, error: string, details?: unknown): Response {
  return Response.json({ error, ...(details ? { details } : {}) }, { status });
}

/**
 * Refuse an upload by its declared size, before reading it. `req.formData()` buffers the whole
 * body in memory, so without this a file of any size is read in full only to be rejected by
 * the size check that follows.
 */
export function oversizedUpload(req: Request, maxBytes: number): Response | null {
  const declared = Number(req.headers.get("content-length"));
  // The multipart envelope and the other form fields add a little to the file's own size.
  const allowance = 1024 * 1024;
  if (!Number.isFinite(declared) || declared <= maxBytes + allowance) return null;
  return jsonError(413, `File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
}

/** Map service errors to HTTP responses so route handlers stay small. */
export function handleError(err: unknown): Response {
  if (err instanceof NotFoundError) return jsonError(404, err.message);
  if (err instanceof ValidationError) return jsonError(400, err.message);
  if (err instanceof z.ZodError) {
    return jsonError(400, "Invalid request", z.flattenError(err));
  }
  console.error(err);
  return jsonError(500, "Something went wrong");
}

/** Parse a JSON body against a schema (throws ZodError / ValidationError). */
export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Body must be JSON");
  }
  return schema.parse(body);
}

export const vocalistHintSchema = z.enum(["male", "female", "unknown"]);

export const createSongSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().max(200).optional(),
  sheetText: z.string().min(1).max(200_000),
  key: z.string().max(10).nullish(),
  timeSignature: z.string().max(10).nullish(),
  bpm: z.number().positive().max(400).nullish(),
  vocalistHint: vocalistHintSchema.optional(),
});

export const updateSongSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  artist: z.string().max(200).optional(),
  originalKey: z.string().max(10).nullable().optional(),
  timeSignature: z.string().max(10).optional(),
  bpm: z.number().positive().max(400).nullable().optional(),
  vocalistHint: vocalistHintSchema.optional(),
});

export const sheetSchema = z.object({ text: z.string().min(1).max(200_000) });

export const confirmSchema = z.object({
  transposeSemitones: z.number().int().min(-24).max(24),
  audioPitchSemitones: z.number().int().min(-12).max(12),
  pitchLinked: z.boolean(),
  capoFret: z.number().int().min(0).max(12),
  strumPatternId: z.string().max(100).nullable(),
});

export const rejectSchema = z.object({
  field: z.enum(["transpose", "audioPitch", "capo", "strum"]),
  suggestedValue: z.union([z.number(), z.string(), z.null()]),
  source: z.string().max(50),
  replacedWith: z.union([z.number(), z.string(), z.null()]).optional(),
});

export const clientEventSchema = z.object({
  type: z.enum([
    "search",
    "open_song",
    "play",
    "transpose_change",
    "pitch_change",
    "capo_change",
    "strum_change",
  ]),
  songId: z.string().max(100).nullish(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const strumPatternSchema = z.object({
  name: z.string().min(1).max(80),
  timeSignature: z.string().max(10),
  subdivision: z.union([z.literal(8), z.literal(16)]),
  pattern: z.string().min(1).max(64),
});
