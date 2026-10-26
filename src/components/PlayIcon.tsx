import AppArtwork from "./AppArtwork";

export default function PlayIcon({ playing = false }: { playing?: boolean }) {
  return <AppArtwork name={playing ? "pause" : "play"} size={22} className="app-play-artwork" />;
}
