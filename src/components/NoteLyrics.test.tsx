import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NoteLyrics from "./NoteLyrics";

describe("음표별 가사 칸", () => {
  it("쉼표를 제외하고 음표마다 한 칸씩 만든다", () => {
    const markup = renderToStaticMarkup(<NoteLyrics meter={{ beats: 4, beatUnit: 4 }} measureIndex={0}
      notes={[
        { id: "a", pitch: 60, duration: { numerator: 1, denominator: 1 }, lyric: "봄" },
        { id: "rest", pitch: null, duration: { numerator: 1, denominator: 1 } },
        { id: "b", pitch: 64, duration: { numerator: 2, denominator: 1 } }
      ]} selectedNoteId="a" onChange={() => undefined} />);
    expect(markup.match(/data-testid="note-lyric-/g)).toHaveLength(2);
    expect(markup).toContain("value=\"봄\"");
    expect(markup).toContain("maxLength=\"1\"");
    expect(markup).toContain("lyric-note-selected");
  });
});
