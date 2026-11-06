import { Star } from "lucide-react";
import "./GameStars.css";

export default function GameStars({ count, size = 20 }: { count: number; size?: number }) {
  return <span className="game-stars" role="img" aria-label={`별 3개 중 ${count}개`}>
    {[1, 2, 3].map((number) => <Star key={number} size={size} aria-hidden="true"
      fill={number <= count ? "currentColor" : "none"} className={number <= count ? "earned" : "unearned"} />)}
  </span>;
}
