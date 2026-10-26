import { forwardRef, type CSSProperties, type ImgHTMLAttributes } from "react";
import { artworkSource, type AppArtworkName, type SharedArtworkName } from "./AppArtwork";

type IconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "width" | "height" | "color"> & {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
  fill?: string;
};
type ArtworkName = AppArtworkName | SharedArtworkName;

function imageIcon(name: ArtworkName, mirrored = false) {
  const Icon = forwardRef<HTMLImageElement, IconProps>(function ArtworkIcon({ size = 24,
    color: _color, strokeWidth: _strokeWidth, absoluteStrokeWidth: _absoluteStrokeWidth, fill: _fill,
    className = "", style, ...attributes }, ref) {
    const css = { "--app-artwork-size": typeof size === "number" ? `${size}px` : size,
      ...(mirrored ? { transform: "scaleX(-1)" } : {}), ...style } as CSSProperties;
    return <img ref={ref} alt="" aria-hidden="true" draggable={false} decoding="async" {...attributes}
      src={artworkSource(name)} width={size} height={size} data-app-artwork={name}
      className={`app-artwork app-control-artwork ${className}`.trim()} style={css} />;
  });
  Icon.displayName = `AppArtwork(${name})`;
  return Icon;
}

export type LucideIcon = ReturnType<typeof imageIcon>;
export const AlertTriangle = imageIcon("alert");
export const ArrowLeft = imageIcon("arrow-right", true);
export const ArrowRight = imageIcon("arrow-right");
export const Bike = imageIcon("tempo-fast");
export const BookOpen = imageIcon("book");
export const Check = imageIcon("check");
export const CheckCircle2 = imageIcon("check");
export const ChevronRight = imageIcon("arrow-right");
export const Cloud = imageIcon("cloud");
export const Copy = imageIcon("copy");
export const Download = imageIcon("download");
export const Drum = imageIcon("drum");
export const ExternalLink = imageIcon("external-link");
export const Eye = imageIcon("eye");
export const EyeOff = imageIcon("eye-off");
export const FileDown = imageIcon("download");
export const FileMusic = imageIcon("document-score");
export const FileUp = imageIcon("upload");
export const FileVideo = imageIcon("document-video");
export const Folder = imageIcon("folder");
export const Footprints = imageIcon("rhythm-medium");
export const GraduationCap = imageIcon("graduation");
export const Headphones = imageIcon("headphones");
export const Heart = imageIcon("heart");
export const Layers3 = imageIcon("layers");
export const Library = imageIcon("library");
export const Lightbulb = imageIcon("lightbulb");
export const LoaderCircle = imageIcon("loading");
export const LocateFixed = imageIcon("locate");
export const Lock = imageIcon("lock");
export const LogIn = imageIcon("account");
export const LogOut = imageIcon("logout");
export const Mail = imageIcon("mail");
export const Menu = imageIcon("menu");
export const Mic2 = imageIcon("microphone");
export const Minus = imageIcon("minus");
export const MoonStar = imageIcon("tempo-slow");
export const Music2 = imageIcon("app-logo");
export const Pencil = imageIcon("brush");
export const PersonStanding = imageIcon("tempo-normal");
export const Play = imageIcon("play");
export const Plus = imageIcon("plus");
export const QrCode = imageIcon("qr-code");
export const Rabbit = imageIcon("rhythm-short");
export const Redo2 = imageIcon("redo");
export const RefreshCw = imageIcon("rotate-back");
export const RotateCcw = imageIcon("rotate-back");
export const RotateCw = imageIcon("redo");
export const Save = imageIcon("save");
export const ScanLine = imageIcon("scan");
export const Send = imageIcon("send");
export const Share2 = imageIcon("share");
export const SlidersHorizontal = imageIcon("settings");
export const Smartphone = imageIcon("smartphone");
export const Sparkles = imageIcon("sparkles");
export const Square = imageIcon("rectangle");
export const Trash2 = imageIcon("delete");
export const Turtle = imageIcon("rhythm-long");
export const Type = imageIcon("letters");
export const Undo2 = imageIcon("rotate-back");
export const Upload = imageIcon("upload");
export const UserRound = imageIcon("account");
export const Users = imageIcon("account");
export const Video = imageIcon("video");
export const Volume2 = imageIcon("volume-on");
export const VolumeX = imageIcon("volume-off");
export const WandSparkles = imageIcon("sparkles");
export const X = imageIcon("close");
export const ZoomIn = imageIcon("zoom-in");
export const ZoomOut = imageIcon("zoom-out");
