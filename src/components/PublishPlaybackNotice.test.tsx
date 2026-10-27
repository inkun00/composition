import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PublishPlaybackNotice from "./PublishPlaybackNotice";

describe("PublishPlaybackNotice", () => {
  it("음악이 재생 중이지 않을 때는 아무것도 렌더링하지 않는다", () => {
    const markup = renderToStaticMarkup(
      <PublishPlaybackNotice isAnyPlaying={false} onStop={vi.fn()} />
    );
    expect(markup).toBe("");
  });

  it("음악이 재생 중일 때는 정지 안내 메시지와 정지 버튼을 표시한다", () => {
    const markup = renderToStaticMarkup(
      <PublishPlaybackNotice isAnyPlaying={true} onStop={vi.fn()} />
    );
    expect(markup).toContain("음악이 재생 중이어서 저장 및 뮤직비디오 기능이 잠시 비활성화되어 있어요");
    expect(markup).toContain("■ 정지 버튼");
    expect(markup).toContain("음악 정지하고 활성화하기");
  });
});
