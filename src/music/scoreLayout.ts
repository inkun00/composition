export type ScoreLayoutOptions = Readonly<{
  compact?: boolean;
  wide?: boolean;
  showSignature?: boolean;
}>;

/**
 * 악보, 음표 선택 영역, 가사 입력칸이 공유하는 내부 SVG 좌표계다.
 * 화면의 CSS 크기와 무관하게 이 값을 기준으로 위치를 계산한다.
 */
export function scoreLayout({
  compact = false,
  wide = false,
  showSignature = true
}: ScoreLayoutOptions = {}) {
  const width = compact ? (wide ? 560 : 390) : 700;
  // 4마디 전체 악보는 두 배 표기를 온전히 담을 만큼 세로 공간을 사용한다.
  const height = compact ? (wide ? 390 : 178) : 196;
  const left = showSignature ? (compact ? 92 : 118) : 34;
  // 확대된 음자리표·박자표 뒤 첫 음표의 빈 공간을 과하게 두지 않는다.
  // 150은 박자표와 겹치지 않으면서 첫 음을 자연스럽게 가까이 붙이는 값이다.
  const noteStartX = showSignature && compact && wide ? 150 : left;
  const rightPadding = compact ? 58 : 72;

  return {
    width,
    height,
    left,
    noteStartX,
    rightPadding,
    usableWidth: width - left - rightPadding
  } as const;
}
