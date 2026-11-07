import { describe, expect, it } from "vitest";
import { parseYouTubeVideoId, youTubeWatchUrl } from "./youtube";

const VID = "dQw4w9WgXcQ";

describe("parseYouTubeVideoId", () => {
  it.each([
    VID,
    `https://www.youtube.com/watch?v=${VID}`,
    `https://youtube.com/watch?feature=share&v=${VID}&t=42`,
    `https://m.youtube.com/watch?v=${VID}`,
    `https://youtu.be/${VID}?si=abc`,
    `https://www.youtube.com/shorts/${VID}`,
    `https://www.youtube.com/embed/${VID}`,
    `https://music.youtube.com/watch?v=${VID}&list=x`,
    `youtube.com/watch?v=${VID}`,
    `  ${VID}  `,
  ])("%s", (s) => {
    expect(parseYouTubeVideoId(s)).toBe(VID);
  });

  it.each([
    "",
    "hello",
    "https://vimeo.com/123",
    "https://youtube.com/watch?v=short",
    "https://youtube.com/",
  ])("rejects %j", (s) => {
    expect(parseYouTubeVideoId(s)).toBeNull();
  });

  it("builds watch URLs", () => {
    expect(youTubeWatchUrl(VID)).toBe(`https://www.youtube.com/watch?v=${VID}`);
  });
});
