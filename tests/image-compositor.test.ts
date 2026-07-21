import { describe, expect, it } from "vitest";
import { composePanelSvg } from "@maliang/image-compositor";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

describe("image compositor", () => {
  it("preserves exact dialogue locally and XML-escapes it", () => {
    const composed = composePanelSvg({
      artBytes: png,
      dialogue: [{
        speakerId: null,
        exactText: `Wait <here> & "listen"!`,
        source: { start: 0, end: 22, text: `Wait <here> & "listen"!` }
      }]
    }).toString("utf8");
    expect(composed).toContain("Wait &lt;here&gt; &amp;");
    expect(composed).toContain("&quot;listen&quot;!");
    expect(composed).not.toContain("<here>");
  });

  it("rejects unexpected model artifact types", () => {
    expect(() => composePanelSvg({
      artBytes: Buffer.from("not an image"),
      dialogue: []
    })).toThrow("INVALID_ARTIFACT");
  });
});
