import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPracticeMeasures } from "./practiceModel";
import { getAvailablePracticeChords } from "./practiceHarmony";
import { emptyPracticeDraft, PRACTICE_STORAGE_KEY } from "./practiceStorage";
import { button, changeValue, click, container, mount, savedDraft, unmount } from "./PracticeMode.test.helpers";

vi.mock("./usePracticeAudio", () => ({ usePracticeAudio: vi.fn(() => ({
  busy: false,
  playing: false,
  previewMeasureIndex: null,
  previewScoreIndex: null,
  previewRhythmMixing: false,
  playingNoteId: null,
  playingNoteIds: [],
  status: "",
  progress: 0,
  preview: vi.fn(),
  previewMeasure: vi.fn(),
  previewRhythmMix: vi.fn(),
  save: vi.fn(),
  stop: vi.fn()
})) }));
vi.mock("../components/ScoreMeasure", () => ({ default: () => <div aria-label="연습 악보" /> }));

function startMelodyPractice(count = 4): void {
  const draft = emptyPracticeDraft();
  draft.measures = createPracticeMeasures(count).map((measure, index) => ({
    ...measure,
    lyric: "작은새야",
    notes: [..."작은새야"].map((lyric, noteIndex) => ({
      id: `harmony-${index}-${noteIndex}`,
      pitch: noteIndex === 1 ? 63 : 60,
      duration: { numerator: 1, denominator: 1 },
      ...(noteIndex === 1 ? { accidental: "sharp" as const } : {}),
      lyric
    }))
  }));
  localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(draft));
  mount();
  click(button("가락 만들기로"));
}

function chordSelect(index: number): HTMLSelectElement {
  const input = container?.querySelector<HTMLSelectElement>(`[aria-label="${index + 1}마디 가락 연습 화음"]`);
  if (!input) throw new Error(`${index + 1}마디 화음 선택을 찾지 못했습니다.`);
  return input;
}

function chordChoices(index: number): string[] {
  return [...chordSelect(index).options].map((option) => option.value);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  unmount();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("연습 가락의 화음 이어 고르기", () => {
  it("첫 화음은 다양하게 고르고 다음 마디는 앞 화음에 어울리는 후보만 보여 준다", () => {
    startMelodyPractice();
    expect(chordChoices(0)).toHaveLength(14);
    expect(chordChoices(0)).toContain("Fmaj7");
    expect(chordChoices(0)).toContain("Dm7");
    expect(chordChoices(1)).toEqual(getAvailablePracticeChords("C").map((option) => option.value));
    expect(chordChoices(1).length).toBeLessThan(chordChoices(0).length);
    changeValue("1마디 가락 연습 화음", "Fmaj7");
    expect(chordChoices(1)).toEqual(getAvailablePracticeChords("Fmaj7").map((option) => option.value));
    expect(container?.textContent).toContain("1마디의 Fmaj7 화음 뒤에 자주 쓰는 화음 연결 후보예요. 가락과 함께 들어 보세요.");
    const firstDescription = getAvailablePracticeChords().find((option) => option.value === "Fmaj7")?.description;
    expect(container?.querySelector("#practice-harmony-description-0")?.textContent).toBe(firstDescription);
  });

  it("앞 화음을 바꾸면 뒤 화음과 후보도 연결해 갱신하고 음표·길이·가사를 보존한다", () => {
    startMelodyPractice();
    const before = savedDraft().measures;
    changeValue("1마디 가락 연습 화음", "Dm");
    const after = savedDraft().measures;
    expect(after[0].chord).toBe("Dm");
    expect(after.slice(1).some((measure, index) => measure.chord !== before[index + 1].chord)).toBe(true);
    for (let index = 0; index < after.length; index += 1) {
      expect(after[index].notes).toEqual(before[index].notes);
      expect(after[index].lyric).toBe(before[index].lyric);
      expect(chordSelect(index).value).toBe(after[index].chord);
      if (index > 0) {
        expect(chordChoices(index)).toEqual(getAvailablePracticeChords(after[index - 1].chord).map((option) => option.value));
        expect(chordChoices(index)).toContain(after[index].chord);
      }
    }
    expect(container?.textContent).toContain("뒤쪽");
    expect(container?.textContent).toContain("리듬과 가락은 그대로예요.");
    unmount();
    mount();
    click(button("가락 만들기로"));
    expect(savedDraft().measures).toEqual(after);
    expect(chordSelect(0).value).toBe("Dm");
  });
});
