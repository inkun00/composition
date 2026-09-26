import { useState, type FormEvent } from "react";
import { isSongLength, MAX_SONG_LENGTH, MIN_SONG_LENGTH, QUICK_SONG_LENGTHS, type SongLength } from "../music/songLength";

type Props = Readonly<{
  length: SongLength;
  onSelect: (length: SongLength) => void;
}>;

export default function SongLengthChooser({ length, onSelect }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState(String(length));
  const [showError, setShowError] = useState(false);
  const isCustom = !QUICK_SONG_LENGTHS.some((option) => option === length);

  function submitCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(customValue.trim());
    if (customValue.trim() === "" || !isSongLength(value) || value > MAX_SONG_LENGTH) {
      setShowError(true);
      return;
    }
    setShowError(false);
    onSelect(value);
  }

  return <section className="length-chooser" aria-labelledby="length-heading">
    <div className="compact-heading">
      <span className="number-badge">4</span>
      <div><h2 id="length-heading">노래 길이를 골라요</h2><p>{length > MAX_SONG_LENGTH
        ? "가져온 긴 악보도 이곳에서 이어서 만들 수 있어요." : "8마디부터 32마디까지 고를 수 있어요."}</p></div>
    </div>
    <div className="length-options">
      {QUICK_SONG_LENGTHS.map((option) => <button key={option} type="button"
        data-testid={`length-${option}`} className={`length-option${length === option ? " active" : ""}`}
        aria-pressed={length === option} onClick={() => { setCustomOpen(false); onSelect(option); }}>
        <strong>{option}마디</strong>
      </button>)}
      <button type="button" data-testid="length-custom"
        className={`length-option${isCustom ? " active" : ""}`}
        aria-pressed={isCustom} aria-expanded={customOpen}
        onClick={() => { setCustomValue(String(length)); setShowError(false); setCustomOpen(true); }}>
        <strong>직접 설정</strong>
        {isCustom && <span>현재 {length}마디</span>}
      </button>
    </div>
    {customOpen && <form className="length-custom-form" onSubmit={submitCustom} noValidate>
      <label htmlFor="custom-song-length">몇 마디로 만들까요? (8~32마디)</label>
      <div className="length-custom-controls">
        <input id="custom-song-length" data-testid="custom-song-length" type="number"
          min={MIN_SONG_LENGTH} max={MAX_SONG_LENGTH} step="1" required
          value={customValue} aria-invalid={showError}
          onChange={(event) => { setCustomValue(event.target.value); setShowError(false); }} />
        <button type="submit">적용하기</button>
      </div>
      {showError && <p role="alert">8부터 32까지의 숫자를 넣어 주세요.</p>}
    </form>}
  </section>;
}
