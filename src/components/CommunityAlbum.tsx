import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Copy,
  FileMusic,
  Folder,
  Library,
  Lock,
  Play,
  Plus,
  Save,
  Trash2,
  X
} from "lucide-react";
import type { User } from "../firebase/client";
import type {
  CommunityAlbum as CommunityAlbumItem,
  PublicationAccess,
  PublishedSong
} from "../firebase/communityAlbums";
import { findHarmonyPreset } from "../music/harmonyPresets";
import type { NoteEvent } from "../music/types";
import PdfScoreSheet from "./PdfScoreSheet";

type CommunityAlbumProps = Readonly<{
  configured: boolean;
  user: User | null;
  onClose: () => void;
  onRequestLogin: () => void;
  onPlay: (song: PublishedSong) => Promise<boolean>;
  onOpenProject: (song: PublishedSong) => void;
}>;

const ACCESS_OPTIONS: readonly Readonly<{
  id: PublicationAccess;
  label: string;
  description: string;
}>[] = [
  { id: "audio", label: "음악만 공개", description: "완성된 음악만 들을 수 있어요." },
  { id: "score", label: "음악과 악보 공개", description: "음악과 가락 악보를 볼 수 있어요." },
  { id: "project", label: "프로젝트 공개", description: "사본을 만들어 직접 편집할 수 있어요." }
];

const ADMIN_EMAIL = "inkun00@hanmail.net";

function accessLabel(access: PublicationAccess): string {
  return ACCESS_OPTIONS.find((option) => option.id === access)?.label ?? "음악만 공개";
}

function userName(user: User): string {
  return user.displayName || user.email?.split("@")[0] || "마음멜로디 사용자";
}

function canDeleteAlbum(user: User | null, album: CommunityAlbumItem): boolean {
  return user?.uid === album.ownerId || user?.email?.trim().toLowerCase() === ADMIN_EMAIL;
}

function notesWithLegacyLyrics(notes: readonly NoteEvent[], lyric: string | undefined): readonly NoteEvent[] {
  if (!lyric || notes.some((note) => note.lyric)) return notes;
  const syllables = Array.from(lyric.replace(/\s+/g, ""));
  let lyricIndex = 0;
  return notes.map((note) => note.pitch === null ? note : { ...note, lyric: syllables[lyricIndex++] ?? "" });
}

function PublicScorePreview({ song, onClose }: Readonly<{ song: PublishedSong; onClose: () => void }>) {
  const preset = findHarmonyPreset(song.draft.presetId);
  const printableMeasures = song.draft.measures.flatMap((measure, index) => measure.notes ? [{
    candidateName: measure.candidateName ?? "나만의 가락",
    notes: notesWithLegacyLyrics(measure.notes, song.draft.lyrics[index]),
    chords: preset.bars[index % preset.bars.length]
  }] : []);
  return (
    <div className="album-subdialog-overlay" role="dialog" aria-modal="true" aria-label={`${song.title} 악보`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="album-subdialog album-score-dialog">
        <header className="album-subdialog-header">
          <div><FileMusic size={20} /><span><strong>{song.title}</strong><small>{song.creator} 작곡 · {song.draft.songLength}마디</small></span></div>
          <button type="button" aria-label="악보 닫기" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="community-score-preview">
          <PdfScoreSheet title={song.title} description={song.draft.description ?? ""} creator={song.creator}
            originalCreator={song.draft.originalCreator} meter={song.draft.meter}
            measures={printableMeasures} includeAccompaniment={false} preview />
        </div>
      </section>
    </div>
  );
}

export default function CommunityAlbum({ configured, user, onClose, onRequestLogin, onPlay, onOpenProject }: CommunityAlbumProps) {
  const [albums, setAlbums] = useState<CommunityAlbumItem[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<CommunityAlbumItem | null>(null);
  const [songs, setSongs] = useState<PublishedSong[]>([]);
  const [selectedSong, setSelectedSong] = useState<PublishedSong | null>(null);
  const [scoreSong, setScoreSong] = useState<PublishedSong | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [albumName, setAlbumName] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [manageAccess, setManageAccess] = useState<PublicationAccess>("audio");
  const [error, setError] = useState("");

  const refreshAlbums = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError("");
    try {
      const { listCommunityAlbums } = await import("../firebase/communityAlbums");
      setAlbums(await listCommunityAlbums());
    } catch (loadError) {
      console.error(loadError);
      setError("앨범을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    void refreshAlbums();
  }, [refreshAlbums]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (scoreSong) setScoreSong(null);
      else if (selectedSong) setSelectedSong(null);
      else if (createOpen) setCreateOpen(false);
      else onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [createOpen, onClose, scoreSong, selectedSong]);

  async function openAlbum(album: CommunityAlbumItem) {
    setSelectedAlbum(album);
    setSongs([]);
    setLoading(true);
    setError("");
    try {
      const { listPublishedSongs } = await import("../firebase/communityAlbums");
      setSongs(await listPublishedSongs(album.id));
    } catch (loadError) {
      console.error(loadError);
      setError("앨범 속 노래를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAlbum(album: CommunityAlbumItem) {
    if (!canDeleteAlbum(user, album)) return;
    if (!window.confirm(`'${album.name}' 앨범을 삭제할까요? 앨범에 공개된 음악도 모두 삭제되며 되돌릴 수 없어요.`)) return;
    setBusy(true);
    setError("");
    try {
      const { deleteCommunityAlbum } = await import("../firebase/communityAlbums");
      await deleteCommunityAlbum(album.id);
      setAlbums((current) => current.filter((item) => item.id !== album.id));
    } catch (deleteError) {
      console.error(deleteError);
      setError("앨범을 삭제하지 못했어요. 권한을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAlbum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setError("앨범을 만들려면 먼저 로그인해 주세요.");
      return;
    }
    const trimmedName = albumName.trim();
    if (!trimmedName) {
      setError("앨범 이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { createCommunityAlbum } = await import("../firebase/communityAlbums");
      const album = await createCommunityAlbum(user.uid, userName(user), trimmedName);
      setAlbums((current) => [album, ...current]);
      setAlbumName("");
      setCreateOpen(false);
    } catch (createError) {
      console.error(createError);
      setError("앨범을 만들지 못했어요. 이름을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function playSelectedSong(song: PublishedSong) {
    if (playingSongId) return;
    setPlayingSongId(song.id);
    setError("");
    try {
      if (!await onPlay(song)) setError("다른 음악이 끝난 뒤 다시 재생해 주세요.");
    } finally {
      setPlayingSongId(null);
    }
  }

  async function saveAccess() {
    if (!selectedSong || selectedSong.ownerId !== user?.uid) return;
    setBusy(true);
    setError("");
    try {
      const { updatePublishedSongAccess } = await import("../firebase/communityAlbums");
      await updatePublishedSongAccess(selectedSong.albumId, selectedSong.id, manageAccess);
      const updated = { ...selectedSong, access: manageAccess, updatedAt: Date.now() };
      setSelectedSong(updated);
      setSongs((current) => current.map((song) => song.id === updated.id ? updated : song));
    } catch (updateError) {
      console.error(updateError);
      setError("공개 범위를 바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSong() {
    if (!selectedSong || selectedSong.ownerId !== user?.uid) return;
    if (!window.confirm(`'${selectedSong.title}'을 이 앨범에서 삭제할까요? 내 악보함의 원본은 삭제되지 않아요.`)) return;
    setBusy(true);
    setError("");
    try {
      const { removePublishedSong } = await import("../firebase/communityAlbums");
      await removePublishedSong(selectedSong.albumId, selectedSong.id);
      setSongs((current) => current.filter((song) => song.id !== selectedSong.id));
      setSelectedSong(null);
    } catch (deleteError) {
      console.error(deleteError);
      setError("앨범에서 노래를 삭제하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  function selectSong(song: PublishedSong) {
    setSelectedSong(song);
    setManageAccess(song.access);
    setError("");
  }

  return (
    <div className="account-overlay community-album-overlay" role="dialog" aria-modal="true" aria-label="모두의 앨범"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="account-library community-album-window">
        <header className="account-library-header community-album-header">
          <div>
            {selectedAlbum && <button type="button" className="community-back" aria-label="앨범 목록으로 돌아가기"
              onClick={() => { setSelectedAlbum(null); setSongs([]); setError(""); }}><ArrowLeft size={19} /></button>}
            <span><Library size={19} aria-hidden="true" /></span>
            <div><h2>{selectedAlbum?.name ?? "모두의 앨범"}</h2><p>{selectedAlbum ? `${songs.length}개의 노래` : "친구들이 공개한 노래를 만나는 곳이에요."}</p></div>
          </div>
          <div className="community-header-actions">
            {!selectedAlbum && <button type="button" className="community-create-button"
              onClick={() => { setCreateOpen(true); setError(""); }}><Plus size={17} /> 앨범 만들기</button>}
            <button type="button" className="account-close" aria-label="모두의 앨범 닫기" onClick={onClose}><X size={20} /></button>
          </div>
        </header>

        {!configured ? (
          <div className="account-empty"><Library size={34} /><strong>Firebase 연결이 필요해요</strong></div>
        ) : loading ? (
          <div className="account-empty"><span className="account-spinner" /><strong>앨범을 불러오고 있어요</strong></div>
        ) : selectedAlbum ? (
          songs.length === 0 ? (
            <div className="account-empty"><FileMusic size={34} /><strong>아직 공개된 노래가 없어요</strong><p>내 악보함에서 이 앨범에 첫 노래를 공개해 보세요.</p></div>
          ) : (
            <div className="community-song-list">
              {songs.map((song) => (
                <button type="button" className="community-song" key={song.id} onClick={() => selectSong(song)}>
                  <span className="community-song-icon"><FileMusic size={22} /></span>
                  <span><strong>{song.title || "제목 없는 노래"}</strong><small>{song.creator || song.ownerName} · {song.draft.songLength}마디</small></span>
                  <em>{accessLabel(song.access)}</em>
                </button>
              ))}
            </div>
          )
        ) : albums.length === 0 ? (
          <div className="account-empty"><Folder size={36} /><strong>첫 앨범을 만들어 보세요</strong><p>오른쪽 위의 앨범 만들기 버튼으로 시작할 수 있어요.</p></div>
        ) : (
          <div className="community-album-grid">
            {albums.map((album) => (
              <article className="community-album-folder-card" key={album.id}>
                <button type="button" className="community-album-folder" disabled={busy}
                  onClick={() => void openAlbum(album)}>
                  <Folder size={45} strokeWidth={1.7} aria-hidden="true" />
                  <span><strong>{album.name}</strong><small>{album.ownerName}의 앨범</small></span>
                </button>
                {canDeleteAlbum(user, album) && (
                  <button type="button" className="community-album-delete" disabled={busy}
                    title="앨범 삭제" aria-label={`${album.name} 앨범 삭제`}
                    onClick={() => void deleteAlbum(album)}><Trash2 size={17} /></button>
                )}
              </article>
            ))}
          </div>
        )}
        {error && !createOpen && !selectedSong && <p className="community-album-error" role="status">{error}</p>}
      </section>

      {createOpen && (
        <div className="album-subdialog-overlay" role="dialog" aria-modal="true" aria-label="앨범 만들기"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
          <section className="album-subdialog album-create-dialog">
            <header className="album-subdialog-header"><div><Folder size={20} /><strong>앨범 만들기</strong></div>
              <button type="button" aria-label="앨범 만들기 닫기" onClick={() => setCreateOpen(false)}><X size={20} /></button></header>
            <form className="album-create-form" onSubmit={(event) => void submitAlbum(event)}>
              <label><span>앨범 이름</span><input type="text" value={albumName} maxLength={40} autoFocus
                placeholder="예: 우리 반 여름 노래" onChange={(event) => { setAlbumName(event.target.value); setError(""); }} /></label>
              {!user && <div className="album-login-needed"><Lock size={18} /><span>로그인한 사용자만 앨범을 만들 수 있어요.</span>
                <button type="button" onClick={onRequestLogin}>로그인</button></div>}
              {error && <p className="community-album-error" role="status">{error}</p>}
              <button type="submit" className="account-primary" disabled={busy || !user || !albumName.trim()}>
                <Plus size={18} /> 앨범 만들기
              </button>
            </form>
          </section>
        </div>
      )}

      {selectedSong && (
        <div className="album-subdialog-overlay" role="dialog" aria-modal="true" aria-label={`${selectedSong.title} 음악 메뉴`}
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedSong(null); }}>
          <section className="album-subdialog album-song-dialog">
            <header className="album-subdialog-header"><div><FileMusic size={20} /><span><strong>{selectedSong.title}</strong><small>{selectedSong.creator} 작곡</small></span></div>
              <button type="button" aria-label="음악 메뉴 닫기" onClick={() => setSelectedSong(null)}><X size={20} /></button></header>
            <div className="album-song-actions">
              <button type="button" onClick={() => void playSelectedSong(selectedSong)} disabled={playingSongId !== null}>
                <Play size={19} fill="currentColor" /> {playingSongId === selectedSong.id ? "재생 중" : "재생하기"}
              </button>
              <button type="button" onClick={() => setScoreSong(selectedSong)} disabled={selectedSong.access === "audio"}
                title={selectedSong.access === "audio" ? "악보가 공개되지 않은 노래예요." : undefined}>
                {selectedSong.access === "audio" ? <Lock size={18} /> : <FileMusic size={19} />} 악보 보기
              </button>
              <button type="button" onClick={() => onOpenProject(selectedSong)} disabled={selectedSong.access !== "project"}
                title={selectedSong.access !== "project" ? "프로젝트가 공개되지 않은 노래예요." : undefined}>
                {selectedSong.access !== "project" ? <Lock size={18} /> : <Copy size={19} />} 프로젝트 보기
              </button>
            </div>
            {error && <p className="community-album-error" role="status">{error}</p>}

            {selectedSong.ownerId === user?.uid && (
              <section className="album-song-manage" aria-label="내 공개 음악 관리">
                <div><strong>공개 범위 수정</strong><small>변경 내용은 바로 이 앨범에 적용돼요.</small></div>
                <div className="album-access-options compact">
                  {ACCESS_OPTIONS.map((option) => (
                    <button type="button" key={option.id} className={manageAccess === option.id ? "active" : ""}
                      aria-pressed={manageAccess === option.id} onClick={() => setManageAccess(option.id)}>{option.label}</button>
                  ))}
                </div>
                <div className="album-manage-actions">
                  <button type="button" className="account-primary" onClick={() => void saveAccess()}
                    disabled={busy || manageAccess === selectedSong.access}><Save size={17} /> 공개 설정 저장</button>
                  <button type="button" className="album-delete-song" onClick={() => void deleteSong()} disabled={busy}>
                    <Trash2 size={17} /> 앨범에서 삭제
                  </button>
                </div>
              </section>
            )}
          </section>
        </div>
      )}

      {scoreSong && <PublicScorePreview song={scoreSong} onClose={() => setScoreSong(null)} />}
    </div>
  );
}
