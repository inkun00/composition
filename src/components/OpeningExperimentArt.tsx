type ExperimentKind = "compose" | "resume" | "practice";

const colors = ["#ed4c85", "#ff9148", "#ffcf4b", "#94c83d", "#45adc0", "#5969d7", "#9b64c4"];
const melody = [6, 5, 4, 5, 3, 2, 1, 2, 4, 3, 5, 6];

export default function OpeningExperimentArt({ kind }: { kind: ExperimentKind }) {
  if (kind === "compose") {
    return (
      <svg viewBox="0 0 360 290" aria-hidden="true" focusable="false">
        <rect width="360" height="290" fill="#fff" />
        {Array.from({ length: 13 }, (_, index) => (
          <line key={`column-${index}`} x1={index * 30} x2={index * 30} y1="0" y2="240" stroke="#dfedf0" />
        ))}
        {Array.from({ length: 9 }, (_, index) => (
          <line key={`row-${index}`} x1="0" x2="360" y1={index * 30} y2={index * 30} stroke="#dfedf0" />
        ))}
        {melody.map((row, index) => (
          <rect key={`note-${index}`} x={index * 30 + 1} y={row * 30 + 1} width="28" height="28"
            fill={colors[6 - row]} />
        ))}
        <rect x="0" y="240" width="360" height="50" fill="#f4f7f8" />
        {Array.from({ length: 12 }, (_, index) => (
          <circle key={`beat-${index}`} cx={index * 30 + 15} cy="265" r={index % 3 === 0 ? 7 : 4}
            fill={index % 3 === 0 ? "#45adc0" : "#d0dfe3"} />
        ))}
      </svg>
    );
  }

  if (kind === "resume") {
    return (
      <svg viewBox="0 0 360 290" aria-hidden="true" focusable="false">
        <rect width="360" height="290" fill="#fff5bd" />
        {Array.from({ length: 6 }, (_, index) => (
          <line key={`track-${index}`} x1="0" x2="360" y1={index * 34 + 22} y2={index * 34 + 22}
            stroke="#e9dd9e" />
        ))}
        {[
          { x: 22, y: 164, width: 70, color: colors[0] },
          { x: 72, y: 130, width: 53, color: colors[2] },
          { x: 116, y: 96, width: 70, color: colors[3] },
          { x: 168, y: 62, width: 52, color: colors[4] },
          { x: 213, y: 96, width: 72, color: colors[5] },
          { x: 273, y: 130, width: 65, color: colors[6] }
        ].map((bar, index) => (
          <rect key={index} x={bar.x} y={bar.y} width={bar.width} height="16" rx="2" fill={bar.color} />
        ))}
        <rect x="0" y="218" width="360" height="72" fill="#fff" />
        {Array.from({ length: 10 }, (_, index) => (
          <line key={`key-${index}`} x1={index * 36} x2={index * 36} y1="218" y2="290" stroke="#cbd5d9" />
        ))}
        {[1, 2, 4, 5, 6, 8, 9].map((index) => (
          <rect key={`black-${index}`} x={index * 36 - 10} y="218" width="20" height="43" fill="#33383d" />
        ))}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 360 290" aria-hidden="true" focusable="false">
      <rect width="360" height="290" fill="#ed4c85" />
      <circle cx="180" cy="140" r="87" fill="#ffcf4b" />
      <circle cx="180" cy="140" r="62" fill="#fff" />
      <circle cx="180" cy="140" r="40" fill="#ffcf4b" />
      <path d="M 169 121 L 199 140 L 169 159 Z" fill="#33383d" />
      <path d="M 67 73 L 117 102 M 244 181 L 294 212" stroke="#33383d" strokeWidth="10" strokeLinecap="round" />
      <circle cx="63" cy="71" r="13" fill="#fff" />
      <circle cx="298" cy="214" r="13" fill="#fff" />
      {[59, 119, 180, 241, 301].map((x, index) => (
        <circle key={x} cx={x} cy="258" r={index % 2 === 0 ? 9 : 5} fill="#fff" opacity={index % 2 === 0 ? 1 : 0.5} />
      ))}
    </svg>
  );
}
