import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { isSavedDraft, type SavedDraft } from "./draft";
import {
  parseMusicXml,
  readMusicScoreFile,
  recognizedScoreToDraft
} from "./scoreImport";

function musicXml(measureCount = 5, beats = 4): string {
  const measures = Array.from({ length: measureCount }, (_, measureIndex) => `
    <measure number="${measureIndex + 1}">
      ${measureIndex === 0 ? `<attributes>
        <divisions>2</divisions><key><fifths>-1</fifths></key>
        <time><beats>${beats}</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>
      </attributes>` : ""}
      ${Array.from({ length: beats }, (_, noteIndex) => `<note>
        <pitch><step>${noteIndex === 1 ? "D" : "C"}</step><octave>4</octave></pitch>
        <duration>2</duration><voice>1</voice><type>quarter</type>
        ${measureIndex === 0 && noteIndex === 0 ? "<lyric><text>라</text></lyric>" : ""}
      </note>`).join("")}
    </measure>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
    <score-partwise version="4.0">
      <work><work-title>봄 노래</work-title></work>
      <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
      <part id="P1">${measures}</part>
    </score-partwise>`;
}

const baseDraft: SavedDraft = {
  version: 1,
  updatedAt: 1,
  sourceHash: "",
  title: "새 노래",
  creator: "작곡가",
  originalCreator: "작곡가",
  presetId: "H001",
  meter: { beats: 4, beatUnit: 4 },
  songLength: 8,
  instrumentId: "piano",
  bpm: 96,
  lyrics: Array(8).fill(""),
  measures: Array.from({ length: 8 }, () => ({
    candidateId: null,
    candidateName: null,
    notes: null,
    effects: []
  })),
  showArrangement: false
};

describe("악보 가져오기", () => {
  it("MusicXML의 첫 성부를 마디와 MIDI 음높이로 변환한다", () => {
    const score = parseMusicXml(musicXml());
    expect(score.title).toBe("봄 노래");
    expect(score.meter).toEqual({ beats: 4, beatUnit: 4 });
    expect(score.measures).toHaveLength(5);
    expect(score.measures[0].notes.map((note) => note.pitch)).toEqual([60, 62, 60, 60]);
    expect(score.measures[0].notes[0].lyric).toBe("라");
    expect(score.warnings).not.toContain("조표의 실제 음높이는 반영했지만 현재 악보에서는 임시표가 올림표 중심으로 표시돼요.");
  });

  it("압축 MXL 안의 MusicXML을 찾아 읽는다", async () => {
    const container = `<?xml version="1.0"?><container><rootfiles>
      <rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>
    </rootfiles></container>`;
    const archive = zipSync({
      "META-INF/container.xml": strToU8(container),
      "score.musicxml": strToU8(musicXml(8))
    });
    const score = await readMusicScoreFile(new File([archive], "song.mxl"));
    expect(score.measures).toHaveLength(8);
    expect(score.title).toBe("봄 노래");
  });

  it("가져온 5마디를 지원 길이인 8마디 프로젝트로 만들고 나머지는 쉼표로 채운다", () => {
    const project = recognizedScoreToDraft(parseMusicXml(musicXml()), baseDraft);
    expect(project.songLength).toBe(8);
    expect(project.measures).toHaveLength(8);
    expect(project.measures[0].candidateId).toBe("imported-score");
    expect(project.measures[0].keyFifths).toBe(-1);
    expect(project.measures[0].chords).toHaveLength(1);
    expect(project.measures[5].candidateId).toBe("imported-padding");
    expect(project.measures[5].notes?.[0].pitch).toBeNull();
    expect(project.measures[5].chords).toHaveLength(1);
    expect(isSavedDraft(project)).toBe(true);
  });

  it("시작 조표를 음높이와 임시표에 반영하고 제자리표도 구분한다", () => {
    const source = `<?xml version="1.0"?>
      <score-partwise version="4.0">
        <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>-1</fifths><mode>major</mode></key>
            <time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign></clef></attributes>
          <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
          <note><pitch><step>B</step><alter>0</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
          <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice></note>
          <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice></note>
        </measure></part>
      </score-partwise>`;
    const score = parseMusicXml(source);
    expect(score.keyFifths).toBe(-1);
    expect(score.measures[0].notes.slice(0, 2).map((note) => [note.pitch, note.accidental]))
      .toEqual([[70, "flat"], [71, "natural"]]);
  });

  it("MusicXML의 코드 기호를 가져온 프로젝트에 그대로 보존한다", () => {
    const source = `<?xml version="1.0"?>
      <score-partwise version="4.0">
        <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>0</fifths><mode>major</mode></key>
            <time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign></clef></attributes>
          <harmony><root><root-step>F</root-step><root-alter>1</root-alter></root><kind>minor-seventh</kind></harmony>
          <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
        </measure></part>
      </score-partwise>`;
    const score = parseMusicXml(source);
    const project = recognizedScoreToDraft(score, baseDraft);

    expect(score.measures[0].chords).toEqual(["F#m7"]);
    expect(score.measures[0].notes[0].accidental).toBe("sharp");
    expect(project.measures[0].chords).toEqual(["F#m7"]);
  });

  it("지원하지 않는 박자표는 프로젝트로 만들지 않는다", () => {
    expect(() => parseMusicXml(musicXml(5, 5))).toThrow("5/4박자는 아직 프로젝트에서 지원하지 않아요.");
  });
});
