import AppArtwork, { type AppArtworkName, type SharedArtworkName } from "./AppArtwork";

const PICTURES: Readonly<Record<string, AppArtworkName | SharedArtworkName>> = {
  "🎹": "piano", "🥁": "drum", "✨": "sparkles", "🌙": "tempo-slow", "🎬": "video",
  "🎵": "app-logo", "🎶": "app-logo", "🎤": "microphone", "🎧": "headphones", "🔊": "volume-on"
};

/** Keep instrument-specific symbols when no matching generated picture exists. */
export default function MusicChoiceArtwork({ symbol, size = 26 }: Readonly<{ symbol: string; size?: number }>) {
  const picture = PICTURES[symbol];
  return picture ? <AppArtwork name={picture} size={size} /> : <span aria-hidden="true">{symbol}</span>;
}
