import { ArrowRight, GraduationCap, Music2, WandSparkles } from "lucide-react";
import { publicAssetUrl } from "../platform/portable";
import "../practice/PracticeMode.css";

type OpeningScreenProps = {
  hasDraft: boolean;
  onStart: () => void;
  onContinue: () => void;
  onPractice: () => void;
};

export default function OpeningScreen({ hasDraft, onStart, onContinue, onPractice }: OpeningScreenProps) {
  return (
    <section className="opening-screen" aria-label="마음멜로디 시작 화면">
      <picture className="opening-visual" aria-hidden="true">
        <source media="(max-width: 700px)" srcSet={publicAssetUrl("/illustrations/opening-studio-mobile-v1.webp")} />
        <img src={publicAssetUrl("/illustrations/opening-studio-desktop-v2.webp")} alt="" fetchPriority="high" />
      </picture>
      <div className="opening-content">
        <div className="opening-brand-lockup">
          <span className="opening-mark"><Music2 size={31} /></span>
          <span className="opening-kicker">나만의 멜로디 놀이터</span>
        </div>
        <h1>마음멜로디</h1>
        <p><strong>네 마음속 장면이 노래가 되는 곳</strong><br />친구들과 함께 첫 멜로디를 만들어 봐요.</p>
        <div className="opening-actions">
          <button type="button" className="opening-start action-button" onClick={onStart}>
            <WandSparkles size={20} /> 추천 가락으로 만들기 <ArrowRight size={18} />
          </button>
          <button type="button" className="opening-continue action-button" disabled={!hasDraft} onClick={onContinue}>
            <Music2 size={19} /> 이어 만들기
          </button>
          <button type="button" className="opening-practice action-button" onClick={onPractice}>
            <GraduationCap size={22} />
            <span><strong>리듬·가락 직접 만들기</strong><small>한 마디씩 연습해요</small></span>
            <ArrowRight size={18} />
          </button>
        </div>
        <small className="opening-status">{hasDraft ? "저장한 노래가 기다리고 있어요." : "오늘의 첫 노래를 시작해 볼까요?"}</small>
      </div>
    </section>
  );
}
