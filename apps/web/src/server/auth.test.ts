import { describe, expect, it } from "vitest";
import { isAuthorized, safeNextPath, tokenMatches } from "./auth";

const T = "s3cret-token-for-tests";

describe("isAuthorized", () => {
  it("lets everything through when no token is configured", () => {
    expect(isAuthorized(undefined, { authorization: null, cookie: undefined })).toBe(true);
  });

  it("accepts the token as a bearer header or as the cookie", () => {
    expect(isAuthorized(T, { authorization: `Bearer ${T}`, cookie: undefined })).toBe(true);
    expect(isAuthorized(T, { authorization: `bearer  ${T}`, cookie: undefined })).toBe(true);
    expect(isAuthorized(T, { authorization: null, cookie: T })).toBe(true);
  });

  it("refuses missing or wrong tokens", () => {
    expect(isAuthorized(T, { authorization: null, cookie: undefined })).toBe(false);
    expect(isAuthorized(T, { authorization: "Bearer nope", cookie: "nope" })).toBe(false);
    expect(isAuthorized(T, { authorization: T, cookie: undefined })).toBe(false); // no scheme
    expect(isAuthorized(T, { authorization: `Bearer ${T}x`, cookie: undefined })).toBe(false);
    expect(tokenMatches(T, "")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/songs/abc", "/songs/abc"],
    ["/?q=grace", "/?q=grace"],
    ["//evil.example", "/"],
    ["https://evil.example", "/"],
    ["/\\evil.example", "/"],
    [undefined, "/"],
    [["/a"], "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
