import { useEffect, useState, type FormEvent } from "react";
import { Cloud, Copy, Eye, EyeOff, FileMusic, Library, LogIn, LogOut, Mail, Save, Trash2, UserRound, X } from "lucide-react";
import type { User } from "../firebase/client";
import type { CloudScore } from "../firebase/scores";

type AccountLibraryProps = Readonly<{
  configured: boolean;
  user: User | null;
  authReady: boolean;
  scores: readonly CloudScore[];
  loading: boolean;
  busy: boolean;
  error: string;
  currentScoreId: string | null;
  onClose: () => void;
  onGoogleSignIn: () => void;
  onEmailAuth: (mode: "signin" | "signup", email: string, password: string) => Promise<boolean>;
  onPasswordReset: (email: string) => Promise<boolean>;
  onClearError: () => void;
  onSignOut: () => void;
  onSave: (asCopy: boolean) => void;
  onLoad: (score: CloudScore) => void;
  onDelete: (score: CloudScore) => void;
}>;

function updatedLabel(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "저장 시간 확인 중";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(timestamp));
}

export default function AccountLibrary({ configured, user, authReady, scores, loading, busy, error,
  currentScoreId, onClose, onGoogleSignIn, onEmailAuth, onPasswordReset, onClearError,
  onSignOut, onSave, onLoad, onDelete }: AccountLibraryProps) {
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  function changeAuthMode(mode: "signin" | "signup") {
    setAuthMode(mode);
    setPassword("");
    setPasswordConfirm("");
    setFormError("");
    setResetSent(false);
    onClearError();
  }

  function changeField(update: (value: string) => void, value: string) {
    update(value);
    setFormError("");
    setResetSent(false);
    onClearError();
  }

  async function submitEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setResetSent(false);
    if (authMode === "signup" && password !== passwordConfirm) {
      setFormError("비밀번호가 서로 같지 않아요.");
      return;
    }
    await onEmailAuth(authMode, email.trim(), password);
  }

  async function requestPasswordReset() {
    setFormError("");
    setResetSent(false);
    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.value = email.trim();
    if (!emailInput.checkValidity()) {
      setFormError("비밀번호를 재설정할 이메일 주소를 정확히 입력해 주세요.");
      return;
    }
    setResetSent(await onPasswordReset(email.trim()));
  }

  return (
    <div className="account-overlay" role="dialog" aria-modal="true" aria-label="내 악보함"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="account-library">
        <header className="account-library-header">
          <div><span><Library size={19} aria-hidden="true" /></span><div><h2>내 악보함</h2><p>로그인한 계정에서만 보이는 개인 악보예요.</p></div></div>
          <button type="button" className="account-close" aria-label="내 악보함 닫기" onClick={onClose}><X size={20} /></button>
        </header>

        {!configured ? (
          <div className="account-empty">
            <Cloud size={34} aria-hidden="true" />
            <strong>Firebase 연결이 필요해요</strong>
            <p>관리자가 Firebase 프로젝트 정보를 배포 환경에 등록하면 로그인과 클라우드 저장이 열립니다.</p>
          </div>
        ) : !authReady ? (
          <div className="account-empty"><span className="account-spinner" /><strong>계정을 확인하고 있어요</strong></div>
        ) : !user ? (
          <div className="account-auth">
            <div className="account-auth-heading">
              <UserRound size={32} aria-hidden="true" />
              <strong>내 악보를 안전하게 모아 두세요</strong>
              <p>이메일 계정이나 Google 계정으로 어느 기기에서든 악보를 열 수 있어요.</p>
            </div>
            <div className="account-auth-tabs" role="tablist" aria-label="계정 방식">
              <button type="button" role="tab" aria-selected={authMode === "signin"}
                onClick={() => changeAuthMode("signin")}>로그인</button>
              <button type="button" role="tab" aria-selected={authMode === "signup"}
                onClick={() => changeAuthMode("signup")}>회원가입</button>
            </div>
            <form className="account-auth-form" onSubmit={(event) => void submitEmailAuth(event)}>
              <label>
                <span>이메일</span>
                <div className="account-input"><Mail size={18} aria-hidden="true" />
                  <input type="email" value={email} onChange={(event) => changeField(setEmail, event.target.value)}
                    placeholder="name@example.com" autoComplete="email" required disabled={busy} />
                </div>
              </label>
              <label>
                <span>비밀번호</span>
                <div className="account-input">
                  <input type={showPassword ? "text" : "password"} value={password}
                    onChange={(event) => changeField(setPassword, event.target.value)} placeholder="6자 이상"
                    autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                    minLength={6} required disabled={busy} />
                  <button type="button" title={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    onClick={() => setShowPassword((shown) => !shown)}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              {authMode === "signup" && (
                <label>
                  <span>비밀번호 확인</span>
                  <div className="account-input">
                    <input type={showPassword ? "text" : "password"} value={passwordConfirm}
                      onChange={(event) => changeField(setPasswordConfirm, event.target.value)} placeholder="한 번 더 입력"
                      autoComplete="new-password" minLength={6} required disabled={busy} />
                  </div>
                </label>
              )}
              {(formError || error) && <p className="account-error" role="alert">{formError || error}</p>}
              {resetSent && <p className="account-notice" role="status">비밀번호 재설정 메일을 보냈어요.</p>}
              <button type="submit" className="account-primary" disabled={busy}>
                <LogIn size={18} aria-hidden="true" /> {authMode === "signup" ? "이메일로 회원가입" : "이메일로 로그인"}
              </button>
              {authMode === "signin" && (
                <button type="button" className="account-reset" onClick={() => void requestPasswordReset()} disabled={busy}>
                  비밀번호를 잊었나요?
                </button>
              )}
            </form>
            <div className="account-divider"><span>또는</span></div>
            <button type="button" className="account-secondary account-google" onClick={onGoogleSignIn} disabled={busy}>
              <LogIn size={18} aria-hidden="true" /> Google로 계속하기
            </button>
          </div>
        ) : (
          <>
            <div className="account-profile">
              {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <UserRound size={22} />}
              <div><strong>{user.displayName || "마음멜로디 사용자"}</strong><span>{user.email}</span></div>
              <button type="button" title="로그아웃" aria-label="로그아웃" onClick={onSignOut} disabled={busy}><LogOut size={18} /></button>
            </div>
            <div className="cloud-save-actions">
              <button type="button" className="account-primary" onClick={() => onSave(false)} disabled={busy}>
                <Save size={18} aria-hidden="true" /> {currentScoreId ? "현재 악보 업데이트" : "현재 악보 저장"}
              </button>
              {currentScoreId && (
                <button type="button" className="account-secondary" onClick={() => onSave(true)} disabled={busy}>
                  <Copy size={18} aria-hidden="true" /> 새 악보로 저장
                </button>
              )}
            </div>
            {error && <p className="account-error" role="status">{error}</p>}
            <div className="account-score-heading"><strong>저장된 악보</strong><span>{scores.length}개</span></div>
            {loading ? (
              <div className="account-empty compact"><span className="account-spinner" /><strong>악보를 불러오고 있어요</strong></div>
            ) : scores.length === 0 ? (
              <div className="account-empty compact"><FileMusic size={30} /><strong>아직 저장된 악보가 없어요</strong></div>
            ) : (
              <div className="account-score-list">
                {scores.map((score) => (
                  <article className={score.id === currentScoreId ? "account-score active" : "account-score"} key={score.id}>
                    <button type="button" className="account-score-open" onClick={() => onLoad(score)} disabled={busy}>
                      <FileMusic size={21} aria-hidden="true" />
                      <span><strong>{score.title || "제목 없는 악보"}</strong><small>{score.songLength}마디 · {updatedLabel(score.updatedAt)}</small></span>
                    </button>
                    <button type="button" className="account-score-delete" title="악보 삭제" aria-label={`${score.title} 삭제`}
                      onClick={() => onDelete(score)} disabled={busy}><Trash2 size={18} /></button>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
