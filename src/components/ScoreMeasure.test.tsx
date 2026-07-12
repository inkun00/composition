import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ScoreMeasure from "./ScoreMeasure";

const notes = [
  { id: "note-a", pitch: 60, duration: { numerator: 1, denominator: 1 } },
  { id: "note-b", pitch: 64, duration: { numerator: 1, denominator: 1 } }
];

describe("ScoreMeasure VexFlow 좌표 오버레이", () => {
  it("현재 연주되는 음표만 재생 클래스를 가진다", () => {
    const markup = renderToStaticMarkup(<ScoreMeasure notes={notes} playingNoteId="note-b" />);
    expect(markup.match(/note-playing/g)).toHaveLength(1);
  });

  it("같은 높이로 이어진 음은 붙임줄로 표시한다", () => {
    const markup = renderToStaticMarkup(<ScoreMeasure notes={[
      { id: "a", pitch: 60, duration: { numerator: 1, denominator: 1 }, linkToNext: true },
      { id: "b", pitch: 60, duration: { numerator: 1, denominator: 1 } }
    ]} />);
    expect(markup).toContain("note-link tie");
    expect(markup).toContain("붙임줄");
  });

  it("다른 높이로 이어진 음은 이음줄로 표시한다", () => {
    const markup = renderToStaticMarkup(<ScoreMeasure notes={[
      { id: "a", pitch: 60, duration: { numerator: 1, denominator: 1 }, linkToNext: true },
      { id: "b", pitch: 64, duration: { numerator: 1, denominator: 1 } }
    ]} />);
    expect(markup).toContain("note-link slur");
    expect(markup).toContain("이음줄");
  });

  it("VexFlow 모드에서는 기존 SVG 음표 그림을 새로 그리지 않는다", () => {
    const markup = renderToStaticMarkup(<ScoreMeasure notes={notes} />);
    expect(markup).toContain("vex-score-layer");
    expect(markup).toContain("score-vex-overlay");
    expect(markup).not.toContain("note-head");
    expect(markup).not.toContain("rest-image");
  });

  it("레거시 모드에서는 쉼표 이미지 자산을 유지한다", () => {
    const markup = renderToStaticMarkup(<ScoreMeasure plain notes={[
      { id: "rest", pitch: null, duration: { numerator: 1, denominator: 1 } }
    ]} />);
    expect(markup).toContain("/notation/rests/quarter.png");
    expect(markup).toContain("rest-image");
  });

  it("분리 표시가 있는 짧은 음표는 레거시 자동 기둥으로 묶지 않는다", () => {
    const markup = renderToStaticMarkup(<ScoreMeasure plain notes={[
      { id: "a", pitch: 60, duration: { numerator: 1, denominator: 2 }, beamBreak: true },
      { id: "b", pitch: 64, duration: { numerator: 1, denominator: 2 }, beamBreak: true }
    ]} />);
    expect(markup).not.toContain("class=\"beam\"");
  });
});
