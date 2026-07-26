export type KaraokeGuideMode = "off" | "first-note" | "soft";

export type KaraokeGuideSettings = Readonly<{
  includeMelody: boolean;
  melodyMode: "all" | "first-note";
  volume: number;
}>;

export function karaokeGuideSettings(mode: KaraokeGuideMode): KaraokeGuideSettings {
  if (mode === "off") return { includeMelody: false, melodyMode: "all", volume: 0 };
  if (mode === "soft") return { includeMelody: true, melodyMode: "all", volume: .34 };
  return { includeMelody: true, melodyMode: "first-note", volume: .42 };
}
