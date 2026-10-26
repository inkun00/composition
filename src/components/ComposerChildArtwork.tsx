import { publicAssetUrl } from "../platform/portable";
import "./ComposerChildArtwork.css";

const CHARACTERS = {
  setup: "guide-boy-v1",
  rhythm: "character-rhythm-shaker-girl-v1",
  keyboard: "character-instrument-keyboard-boy-v1",
  tip: "character-music-tip-recorder-boy-v1",
  sound: "character-sound-preview-girl-v1",
  recording: "character-recording-singer-girl-v1",
  listening: "character-listen-sing-boy-v1",
  complete: "character-song-complete-boy-v1",
  exportKeyboard: "backing-export-keyboard-boy-v2",
  exportRhythm: "backing-export-percussion-girl-v2",
  exportMix: "backing-export-mixing-girl-v2",
} as const;

export default function ComposerChildArtwork({ kind, className = "" }: Readonly<{
  kind: keyof typeof CHARACTERS;
  className?: string;
}>) {
  return <img className={`composer-child-artwork ${className}`.trim()} data-composer-child={kind}
    src={publicAssetUrl(`/illustrations/${CHARACTERS[kind]}.webp`)} alt="" aria-hidden="true"
    draggable={false} width={128} height={160} loading="lazy" decoding="async" />;
}
