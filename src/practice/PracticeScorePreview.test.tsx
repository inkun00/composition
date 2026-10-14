import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateMeasure } from "../music/meter";
import {
  button, changeValue, click, completeScoreMeasure, container, latestAudioInput,
  mount, rerender, savedDraft, scoreButton, scoreCard, unmount
} from "./PracticeMode.test.helpers";

const audio = vi.hoisted(() => ({
  busy: false,
  playing: false,
  previewMeasureIndex: null as number | null,
  previewScoreIndex: null as number | null,
  previewRhythmMixing: false,
  playingNoteId: null as string | null,
  playingNoteIds: [] as readonly string[],
  status: "",
  progress: 0,
  preview: vi.fn(),
  previewMeasure: vi.fn(),
  previewScore: vi.fn(),
  previewRhythmMix: vi.fn(),
  save: vi.fn(),
  stop: vi.fn()
}));

vi.mock("./usePracticeAudio", () => ({ usePracticeAudio: vi.fn(() => audio) }));
vi.mock("../components/ScoreMeasure", () => ({ default: () => <div aria-label="연습 악보" /> }));

function wholeScoreButton(scoreIndex: number): HTMLButtonElement {
  return scoreButton(scoreIndex, `practice-score-preview-${scoreIndex}`);
}

function measurePreviewButton(scoreIndex: number, measureIndex: number): HTMLButtonElement {
  const id = scoreIndex === 0 ? `practice-measure-preview-${measureIndex}`
    : `practice-score-${scoreIndex}-measure-preview-${measureIndex}`;
  return scoreButton(scoreIndex, id);
}

function addThreeScores(): void {
  click(button("악보 추가하기"));
  click(button("악보 추가하기"));
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  audio.busy = false;
  audio.playing = false;
  audio.previewMeasureIndex = null;
  audio.previewScoreIndex = null;
  audio.previewRhythmMixing = false;
  audio.playingNoteId = null;
  audio.playingNoteIds = [];
  audio.status = "";
  audio.progress = 0;
});

afterEach(() => {
  unmount();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("악보별 전체 미리듣기와 간단한 마디 버튼", () => {
  it("각 악보 바로 위에 전체 듣기를 두고 마디 버튼은 미리듣기만 표시한다", () => {
    mount();
    addThreeScores();
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      const preview = wholeScoreButton(scoreIndex);
      const firstMeasure = container?.querySelector(
        scoreIndex === 0 ? '[data-testid="practice-measure-card-0"]'
          : `[data-testid="practice-score-${scoreIndex}-measure-card-0"]`
      ) as Element;
      expect(preview.textContent?.trim()).toBe(`악보${scoreIndex + 1} 미리듣기`);
      expect(preview.compareDocumentPosition(firstMeasure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(preview.disabled).toBe(true);
      for (let measureIndex = 0; measureIndex < 2; measureIndex += 1) {
        const measurePreview = measurePreviewButton(scoreIndex, measureIndex);
        expect(measurePreview.textContent?.trim()).toBe("미리듣기");
        expect(measurePreview.getAttribute("aria-label")).toContain(`${measureIndex + 1}마디`);
      }
    }
  });

  it("소리 나는 음표가 있는 악보만 미완성인 여러 마디를 한 번에 듣는다", () => {
    mount();
    addThreeScores();
    changeValue("연습할 마디 수", "4");
    const settings = ["beat:woodblock", "beat:clap", "beat:kick"];
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      changeValue(scoreIndex === 0 ? "리듬 연주 악기" : `${scoreIndex + 1}번 악보 리듬 연주 악기`, settings[scoreIndex]);
      click(scoreButton(scoreIndex, "practice-rest-0.25"));
      expect(wholeScoreButton(scoreIndex).disabled).toBe(true);
      click(scoreButton(scoreIndex, "practice-duration-0.25"));
      const before = savedDraft();
      const measures = scoreIndex === 0 ? before.measures : before.rhythmLayers[scoreIndex - 1].measures;
      expect(validateMeasure(measures[0].notes, before.meter).state).toBe("short");
      expect(measures[1].notes).toHaveLength(0);
      expect(wholeScoreButton(scoreIndex).disabled).toBe(false);
      click(wholeScoreButton(scoreIndex));
      expect(audio.previewScore).toHaveBeenLastCalledWith(scoreIndex);
      expect(audio.previewMeasure).not.toHaveBeenCalled();
      expect(audio.previewRhythmMix).not.toHaveBeenCalled();
      expect(audio.preview).not.toHaveBeenCalled();
      expect(savedDraft()).toEqual(before);
      expect(button("MP3 저장").disabled).toBe(true);
    }
    expect(audio.previewScore.mock.calls).toEqual([[0], [1], [2]]);
    expect(latestAudioInput()).toMatchObject({
      rhythmInstrumentId: settings[0],
      rhythmLayers: savedDraft().rhythmLayers
    });
  });

  it.each(["busy", "playing"] as const)("악보를 %s 상태로 듣는 동안 해당 악보만 취소하거나 멈춘다", (state) => {
    mount();
    addThreeScores();
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      click(scoreButton(scoreIndex, "practice-duration-1"));
    }
    const before = savedDraft();
    audio[state] = true;
    audio.previewScoreIndex = 1;
    rerender();
    const active = wholeScoreButton(1);
    expect(active.textContent?.trim()).toBe(state === "busy" ? "악보2 준비 취소" : "악보2 멈추기");
    expect(active.disabled).toBe(false);
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      if (scoreIndex !== 1) expect(wholeScoreButton(scoreIndex).disabled).toBe(true);
      expect(measurePreviewButton(scoreIndex, 0).disabled).toBe(true);
      expect(scoreButton(scoreIndex, "practice-duration-0.25").disabled).toBe(true);
      expect(scoreButton(scoreIndex, "practice-rest-0.25").disabled).toBe(true);
    }
    expect(button("리듬 함께 듣기").disabled).toBe(true);
    expect(button("MP3 저장").disabled).toBe(true);
    click(active);
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(audio.previewScore).not.toHaveBeenCalled();
    expect(savedDraft()).toEqual(before);
    audio[state] = false;
    audio.previewScoreIndex = null;
    rerender();
    expect(wholeScoreButton(1).textContent?.trim()).toBe("악보2 미리듣기");
    expect(wholeScoreButton(1).disabled).toBe(false);
  });

  it("마디 미리듣기와 전체 합주 중에는 악보 전체 듣기 버튼을 잠근다", () => {
    mount();
    addThreeScores();
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      click(scoreButton(scoreIndex, "practice-duration-1"));
    }
    audio.playing = true;
    audio.previewScoreIndex = 1;
    audio.previewMeasureIndex = 0;
    rerender();
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      expect(wholeScoreButton(scoreIndex).disabled).toBe(true);
    }
    expect(measurePreviewButton(1, 0).textContent?.trim()).toBe("멈추기");
    audio.previewScoreIndex = null;
    audio.previewMeasureIndex = null;
    audio.previewRhythmMixing = true;
    rerender();
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      expect(wholeScoreButton(scoreIndex).disabled).toBe(true);
    }
  });

  it("완성한 악보를 따로 듣는 동안 전체 곡 듣기는 잠그고 재생 중인 악보의 마디만 강조한다", () => {
    mount();
    addThreeScores();
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      completeScoreMeasure(scoreIndex, 0, "우리노래");
      completeScoreMeasure(scoreIndex, 1, "작은새야");
    }
    expect(button("리듬 미리듣기").disabled).toBe(false);
    const note = savedDraft().rhythmLayers[0].measures[1].notes[1];
    audio.playing = true;
    audio.previewScoreIndex = 1;
    audio.playingNoteId = note.id;
    audio.playingNoteIds = [note.id];
    rerender();
    expect(wholeScoreButton(1).textContent?.trim()).toBe("악보2 멈추기");
    expect(wholeScoreButton(1).disabled).toBe(false);
    expect(button("리듬 미리듣기").disabled).toBe(true);
    expect(container?.querySelector(".practice-listen-card .practice-preview")?.textContent)
      .toContain("리듬 미리듣기");
    const currentCard = container?.querySelector('[data-testid="practice-score-1-measure-card-1"]');
    expect(currentCard?.querySelector(".practice-playback-indicator")?.textContent)
      .toContain("재생 중 · 2번째 음표");
    expect(currentCard?.querySelector(`[data-testid="practice-rhythm-note-${note.id}"]`)?.classList.contains("is-playing"))
      .toBe(true);
    expect(container?.querySelectorAll(".practice-playback-indicator")).toHaveLength(1);
  });

  it("가락 단계에서도 악보마다 자신의 전체 미리듣기를 요청한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    addThreeScores();
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      completeScoreMeasure(scoreIndex, 0, "우리노래");
    }
    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      const measurePreview = measurePreviewButton(scoreIndex, 0);
      expect(measurePreview.textContent?.trim()).toBe(scoreIndex === 0 ? "미리 듣기" : "미리듣기");
      expect(measurePreview.getAttribute("aria-label")).toContain(scoreIndex === 0 ? "가락 미리 듣기" : "리듬 미리듣기");
      click(wholeScoreButton(scoreIndex));
    }
    expect(audio.previewScore.mock.calls).toEqual([[0], [1], [2]]);
    expect(latestAudioInput().step).toBe("melody");
  });
});

describe("16분음표와 쉼표 입력", () => {
  it("각 악보에서 0.25박 음표와 쉼표를 추가하고 새로 열어도 정확한 길이를 보존한다", () => {
    mount();
    addThreeScores();
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      const noteButton = scoreButton(scoreIndex, "practice-duration-0.25");
      const restButton = scoreButton(scoreIndex, "practice-rest-0.25");
      expect(noteButton.textContent).toContain("16분음표");
      expect(noteButton.querySelector("small")?.textContent).toBe("0.25박");
      expect(restButton.textContent).toContain("16분쉼표");
      expect(restButton.querySelector("small")?.textContent).toBe("0.25박");
      expect(noteButton.closest('[role="group"]')?.getAttribute("aria-label")).toBe("음표 넣기");
      expect(restButton.closest('[role="group"]')?.getAttribute("aria-label")).toBe("쉼표 넣기");
      click(noteButton);
      click(restButton);
      const message = scoreCard(scoreIndex, 0).querySelector(".practice-measure-validation")?.textContent;
      expect(message).toContain("3.5박이 비었어요");
      expect(message).not.toContain("7/2박");
    }
    const before = savedDraft();
    const scores = [before.measures, ...before.rhythmLayers.map((layer) => layer.measures)];
    for (const measures of scores) {
      expect(measures[0].notes.map((note) => note.pitch)).toEqual([60, null]);
      expect(measures[0].notes.map((note) => note.duration)).toEqual([
        { numerator: 1, denominator: 4 },
        { numerator: 1, denominator: 4 }
      ]);
    }
    unmount();
    mount();
    expect(savedDraft()).toEqual(before);
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      expect(scoreButton(scoreIndex, "practice-duration-0.25")).toBeTruthy();
      expect(scoreButton(scoreIndex, "practice-rest-0.25")).toBeTruthy();
    }
  });
});
