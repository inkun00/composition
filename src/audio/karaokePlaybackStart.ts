export const KARAOKE_INTRO_FADE_SECONDS = 0.14;

export type KaraokeIntroArrangementPlan = Readonly<{
  layerCount: number;
  energy: number;
}>;

const INTRO_ENERGY = [0.72, 0.84, 0.92, 1] as const;

export function karaokeIntroArrangementPlan(
  measureIndex: number,
  availableLayers: number
): KaraokeIntroArrangementPlan {
  const index = Math.max(0, Math.min(INTRO_ENERGY.length - 1, Math.floor(measureIndex)));
  const requestedLayers = index === 0 ? 1 : index === 3 ? 3 : 2;
  return {
    layerCount: Math.min(Math.max(0, availableLayers), requestedLayers),
    energy: INTRO_ENERGY[index]
  };
}

export function karaokeScheduleLeadSeconds(
  songMeasureCount: number,
  accompanimentLayerCount: number
): number {
  const scheduledMeasures = Math.max(0, songMeasureCount) + 8;
  const scheduledLayers = Math.max(1, accompanimentLayerCount);
  const schedulingAllowance = scheduledMeasures * scheduledLayers * 0.01;
  return Math.min(1.6, Math.max(0.8, 0.7 + schedulingAllowance));
}
