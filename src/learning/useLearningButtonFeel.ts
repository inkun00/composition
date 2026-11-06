import { useEffect, useRef } from "react";

/** A short damped spring restores a pressed menu button, independently of game/audio clocks. */
export function useLearningButtonFeel() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = root.current;
    if (!host || typeof Element.prototype.animate !== "function") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Map<HTMLElement, Animation>();
    const press = (event: PointerEvent) => {
      if (motion.matches || event.button !== 0) return;
      const button = (event.target as Element).closest<HTMLButtonElement>(".arcade-home button, .learn-workspace button");
      if (!button || button.disabled) return;
      animations.get(button)?.cancel();
      const frames = Array.from({ length: 25 }, (_, index) => {
        const seconds = index / 24 * .36;
        const displacement = -.045 * Math.exp(-14 * seconds) * Math.cos(25 * seconds);
        return { scale: String(1 + displacement), offset: index / 24 };
      });
      frames[frames.length - 1].scale = "1";
      const animation = button.animate(frames, { duration: 360, easing: "linear" });
      animations.set(button, animation);
      animation.onfinish = () => { if (animations.get(button) === animation) animations.delete(button); };
    };
    host.addEventListener("pointerdown", press);
    return () => {
      host.removeEventListener("pointerdown", press);
      animations.forEach((animation) => animation.cancel());
    };
  }, []);
  return root;
}
