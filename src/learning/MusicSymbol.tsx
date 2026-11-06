import { useEffect, useRef } from "react";
import { loadVexFlow } from "../music/vexflow";

export type MusicSymbolId = "treble" | "bass" | "barline" | "final" | "repeat" | "sharp" | "flat" | "natural";

const labels: Record<MusicSymbolId, string> = {
  treble: "높은음자리표",
  bass: "낮은음자리표",
  barline: "세로줄",
  final: "끝세로줄",
  repeat: "도돌이표",
  sharp: "올림표",
  flat: "내림표",
  natural: "제자리표"
};

function ClefSymbol({ id, size }: { id: "treble" | "bass"; size: number }) {
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const target = host.current;
    if (!target) return;
    let cancelled = false;
    void loadVexFlow().then(({ Renderer, Stave }) => {
      if (cancelled) return;
      target.replaceChildren();
      // VexFlow expects a div target. Move its finished SVG into the inline host
      // so symbols also remain valid phrasing content inside choice buttons.
      const renderTarget = document.createElement("div");
      const renderer = new Renderer(renderTarget, Renderer.Backends.SVG);
      renderer.resize(96, 122);
      const context = renderer.getContext();
      const stave = new Stave(9, 10, 78, { spacingBetweenLinesPx: 11, leftBar: false, rightBar: false });
      stave.setStyle({ strokeStyle: "#a5b3ac", fillStyle: "#223e3c" });
      stave.addClef(id).setContext(context).draw();
      const svg = renderTarget.querySelector("svg");
      svg?.setAttribute("viewBox", "0 0 96 122");
      svg?.setAttribute("width", "100%");
      svg?.setAttribute("height", "100%");
      if (svg) {
        svg.style.width = "100%";
        svg.style.height = "100%";
      }
      svg?.setAttribute("aria-hidden", "true");
      if (svg) target.appendChild(svg);
    }).catch(() => {
      if (!cancelled) target.textContent = labels[id];
    });
    return () => {
      cancelled = true;
      target.replaceChildren();
    };
  }, [id]);

  return <span ref={host} role="img" aria-label={labels[id]}
    style={{ display: "inline-block", width: size, height: size, flex: "none", verticalAlign: "middle" }} />;
}

export default function MusicSymbol({ id, size = 64 }: { id: MusicSymbolId; size?: number }) {
  if (id === "treble" || id === "bass") return <ClefSymbol id={id} size={size} />;
  const hasStaff = id === "barline" || id === "final" || id === "repeat";

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={labels[id]}
      focusable="false" style={{ display: "inline-block", flex: "none", verticalAlign: "middle" }}>
      {hasStaff && [16, 24, 32, 40, 48].map((y) =>
        <path key={y} d={`M8 ${y}H56`} stroke="#a5b3ac" strokeWidth="1" />)}
      {id === "barline" && <path d="M32 16V48" stroke="currentColor" strokeWidth="2" />}
      {id === "final" && <>
        <path d="M29 16V48" stroke="currentColor" strokeWidth="2" />
        <path d="M38 16V48" stroke="currentColor" strokeWidth="5" />
      </>}
      {id === "repeat" && <>
        <path d="M35 16V48" stroke="currentColor" strokeWidth="2" />
        <path d="M44 16V48" stroke="currentColor" strokeWidth="5" />
        <circle cx="27" cy="28" r="2.4" fill="currentColor" />
        <circle cx="27" cy="36" r="2.4" fill="currentColor" />
      </>}
      {id === "sharp" && <>
        <path d="M25 13V53M37 10V50" stroke="currentColor" strokeWidth="2.5" />
        <path d="M18 28 44 23M18 42 44 37" stroke="currentColor" strokeWidth="5" />
      </>}
      {id === "flat" && <>
        <path d="M25 10V51 Q47 37 39 29 Q34 24 25 33" fill="none" stroke="currentColor"
          strokeWidth="3" strokeLinejoin="round" />
      </>}
      {id === "natural" && <>
        <path d="M25 10V45M38 21V55" stroke="currentColor" strokeWidth="2.5" />
        <path d="M25 29 38 25M25 43 38 39" stroke="currentColor" strokeWidth="5" />
      </>}
    </svg>
  );
}
