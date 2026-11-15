import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Download, Film, Play, Square } from "lucide-react";
import { publicAssetUrl } from "../platform/portable";
import { TextbookPrintSheet, TextbookStaff } from "./TextbookScoreSheet";
import TextbookMeasureInput from "./TextbookMeasureInput";
import { useTextbookDraft } from "./useTextbookDraft";
import { useTextbookPlayback } from "./useTextbookPlayback";
import { useTextbookExport } from "./useTextbookExport";
import {
  ACTIVITY_TITLE, ENDING_EXAMPLE, isTextbookBarComplete, TEXTBOOK_BOARD_URL, TEXTBOOK_CHORDS,
  TEXTBOOK_SONG_TITLE, TEXTBOOK_TEMPOS, textbookSong
} from "./textbookScore";
import "./TextbookActivity.css";

export default function TextbookActivity({ onClose }: { onClose: () => void }) {
  const draft = useTextbookDraft();
  const playback = useTextbookPlayback();
  const files = useTextbookExport();
  const heading = useRef<HTMLHeadingElement>(null);
  const [selected, setSelected] = useState(0);
  const measures = useMemo(() => textbookSong(draft.answers), [draft.answers]);
  const completed = draft.answers.filter(isTextbookBarComplete).length;
  const hasMelody = draft.answers.some((bar) => bar.some((note) => note.pitch !== null));
  const complete = completed === 4 && hasMelody;
  const playing = playback.preview !== null;
  const exporting = files.format !== null;
  const readyToSave = complete && Boolean(draft.creator.trim());
  const tempo = TEXTBOOK_TEMPOS.find(({ bpm }) => bpm === draft.bpm)?.label ?? "";

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);

  function previewButton(index: number) {
    const active = playback.preview === index;
    return <button type="button" className="textbook-mini-action" data-testid={`textbook-preview-${index + 1}`}
      aria-label={`${index + 1}마디 ${active ? "재생 멈추기" : "미리듣기"}`}
      disabled={exporting || (!active && (playing || !measures[index].notes.length))}
      onClick={() => active ? playback.stop() : void playback.listen([measures[index]], index, draft.bpm)}>
      {active ? <Square size={15} /> : <Play size={15} />} {active ? "멈추기" : "듣기"}
    </button>;
  }

  return <main className="textbook-activity" aria-labelledby="textbook-song-heading">
    <div className="textbook-toolbar">
      <button type="button" className="textbook-quiet-action" onClick={onClose}><ArrowLeft size={17} /> 돌아가기</button>
      <span>교과서 활동하기</span>
    </div>
    <article className="textbook-workbook">
      <header className="textbook-heading">
        <p>{ACTIVITY_TITLE}</p>
        <h1 id="textbook-song-heading" ref={heading} tabIndex={-1}>{TEXTBOOK_SONG_TITLE}</h1>
        <p>앞 네 마디를 듣고, 이어지는 네 마디에 나만의 가락을 만들어 보세요.</p>
      </header>
      <div className="textbook-metadata">
        <label>빠르기말
          <select disabled={playing || exporting} value={draft.bpm} onChange={(event) => draft.setBpm(Number(event.target.value))}>
            {TEXTBOOK_TEMPOS.map((item) => <option key={item.bpm} value={item.bpm}>{item.label} ({item.bpm} BPM)</option>)}
          </select>
        </label>
        <label>작곡가 이름
          <input data-testid="textbook-creator" maxLength={40} disabled={exporting} value={draft.creator}
            onChange={(event) => draft.setCreator(event.target.value)} placeholder="이름을 적어 주세요" />
        </label>
      </div>

      <section className="textbook-section" aria-labelledby="textbook-given-heading">
        <div className="textbook-section-title"><h2 id="textbook-given-heading">주어진 가락</h2><span>1~4마디 · 4/4박자</span></div>
        <div className="textbook-system textbook-given">
          {measures.slice(0, 4).map((measure, index) => <TextbookStaff key={index} measure={measure} index={index} alignedLyrics
            playingNoteId={playback.sounding?.bar === index ? playback.sounding.id : null}>
            {previewButton(index)}
          </TextbookStaff>)}
        </div>
      </section>

      <section className="textbook-section textbook-compose" aria-labelledby="textbook-compose-heading">
        <div className="textbook-section-title"><h2 id="textbook-compose-heading">내가 만드는 가락</h2><span aria-live="polite">{completed}/4마디 완성</span></div>
        <div className="textbook-system textbook-answers">
          {measures.slice(4).map((measure, offset) => {
            const index = offset + 4;
            return <div className="textbook-answer" key={index} data-selected={selected === offset}>
              <TextbookStaff measure={measure} index={index} playingNoteId={playback.sounding?.bar === index ? playback.sounding.id : null}>
                {previewButton(index)}
              </TextbookStaff>
              <button type="button" className="textbook-select-bar" aria-pressed={selected === offset} aria-controls="textbook-active-editor"
                onClick={() => setSelected(offset)}>{index + 1}마디 편집{isTextbookBarComplete(draft.answers[offset]) ? " ✓" : ""}</button>
            </div>;
          })}
        </div>
        <div className="textbook-active-editor" id="textbook-active-editor">
          <div className="textbook-editor-hint">
            <span>{selected + 5}마디 화음에 어울리는 음 <strong>{TEXTBOOK_CHORDS[selected + 4].hint}</strong></span>
            {selected === 3 && draft.answers[3].length === 0 && <button type="button" className="textbook-quiet-action"
              disabled={playing || exporting} onClick={() => draft.setBar(3, ENDING_EXAMPLE)}>교과서 끝마디 리듬 넣기</button>}
          </div>
          <TextbookMeasureInput key={selected} index={selected} notes={draft.answers[selected]} disabled={playing || exporting}
            onChange={(notes) => draft.setBar(selected, notes)} />
        </div>
      </section>

      <section className="textbook-section textbook-share" aria-labelledby="textbook-share-heading">
        <div className="textbook-section-title"><h2 id="textbook-share-heading">완성하고 공유하기</h2></div>
        <p>{!complete ? "뒤 네 마디를 각각 4박으로 채우고 음표를 넣으면 전곡을 들을 수 있어요."
          : !readyToSave ? "작곡가 이름을 적으면 악보와 영상을 저장할 수 있어요." : "악보 PNG와 연주 MP4를 저장한 뒤 클래스보드에 첨부해 보세요."}</p>
        <div className="textbook-share-actions">
          <button type="button" className="textbook-main-action" data-testid="textbook-play-all"
            disabled={!complete || exporting || (playing && playback.preview !== "all")}
            onClick={() => playing ? playback.stop() : void playback.listen(measures, "all", draft.bpm)}>
            {playing && playback.preview === "all" ? <Square size={17} /> : <Play size={17} />}
            {playing && playback.preview === "all" ? "전곡 재생 멈추기" : "전곡 미리듣기"}
          </button>
          <button type="button" className="textbook-quiet-action" disabled={!readyToSave || playing || exporting}
            onClick={() => void files.save("png", measures, draft.creator, draft.bpm)}><Download size={17} /> 악보 PNG 저장</button>
          <button type="button" className="textbook-quiet-action" disabled={!readyToSave || playing || exporting}
            onClick={() => void files.save("mp4", measures, draft.creator, draft.bpm)}><Film size={17} /> 연주 MP4 저장</button>
          <a href={TEXTBOOK_BOARD_URL} target="_blank" rel="noopener noreferrer" className="textbook-quiet-action">
            <ArrowUpRight size={17} /> <span>클래스보드 열기 <small>(새 탭)</small></span>
          </a>
        </div>
        {exporting && <div className="textbook-export-progress">
          <label>{files.format === "mp4" ? `연주 영상 만들기 ${files.progress}%` : "악보 이미지 만들기"}
            <progress max={100} value={files.format === "mp4" ? files.progress : undefined} />
          </label>
          <button type="button" className="textbook-quiet-action" onClick={files.cancel}>취소</button>
        </div>}
        {(playback.error || files.error) && <p className="textbook-error" role="alert">{files.error || playback.error}</p>}
        {files.status && <p className="textbook-status" role="status">{files.status}</p>}
      </section>

      <details className="textbook-original">
        <summary>첨부한 교과서 자료 보기</summary>
        <img src={publicAssetUrl("/textbook/healthy-bibimbap-reference.png")} loading="lazy" width={1134} height={655}
          alt="건강 비빔밥 교과서 악보. 첫 단에는 주어진 네 마디가 있으며, 둘째 단에는 화음 힌트와 끝마디 예시가 있습니다." />
      </details>
    </article>
    {readyToSave && <TextbookPrintSheet measures={measures} creator={draft.creator} tempo={tempo} sheetRef={files.sheet} />}
  </main>;
}
