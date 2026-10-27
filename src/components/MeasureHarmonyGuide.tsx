import { chordDegreeLabel } from "../music/chord";
import type { Meter } from "../music/meter";
import { activeChordAtNote, chordToneNames, noteHarmonyFit } from "../music/noteHarmonyFit";
import { pitchName } from "../music/score";
import type { NoteEvent } from "../music/types";

type MeasureHarmonyGuideProps = Readonly<{
  chords: readonly string[];
  notes: readonly NoteEvent[];
  meter: Meter;
  selectedNote?: NoteEvent | null;
}>;

export default function MeasureHarmonyGuide({
  chords,
  notes,
  meter,
  selectedNote
}: MeasureHarmonyGuideProps) {
  const safeChords = chords.length > 0 ? chords : ["C"];
  const isMultipleChords = safeChords.length > 1;

  // 선택된 음표가 있을 때는 그 음표 위치의 화음을 우선으로 안내
  const noteChordInfo = selectedNote ? activeChordAtNote(selectedNote, notes, safeChords, meter) : null;
  const currentChord = noteChordInfo ? noteChordInfo.chord : safeChords[0];
  const currentChordDegree = chordDegreeLabel(currentChord);
  const matchingTones = chordToneNames(currentChord);

  const fit = selectedNote ? noteHarmonyFit(selectedNote, notes, safeChords, meter) : null;
  const selectedNoteSyllable = selectedNote && selectedNote.pitch !== null
    ? pitchName(selectedNote.pitch, selectedNote.accidental)
    : null;

  return (
    <div className="harmony-guide" aria-live="polite">
      <div className="harmony-guide-header">
        <span className="harmony-guide-title">화음 어울림</span>
        <div className="harmony-guide-chord-badge" data-testid="active-chord-badge">
          <span className="chord-label">화음</span>
          <strong className="chord-name">
            {isMultipleChords && !selectedNote
              ? safeChords.map((chord) => `${chord} (${chordDegreeLabel(chord)})`).join(" → ")
              : `${currentChord} (${currentChordDegree} 화음)`}
          </strong>
        </div>
        <div className="harmony-guide-tones" data-testid="matching-tones">
          <span className="tones-label">어울리는 음</span>
          <div className="tones-list">
            {matchingTones.map((tone) => (
              <span key={tone} className="tone-pill">{tone}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="harmony-guide-body">
        <div className="harmony-guide-legend">
          <span className="fit-chord">● 화음에 있는 음</span>
          <span className="fit-color">○ 화음 밖의 음</span>
        </div>

        {selectedNote && selectedNoteSyllable && fit ? (
          <div className={`harmony-guide-feedback fit-${fit}`}>
            {fit === "chord" ? (
              <p>
                <strong>● [{selectedNoteSyllable}]</strong> 음은 <strong>{currentChord}</strong> 화음의 어울리는 음({matchingTones.join(" · ")}) 중 하나예요. 화음과 자연스럽게 어울려요!
              </p>
            ) : (
              <p>
                <strong>○ [{selectedNoteSyllable}]</strong> 음은 <strong>{currentChord}</strong> 화음 밖의 음이에요. 안정적인 느낌을 원하면 어울리는 음(<strong>{matchingTones.join(" · ")}</strong>)으로 바꿔보거나, 앞뒤 음과 이어지는 꾸밈음으로 써 보세요.
              </p>
            )}
          </div>
        ) : selectedNote && selectedNote.pitch === null ? (
          <p className="harmony-guide-hint">쉼표가 선택되어 있어요.</p>
        ) : (
          <p className="harmony-guide-hint">
            💡 음표를 누르면 <strong>{currentChord}</strong> 화음과 어울리는지 바로 확인할 수 있어요.
          </p>
        )}
      </div>
    </div>
  );
}
