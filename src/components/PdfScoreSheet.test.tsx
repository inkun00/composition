import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PdfScoreSheet from "./PdfScoreSheet";

describe("PDF 악보 화면 미리보기", () => {
  it("내보내기 페이지 표식 없이 PDF 페이지 레이아웃을 재사용한다", () => {
    const markup = renderToStaticMarkup(<PdfScoreSheet title="우리 노래" description="함께 만든 노래"
      creator="어린이 작곡가" originalCreator="" meter={{ beats: 4, beatUnit: 4 }}
      measures={[{
        candidateName: "첫 가락",
        chords: ["C"],
        notes: [{ id: "note-1", pitch: 60, duration: { numerator: 1, denominator: 1 }, lyric: "우" }]
      }]} includeAccompaniment={false} preview />);

    expect(markup).toContain("pdf-preview-document");
    expect(markup).toContain("pdf-preview-page-shell");
    expect(markup).toContain("우리 노래");
    expect(markup).not.toContain("data-pdf-page");
  });

  it("첫 페이지에 노래 재생 QR 코드를 넣는다", () => {
    const markup = renderToStaticMarkup(<PdfScoreSheet title="우리 노래" description=""
      creator="어린이 작곡가" originalCreator="" meter={{ beats: 4, beatUnit: 4 }}
      measures={[{
        candidateName: "첫 가락",
        chords: ["C"],
        notes: [{ id: "note-1", pitch: 60, duration: { numerator: 1, denominator: 1 } }]
      }]} includeAccompaniment={false} playbackUrl="https://example.com/?play=qr&song=short-id" preview />);

    expect(markup).toContain("pdf-playback-qr");
    expect(markup).toContain("스캔해서 노래 듣기");
    expect(markup).toContain("악보 노래 재생 QR 코드");
  });
});
