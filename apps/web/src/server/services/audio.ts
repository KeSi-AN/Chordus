import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { sources, songs, type Source } from "../db/schema";
import type { Storage } from "../storage";
import { logEvent } from "./events";
import { getSongDetail, NotFoundError, ValidationError } from "./songs";

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
};

function extensionFor(type: string, filename: string): string | null {
  const byType = AUDIO_EXTENSIONS[type.toLowerCase()];
  if (byType) return byType;
  const m = /\.(mp3|m4a|aac|wav|ogg|oga|webm|flac)$/i.exec(filename);
  return m ? `.${m[1]!.toLowerCase()}` : null;
}

export interface AttachAudioInput {
  userId: string;
  songId: string;
  file: File;
  maxBytes: number;
}

/** Store an uploaded audio file and record it as a `file` source on the song. */
export async function attachAudioFile(
  db: Db,
  storage: Storage,
  input: AttachAudioInput,
): Promise<Source> {
  await getSongDetail(db, input.userId, input.songId);
  const { file } = input;
  if (file.size === 0) throw new ValidationError("The file is empty");
  if (file.size > input.maxBytes) {
    throw new ValidationError(`File is larger than ${Math.round(input.maxBytes / 1024 / 1024)} MB`);
  }
  const ext = extensionFor(file.type, file.name);
  if (!ext) throw new ValidationError("Unsupported file type. Use MP3, M4A, WAV, OGG or FLAC.");

  const id = crypto.randomUUID();
  const key = `audio/${input.songId}/${id}${ext}`;
  await storage.put(key, file.stream());
  await db.insert(sources).values({
    id,
    songId: input.songId,
    kind: "file",
    filePath: key,
    originalFilename: file.name.slice(0, 255),
    mimeType: file.type || null,
  });
  await logEvent(db, {
    userId: input.userId,
    songId: input.songId,
    type: "audio_attached",
    payload: { sourceId: id, filename: file.name, size: file.size },
  });
  const [row] = await db.select().from(sources).where(eq(sources.id, id));
  return row!;
}

/** Look up an audio source and confirm it belongs to the user's song. */
export async function getAudioSource(db: Db, userId: string, sourceId: string): Promise<Source> {
  const [row] = await db
    .select({ source: sources })
    .from(sources)
    .innerJoin(songs, eq(songs.id, sources.songId))
    .where(and(eq(sources.id, sourceId), eq(songs.userId, userId)));
  if (!row?.source.filePath) throw new NotFoundError("Audio");
  return row.source;
}

export function mimeTypeFor(source: Source): string {
  if (source.mimeType) return source.mimeType;
  const ext = source.filePath?.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    webm: "audio/webm",
    flac: "audio/flac",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}

/** Parse a single `Range: bytes=a-b` header against a known size. */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}
