import { describe, expect, it } from "vitest";
import { resolveThumbnail, thumbnailForSource } from "./thumbnail";

const BASE = "https://proj.supabase.co/";

describe("resolveThumbnail", () => {
  it("prefixes a stored path with the Supabase URL and keeps full links", () => {
    expect(resolveThumbnail("/storage/v1/object/public/thumbnails/instagram/Abc_12.jpg", BASE)).toBe(
      "https://proj.supabase.co/storage/v1/object/public/thumbnails/instagram/Abc_12.jpg",
    );
    expect(resolveThumbnail("https://i.ytimg.com/vi/eR1i6g4zoQ0/hqdefault.jpg", BASE)).toBe("https://i.ytimg.com/vi/eR1i6g4zoQ0/hqdefault.jpg");
    expect(resolveThumbnail(null, BASE)).toBeNull();
  });
});

describe("thumbnailForSource", () => {
  it("builds the same paths as run_thumbnail", () => {
    expect(thumbnailForSource("https://www.instagram.com/reel/DfYi19kRNT0/?igsh=x", BASE)).toBe(
      "https://proj.supabase.co/storage/v1/object/public/thumbnails/instagram/DfYi19kRNT0.jpg",
    );
    expect(thumbnailForSource("upload:cccccccc-0000-0000-0000-000000000002", BASE)).toBe(
      "https://proj.supabase.co/storage/v1/object/public/thumbnails/upload/cccccccc-0000-0000-0000-000000000002.jpg",
    );
    expect(thumbnailForSource("https://www.youtube.com/shorts/eR1i6g4zoQ0", BASE)).toBe("https://i.ytimg.com/vi/eR1i6g4zoQ0/hqdefault.jpg");
    expect(thumbnailForSource("", BASE)).toBeNull();
  });
});
