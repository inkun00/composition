type VexFlowModule = typeof import("vexflow");

let readyVexFlow: Promise<VexFlowModule> | null = null;

/**
 * VexFlow의 음표 글꼴(Bravura)과 문자 글꼴(Academico)이 준비된 뒤에만
 * 렌더러를 사용한다. 글꼴 준비 전의 측정값으로 SVG를 만들면 음표 기둥과
 * 빔이 어긋날 수 있으므로, 앱 전체에서 이 Promise를 한 번만 공유한다.
 */
export function loadVexFlow(): Promise<VexFlowModule> {
  if (!readyVexFlow) {
    readyVexFlow = import("vexflow")
      .then(async (vexflow) => {
        await vexflow.default.loadFonts("Bravura", "Academico");
        vexflow.default.setFonts("Bravura", "Academico");
        if (typeof document !== "undefined" && document.fonts) {
          await document.fonts.ready;
        }
        return vexflow;
      })
      .catch((error) => {
        // 일시적인 네트워크 실패 뒤 다음 렌더링에서 재시도할 수 있게 한다.
        readyVexFlow = null;
        throw error;
      });
  }
  return readyVexFlow;
}

/** 앱을 그리는 동안 글꼴 다운로드를 미리 시작한다. */
export function preloadVexFlow(): void {
  void loadVexFlow().catch(() => undefined);
}
