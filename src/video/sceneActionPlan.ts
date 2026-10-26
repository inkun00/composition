import { toNumber } from "../music/rational";
import type { LyricVideoFrame } from "./lyricVideoPlan";
import type { MusicVideoScene } from "./musicVideoModel";
import type { MusicVideoMeasure, MusicVideoMeasureCue } from "./musicVideoMeasures";
import { MAX_SCENE_ACTIONS, SCENE_ACTION_LABELS, type SceneAction, type SceneActionKind,
  type SceneActor } from "./sceneActionTypes";

type ActionRule = Readonly<{ kind: SceneActionKind; pattern: RegExp; roles: readonly string[]; beats: number }>;
const roleWords: Readonly<Record<string, readonly string[]>> = {
  hand: ["손", "검지", "손가락", "팔", "hand", "finger", "arm"],
  switch: ["스위치", "버튼", "단추", "switch", "button"],
  light: ["불", "전등", "조명", "등불", "빛", "light", "lamp", "bulb"],
  person: ["사람", "아이", "친구", "캐릭터", "몸", "person", "child", "character", "body"],
  bird: ["새", "나비", "날개", "bird", "wing", "butterfly"],
  plant: ["꽃", "나무", "줄기", "풀", "flower", "tree", "plant"]
};
const rules: readonly ActionRule[] = [
  { kind: "press", pattern: /누르|눌러|눌렀|눌리|눌린|\bpress\w*|\bpush\w*|\btap\w*/gi, roles: ["hand", "switch"], beats: 2 },
  { kind: "bend", pattern: /굽히|굽혀|굽혔|구부|접[어는다지고자었]|\bbend\w*|\bfold\w*/gi, roles: ["hand", "person"], beats: 2 },
  { kind: "light-off", pattern: /꺼[져진지줘요봐다라질졌야주]|꺼(?=$|[\s.!?,;])|껐|끄(?=$|[\s.!?,;고는면자며지다세])|\bturn\w*\s+(?:the\s+)?(?:light\w*\s+)?off\b/gi,
    roles: ["light"], beats: 1 },
  { kind: "light-on", pattern: /켜[지져진요줘봐고는다자서라세야주]|켜(?=$|[\s.!?,;])|켰|켠다|\bturn\w*\s+(?:the\s+)?(?:light\w*\s+)?on\b/gi,
    roles: ["light"], beats: 1 },
  { kind: "swing", pattern: /흔들|\bsway\w*|\bswing\w*|\bshake\w*/gi, roles: [], beats: 2 },
  { kind: "jump", pattern: /뛰[어는고지자다면며었]|뛴|점프|폴짝|깡충|\bjump\w*|\bhop\w*/gi, roles: ["person", "bird"], beats: 2 },
  { kind: "walk", pattern: /걷(?=[다지고는자며면겠])|걸어|걸으|걸었|\bwalk\w*|\bstroll\w*/gi, roles: ["person"], beats: 4 },
  { kind: "nod", pattern: /끄덕|고개를?숙|인사|\bnod\w*|\bbow\w*/gi, roles: ["person"], beats: 2 },
  { kind: "flap", pattern: /날갯짓|날개짓|날[아고다지자면며았]|날개를?펴|\bflap\w*|\bfly\w*/gi, roles: ["bird"], beats: 2 },
  { kind: "move", pattern: /움직|이동|다가|멀어|\bmove\w*|\bapproach\w*/gi, roles: [], beats: 2 },
  { kind: "grow", pattern: /자라|자랐|커져|커지|커졌|커진|피[어는고지었]|핀다|\bgrow\w*|\bbloom\w*/gi, roles: ["plant"], beats: 4 }
];
type LyricPosition = Readonly<{ measureIndex: number; beat: number }>;
type LyricTimeline = Readonly<{ text: string; positions: readonly LyricPosition[]; endBeat: number;
  measureStarts: ReadonlyMap<number, number> }>;

function lyricTimeline(measures: readonly MusicVideoMeasure[]): LyricTimeline {
  let text = "";
  let songBeat = 0;
  const positions: LyricPosition[] = [];
  const measureStarts = new Map<number, number>();
  measures.forEach((measure, index) => {
    const measureIndex = measure.measureIndex ?? index;
    measureStarts.set(measureIndex, songBeat);
    let beat = 0;
    measure.notes.forEach((note) => {
      const lyric = note.pitch !== null ? note.lyric?.trim() ?? "" : "";
      text += lyric;
      for (let i = 0; i < lyric.length; i++) positions.push({ measureIndex, beat });
      beat += Math.max(0, toNumber(note.duration));
    });
    songBeat += beat;
  });
  return { text, positions, measureStarts, endBeat: songBeat };
}

function actorRoles(actor: SceneActor): string[] {
  const name = actor.name.toLowerCase();
  return Object.entries(roleWords).filter(([, aliases]) => aliases.some((alias) => name.includes(alias)))
    .map(([role]) => role);
}

function chooseActor(actors: readonly SceneActor[], rule: ActionRule, context: string): SceneActor | null {
  const named = actors.filter((actor) => context.toLowerCase().includes(actor.name.toLowerCase()));
  if (rule.kind === "press") {
    const namedHands = named.filter((actor) => actorRoles(actor).includes("hand"));
    const hands = actors.filter((actor) => actorRoles(actor).includes("hand"));
    if (namedHands.length === 1) return namedHands[0];
    if (hands.length === 1) return hands[0];
  }
  const eligible = (items: readonly SceneActor[]) => rule.roles.length === 0 ? [...items]
    : items.filter((actor) => actorRoles(actor).some((role) => rule.roles.includes(role)));
  const exact = eligible(named);
  if (exact.length === 1) return exact[0];
  // Preferred roles are ordered: pressing a switch moves the hand before the switch itself.
  for (const role of rule.roles) {
    const matches = actors.filter((actor) => actorRoles(actor).includes(role));
    if (matches.length === 1) return matches[0];
  }
  if (rule.roles.length === 0 && named.length === 1) return named[0];
  if (actors.length === 1 && (!rule.roles.length || actorRoles(actors[0]).length === 0)) return actors[0];
  return null;
}

const clauseBoundary = /[.!?。！？,，;；\n]|하지만|그러나|그런데|그리고|반면/g;

function clauseAround(text: string, start: number, end: number): Readonly<{ before: string; after: string }> {
  let left = 0;
  let right = text.length;
  for (const match of text.matchAll(new RegExp(clauseBoundary))) {
    if (match.index! + match[0].length <= start) left = match.index! + match[0].length;
    else if (match.index! >= end) {
      right = match.index!;
      break;
    }
  }
  return { before: text.slice(left, start), after: text.slice(end, right) };
}

function negated(text: string, start: number, end: number): boolean {
  const clause = clauseAround(text, start, end);
  const before = clause.before.replace(/\s/g, "");
  const after = clause.after.replace(/\s/g, "");
  // Preserve positive phrases such as '잘못 눌러' and '잠시 동안 걸어'.
  const negativePrefix = /(?:안|못)(?:크게|빨리|천천히|계속|다시|더|잘)*$/.test(before) &&
    !/(?:동안|미안|불안|대안|제안|방안|편안|잘못|연못)$/.test(before);
  return negativePrefix ||
    /\b(?:don't|doesn't|didn't|do\s+not|does\s+not|did\s+not|cannot|can't|not)\s*$/i.test(clause.before) ||
    /^(?:(?:하|가|오|보|이|리|주|나|지|오르|내리|올라|내려|들어|나가|나오|올라가|내려가|돌아가|돌아오)?지(?:는|도)?)?(?:않|못|말|마)/.test(after) ||
    /^고싶지(?:는|도)?(?:않|못)/.test(after) ||
    /^(?:(?:하|가|오|보|이|리|주|나)?면(?:은)?|도)?(?:안돼|안되)/.test(after);
}

function misleadingWord(text: string, start: number, end: number, kind: SceneActionKind): boolean {
  const before = text.slice(Math.max(0, start - 6), start).replace(/\s/g, "");
  const word = text.slice(start, end);
  if (kind === "light-on" && /(?:지|비|삼|치|돌이|들이)$/.test(before)) return true;
  if (kind === "light-off" && word.startsWith("끄") && /이$/.test(before)) return true;
  if (kind === "jump" && /^뛰어(?:난|나다|나게|나고|남)/.test(text.slice(start))) return true;
  if (kind !== "grow") return false;
  if (word.startsWith("피") && /커$/.test(before)) return true;
  // '잘 자라, 우리 아가' is a sleep wish. An explicit plant subject can still grow well.
  if (word === "자라" && /잘$/.test(before)) {
    const clause = clauseAround(text, start, end);
    return !roleWords.plant.some((name) => clause.before.includes(name));
  }
  return false;
}

export type SceneActionVerbMention = Readonly<{
  kind: SceneActionKind;
  start: number;
  end: number;
  negated: boolean;
}>;

/** Shared vocabulary locates a supported verb, including explicit negation, without selecting an object. */
export function findSceneActionVerbMentions(text: string, kind?: SceneActionKind): readonly SceneActionVerbMention[] {
  const mentions: SceneActionVerbMention[] = [];
  for (const rule of rules) {
    if (kind !== undefined && rule.kind !== kind) continue;
    for (const match of text.matchAll(new RegExp(rule.pattern))) {
      const matchStart = match.index!;
      if (misleadingWord(text, matchStart, matchStart + match[0].length, rule.kind)) continue;
      mentions.push({ kind: rule.kind, start: matchStart,
        end: matchStart + match[0].length, negated: negated(text, matchStart, matchStart + match[0].length) });
    }
  }
  return mentions.sort((a, b) => a.start - b.start || a.end - b.end);
}

export type SceneActionPlanResult = Readonly<{
  actions: readonly SceneAction[];
  messages: readonly string[];
  matchedLyrics: readonly string[];
}>;
export type SceneActionPlanOptions = Readonly<{
  scene: MusicVideoScene;
  measures: readonly MusicVideoMeasure[];
  bpm: number;
  startMeasureIndex?: number;
  endMeasureIndex?: number;
}>;

/** Local vocabulary rules propose editable actions, without interpreting image pixels or calling an AI service. */
export function planSceneActions({ scene, measures, bpm, startMeasureIndex, endMeasureIndex }: SceneActionPlanOptions): SceneActionPlanResult {
  const actors = (scene.choreography?.actors ?? []).filter((actor) => actor.elementIds.length > 0);
  if (!Number.isFinite(bpm) || bpm <= 0) return { actions: [], matchedLyrics: [], messages: ["노래의 빠르기를 확인해 주세요."] };
  if (actors.length === 0) return { actions: [], matchedLyrics: [], messages: ["먼저 움직일 대상을 만들고 그림의 선을 지정해 주세요."] };
  const timeline = lyricTimeline(measures);
  const first = startMeasureIndex ?? measures[0]?.measureIndex ?? 0;
  const last = endMeasureIndex ?? scene.endMeasureIndex ?? scene.endLyric?.measureIndex ??
    measures.at(-1)?.measureIndex ?? measures.length - 1;
  const actions: SceneAction[] = [];
  const messages = new Set<string>();
  const matchedLyrics: string[] = [];
  const pending = findSceneActionVerbMentions(timeline.text).filter((mention) => !mention.negated);
  const seen = new Set<string>();
  for (const { kind, start, end } of pending) {
    const rule = rules.find((item) => item.kind === kind)!;
    const position = timeline.positions[start];
    if (!position || position.measureIndex < first || position.measureIndex > last) continue;
    const context = timeline.text.slice(Math.max(0, start - 18), end + 8);
    const actor = chooseActor(actors, rule, context);
    if (!actor) {
      messages.add(`‘${SCENE_ACTION_LABELS[rule.kind]}’의 대상을 정하지 못했어요. 손·전등처럼 대상 이름을 구체적으로 입력하거나 직접 동작을 추가해 주세요.`);
      continue;
    }
    const key = `${actor.id}:${rule.kind}:${position.measureIndex}:${position.beat}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const absoluteBeat = (timeline.measureStarts.get(position.measureIndex) ?? 0) + position.beat;
    const lastMeasure = measures.findIndex((measure, index) => (measure.measureIndex ?? index) === last);
    const nextMeasure = lastMeasure + 1;
    const next = lastMeasure >= 0 ? measures[nextMeasure] : undefined;
    const sceneEnd = next ? timeline.measureStarts.get(next.measureIndex ?? nextMeasure)! : timeline.endBeat;
    const durationBeats = Math.min(rule.beats, sceneEnd - absoluteBeat);
    if (durationBeats <= 0) continue;
    actions.push({ id: crypto.randomUUID(), actorId: actor.id, kind: rule.kind,
      startMeasureIndex: position.measureIndex, startBeat: position.beat, durationBeats, strength: 1 });
    matchedLyrics.push(context);
    if (actions.length === MAX_SCENE_ACTIONS) {
      messages.add("동작은 한 장면에 48개까지 추천할 수 있어요. 나머지는 장면을 나누어 주세요.");
      break;
    }
  }
  if (actions.length === 0 && messages.size === 0) {
    messages.add("이 장면의 가사에서 지원 동작을 찾지 못했어요. 누르기·굽히기·흔들기·뛰기·걷기·끄덕이기·날갯짓·불 켜기/끄기·이동·자라기를 직접 추가할 수 있어요.");
  }
  if (actions.length > 0) messages.add("가사 속 동사의 음표 시작에 동작을 맞췄어요. 대상·시작 박자·도착점을 확인해 주세요.");
  return { actions, messages: [...messages], matchedLyrics };
}

/** Frames contain rests as well as sung notes, so timing follows the score including the intro. */
export function getSceneActionTiming(action: SceneAction, frames: readonly LyricVideoFrame[], bpm: number):
  Readonly<{ startSeconds: number; endSeconds: number }> | null {
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(action.startBeat) || action.startBeat < 0 ||
    !Number.isFinite(action.durationBeats) || action.durationBeats <= 0) return null;
  const measure = frames.filter((frame) => frame.measureIndex === action.startMeasureIndex);
  if (measure.length === 0) return null;
  const startSeconds = measure[0].startSeconds + action.startBeat * 60 / bpm;
  if (startSeconds >= measure.at(-1)!.endSeconds - .000001) return null;
  const songEnd = frames.at(-1)?.endSeconds ?? 0;
  return { startSeconds, endSeconds: Math.min(songEnd, startSeconds + action.durationBeats * 60 / bpm) };
}

/** Scene edits and meter changes must be corrected explicitly rather than silently omitting authored actions. */
export function validateSceneActionRanges(scene: MusicVideoScene, measures: readonly MusicVideoMeasureCue[],
  bpm: number | undefined, startCueIndex: number, endCueIndex: number): string | null {
  const actions = scene.choreography?.actions ?? [];
  const allowed = measures.slice(startCueIndex, endCueIndex + 1);
  for (const action of actions) {
    if (!scene.choreography!.actors.find((actor) => actor.id === action.actorId)?.elementIds.length) {
      return "동작의 대상에 그림의 선을 지정할 수 없어요. 장면의 움직임을 다시 골라 주세요.";
    }
    const measure = allowed.find((cue) => cue.measureIndex === action.startMeasureIndex);
    if (!measure) return "동작의 시작 마디가 장면 구간 밖에 있어요. 장면의 움직임을 다시 골라 주세요.";
    if (bpm === undefined || !Number.isFinite(bpm) || bpm <= 0) continue;
    const start = measure.startSeconds + action.startBeat * 60 / bpm;
    if (start >= measure.endSeconds - .000001) return "동작의 시작 박자가 마디 길이를 넘어요. 장면의 움직임을 다시 골라 주세요.";
    if (start + action.durationBeats * 60 / bpm > allowed.at(-1)!.endSeconds + .000001) {
      return "동작 길이가 장면의 마지막 마디를 넘어요. 움직임을 다시 고르거나 장면 구간을 늘려 주세요.";
    }
  }
  return null;
}
