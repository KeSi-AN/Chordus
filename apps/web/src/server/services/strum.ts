import { validatePattern } from "@chordus/core";
import { asc, desc, eq, isNull, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { strumPatterns, type StrumPattern } from "../db/schema";
import { ValidationError } from "./songs";

/** Built-in presets plus the user's own patterns. */
export async function listStrumPatterns(db: Db, userId: string): Promise<StrumPattern[]> {
  return db
    .select()
    .from(strumPatterns)
    .where(or(isNull(strumPatterns.userId), eq(strumPatterns.userId, userId)))
    .orderBy(
      desc(strumPatterns.isPreset),
      asc(strumPatterns.timeSignature),
      asc(strumPatterns.createdAt),
    );
}

export interface CreateStrumPatternInput {
  name: string;
  timeSignature: string;
  subdivision: 8 | 16;
  pattern: string;
}

export async function createStrumPattern(
  db: Db,
  userId: string,
  input: CreateStrumPatternInput,
): Promise<StrumPattern> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Name is required");
  const pattern = input.pattern.replace(/d/g, "D").replace(/u/g, "U").replace(/X/g, "x");
  const check = validatePattern({ ...input, pattern });
  if (!check.ok) throw new ValidationError(check.error ?? "Invalid pattern");
  const [row] = await db
    .insert(strumPatterns)
    .values({
      userId,
      name,
      timeSignature: input.timeSignature.replace(/\s+/g, ""),
      subdivision: input.subdivision,
      pattern,
      isPreset: false,
    })
    .returning();
  return row!;
}
