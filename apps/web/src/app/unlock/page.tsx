import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNextPath } from "@/server/auth";
import { getServerConfig } from "@/server/env";

export const metadata: Metadata = { title: "Unlock" };

/** Asks for CHORDUS_API_TOKEN once per browser; /api/unlock stores it in a cookie. */
export default async function UnlockPage({ searchParams }: PageProps<"/unlock">) {
  await connection();
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (!getServerConfig().apiToken) redirect(next);
  return (
    <form method="post" action="/api/unlock" className="mx-auto max-w-sm space-y-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Unlock Chordus</h1>
      <p className="text-sm text-muted-foreground">
        This server has an access token (<code>CHORDUS_API_TOKEN</code> in <code>.env</code>). Enter
        it once on this device.
      </p>
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="token">Access token</Label>
        <Input id="token" name="token" type="password" autoComplete="current-password" autoFocus />
      </div>
      {params.error && (
        <p role="alert" className="text-sm text-destructive">
          That token isn&apos;t right.
        </p>
      )}
      <Button type="submit">Unlock</Button>
    </form>
  );
}
