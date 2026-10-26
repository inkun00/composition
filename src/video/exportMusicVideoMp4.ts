import { runExclusiveAudioExport } from "../audio/player";
import { exportLyricMp4 } from "./exportLyricMp4";
import { drawMusicVideoFrame } from "./musicVideoRenderer";
import { checkMusicVideoPlaybackAbort, prepareMusicVideoPlayback, validateMusicVideoPlaybackOptions,
  type MusicVideoExportOptions } from "./prepareMusicVideoPlayback";

export type { MusicVideoExportOptions } from "./prepareMusicVideoPlayback";

export async function exportMusicVideoMp4(options: MusicVideoExportOptions,
  onProgress: (percent: number) => void, signal?: AbortSignal): Promise<Blob | null> {
  validateMusicVideoPlaybackOptions(options, signal);
  return runExclusiveAudioExport(async () => {
    const { audio, plan } = await prepareMusicVideoPlayback(options, signal, onProgress);
    const blob = await exportLyricMp4(audio, plan.lyrics,
      (percent) => onProgress(35 + Math.round(percent * .65)), signal, {
        drawFrame: (context, _frame, timeSeconds) => drawMusicVideoFrame(context, plan, timeSeconds, options.animated),
        ...(options.animated ? { frameRate: 24 } : {})
      });
    checkMusicVideoPlaybackAbort(signal);
    return blob;
  });
}
