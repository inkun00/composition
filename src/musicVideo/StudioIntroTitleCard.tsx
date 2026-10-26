import "./StudioIntroTitleCard.css";

export default function StudioIntroTitleCard({ title, composer }: Readonly<{ title: string; composer?: string }>) {
  return <div className="mv-intro-title-card" data-testid="studio-intro-title-card" aria-hidden="true">
    <strong>{title.trim() || "나의 뮤직비디오"}</strong>
    <span>{composer?.trim() ? `작곡가 ${composer.trim()}` : "작곡가 미입력"}</span>
  </div>;
}
