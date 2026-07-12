import { describe, expect, it } from "vitest";
import { scoreLayout } from "./scoreLayout";

describe("악보 공통 좌표계", () => {
  it("작은 마디와 넓은 작은 마디의 폭을 일관되게 제공한다", () => {
    expect(scoreLayout({ compact: true })).toMatchObject({ width: 390, left: 92, usableWidth: 240 });
    expect(scoreLayout({ compact: true, wide: true })).toMatchObject({ width: 560, height: 390, left: 92, noteStartX: 150, usableWidth: 410 });
  });

  it("음자리표가 없는 마디에서는 왼쪽 여백을 줄인다", () => {
    expect(scoreLayout({ compact: true, showSignature: false }).left).toBe(34);
  });
});
