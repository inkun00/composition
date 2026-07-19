import { useEffect, useState } from "react";
import { ArrowLeft, Copy, FileMusic, Folder, Send, Volume2, X } from "lucide-react";
import type { User } from "../firebase/client";
import type { CommunityAlbum, PublicationAccess } from "../firebase/communityAlbums";
import type { CloudScore } from "../firebase/scores";

type PublishScoreDialogProps = Readonly<{
  user: User;
  score: CloudScore;
  onClose: () => void;
  onPublished: (album: CommunityAlbum, access: PublicationAccess) => void;
}>;

const ACCESS_OPTIONS: readonly Readonly<{
  id: PublicationAccess;
  label: string;
  description: string;
}>[] = [
  { id: "audio", label: "음악만 공개", description: "완성된 음악만 감상할 수 있어요." },
  { id: "score", label: "음악과 악보 공개", description: "음악을 듣고 가락 악보도 볼 수 있어요." },
  { id: "project", label: "프로젝트 공개", description: "다른 사람이 사본을 만들어 편집할 수 있어요." }
];

function ownerName(user: User): string {
  return user.displayName || user.email?.split("@")[0] || "마음멜로디 사용자";
}

export default function PublishScoreDialog({ user, score, onClose, onPublished }: PublishScoreDialogProps) {
  const [albums, setAlbums] = useState<CommunityAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<CommunityAlbum | null>(null);
  const [access, setAccess] = useState<PublicationAccess>("audio");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void import("../firebase/communityAlbums").then(({ listCommunityAlbums }) => listCommunityAlbums()).then((items) => {
      if (active) setAlbums(items);
    }).catch((loadError) => {
      console.error(loadError);
      if (active) setError("앨범 목록을 불러오지 못했어요.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") selectedAlbum ? setSelectedAlbum(null) : onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, selectedAlbum]);

  async function publish() {
    if (!selectedAlbum || busy) return;
    setBusy(true);
    setError("");
    try {
      const { publishScoreToAlbum } = await import("../firebase/communityAlbums");
      await publishScoreToAlbum(user.uid, ownerName(user), selectedAlbum.id, score, access);
      onPublished(selectedAlbum, access);
    } catch (publishError) {
      console.error(publishError);
      setError("앨범에 공개하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="album-subdialog-overlay publish-score-overlay" role="dialog" aria-modal="true" aria-label="앨범에 공개"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="album-subdialog publish-score-dialog">
        <header className="album-subdialog-header">
          <div>
            {selectedAlbum && <button type="button" className="community-back" aria-label="앨범 다시 선택"
              onClick={() => { setSelectedAlbum(null); setError(""); }}><ArrowLeft size={18} /></button>}
            <FileMusic size={20} /><span><strong>앨범에 공개</strong><small>{score.title || "제목 없는 악보"}</small></span>
          </div>
          <button type="button" aria-label="앨범 공개 닫기" onClick={onClose}><X size={20} /></button>
        </header>

        {loading ? (
          <div className="account-empty compact"><span className="account-spinner" /><strong>앨범을 불러오고 있어요</strong></div>
        ) : selectedAlbum ? (
          <div className="publish-access-step">
            <div className="publish-selected-album"><Folder size={25} /><span><small>선택한 앨범</small><strong>{selectedAlbum.name}</strong></span></div>
            <div className="album-access-options">
              {ACCESS_OPTIONS.map((option) => (
                <button type="button" key={option.id} className={access === option.id ? "active" : ""}
                  aria-pressed={access === option.id} onClick={() => setAccess(option.id)}>
                  {option.id === "project" ? <Copy size={20} /> : option.id === "score" ? <FileMusic size={20} /> : <Volume2 size={20} />}
                  <span><strong>{option.label}</strong><small>{option.description}</small></span>
                </button>
              ))}
            </div>
            <button type="button" className="account-primary publish-confirm" onClick={() => void publish()} disabled={busy}>
              <Send size={18} /> {busy ? "공개하는 중" : "이 범위로 공개하기"}
            </button>
          </div>
        ) : albums.length === 0 ? (
          <div className="account-empty compact"><Folder size={34} /><strong>만들어진 앨범이 없어요</strong><p>모두의 앨범에서 앨범을 먼저 만들어 주세요.</p></div>
        ) : (
          <div className="publish-album-grid">
            {albums.map((album) => (
              <button type="button" key={album.id} onClick={() => setSelectedAlbum(album)}>
                <Folder size={35} /><span><strong>{album.name}</strong><small>{album.ownerName}의 앨범</small></span>
              </button>
            ))}
          </div>
        )}
        {error && <p className="community-album-error" role="status">{error}</p>}
      </section>
    </div>
  );
}
