import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  button, changeValue, click, completeOneMeasure, completeScoreMeasure, container, latestAudioInput, mount,
  rerender, savedDraft, testButton, unmount
} from "./PracticeMode.test.helpers";

const audio = vi.hoisted(() => ({
  busy: false,
  playing: false,
  previewMeasureIndex: null as number | null,
  previewScoreIndex: null as number | null,
  previewRhythmMixing: false,
  playingNoteId: null,
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
vi.mock("./PracticeVideoPreview", () => ({
  default: ({ mode, step }: { mode: string; step: string }) => (
    <div data-testid="save-preview" data-mode={mode} data-step={step} />
  )
}));
vi.mock("../components/ScoreMeasure", () => ({ default: () => <div aria-label="연습 악보" /> }));

function stage(id: string): HTMLButtonElement {
  const found = container?.querySelector<HTMLButtonElement>(`#practice-${id}-tab`);
  if (!found) throw new Error(`${id} 단계를 찾지 못했습니다.`);
  return found;
}

function modeButton(mode: "bars" | "score"): HTMLButtonElement {
  const label = mode === "bars" ? "막대 모드" : "악보 모드";
  const found = [...(container?.querySelectorAll<HTMLButtonElement>(".practice-video-modes button") ?? [])]
    .find((item) => item.textContent?.includes(label));
  if (!found) throw new Error(`${label} 버튼을 찾지 못했습니다.`);
  return found;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  audio.busy = false;
  audio.playing = false;
  audio.previewMeasureIndex = null;
  audio.previewScoreIndex = null;
  audio.status = "";
});

afterEach(() => {
  unmount();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("음악 저장과 공유 단계", () => {
  it("추가 악보의 가사도 모두 배치한 뒤 영상에 저장한다", () => {
    mount();
    completeOneMeasure("");
    click(button("악보 추가하기"));
    completeScoreMeasure(1, 0, "다섯글자야");
    click(stage("save"));
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(true);
    click(button("리듬 편집으로"));
    changeValue("2번 악보 1마디 가사", "같이해요");
    click(stage("save"));
    expect(button("MP4 저장").disabled).toBe(false);
  });

  it("가락 저장에서는 숨긴 리듬 악보의 남은 가사가 영상 저장을 막지 않고 리듬으로 복귀하면 다시 검사한다", () => {
    mount(undefined, "rhythm-melody");
    completeOneMeasure("우리노래");
    click(button("악보 추가하기"));
    completeScoreMeasure(1, 0, "반짝이는우리별");
    const before = savedDraft();
    expect(button("MP4 저장").disabled).toBe(true);

    click(stage("melody"));
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(false);
    click(stage("save"));
    click(modeButton("score"));
    expect(container?.querySelector('[data-testid="save-preview"]')?.getAttribute("data-step")).toBe("melody");
    click(button("MP4 저장"));
    expect(audio.save).toHaveBeenCalledWith("mp4");
    expect(latestAudioInput().rhythmLayers).toEqual(before.rhythmLayers);
    expect(savedDraft()).toEqual(before);

    click(stage("rhythm"));
    expect(button("MP4 저장").disabled).toBe(true);
    expect(container?.textContent).toContain("모든 가사 글자에 음표");
    expect(savedDraft()).toEqual(before);
  });
  it("세 편집·저장 단계와 지정한 샘보드 새 창 링크를 보여 준다", () => {
    mount();
    expect(stage("rhythm").textContent).toContain("리듬 만들기");
    expect(stage("melody").textContent).toContain("가락 만들기");
    expect(stage("save").textContent).toContain("음악 저장하기");
    const share = container?.querySelector<HTMLAnchorElement>(".practice-share-stage");
    expect(share?.textContent).toContain("음악 공유하기");
    expect(share?.href).toBe("https://samboard.vivasam.com/studentEntry/?brdId=brd-0RXAMP8AGEZ2B");
    expect(share?.target).toBe("_blank");
    expect(share?.rel).toBe("noopener noreferrer");
    expect(share?.closest('[role="tablist"]')).toBeNull();
  });

  it("미완성 리듬도 저장 화면은 열리지만 파일 저장은 박자를 모두 완성해야 열린다", () => {
    mount();
    click(stage("save"));
    expect(stage("save").getAttribute("aria-selected")).toBe("true");
    const savePanel = container?.querySelector<HTMLElement>("#practice-save-panel");
    expect(savePanel?.getAttribute("role")).toBe("tabpanel");
    expect(savePanel?.getAttribute("aria-labelledby")).toBe("practice-save-tab");
    expect(container?.querySelector<HTMLElement>("#practice-workspace")?.hidden).toBe(true);
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
    click(button("MP4 저장"));
    expect(audio.save).not.toHaveBeenCalled();
    click(button("리듬 편집으로"));
    completeOneMeasure("");
    click(stage("save"));
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(false);
    expect(latestAudioInput().step).toBe("rhythm");
    click(button("MP4 저장"));
    expect(audio.save).toHaveBeenCalledWith("mp4");
  });

  it("막대·악보 모드는 영상 미리보기와 음원 입력으로 전달되며 리듬·가사·악기는 보존한다", () => {
    mount();
    completeOneMeasure("우리노래");
    changeValue("리듬 연주 악기", "beat:shaker");
    const before = savedDraft();
    click(button("음악 저장 설정"));
    expect(latestAudioInput().videoMode).toBe("bars");
    expect(modeButton("bars").getAttribute("aria-pressed")).toBe("true");
    click(modeButton("score"));
    expect(latestAudioInput()).toMatchObject({ step: "rhythm", videoMode: "score", rhythmInstrumentId: "beat:shaker" });
    expect(container?.querySelector('[data-testid="save-preview"]')?.getAttribute("data-mode")).toBe("score");
    click(button("MP4 저장"));
    click(modeButton("bars"));
    expect(latestAudioInput().videoMode).toBe("bars");
    expect(savedDraft()).toEqual(before);
    click(button("리듬 편집으로"));
    expect(stage("rhythm").getAttribute("aria-selected")).toBe("true");
    expect(savedDraft()).toEqual(before);
  });

  it("가락에서 저장 단계로 옮겨도 가락 악기와 음높이가 유지되며 돌아와 계속 편집한다", () => {
    mount();
    completeOneMeasure("");
    click(stage("melody"));
    changeValue("가락 연주 악기", "violin");
    const firstId = savedDraft().measures[0].notes[0].id;
    click(testButton(`practice-melody-${firstId}-67`));
    const before = savedDraft();
    click(stage("save"));
    click(modeButton("score"));
    expect(stage("melody").getAttribute("aria-selected")).toBe("false");
    expect(latestAudioInput()).toMatchObject({ step: "melody", videoMode: "score", melodyInstrumentId: "violin" });
    expect(latestAudioInput().measures).toEqual(before.measures);
    expect(container?.querySelector('[data-testid="save-preview"]')?.getAttribute("data-step")).toBe("melody");
    click(button("가락 편집으로"));
    expect(stage("melody").getAttribute("aria-selected")).toBe("true");
    expect(savedDraft()).toEqual(before);
    click(testButton(`practice-melody-${firstId}-69`));
    expect(savedDraft().measures[0].notes[0].pitch).toBe(69);
  });

  it("파일 준비 중에는 저장 모드와 편집 전환을 잠그고 취소는 가능하다", () => {
    mount();
    completeOneMeasure();
    click(stage("save"));
    audio.busy = true;
    rerender();
    expect(stage("save").disabled).toBe(true);
    expect(stage("rhythm").disabled).toBe(true);
    expect(button("리듬 편집으로").disabled).toBe(true);
    expect(modeButton("score").matches(":disabled")).toBe(true);
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
    expect(button("취소").disabled).toBe(false);
    click(button("취소"));
    expect(audio.stop).toHaveBeenCalledTimes(1);
  });

  it("가사가 음표보다 많으면 두 저장 모드 모두 MP4를 잠그고 MP3는 허용한다", () => {
    mount();
    completeOneMeasure("반짝이는우리별");
    click(stage("save"));
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(true);
    click(modeButton("score"));
    expect(button("MP4 저장").disabled).toBe(true);
    expect(container?.textContent).toContain("모든 가사 글자에 음표");
  });
});
