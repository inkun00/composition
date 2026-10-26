import { useEffect, useMemo, useRef, useState } from "react";
import StudioArtwork from "./StudioArtwork";
import type { MusicVideoPlan, MusicVideoScene } from "../video/musicVideoModel";
import { drawMusicVideoFrame } from "../video/musicVideoRenderer";
import { ensureSceneVectorEngine } from "../video/sceneVectorEngine";
import { getSceneBeatSeconds, normalizeSceneBpm } from "../video/sceneMotionClock";

type Props = Readonly<{ scene: MusicVideoScene; bpm: number; title: string; lyricText: string;
  plan?: MusicVideoPlan; playRequest?: string; suspended?: boolean }>;

export default function SceneMotionPreview({ scene, bpm, title, lyricText, plan: suppliedPlan, playRequest, suspended = false }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const hasObjectMotion = scene.elements.some((element) => element.motion !== undefined);
  const hasMovingObject = scene.elements.some((element) => element.motion !== undefined &&
    element.motion !== "still" && element.motion !== "auto");
  const canAutoplay = scene.motion !== "still" && scene.motion !== "auto" || hasMovingObject;
  const needsVector = Boolean(scene.choreography?.actions.length) && !hasObjectMotion;
  const beatSeconds = getSceneBeatSeconds(bpm);
  const fallbackDuration = 8 * beatSeconds;
  const plan = useMemo<MusicVideoPlan>(() => suppliedPlan ?? { title, bpm: normalizeSceneBpm(bpm), introSeconds: 0,
    lyrics: { title, hasLyrics: true, frames: [{ startSeconds: 0, endSeconds: fallbackDuration,
      syllables: [lyricText], activeSyllable: 0, measureIndex: 0 }] },
    scenes: [{ scene, startSeconds: 0, endSeconds: fallbackDuration, lyricText }] },
    [suppliedPlan, title, bpm, beatSeconds, fallbackDuration, lyricText, scene]);
  const start = plan.scenes[0]?.startSeconds ?? 0;
  const duration = Math.max(.01, (plan.scenes[0]?.endSeconds ?? start + 8 * getSceneBeatSeconds(plan.bpm)) - start);
  useEffect(() => { elapsed.current = 0; setTime(0); }, [plan]);
  useEffect(() => {
    elapsed.current = 0;
    setTime(0);
    setPlaying(Boolean(playRequest) && canAutoplay);
  }, [playRequest, scene.id, scene.motion, canAutoplay]);
  useEffect(() => {
    if (suspended) return;
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    let animation = 0;
    let disposed = false;
    setError("");
    setLoading(needsVector);
    async function begin() {
      if (needsVector) {
        try { await ensureSceneVectorEngine(); }
        catch { if (!disposed) setError("움직임 도구를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 열어 주세요."); return; }
        finally { if (!disposed) setLoading(false); }
      }
      if (disposed) return;
      const base = elapsed.current;
      const started = performance.now();
      let updated = 0;
      function draw() {
        if (disposed) return;
        const local = playing ? (base + (performance.now() - started) / 1000) % duration : elapsed.current;
        elapsed.current = local;
        drawMusicVideoFrame(context!, plan, start + Math.min(local, duration - .00001), true);
        if (!playing || performance.now() - updated > 100) { setTime(local); updated = performance.now(); }
        if (playing) animation = requestAnimationFrame(draw);
      }
      draw();
    }
    void begin();
    return () => { disposed = true; cancelAnimationFrame(animation); };
  }, [scene, plan, start, duration, playing, playRequest, needsVector, suspended]);
  return <div className="mv-motion-preview"><canvas ref={canvas} width={1280} height={720} aria-label="장면 움직임 미리보기" />
    <label className="mv-preview-timeline"><span>장면 {time.toFixed(1)}초 / {duration.toFixed(1)}초</span>
      <input type="range" aria-label="움직임 미리보기 시간" min={0} max={duration} step={.01} value={time}
        disabled={suspended || loading || Boolean(error)} onChange={(event) => {
          const next = Number(event.target.value);
          elapsed.current = next;
          setTime(next);
          setPlaying(false);
          const context = canvas.current?.getContext("2d");
          if (context) drawMusicVideoFrame(context, plan, start + Math.min(next, duration - .00001), true);
        }} /></label>
    <button type="button" disabled={suspended || loading || Boolean(error)} onClick={() => setPlaying((value) => !value)} aria-pressed={playing}>
      <StudioArtwork name={playing ? "pause" : "play"} size={18} /> {playing ? "미리보기 멈추기" : "움직임 미리보기"}</button>
    <small role={error ? "alert" : undefined}>{error || (suspended ? "그리는 동안 미리보기를 잠시 쉬어요."
      : loading ? "움직임 도구를 준비하고 있어요…" : "시간 막대로 동작을 확인해요. 음악은 하단 미리보기에서 함께 들어요.")}</small>
  </div>;
}
