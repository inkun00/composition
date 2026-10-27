import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MeasureHarmonyGuide from "./MeasureHarmonyGuide";
import type { NoteEvent } from "../music/types";

const meter = { beats: 4, beatUnit: 4 } as const;
const note = (id: string, pitch: number | null, beats = 1, accidental?: NoteEvent["accidental"]): NoteEvent => ({
  id, pitch, accidental, duration: { numerator: beats, denominator: 1 }
});

describe("MeasureHarmonyGuide", () => {
  it("음표가 선택되지 않았을 때 마디의 기본 화음과 어울리는 음을 표시한다", () => {
    const notes = [note("1", 60), note("2", 64)];
    const markup = renderToStaticMarkup(<MeasureHarmonyGuide chords={["C"]} notes={notes} meter={meter} selectedNote={null} />);

    expect(markup).toContain("C (1도 화음)");
    expect(markup).toContain("도");
    expect(markup).toContain("미");
    expect(markup).toContain("솔");
    expect(markup).toContain("음표를 누르면");
  });

  it("화음에 속하는 음표가 선택되면 일치 피드백을 제공한다", () => {
    const mi = note("mi", 64);
    const notes = [mi];
    const markup = renderToStaticMarkup(<MeasureHarmonyGuide chords={["C"]} notes={notes} meter={meter} selectedNote={mi} />);

    expect(markup).toContain("화음과 자연스럽게 어울려요");
    expect(markup).toContain("[미]");
  });

  it("화음 밖의 음표가 선택되면 어울리는 음으로의 변경 안내를 제공한다", () => {
    const fSharp = note("fSharp", 66, 1, "sharp");
    const notes = [fSharp];
    const markup = renderToStaticMarkup(<MeasureHarmonyGuide chords={["C"]} notes={notes} meter={meter} selectedNote={fSharp} />);

    expect(markup).toContain("화음 밖의 음이에요");
    expect(markup).toContain("[파♯]");
  });

  it("마디에 여러 화음이 있을 때 선택된 음표의 타이밍에 맞는 화음을 안내한다", () => {
    const sol = note("sol", 67, 2);
    const notes = [note("c1", 60, 2), sol];
    const markup = renderToStaticMarkup(<MeasureHarmonyGuide chords={["C", "G"]} notes={notes} meter={meter} selectedNote={sol} />);

    expect(markup).toContain("G (5도 화음)");
    expect(markup).toContain("솔");
    expect(markup).toContain("시");
    expect(markup).toContain("레");
    expect(markup).toContain("화음과 자연스럽게 어울려요");
  });
});

