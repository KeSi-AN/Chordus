import { safeNextPath, TOKEN_COOKIE, tokenMatches } from "@/server/auth";
import { getServerConfig } from "@/server/env";

const YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Form post from /unlock: remember the access token in an HttpOnly cookie for this browser. */
export async function POST(req: Request) {
  const form = await req.formData();
  const next = safeNextPath(form.get("next"));
  const token = form.get("token");
  const expected = getServerConfig().apiToken;
  const redirect = (path: string, cookie?: string) => {
    const headers = new Headers({ Location: new URL(path, req.url).toString() });
    if (cookie) headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 303, headers });
  };
  if (!expected) return redirect(next);
  if (!(typeof token === "string" && tokenMatches(expected, token))) {
    return redirect(`/unlock?error=1&next=${encodeURIComponent(next)}`);
  }
  // Not `Secure`: on a home network the app is served over plain HTTP.
  return redirect(
    next,
    `${TOKEN_COOKIE}=${encodeURIComponent(expected)}; Path=/; Max-Age=${YEAR_SECONDS}; HttpOnly; SameSite=Lax`,
  );
}
