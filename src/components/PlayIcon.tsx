export default function PlayIcon({ playing = false }: { playing?: boolean }) {
  return playing ? (
    <span className="pause-icon" aria-hidden="true"><i /><i /></span>
  ) : (
    <span className="play-icon" aria-hidden="true" />
  );
}
