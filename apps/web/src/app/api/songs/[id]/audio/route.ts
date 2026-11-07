import { getRequestContext, handleError, jsonError } from "@/server/api";
import { getServerConfig } from "@/server/env";
import { attachAudioFile } from "@/server/services/audio";
import { getStorage } from "@/server/storage";

/** Upload an audio file (multipart field `file`) and attach it to the song. */
export async function POST(req: Request, ctx: RouteContext<"/api/songs/[id]/audio">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "Missing file");
    const source = await attachAudioFile(db, getStorage(), {
      userId,
      songId: id,
      file,
      maxBytes: getServerConfig().maxUploadBytes,
    });
    return Response.json({ source }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
