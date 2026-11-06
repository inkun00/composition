import { describe, expect, it } from "vitest";
import { DYNAMICS, LESSONS, NOTES, QUIZZES, measureFeedback, secondsForBeats, totalBeats } from "./learningModel";

describe("elementary music lengths", () => {
  it("keeps the quarter note as one beat and silence as measured time", () => {
    expect(totalBeats(["half"])).toBe(totalBeats(["quarter", "quarter"]));
    expect(totalBeats(["eighth", "eighth"])).toBe(1);
    expect(totalBeats(["quarter-rest", "quarter"])).toBe(2);
    expect(totalBeats(["whole"])).toBe(4);
    expect(NOTES.find((note) => note.id === "quarter-rest")?.rest).toBe(true);
  });

  it("distinguishes empty, short, full and overflowing simple-meter bars", () => {
    expect(measureFeedback([], 2)).toMatchObject({ state: "empty", remaining: 2 });
    expect(measureFeedback(["eighth"], 2)).toMatchObject({ state: "incomplete", remaining: 1.5 });
    expect(measureFeedback(["half"], 2)).toMatchObject({ state: "exact", remaining: 0 });
    expect(measureFeedback(["half", "quarter"], 3).state).toBe("exact");
    expect(measureFeedback(["whole"], 2)).toMatchObject({ state: "overflow", remaining: -2 });
  });

  it("changes seconds with tempo while preserving the same beat length", () => {
    expect(secondsForBeats(2, 60)).toBe(2);
    expect(secondsForBeats(2, 120)).toBe(1);
    expect(secondsForBeats(0.5, 120)).toBe(0.25);
    for (const bpm of [0, -1, NaN, Infinity]) expect(() => secondsForBeats(2, bpm)).toThrow();
  });

  it("orders relative dynamics from soft to loud at conservative gains", () => {
    expect(DYNAMICS.map((item) => item.id)).toEqual(["pp", "p", "mp", "mf", "f", "ff"]);
    DYNAMICS.slice(1).forEach((item, index) => expect(item.gain).toBeGreaterThan(DYNAMICS[index].gain));
    expect(DYNAMICS.every((item) => item.gain > 0 && item.gain < 0.3)).toBe(true);
  });

  it("provides a complete quiz with valid answers for every lesson", () => {
    const ids = new Set<string>();
    LESSONS.forEach((lesson) => {
      const questions = QUIZZES[lesson.id];
      expect(questions.length).toBeGreaterThanOrEqual(3);
      questions.forEach((question) => {
        expect(ids.has(question.id)).toBe(false);
        ids.add(question.id);
        expect(question.answer).toBeGreaterThanOrEqual(0);
        expect(question.answer).toBeLessThan(question.options.length);
        expect(question.explanation.length).toBeGreaterThan(10);
      });
    });
  });
});
