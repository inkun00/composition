import { useState, type FormEvent } from "react";
import { Lock, X } from "lucide-react";
import type { CommunityAlbum } from "../firebase/communityAlbums";
import "./AlbumPasswordDialog.css";

type Props = Readonly<{
  album: CommunityAlbum;
  mode: "unlock" | "manage";
  signedIn: boolean;
  onRequestLogin: () => void;
  onSubmit: (password: string) => Promise<void>;
  onRemove?: () => Promise<void>;
  onClose: () => void;
}>;

export default function AlbumPasswordDialog({ album, mode, signedIn, onRequestLogin, onSubmit, onRemove, onClose }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const manage = mode === "manage";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signedIn || busy) return;
    const value = password.trim();
    if (manage && value.length < 4) {
      setError("암호는 4글자 이상 적어 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(value);
    } catch (failure) {
      console.error(failure);
      setError(failure && typeof failure === "object" && "code" in failure && failure.code === "permission-denied"
        ? "암호가 맞지 않아요. 다시 확인해 주세요."
        : "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onRemove || busy) return;
    setBusy(true);
    setError("");
    try {
      await onRemove();
    } catch (failure) {
      console.error(failure);
      setError("암호를 해제하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="album-subdialog-overlay" role="dialog" aria-modal="true"
    aria-label={manage ? `${album.name} 앨범 암호 설정` : `${album.name} 앨범 입장`}
    onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="album-subdialog album-password-dialog">
      <header className="album-subdialog-header">
        <div><Lock size={20} /><strong>{manage ? "앨범 암호 설정" : album.name}</strong></div>
        <button type="button" aria-label="암호 창 닫기" disabled={busy} onClick={onClose}><X size={20} /></button>
      </header>
      <form className="album-create-form" onSubmit={(event) => void submit(event)}>
        <p className="album-password-help">{manage
          ? "새 암호를 정해 주세요. 암호를 바꾸면 친구들도 새 암호를 입력해야 해요."
          : "이 앨범의 암호를 알고 있는 친구만 노래를 볼 수 있어요."}</p>
        <label><span>{manage ? "새 앨범 암호" : "앨범 암호"}</span>
          <input type="password" value={password} maxLength={40} autoComplete="off" autoFocus
            placeholder={manage ? "4글자 이상 적어 주세요" : "앨범 암호를 입력해 주세요"}
            onChange={(event) => { setPassword(event.target.value); setError(""); }} /></label>
        {!signedIn && <div className="album-login-needed"><Lock size={18} /><span>암호를 확인하려면 먼저 로그인해 주세요.</span>
          <button type="button" onClick={onRequestLogin}>로그인</button></div>}
        {error && <p className="community-album-error" role="status">{error}</p>}
        <button type="submit" className="account-primary" disabled={!signedIn || busy || !password.trim()}>
          <Lock size={17} /> {busy ? "확인하는 중..." : manage ? "암호 저장" : "앨범 들어가기"}
        </button>
        {manage && album.locked && onRemove && <button type="button" className="album-password-remove"
          disabled={busy} onClick={() => void remove()}>암호 해제하기</button>}
      </form>
    </section>
  </div>;
}
