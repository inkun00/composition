import type { CSSProperties } from "react";
import { publicAssetUrl } from "../platform/portable";
import "./AppArtDirection.css";

export const APP_IMAGE_NAMES = [
  "app-logo", "microphone", "library", "cloud", "account", "menu", "share", "qr-code",
  "document-score", "document-audio", "document-video", "document-pdf", "copy", "folder",
  "smartphone", "send", "scan", "locate", "book", "graduation", "drum", "piano",
  "lightbulb", "lock", "mail", "eye", "eye-off", "logout", "external-link", "alert",
  "volume-on", "volume-off", "letters", "heart", "layers", "zoom-in", "zoom-out", "minus",
  "tempo-slow", "tempo-normal", "tempo-fast", "rhythm-short", "rhythm-medium", "rhythm-long",
  "opening-studio", "rhythm-stage", "melody-stage", "recording-stage", "publishing-stage"
] as const;

export type AppArtworkName = typeof APP_IMAGE_NAMES[number];
export type SharedArtworkName = "play" | "pause" | "check" | "plus" | "close" | "save" | "upload" |
  "download" | "arrow-right" | "rotate-back" | "redo" | "loading" | "settings" | "headphones" |
  "sparkles" | "brush" | "rectangle" | "chevron-down" | "video" | "delete";

type Props = Readonly<{
  name: AppArtworkName | SharedArtworkName;
  size?: number | string;
  className?: string;
  lazy?: boolean;
  style?: CSSProperties;
}>;

export function artworkSource(name: AppArtworkName | SharedArtworkName): string {
  const directory = (APP_IMAGE_NAMES as readonly string[]).includes(name) ? "app-images" : "studio-images";
  return publicAssetUrl(`/${directory}/v1/${name}.webp`);
}

/** Generated decoration stays separate from editable notes, lyrics and button names. */
export default function AppArtwork({ name, size = 24, className = "", lazy = false, style }: Props) {
  return <img className={`app-artwork ${className}`.trim()} data-app-artwork={name}
    src={artworkSource(name)} width={size} height={size} alt="" aria-hidden="true" draggable={false}
    loading={lazy ? "lazy" : "eager"} decoding="async"
    style={{ "--app-artwork-size": typeof size === "number" ? `${size}px` : size, ...style } as CSSProperties} />;
}
