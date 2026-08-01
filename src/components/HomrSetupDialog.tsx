import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, LoaderCircle, ScanLine, X } from "lucide-react";
import {
  getHomrStatus,
  HomrLocalError,
  installHomrRuntime
} from "../music/homrClient";
import "./HomrSetupDialog.css";

type HomrSetupDialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
  onReady: () => void;
}>;

type SetupPhase = "checking" | "missing" | "installing" | "ready" | "error";

function setupErrorMessage(error: unknown): string {
  if (error instanceof HomrLocalError && error.code === "LOCAL_SERVER_MISSING") {
    return "아래 도우미를 받은 뒤 열어 주세요.";
  }
  return "잠시 후 다시 해 주세요.";
}

export default function HomrSetupDialog({ open, onClose, onReady }: HomrSetupDialogProps) {
  const [phase, setPhase] = useState<SetupPhase>("checking");
  const [error, setError] = useState("");

  const checkStatus = useCallback(async () => {
    setPhase("checking");
    setError("");
    try {
      const result = await getHomrStatus();
      setPhase(result.available ? "ready" : "missing");
    } catch (statusError) {
      setError(setupErrorMessage(statusError));
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (open) void checkStatus();
  }, [checkStatus, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && phase !== "installing") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open, phase]);

  async function install() {
    setPhase("installing");
    setError("");
    try {
      await installHomrRuntime();
      setPhase("ready");
    } catch (installError) {
      setError(setupErrorMessage(installError));
      setPhase("error");
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="homr-setup-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && phase !== "installing") onClose();
    }}>
      <section className="homr-setup-dialog" role="dialog" aria-modal="true"
        aria-labelledby="homr-setup-heading" data-testid="homr-setup-dialog">
        <header>
          <h2 id="homr-setup-heading">악보 사진 읽기</h2>
          <button type="button" onClick={onClose} disabled={phase === "installing"}
            aria-label="악보 읽기 준비 창 닫기" data-testid="homr-setup-close"><X size={20} /></button>
        </header>

        <div className="homr-setup-body">
          <div className={`homr-setup-state state-${phase}`} aria-live="polite">
            {phase === "checking" && <>
              <LoaderCircle className="spin" size={28} />
              <strong>준비 상태를 확인하고 있어요</strong>
            </>}
            {phase === "missing" && <>
              <Download size={28} />
              <strong>처음 한 번만 준비해 주세요</strong>
            </>}
            {phase === "installing" && <>
              <LoaderCircle className="spin" size={28} />
              <div><strong>악보 읽기를 준비하고 있어요</strong><span>잠시만 기다려 주세요.</span></div>
            </>}
            {phase === "ready" && <>
              <Check size={28} />
              <strong>준비됐어요!</strong>
            </>}
            {phase === "error" && <>
              <X size={28} />
              <div><strong>준비하지 못했어요</strong><span>{error}</span></div>
            </>}
          </div>
        </div>

        <footer>
          <button type="button" onClick={onClose} disabled={phase === "installing"}>나중에</button>
          {phase === "missing" && (
            <button type="button" className="primary" data-testid="homr-install" onClick={() => void install()}>
              <Download size={17} /> 지금 준비하기
            </button>
          )}
          {phase === "ready" && (
            <button type="button" className="primary" data-testid="homr-start" onClick={onReady}>
              <ScanLine size={17} /> 악보 읽기 시작
            </button>
          )}
          {phase === "error" && (
            <>
              <a href="/start-score-reader.cmd" download data-testid="homr-helper-download">
                <Download size={17} /> 도우미 받기
              </a>
              <button type="button" className="primary" data-testid="homr-retry" onClick={() => void checkStatus()}>
                다시 확인하기
              </button>
            </>
          )}
        </footer>
      </section>
    </div>,
    document.body
  );
}
