import { describe, expect, it } from "vitest";
import { TRAIN_ROUNDS, judgeTrainTap, trainResult, trainTimeline } from "./rhythmTrainModel";

describe("rhythm train performance rules", () => {
  it("counts held half notes and eighth onsets rather than treating every symbol as one beat", () => {
    const cues = trainTimeline(TRAIN_ROUNDS[2].notes);
    expect(cues.map((cue) => cue.beat)).toEqual([0, 2, 3, 3.5]);
    expect(cues.map((cue) => cue.duration)).toEqual([2, 1, 0.5, 0.5]);
  });

  it("a rest never earns a hit and the next note retains its correct onset", () => {
    const cues = trainTimeline(TRAIN_ROUNDS[1].notes);
    expect(judgeTrainTap(cues, 750, 80, 240, [])).toBeNull();
    expect(judgeTrainTap(cues, 1500, 80, 240, [])?.index).toBe(2);
  });

  it("a consumed onset cannot be scored again, and half-beat neighbors match the nearest remaining onset", () => {
    const cues = trainTimeline(TRAIN_ROUNDS[2].notes);
    const first = judgeTrainTap(cues, 0, 80, 240, [])!;
    expect(judgeTrainTap(cues, 30, 80, 240, [first])).toBeNull();
    expect(judgeTrainTap(cues, 2600, 80, 240, [])?.index).toBe(3);
  });

  it("gentle timing allows small offsets that precise timing rejects", () => {
    const cues = trainTimeline(TRAIN_ROUNDS[0].notes);
    expect(judgeTrainTap(cues, 210, 80, 240, [])?.quality).toBe("good");
    expect(judgeTrainTap(cues, 210, 80, 150, [])).toBeNull();
    expect(judgeTrainTap(cues, 280, 80, 240, [])).toBeNull();
  });

  it("extra inputs reduce accuracy and stars so random spamming is never perfect", () => {
    const cues = trainTimeline(TRAIN_ROUNDS[0].notes);
    const hits = cues.map((cue) => ({ index: cue.index, offsetMs: 0, quality: "perfect" as const }));
    expect(trainResult(cues, hits, 0)).toMatchObject({ score: 400, accuracy: 1, stars: 3 });
    expect(trainResult(cues, hits, 4)).toMatchObject({ score: 300, accuracy: 0.5, stars: 1 });
    expect(trainResult(cues, [], 5).score).toBe(0);
  });
});
