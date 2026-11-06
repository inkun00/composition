import { DYNAMICS, type DynamicId } from "../learningModel";

export type DynamicsMarking = DynamicId | "crescendo" | "decrescendo";

export type DynamicsChoice = {
  id: DynamicsMarking;
  label: string;
  name: string;
  description: string;
};

export const DYNAMICS_CHOICES: readonly DynamicsChoice[] = [
  ...DYNAMICS.map(({ id, name, description }) => ({ id, label: id, name, description })),
  { id: "crescendo", label: "cresc.", name: "크레셴도", description: "점점 세게" },
  { id: "decrescendo", label: "decresc.", name: "데크레셴도", description: "점점 여리게" }
];

/** Every choice uses these same pitches, note lengths and tempo. Only gain changes. */
export const MELODY = {
  midi: [60, 64, 67, 72, 71, 67, 64, 62],
  beats: 1,
  bpm: 112
} as const;

const steadyGains = Object.fromEntries(DYNAMICS.map(({ id, gain }) => [id, gain])) as Record<DynamicId, number>;

/** Progress is the position in the whole phrase, from its first note to its last. */
export function dynamicsGainAt(marking: DynamicsMarking, progress: number): number {
  if (marking !== "crescendo" && marking !== "decrescendo") return steadyGains[marking];
  const position = Number.isNaN(progress) ? 0 : Math.max(0, Math.min(1, progress));
  const start = marking === "crescendo" ? steadyGains.p : steadyGains.f;
  const end = marking === "crescendo" ? steadyGains.f : steadyGains.p;
  if (position === 0) return start;
  if (position === 1) return end;
  return start + (end - start) * position;
}

export type DynamicsMission = {
  id: string;
  target: DynamicsMarking;
  title: string;
  description: string;
};

export const DYNAMICS_MISSIONS: readonly DynamicsMission[] = [
  {
    id: "gentle-phrase",
    target: "p",
    title: "여리게 인사해요",
    description: "p(피아노)를 골라 같은 가락을 처음부터 끝까지 여리게 연주해요. 음높이와 빠르기는 그대로예요."
  },
  {
    id: "strong-phrase",
    target: "f",
    title: "힘차게 들려줘요",
    description: "f(포르테)를 골라 같은 가락을 처음부터 끝까지 세게 연주해요. 소리의 크기인 음량만 커져요."
  },
  {
    id: "growing-phrase",
    target: "crescendo",
    title: "점점 세게 펼쳐요",
    description: "크레셴도를 골라 같은 가락의 음량을 점점 키워요. p에서 f로, 빠르기와 음높이를 바꾸지 않아요."
  },
  {
    id: "fading-phrase",
    target: "decrescendo",
    title: "점점 여리게 마쳐요",
    description: "데크레셴도를 골라 같은 가락의 음량을 점점 줄여요. f에서 p로, 빠르기와 음높이를 바꾸지 않아요."
  }
];

/** Count submitted answers per completed mission; listening and rehearsing stay free. */
export function dynamicsPerformanceReward(attempts: readonly number[]): { stars: number; score: number } {
  const retries = attempts.map((count) => Math.max(0, count - 1));
  const totalRetries = retries.reduce((total, count) => total + count, 0);
  return {
    stars: totalRetries === 0 ? 3 : totalRetries <= 4 ? 2 : 1,
    score: retries.reduce((total, count) => total + Math.max(100, 300 - count * 40), 0)
  };
}
