import { describe, expect, it, vi } from "vitest";
import type { MusicVideoScene } from "../video/musicVideoModel";
import {
  importSceneInto, parseSceneFile, readSceneFile, resetScene, serializeSceneFile
} from "./sceneFile";

const scene: MusicVideoScene = {
  id: "drawn-scene", background: "#fff8ed", motion: "still",
  endLyric: { measureIndex: 7, noteId: "legacy-last-note" }, endMeasureIndex: 7,
  elements: [
    { id: "hand", tool: "brush", color: "#1e293b", width: 8,
      points: [[100, 140, .25], [240, 190, .8], [300, 220, .5]] },
    { id: "switch", tool: "rectangle", color: "#14b8a6", width: 4,
      points: [[320, 160, .5], [380, 260, .5]] }
  ],
  choreography: {
    version: 1, description: "손가락으로 스위치를 누르는 장면",
    actors: [{ id: "finger", name: "검지", elementIds: ["hand"],
      fixedPoint: [100, 140], movingPoint: [300, 220], endPoint: [330, 220] }],
    actions: [{ id: "press", actorId: "finger", kind: "press", startMeasureIndex: 2,
      startBeat: 1, durationBeats: 2, strength: .8 }]
  }
};

function envelope(value: unknown = scene) {
  return { format: "maeum-melody-scene", version: 1, scene: value };
}

function fileWith(text: string, size = new TextEncoder().encode(text).byteLength) {
  const read = vi.fn(async () => text);
  return { file: { size, text: read } as unknown as File, read };
}

describe("편집 가능한 장면 파일", () => {
  it("그림, 배경, 마디, 대상의 선과 제어점, 동작을 함께 보관하고 왕복 복원한다", () => {
    const encoded = serializeSceneFile(scene);
    expect(JSON.parse(encoded)).toMatchObject(envelope());
    const restored = parseSceneFile(encoded);
    expect(restored).toEqual(scene);
    expect(restored).not.toBe(scene);
    expect(restored.choreography?.actors[0].elementIds).toEqual(["hand"]);
    expect(restored.choreography?.actions[0]).toEqual(scene.choreography?.actions[0]);
  });

  it("빈 장면도 저장하여 다시 편집할 수 있다", () => {
    const empty = { ...scene, elements: [], choreography: undefined };
    expect(parseSceneFile(serializeSceneFile(empty))).toEqual(empty);
  });

  it("파일을 읽어 저장 당시의 편집 정보를 돌려준다", async () => {
    const { file, read } = fileWith(serializeSceneFile(scene));
    await expect(readSceneFile(file)).resolves.toEqual(scene);
    expect(read).toHaveBeenCalledOnce();
  });

  it.each([
    ["깨진 JSON", "{"],
    ["일반 그림 객체", JSON.stringify(scene)],
    ["다른 파일 종류", JSON.stringify({ ...envelope(), format: "another-project" })],
    ["지원하지 않는 버전", JSON.stringify({ ...envelope(), version: 2 })],
    ["문자열 버전", JSON.stringify({ ...envelope(), version: "1" })],
    ["누락된 장면", JSON.stringify({ format: "maeum-melody-scene", version: 1 })],
    ["장면 목록", JSON.stringify(envelope([scene]))],
    ["null", "null"]
  ])("%s는 장면 파일로 불러오지 않는다", (_label, contents) => {
    expect(() => parseSceneFile(contents)).toThrow();
  });

  it.each([
    ["그림 범위를 벗어난 좌표", { ...scene, elements: [{ ...scene.elements[0], points: [[1000, 0, .5]] }] }],
    ["없는 선을 가리키는 대상", { ...scene, choreography: { ...scene.choreography,
      actors: [{ ...scene.choreography!.actors[0], elementIds: ["missing-stroke"] }] } }],
    ["없는 대상을 가리키는 동작", { ...scene, choreography: { ...scene.choreography,
      actions: [{ ...scene.choreography!.actions[0], actorId: "missing-actor" }] } }],
    ["지원하지 않는 동작 종류", { ...scene, choreography: { ...scene.choreography,
      actions: [{ ...scene.choreography!.actions[0], kind: "unknown-action" }] } }]
  ])("%s가 든 파일은 편집 상태에 반영하지 않는다", (_label, invalid) => {
    expect(() => parseSceneFile(JSON.stringify(envelope(invalid)))).toThrow();
  });

  it("2MB를 넘는 파일은 내용을 읽기 전에 거부한다", async () => {
    const { file, read } = fileWith(serializeSceneFile(scene), 2 * 1024 * 1024 + 1);
    await expect(readSceneFile(file)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it("파일 읽기 오류를 성공으로 처리하지 않는다", async () => {
    const failed = { size: 100, text: vi.fn().mockRejectedValue(new Error("unreadable")) } as unknown as File;
    await expect(readSceneFile(failed)).rejects.toThrow();
  });
});

describe("선택한 장면 초기화와 불러오기", () => {
  it("명시한 시작 마디는 파일과 초기화에 남고 다른 그림을 불러올 때 현재 구간을 유지한다", () => {
    const current = { ...scene, startMeasureIndex: 2, endMeasureIndex: 5 };
    const imported = { ...scene, startMeasureIndex: 0, endMeasureIndex: 7 };
    expect(parseSceneFile(serializeSceneFile(current))).toEqual(current);
    expect(resetScene(current)).toMatchObject({ startMeasureIndex: 2, endMeasureIndex: 5 });
    expect(importSceneInto(current, imported)).toMatchObject({ startMeasureIndex: 2, endMeasureIndex: 5 });
    const withoutStart = importSceneInto(scene, imported);
    expect(withoutStart.startMeasureIndex).toBeUndefined();
  });

  it("전주를 저장하고 초기화해도 전주 구간을 본곡 마디로 바꾸지 않는다", () => {
    const { endMeasureIndex: _measure, choreography: _actions, ...drawing } = scene;
    const intro: MusicVideoScene = { ...drawing, section: "intro", endLyric: null };
    expect(parseSceneFile(serializeSceneFile(intro))).toEqual(intro);
    const cleared = resetScene(intro);
    expect(cleared.section).toBe("intro");
    expect(cleared.endMeasureIndex).toBeUndefined();
    expect(cleared.elements).toEqual([]);
    expect(parseSceneFile(serializeSceneFile(cleared))).toEqual(cleared);
  });

  it("전주에 본곡 그림을 불러오거나 본곡에 전주 그림을 불러와도 현재 구간을 유지한다", () => {
    const { endMeasureIndex: _measure, choreography: _actions, ...drawing } = scene;
    const intro: MusicVideoScene = { ...drawing, id: "intro", section: "intro", endLyric: null };
    const importedIntro = importSceneInto(intro, scene);
    expect(importedIntro.section).toBe("intro");
    expect(importedIntro.endMeasureIndex).toBeUndefined();
    expect(importedIntro.endLyric).toBeNull();
    expect(importedIntro.elements).toBe(scene.elements);
    const importedSong = importSceneInto(scene, intro);
    expect(importedSong).not.toHaveProperty("section");
    expect(importedSong.endMeasureIndex).toBe(scene.endMeasureIndex);
    expect(importedSong.endLyric).toEqual(scene.endLyric);
  });

  it("초기화는 현재 장면과 구간을 보존하고 그림, 배경, 움직임을 새 도화지 상태로 돌린다", () => {
    const original = structuredClone(scene);
    const cleared = resetScene(scene);
    expect(cleared).toEqual({ id: scene.id, background: "#ffffff", motion: "still", elements: [],
      endLyric: scene.endLyric, endMeasureIndex: scene.endMeasureIndex });
    expect(cleared).not.toHaveProperty("choreography");
    expect(scene).toEqual(original);
  });

  it("초기화한 예전 음절 기준 장면도 원래 구간을 보존한다", () => {
    const { endMeasureIndex: _measure, ...legacy } = scene;
    const cleared = resetScene(legacy);
    expect(cleared.endLyric).toEqual(scene.endLyric);
    expect(cleared).not.toHaveProperty("endMeasureIndex");
  });

  it("불러온 그림과 동작을 선택한 장면에 넣고 현재 장면 ID와 마디 연결을 유지한다", () => {
    const current: MusicVideoScene = { id: "current-scene", background: "#ffffff", motion: "auto", elements: [],
      endLyric: null, endMeasureIndex: 10 };
    const imported = parseSceneFile(serializeSceneFile(scene));
    const merged = importSceneInto(current, imported);
    expect(merged).toEqual({ ...scene, id: "current-scene", endLyric: null, endMeasureIndex: 10 });
    expect(current.elements).toEqual([]);
    expect(imported).toEqual(scene);
  });

  it("현재 장면에 마디 필드가 없으면 가져온 마디가 끼어들지 않는다", () => {
    const current: MusicVideoScene = { id: "legacy-scene", background: "#ffffff", motion: "auto", elements: [],
      endLyric: { measureIndex: 4, noteId: "current-end" } };
    const merged = importSceneInto(current, scene);
    expect(merged.id).toBe(current.id);
    expect(merged.endLyric).toEqual(current.endLyric);
    expect(merged.endMeasureIndex).toBeUndefined();
    expect(merged.elements).toEqual(scene.elements);
    expect(merged.choreography).toEqual(scene.choreography);
  });
});
