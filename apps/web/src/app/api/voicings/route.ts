import { lookupVoicings } from "@/server/voicings";

/** `GET /api/voicings?chords=G,C,D/F#` → guitar voicings for each chord. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("chords") ?? "";
  const chords = raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 64);
  return Response.json(
    { voicings: lookupVoicings(chords) },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
