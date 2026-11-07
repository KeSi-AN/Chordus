import { getRequestContext, handleError, jsonError } from "@/server/api";
import { getAudioSource, mimeTypeFor, parseRange } from "@/server/services/audio";
import { getStorage } from "@/server/storage";

/** Stream an uploaded audio file with HTTP Range support (needed for seeking). */
export async function GET(req: Request, ctx: RouteContext<"/api/sources/[id]/audio">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    const source = await getAudioSource(db, userId, id);
    const storage = getStorage();
    const stat = await storage.stat(source.filePath!);
    if (!stat) return jsonError(404, "Audio file is missing from storage");

    const headers = new Headers({
      "Content-Type": mimeTypeFor(source),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    });
    const range = parseRange(req.headers.get("range"), stat.size);
    if (range === "invalid") {
      headers.set("Content-Range", `bytes */${stat.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (range) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(storage.read(source.filePath!, range), { status: 206, headers });
    }
    headers.set("Content-Length", String(stat.size));
    return new Response(storage.read(source.filePath!), { status: 200, headers });
  } catch (err) {
    return handleError(err);
  }
}
