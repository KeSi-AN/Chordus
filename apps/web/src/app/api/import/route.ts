import { z } from "zod";
import {
  getRequestContext,
  handleError,
  jsonError,
  oversizedUpload,
  parseJson,
  vocalistHintSchema,
} from "@/server/api";
import { getServerConfig } from "@/server/env";
import { importFromFile, importFromYouTube } from "@/server/services/analysis";
import { getStorage } from "@/server/storage";

const youtubeSchema = z.object({
  youtubeUrl: z.string().min(1).max(500),
  title: z.string().max(200).optional(),
  artist: z.string().max(200).optional(),
  vocalistHint: vocalistHintSchema.optional(),
});

/**
 * New song from audio. JSON `{ youtubeUrl, title?, artist? }` or multipart with `file`
 * (+ optional `title`, `artist`, `vocalistHint`). Queues an analysis job either way.
 */
export async function POST(req: Request) {
  try {
    const { db, userId } = await getRequestContext();
    const type = req.headers.get("content-type") ?? "";
    if (type.includes("multipart/form-data")) {
      const maxBytes = getServerConfig().maxUploadBytes;
      const tooLarge = oversizedUpload(req, maxBytes);
      if (tooLarge) return tooLarge;
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonError(400, "Missing file");
      const text = (k: string) => {
        const v = form.get(k);
        return typeof v === "string" && v.trim() ? v.trim() : undefined;
      };
      const hint = vocalistHintSchema.safeParse(text("vocalistHint"));
      const result = await importFromFile(db, getStorage(), {
        userId,
        file,
        maxBytes,
        title: text("title"),
        artist: text("artist"),
        vocalistHint: hint.success ? hint.data : undefined,
      });
      return Response.json(result, { status: 201 });
    }
    const input = await parseJson(req, youtubeSchema);
    const result = await importFromYouTube(db, { userId, url: input.youtubeUrl, ...input });
    return Response.json(result, { status: result.existing ? 200 : 201 });
  } catch (err) {
    return handleError(err);
  }
}
