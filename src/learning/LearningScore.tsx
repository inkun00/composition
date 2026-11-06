import { useEffect, useRef, useState } from "react";
import { loadVexFlow } from "../music/vexflow";
import { getNote, type NoteId } from "./learningModel";
import "./LearningScore.css";

type LearningScoreProps = {
  notes: NoteId[];
  beatsPerBar?: number;
  activeIndex?: number;
  dynamic?: string;
  showClef?: boolean;
};

/** Small note symbols use paths, so the choice buttons never depend on a font. */
export function NoteSymbol({ id, size = 48 }: { id: NoteId; size?: number }) {
  const note = getNote(id);
  return (
    <svg className="learning-note-symbol" width={size} height={size} viewBox="0 0 48 56"
      role="img" aria-label={note.name} focusable="false">
      {id === "quarter-rest" ? (
        <path d="M25 5 19 16 29 27 19 34 Q12 39 24 49 Q16 36 30 37 L23 28 32 18Z" fill="currentColor" />
      ) : (
        <>
          <ellipse cx={id === "whole" ? 24 : 18} cy="41" rx={id === "whole" ? 12 : 9} ry="6.5"
            transform={`rotate(-18 ${id === "whole" ? 24 : 18} 41)`}
            fill={id === "whole" || id === "half" ? "none" : "currentColor"}
            stroke="currentColor" strokeWidth={id === "whole" ? 3.5 : 2.5} />
          {id !== "whole" && <path d="M26 39V7" stroke="currentColor" strokeWidth="2.7" />}
          {id === "eighth" && <path d="M27 8 Q28 14 36 19 Q43 25 34 33 Q38 23 27 22Z" fill="currentColor" />}
        </>
      )}
    </svg>
  );
}

/** A self-contained, real SVG stave with accessible note descriptions. */
export default function LearningScore({ notes, beatsPerBar = 4, activeIndex = -1,
  dynamic, showClef = true }: LearningScoreProps) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const noteKey = notes.join("|");
  const label = `${beatsPerBar}/4박자 악보. ${notes.length
    ? notes.map((id) => getNote(id).name).join(", ")
    : "음표를 넣어 보세요"}${dynamic ? `. 셈여림 ${dynamic}` : ""}`;

  useEffect(() => {
    const target = host.current;
    if (!target) return;
    let cancelled = false;
    const ids = noteKey ? noteKey.split("|") as NoteId[] : [];
    const width = Math.max(440, 150 + ids.length * 42);
    const height = 164;
    void loadVexFlow().then(({ Renderer, Stave, StaveNote, Voice, Formatter, Stem }) => {
      if (cancelled) return;
      target.replaceChildren();
      const renderer = new Renderer(target, Renderer.Backends.SVG);
      renderer.resize(width, height);
      const context = renderer.getContext();
      const stave = new Stave(12, 12, width - 24, { spacingBetweenLinesPx: 12 });
      if (showClef) stave.addClef("treble");
      stave.addTimeSignature(`${beatsPerBar}/4`);
      stave.setStyle({ strokeStyle: "#b4bcb5", fillStyle: "#223e3c" });
      stave.setContext(context).draw();

      if (ids.length) {
        const tickables = ids.map((id, index) => {
          const spec = getNote(id);
          const note = new StaveNote({
            keys: [spec.rest ? "b/4" : "g/4"],
            duration: spec.duration,
            stemDirection: Stem.UP
          });
          const color = index === activeIndex ? "#c05124" : "#223e3c";
          const style = { fillStyle: color, strokeStyle: color };
          note.setStyle(style);
          note.setStemStyle(style);
          note.setFlagStyle(style);
          return note;
        });
        const voice = new Voice({ numBeats: beatsPerBar, beatValue: 4 })
          .setMode(Voice.Mode.SOFT).addTickables(tickables);
        new Formatter().joinVoices([voice]).format([voice], width - (showClef ? 155 : 120));
        voice.draw(context, stave);
        tickables.forEach((note, index) => {
          const element = note.getSVGElement();
          element?.setAttribute("data-learning-note", String(index));
          if (index === activeIndex) element?.setAttribute("data-playing", "true");
        });
      }

      const svg = target.querySelector("svg");
      if (svg) {
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        if (dynamic) {
          const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
          text.setAttribute("x", showClef ? "115" : "72");
          text.setAttribute("y", "147");
          text.setAttribute("font-family", "Georgia, serif");
          text.setAttribute("font-size", "25");
          text.setAttribute("font-style", "italic");
          text.setAttribute("font-weight", "bold");
          text.setAttribute("fill", "#223e3c");
          text.textContent = dynamic;
          svg.appendChild(text);
        }
      }
      target.dataset.ready = "true";
      setError(false);
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
      target.replaceChildren();
    };
  }, [noteKey, beatsPerBar, activeIndex, dynamic, showClef]);

  return (
    <div className={`learning-score${notes.length >= 6 ? " is-dense" : ""}`}>
      <div className="learning-score-viewport" role="img" aria-label={label} tabIndex={notes.length >= 6 ? 0 : undefined}>
        <div ref={host} className="learning-score-host" aria-hidden="true" />
      </div>
      {notes.length >= 6 && <p className="learning-score-scroll-hint">음표가 많을 땐 악보를 옆으로 밀어 보세요. 키보드는 악보에 초점을 두고 방향키를 눌러요.</p>}
      {error && <p className="learning-score-fallback">악보 그림을 불러오지 못했어요. {label}</p>}
    </div>
  );
}
