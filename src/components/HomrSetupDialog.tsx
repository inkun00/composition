import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, ExternalLink, LoaderCircle, RotateCw, ScanLine, X } from "lucide-react";
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
  hosted?: boolean;
}>;

type SetupPhase = "checking" | "helper-missing" | "runtime-missing" | "installing" | "ready" | "error";
type Device = "windows" | "mac" | "linux" | "mobile";

const NODE_DOWNLOAD = "https://nodejs.org/ko/download";
const PYTHON_DOWNLOAD = "https://www.python.org/downloads/";

function currentDevice(): Device {
  const agent = navigator.userAgent.toLowerCase();
  if (/android|iphone|ipad|ipod|mobile/.test(agent)) return "mobile";
  if (agent.includes("windows")) return "windows";
  if (agent.includes("mac")) return "mac";
  return "linux";
}

function setupErrorMessage(error: unknown): string {
  if (error instanceof HomrLocalError && error.code === "PYTHON_NOT_FOUND") {
    return "Python을 설치한 뒤 다시 준비하기를 눌러 주세요.";
  }
  if (error instanceof HomrLocalError && error.code === "LOCAL_SERVER_MISSING") {
    return "앱을 다시 열고 연결을 확인해 주세요.";
  }
  return error instanceof Error ? error.message : "잠시 후 다시 해 주세요.";
}

export default function HomrSetupDialog({ open, onClose, onReady,
  hosted = import.meta.env.PROD }: HomrSetupDialogProps) {
  const [phase, setPhase] = useState<SetupPhase>("checking");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const device = currentDevice();

  const checkStatus = useCallback(async (quiet = false) => {
    if (!quiet) {
      setPhase("checking");
      setError("");
      setErrorCode("");
    }
    try {
      const result = await getHomrStatus();
      setErrorCode("");
      setPhase(result.available ? "ready" : "runtime-missing");
    } catch (statusError) {
      if (quiet) return;
      if (hosted && statusError instanceof HomrLocalError && statusError.code === "LOCAL_SERVER_MISSING") {
        setPhase("helper-missing");
        return;
      }
      setErrorCode(statusError instanceof HomrLocalError ? statusError.code : "");
      setError(setupErrorMessage(statusError));
      setPhase("error");
    }
  }, [hosted]);

  useEffect(() => {
    if (open) void checkStatus();
  }, [checkStatus, open]);

  useEffect(() => {
    if (!open || phase !== "helper-missing") return;
    const timer = window.setInterval(() => { void checkStatus(true); }, 3000);
    return () => window.clearInterval(timer);
  }, [checkStatus, open, phase]);

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
    setErrorCode("");
    try {
      await installHomrRuntime();
      setPhase("ready");
    } catch (installError) {
      setErrorCode(installError instanceof HomrLocalError ? installError.code : "");
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
          <div><h2 id="homr-setup-heading">악보 사진 읽기</h2>
            <p>처음 한 번만 준비하면 다음에는 바로 읽을 수 있어요.</p></div>
          <button type="button" onClick={onClose} disabled={phase === "installing"}
            aria-label="악보 읽기 준비 창 닫기" data-testid="homr-setup-close"><X size={20} /></button>
        </header>

        <div className="homr-setup-body">
          <div className="homr-setup-journey" aria-label="악보 읽기 준비 단계">
            {hosted && <span className={phase === "helper-missing" ? "current" : "done"}>1 도우미 연결</span>}
            <span className={phase === "runtime-missing" || phase === "installing" || phase === "error" ? "current" :
              phase === "ready" ? "done" : ""}>{hosted ? "2" : "1"} 읽기 준비</span>
            <span className={phase === "ready" ? "current" : ""}>{hosted ? "3" : "2"} 사진 읽기</span>
          </div>
          <div className={`homr-setup-state state-${phase}`} aria-live="polite">
            {phase === "checking" && <>
              <LoaderCircle className="spin" size={28} />
              <strong>연결을 확인하고 있어요</strong>
            </>}
            {phase === "helper-missing" && <>
              <Download size={28} />
              <div><strong>이 컴퓨터에 도우미가 필요해요</strong>
                <span>도우미를 켜면 이 화면이 자동으로 다음 단계로 넘어가요.</span></div>
            </>}
            {phase === "runtime-missing" && <>
              <Download size={28} />
              <div><strong>읽기 도구를 준비할게요</strong><span>아래 버튼을 누르면 이 컴퓨터에서 준비를 시작해요.</span></div>
            </>}
            {phase === "installing" && <>
              <LoaderCircle className="spin" size={28} />
              <div><strong>악보 읽기를 준비하고 있어요</strong><span>잠시만 기다려 주세요.</span></div>
            </>}
            {phase === "ready" && <>
              <Check size={28} />
              <div><strong>준비됐어요!</strong><span>이제 고른 악보 사진을 읽을 수 있어요.</span></div>
            </>}
            {phase === "error" && <>
              <X size={28} />
              <div><strong>준비하지 못했어요</strong><span>{error}</span></div>
            </>}
          </div>
          {phase === "helper-missing" && device === "windows" && <div className="homr-setup-guide">
            <div className="homr-setup-guide-step"><span>1</span><div><strong>도우미 파일 받기</strong>
              <p>아래 버튼을 누르면 파일이 다운로드돼요.</p>
              <a href="/start-score-reader.cmd" download data-testid="homr-helper-download">
                <Download size={16} /> 도우미 받기</a></div></div>
            <div className="homr-setup-guide-step"><span>2</span><div><strong>받은 파일 열기</strong>
              <p>다운로드 목록에서 <b>start-score-reader.cmd</b>를 열어 주세요. 앱이 다시 열리면 준비됐어요.
                컴퓨터가 실행을 막으면 보호자나 선생님께 도움을 요청하세요.</p></div></div>
            <p className="homr-setup-tip">“Node.js가 필요합니다”라고 나오면
              <a href={NODE_DOWNLOAD} target="_blank" rel="noopener noreferrer">Node.js 설치 페이지 <ExternalLink size={13} /></a>
              에서 설치한 뒤 도우미 파일을 다시 열어 주세요.</p>
          </div>}
          {phase === "helper-missing" && device !== "windows" && <div className="homr-setup-guide"
            data-testid="homr-device-unsupported">
            <strong>{device === "mobile" ? "휴대폰에서는 도우미를 실행할 수 없어요" :
              "이 기기에서는 간편 도우미 설치를 아직 지원하지 않아요"}</strong>
            <p>사진 읽기는 Windows 컴퓨터에서 이용해 주세요. 악보 파일(XML·MXL)은 이 기기에서도 바로 가져올 수 있어요.</p>
          </div>}
          {phase === "runtime-missing" && <p className="homr-setup-tip">준비에 실패하면
            <a href={PYTHON_DOWNLOAD} target="_blank" rel="noopener noreferrer">Python 설치 페이지 <ExternalLink size={13} /></a>
            가 필요할 수 있어요.</p>}
          {phase === "error" && errorCode === "PYTHON_NOT_FOUND" && <div className="homr-setup-guide">
            <strong>Python을 설치해 주세요</strong>
            <p>설치를 마친 뒤 아래 “다시 준비하기”를 눌러 주세요. 안 되면 도우미를 껐다가 다시 열어 주세요.</p>
            <a href={PYTHON_DOWNLOAD} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} /> Python 설치 페이지 열기</a>
          </div>}
          {phase === "error" && errorCode !== "PYTHON_NOT_FOUND" && <p className="homr-setup-tip">
            연결이 안 되면 도우미가 켜져 있는지 확인하고 다시 시도해 주세요.</p>}
          <p className="homr-setup-file-note">악보 파일(XML·MXL)은 설치 없이 바로 가져올 수 있어요.</p>
        </div>

        <footer>
          <button type="button" onClick={onClose} disabled={phase === "installing"}>나중에</button>
          {phase === "helper-missing" && device === "windows" && (
            <button type="button" className="primary" data-testid="homr-retry" onClick={() => void checkStatus()}>
              <RotateCw size={17} /> 연결 확인하기
            </button>
          )}
          {phase === "runtime-missing" && (
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
            <button type="button" className="primary" data-testid="homr-retry"
              onClick={() => void (errorCode === "PYTHON_NOT_FOUND" ? install() : checkStatus())}>
              <RotateCw size={17} /> {errorCode === "PYTHON_NOT_FOUND" ? "다시 준비하기" : "다시 확인하기"}
            </button>
          )}
        </footer>
      </section>
    </div>,
    document.body
  );
}
