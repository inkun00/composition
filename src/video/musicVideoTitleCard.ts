const FONT_FAMILY = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
type TextBlock = Readonly<{ lines: readonly string[]; size: number }>;

function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
  }
  return Array.from(text);
}

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const letter of graphemes(text.replace(/\s+/gu, " ").trim())) {
    if (line && context.measureText(line + letter).width > maxWidth) {
      lines.push(line.trimEnd());
      line = letter.trimStart();
    } else line += letter;
  }
  if (line) lines.push(line);
  return lines;
}

function fit(context: CanvasRenderingContext2D, text: string, size: number, minimum: number,
  maxLines: number, weight: number, maxWidth: number): TextBlock {
  let lines: string[] = [];
  for (; size >= minimum; size -= 2) {
    context.font = `${weight} ${size}px ${FONT_FAMILY}`;
    lines = wrap(context, text, maxWidth);
    if (lines.length <= maxLines) return { lines, size };
  }
  size = minimum;
  context.font = `${weight} ${size}px ${FONT_FAMILY}`;
  lines = lines.slice(0, maxLines);
  const last = graphemes(lines.at(-1) ?? "");
  while (last.length && context.measureText(last.join("") + "…").width > maxWidth) last.pop();
  lines[maxLines - 1] = last.join("") + "…";
  return { lines, size };
}

/** A missing introductory drawing shows a legible card, never the first song drawing. */
export function drawMusicVideoTitleCard(context: CanvasRenderingContext2D, title: string,
  composer: string | undefined, width: number, height: number): void {
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const maxWidth = width - 160;
  const heading = fit(context, title.trim() || "나의 뮤직비디오", 76, 28, 3, 700, maxWidth);
  const credit = fit(context, composer?.trim() ? `작곡가 ${composer.trim()}` : "작곡가 미입력", 32, 24, 2, 400, maxWidth);
  const gap = 42;
  const headingHeight = heading.lines.length * heading.size * 1.25;
  const creditHeight = credit.lines.length * credit.size * 1.4;
  let y = (height - headingHeight - gap - creditHeight) / 2 + heading.size * 1.25 / 2;
  context.font = `700 ${heading.size}px ${FONT_FAMILY}`;
  for (const line of heading.lines) {
    context.fillText(line, width / 2, y, maxWidth);
    y += heading.size * 1.25;
  }
  y += gap + credit.size * 1.4 / 2 - heading.size * 1.25 / 2;
  context.font = `400 ${credit.size}px ${FONT_FAMILY}`;
  for (const line of credit.lines) {
    context.fillText(line, width / 2, y, maxWidth);
    y += credit.size * 1.4;
  }
}
