import { describe, expect, it } from "vitest";
import { oversizedUpload } from "./api";

const MB = 1024 * 1024;
const upload = (length: string | null) =>
  new Request("http://localhost/api/import", {
    method: "POST",
    headers: length === null ? {} : { "content-length": length },
  });

describe("oversizedUpload", () => {
  it("lets through uploads within the limit, allowing for the multipart envelope", () => {
    expect(oversizedUpload(upload(String(50 * MB)), 100 * MB)).toBeNull();
    expect(oversizedUpload(upload(String(100 * MB + 2000)), 100 * MB)).toBeNull();
  });

  it("refuses a body that is declared too large, without reading it", async () => {
    const res = oversizedUpload(upload(String(500 * MB)), 100 * MB);
    expect(res?.status).toBe(413);
    expect(await res?.json()).toEqual({ error: "File is larger than 100 MB" });
  });

  it("leaves a request without a usable length to the check on the file itself", () => {
    expect(oversizedUpload(upload(null), 100 * MB)).toBeNull();
    expect(oversizedUpload(upload("not-a-number"), 100 * MB)).toBeNull();
  });
});
