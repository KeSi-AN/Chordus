import { getRequestContext, handleError, parseJson, strumPatternSchema } from "@/server/api";
import { createStrumPattern, listStrumPatterns } from "@/server/services/strum";

export async function GET() {
  try {
    const { db, userId } = await getRequestContext();
    return Response.json({ patterns: await listStrumPatterns(db, userId) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await getRequestContext();
    const input = await parseJson(req, strumPatternSchema);
    return Response.json({ pattern: await createStrumPattern(db, userId, input) }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
