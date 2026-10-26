import type { CSSProperties } from "react";
import type { SceneMotion } from "../video/musicVideoModel";
import "./StudioArtwork.css";

export const STUDIO_CONTROL_IMAGES = [
  "video", "select", "brush", "eraser", "line", "rectangle", "ellipse", "rotate-back", "redo",
  "delete", "palette", "check", "play", "pause", "close", "expand", "plus", "sparkles",
  "chevron-down", "music", "save", "upload", "loading", "settings", "headphones", "download", "arrow-right"
] as const;

export type StudioArtworkName = typeof STUDIO_CONTROL_IMAGES[number] |
  `motion-${Exclude<SceneMotion, "auto" | "sway">}`;

type Props = Readonly<{
  name: StudioArtworkName;
  size?: number;
  className?: string;
  lazy?: boolean;
}>;

/** Decorative generated artwork; the containing control retains its accessible name. */
export default function StudioArtwork({ name, size = 20, className = "", lazy = false }: Props) {
  return <img className={`mv-studio-artwork ${className}`.trim()} data-studio-artwork={name}
    src={`/studio-images/v1/${name}.webp`} alt="" aria-hidden="true" draggable={false}
    width={size} height={size} loading={lazy ? "lazy" : "eager"} decoding="async"
    style={{ "--mv-artwork-size": `${size}px` } as CSSProperties} />;
}
