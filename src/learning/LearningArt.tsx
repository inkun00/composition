import { publicAssetUrl } from "../platform/portable";

export type LearningArtName = "world-map" | "bridge-scene" | "train-scene" | "observatory" | "guide-bird" | "star-train";

export default function LearningArt({ name, className, alt = "", eager = false }: {
  name: LearningArtName;
  className?: string;
  alt?: string;
  eager?: boolean;
}) {
  const size = name === "guide-bird" ? [768, 702] : name === "star-train" ? [768, 356] : [1536, 1024];
  return <img src={publicAssetUrl(`/learning-art/${name}.webp`)} alt={alt} className={className}
    width={size[0]} height={size[1]} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} />;
}
