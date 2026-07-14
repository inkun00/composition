import { useEffect, useRef, useState } from "react";
import { pitchName, positionNotes } from "../music/score";
import { measureCapacity, type Meter } from "../music/meter";
import { toNumber } from "../music/rational";
import { scoreLayout } from "../music/scoreLayout";
import { loadVexFlow } from "../music/vexflow";
import type { NoteEvent } from "../music/types";

type ScoreMeasureProps = {
  notes: readonly NoteEvent[];
  selectedNoteId?: string;
  selectedNoteIds?: readonly string[];
  playingNoteId?: string | null;
  reviewIssueNoteIds?: readonly string[];
  onNoteLayout?: (positions: Record<string, { x: number; y: number }>) => void;
  onSelectNote?: (id: string, extendRange?: boolean) => void;
  onMoveNote?: (id: string, pitch: number) => void;
  onMovePosition?: (id: string, targetBeat: number) => void;
  compact?: boolean;
  wide?: boolean;
  plain?: boolean;
  meter?: Meter;
  showSignature?: boolean;
  systemMeasure?: boolean;
  expandedStaff?: boolean;
  renderBackend?: "svg" | "canvas";
  connectedSystem?: boolean;
  endBarline?: "single" | "final";
};

const trebleMiddleLineMidi = 71;

function midiToVexKey(pitch: number): string {
  const names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  return `${names[((pitch % 12) + 12) % 12]}/${Math.floor(pitch / 12) - 1}`;
}

function vexDuration(duration: number, dotted?: boolean): string {
  const undotted = dotted ? duration / 1.5 : duration;
  if (undotted >= 4) return "w";
  if (undotted >= 2) return "h";
  if (undotted >= 1) return "q";
  if (undotted >= 0.5) return "8";
  return "16";
}

function noteY(pitch: number): number {
  return 42 - (pitch - 60) * 3;
}

function expandedStaffNoteY(pitch: number): number {
  // A sharp or flat sits on the same staff position as its natural letter.
  const degreeByPitchClass = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const octave = Math.floor(pitch / 12) - 1;
  const staffStep = octave * 7 + degreeByPitchClass[((pitch % 12) + 12) % 12];
  const e4Step = 4 * 7 + 2;
  // E4 is the bottom line (y 84); one staff step is half a line gap.
  return Math.max(10, Math.min(138, 84 - (staffStep - e4Step) * 9));
}

function defaultRestY(duration: number): number {
  if (duration >= 4) return 36;
  if (duration >= 2) return 26;
  if (duration <= 0.5) return 22;
  return 26;
}

function restSprite(duration: number, dotted?: boolean) {
  if (dotted && duration >= 6) return { name: "dotted-whole", width: 34, height: 17 };
  if (dotted && duration >= 3) return { name: "dotted-half", width: 34, height: 16 };
  if (dotted && duration >= 1.5) return { name: "dotted-quarter", width: 30, height: 46 };
  if (dotted && duration >= 0.75) return { name: "dotted-eighth", width: 33, height: 34 };
  if (dotted) return { name: "dotted-sixteenth", width: 32, height: 45 };
  if (duration >= 4) return { name: "whole", width: 24, height: 15 };
  if (duration >= 2) return { name: "half", width: 24, height: 14 };
  if (duration <= 0.25) return { name: "sixteenth", width: 23, height: 46 };
  if (duration <= 0.5) return { name: "eighth", width: 24, height: 39 };
  return { name: "quarter", width: 20, height: 50 };
}

function renderRestMark(x: number, y: number, duration: number, dotted?: boolean) {
  const sprite = restSprite(duration, dotted);
  return (
    <image href={`/notation/rests/${sprite.name}.png`}
      x={x - sprite.width / 2} y={y - sprite.height / 2}
      width={sprite.width} height={sprite.height}
      className="rest-mark rest-image"
      preserveAspectRatio="xMidYMid meet" />
  );
}

function appendSvgTransform(element: Element | null | undefined, transform: string): void {
  if (!element) return;
  const current = element.getAttribute("transform");
  element.setAttribute("transform", current ? `${current} ${transform}` : transform);
}

export default function ScoreMeasure({
  notes,
  selectedNoteId,
  selectedNoteIds,
  playingNoteId,
  reviewIssueNoteIds,
  onNoteLayout,
  onSelectNote,
  onMoveNote,
  onMovePosition,
  compact = false,
  wide = false,
  plain = false,
  meter = { beats: 4, beatUnit: 4 },
  showSignature = true,
  systemMeasure = false,
  expandedStaff = false,
  renderBackend = "svg",
  connectedSystem = false,
  endBarline = "single"
}: ScoreMeasureProps) {
  const vexHost = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    startValue: number;
    svgWidth: number;
    svgHeight: number;
    kind: "note" | "rest";
    hasMoved: boolean;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; dx: number } | null>(null);
  const [vexPositions, setVexPositions] = useState<Record<string, { x: number; y: number }>>({});
  const useVexLayer = !plain;
  const positioned = positionNotes(notes);
  const staffLines = expandedStaff ? [12, 30, 48, 66, 84] : [2, 14, 26, 38, 50];
  const { width, height: scoreHeight, left, noteStartX, usableWidth: usable } = scoreLayout({
    compact,
    wide,
    showSignature
  });
  // 4마디 전체 악보는 칸의 크기를 바꾸지 않고 표기만 두 배 크게 보여 준다.
  // 후보 카드와 PDF용 작은 악보는 기존 비율을 유지한다.
  const notationScale = compact && wide ? 2 : 1;
  const capacity = toNumber(measureCapacity(meter));
  const drawnNotes = positioned.map((note) => {
    const vexPosition = useVexLayer ? vexPositions[note.id] : undefined;
    const logicalX = noteStartX + (note.onset / capacity) * (width - noteStartX - 8) + 10;
    return ({
    ...note,
    x: vexPosition?.x ?? logicalX,
    logicalX,
    durationValue: toNumber(note.duration),
      y: vexPosition?.y ?? (note.pitch === null
      ? note.restY ?? (expandedStaff ? 48 : defaultRestY(toNumber(note.duration)))
      : expandedStaff ? expandedStaffNoteY(note.pitch) : noteY(note.pitch))
    });
  });
  const beamUnit = meter.beatUnit === 8 ? 1.5 : 1;
  const beamGroups: Array<typeof drawnNotes> = [];
  const explicitBeamIds = new Set<string>();
  const explicitGroupNames = [...new Set(drawnNotes.flatMap((note) => note.beamGroup ? [note.beamGroup] : []))];
  explicitGroupNames.forEach((name) => {
    const group = drawnNotes.filter((note) =>
      note.beamGroup === name && !note.beamBreak && note.pitch !== null && note.durationValue <= 0.5);
    if (group.length > 1) {
      beamGroups.push(group);
      group.forEach((note) => explicitBeamIds.add(note.id));
    }
  });
  let pendingBeam: typeof drawnNotes = [];

  drawnNotes.forEach((note) => {
    if (explicitBeamIds.has(note.id)) {
      if (pendingBeam.length > 1) beamGroups.push(pendingBeam);
      pendingBeam = [];
      return;
    }
    const previous = pendingBeam[pendingBeam.length - 1];
    const sameBeat = previous
      ? Math.floor((previous.onset + 0.001) / beamUnit) === Math.floor((note.onset + 0.001) / beamUnit)
      : true;
    const followsPrevious = previous
      ? Math.abs(note.onset - (previous.onset + previous.durationValue)) < 0.001
      : true;
    const canBeam = note.pitch !== null && note.durationValue <= 0.5 && !note.beamBreak && sameBeat && followsPrevious;

    if (!canBeam) {
      if (pendingBeam.length > 1) beamGroups.push(pendingBeam);
      pendingBeam = note.pitch !== null && note.durationValue <= 0.5 && !note.beamBreak ? [note] : [];
      return;
    }
    pendingBeam.push(note);
  });
  if (pendingBeam.length > 1) beamGroups.push(pendingBeam);

  const beamedIds = new Set(beamGroups.flatMap((group) => group.map((note) => note.id)));
  const beamYById = new Map<string, number>();
  const stemUpById = new Map<string, boolean>();
  drawnNotes.forEach((note) => {
    if (note.pitch !== null) stemUpById.set(note.id, note.pitch < trebleMiddleLineMidi);
  });
  beamGroups.forEach((group) => {
    const pitchedGroup = group.filter((note) => note.pitch !== null);
    const stemUp = pitchedGroup.reduce((sum, note) => sum + (note.pitch ?? trebleMiddleLineMidi), 0) /
      Math.max(1, pitchedGroup.length) < trebleMiddleLineMidi;
    const beamY = stemUp ? Math.min(...group.map((note) => note.y)) - 29 : Math.max(...group.map((note) => note.y)) + 29;
    group.forEach((note) => {
      beamYById.set(note.id, beamY);
      stemUpById.set(note.id, stemUp);
    });
  });
  const noteLinks = drawnNotes.flatMap((note, index) => {
    const next = drawnNotes[index + 1];
    if (!note.linkToNext || !next || note.pitch === null || next.pitch === null) return [];
    const samePitch = note.pitch === next.pitch;
    const startX = note.x + 7;
    const endX = next.x - 7;
    const startY = note.y + 12;
    const endY = next.y + 12;
    const curveY = Math.max(note.y, next.y) + (samePitch ? 18 : 24);
    return [{
      id: `link-${note.id}-${next.id}`,
      type: samePitch ? "tie" : "slur",
      d: `M ${startX} ${startY} C ${(startX + endX) / 2} ${curveY}, ${(startX + endX) / 2} ${curveY}, ${endX} ${endY}`
    }];
  });
  const vexRenderKey = notes.map((note) => [
    note.id,
    note.pitch ?? "r",
    note.duration.numerator,
    note.duration.denominator,
    note.dotted ? "d" : "",
    note.beamGroup ?? "",
    note.beamBreak ? "b" : "",
    note.linkToNext ? "l" : "",
    note.restY ?? ""
  ].join(":")).join("|");

  useEffect(() => {
    const host = vexHost.current;
    if (!host) return;
    let cancelled = false;
    let layoutFrame: number | null = null;
    host.dataset.vexScore = "true";
    host.dataset.vexReady = "false";
    host.innerHTML = "";
    if (!useVexLayer) {
      host.dataset.vexReady = "true";
      setVexPositions({});
      return;
    }
    void loadVexFlow().then(({ BarlineType, Beam, Dot, Formatter, Renderer, Stave, StaveNote, Stem, Voice }) => {
      if (cancelled || !vexHost.current) return;
      host.innerHTML = "";
      const renderTarget = renderBackend === "canvas" ? document.createElement("canvas") : host;
      if (renderBackend === "canvas") host.appendChild(renderTarget);
      const renderer = new Renderer(renderTarget,
        renderBackend === "canvas" ? Renderer.Backends.CANVAS : Renderer.Backends.SVG);
      // SVG의 내부 좌표계를 줄이고 CSS로 같은 칸에 맞춰 확대한다.
      // context.scale()은 SVGContext의 좌표 보정과 겹쳐 실제 크기가 바뀌지 않으므로 사용하지 않는다.
      const renderWidth = width / notationScale;
      const renderHeight = scoreHeight / notationScale;
      renderer.resize(renderWidth, renderHeight);
      const context = renderer.getContext();
      context.setFillStyle("#243647");
      context.setStrokeStyle("#243647");

      const staveMargin = (connectedSystem ? (showSignature ? 4 : 0) : systemMeasure ? 14 : 18) / notationScale;
      // Leave one pixel for ordinary barlines and extra room for the thick
      // final barline so the Canvas edge does not clip either one.
      const staveRightPadding = (connectedSystem ? (endBarline === "final" ? 8 : 1) : compact ? 8 : 12) / notationScale;
      const staveX = staveMargin;
      const staveWidth = renderWidth - staveMargin - staveRightPadding;
      const stave = new Stave(staveX, 16, staveWidth, {
        leftBar: false,
        rightBar: true,
        spacingBetweenLinesPx: 12,
        spaceAboveStaffLn: 2,
        spaceBelowStaffLn: 2
      });
      if (showSignature) {
        stave.addClef("treble");
        stave.addTimeSignature(`${meter.beats}/${meter.beatUnit}`);
      }
      stave.setEndBarType(endBarline === "final" ? BarlineType.END : BarlineType.SINGLE);
      stave.setStyle({ strokeStyle: "#9caab4", fillStyle: "#243647" });
      stave.setNoteStartX(showSignature ? noteStartX / notationScale : staveX + 28 / notationScale);
      stave.setContext(context).draw();

      if (drawnNotes.length === 0) {
        setVexPositions({});
        onNoteLayout?.({});
        host.dataset.vexReady = "true";
        return;
      }

      const stemDirectionById = new Map<string, number>();
      beamGroups.forEach((group) => {
        const pitchedGroup = group.filter((note) => note.pitch !== null);
        if (pitchedGroup.length === 0) return;
        const averagePitch = pitchedGroup.reduce((sum, note) => sum + (note.pitch ?? trebleMiddleLineMidi), 0) / pitchedGroup.length;
        const direction = averagePitch < trebleMiddleLineMidi ? Stem.UP : Stem.DOWN;
        pitchedGroup.forEach((note) => stemDirectionById.set(note.id, direction));
      });

      const vexNotes = drawnNotes.map((note) => {
        const duration = vexDuration(note.durationValue, note.dotted) + (note.pitch === null ? "r" : "");
        const stemDirection = note.pitch === null
          ? undefined
          : stemDirectionById.get(note.id) ?? (note.pitch < trebleMiddleLineMidi ? Stem.UP : Stem.DOWN);
        const staveNote = new StaveNote({
          clef: "treble",
          keys: [note.pitch === null ? "b/4" : midiToVexKey(note.pitch)],
          duration,
          ...stemDirection === undefined ? {} : { stemDirection }
        });
        if (note.dotted || note.durationValue === 1.5 || note.durationValue === 3 || note.durationValue === 0.75) {
          Dot.buildAndAttach([staveNote], { all: true });
        }
        staveNote.setStyle({ fillStyle: "#243647", strokeStyle: "#243647" });
        staveNote.setStemStyle({ strokeStyle: "#243647" });
        staveNote.setFlagStyle({ fillStyle: "#243647", strokeStyle: "#243647" });
        return staveNote;
      });

      const voice = new Voice({ numBeats: meter.beats, beatValue: meter.beatUnit }).setMode(Voice.Mode.SOFT);
      voice.addTickables(vexNotes);
      const naturalFormatWidth = Math.max(120, width - (compact ? 8 : 12) - noteStartX - (compact ? 34 : 44));
      // 사용 가능한 마디 폭 전체에 음표 수와 길이에 맞춰 배분한다.
      // Formatter가 짧은 음표가 많은 마디와 긴 음표가 많은 마디의 간격을 각각 조절한다.
      const formatWidth = Math.max(64 / notationScale, naturalFormatWidth / notationScale);
      new Formatter({ softmaxFactor: 1.2 }).joinVoices([voice]).format([voice], formatWidth);
      const beams = Beam.generateBeams(vexNotes, { maintainStemDirections: true });
      voice.draw(context, stave);
      beams.forEach((beam) => {
        beam.renderOptions.beamWidth = 2.5;
        beam.setContext(context).draw();

      });

      vexNotes.forEach((note, index) => {
        if (renderBackend !== "svg") return;
        const element = note.getSVGElement();
        if (!element) return;
        element.setAttribute("data-note-id", drawnNotes[index].id);
        element.classList.add("vex-note-event");

        if (drawnNotes[index].id === playingNoteId) element.classList.add("vex-note-playing");
        if (reviewIssueNoteIds?.includes(drawnNotes[index].id)) element.classList.add("vex-note-review-issue");
      });

      const svgElement = renderBackend === "svg" ? host.querySelector<SVGSVGElement>("svg") : null;
      if (svgElement) {
        svgElement.setAttribute("aria-hidden", "true");
        svgElement.setAttribute("viewBox", `0 0 ${renderWidth} ${renderHeight}`);
        svgElement.setAttribute("width", "100%");
        svgElement.setAttribute("height", "100%");
        svgElement.style.width = "100%";
        svgElement.style.height = "100%";
      }

      // SVG의 CSS 크기가 계산된 다음 프레임에 실제 음표 머리 좌표를 읽는다.
      // 렌더링 직후에는 getBoundingClientRect()가 0이어서 상대 좌표가 될 수 있다.
      layoutFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        // 상위 그리드와 절대 위치 SVG가 확정되는 한 프레임을 더 기다린다.
        layoutFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const renderedSvg = host.querySelector<SVGSVGElement>("svg");
        const svgBox = renderedSvg?.getBoundingClientRect();
        const nextPositions = Object.fromEntries(vexNotes.map((note, index) => [
          drawnNotes[index].id,
          (() => {
            const element = note.getSVGElement();
            const renderedHead = element?.querySelector<SVGGraphicsElement>(".vf-notehead") ?? element;
            const renderedBox = renderedHead?.getBoundingClientRect();
            if (svgBox && renderedBox && svgBox.width > 0 && svgBox.height > 0) {
              return {
                x: (renderedBox.left + renderedBox.width / 2 - svgBox.left) * width / svgBox.width,
                y: (renderedBox.top + renderedBox.height / 2 - svgBox.top) * scoreHeight / svgBox.height
              };
            }
            const box = note.getBoundingBox();
            const absoluteX = note.getAbsoluteX();
            return {
              x: (Number.isFinite(absoluteX) ? absoluteX : box.getX() + box.getW() / 2) * notationScale,
              y: (box.getY() + box.getH() / 2) * notationScale
            };
          })()
        ]));
        setVexPositions((current) => {
          const changed = Object.keys(nextPositions).length !== Object.keys(current).length ||
            Object.entries(nextPositions).some(([id, position]) =>
              Math.abs((current[id]?.x ?? -9999) - position.x) > 0.5 ||
              Math.abs((current[id]?.y ?? -9999) - position.y) > 0.5);
          return changed ? nextPositions : current;
        });
        onNoteLayout?.(nextPositions);
        host.dataset.vexReady = "true";
        });
      });
    }).catch((error) => {
      console.warn("악보 렌더링을 완료하지 못했습니다.", error);
      host.innerHTML = "";
      host.dataset.vexReady = "true";
    });
    return () => {
      cancelled = true;
      if (layoutFrame !== null) window.cancelAnimationFrame(layoutFrame);
    };
  }, [connectedSystem, endBarline, meter.beatUnit, meter.beats, notationScale, noteStartX, renderBackend, reviewIssueNoteIds, scoreHeight, showSignature, systemMeasure, useVexLayer, vexRenderKey, width]);

  useEffect(() => {
    const host = vexHost.current;
    if (!host || !useVexLayer) return;
    host.querySelectorAll(".vex-note-event.vex-note-playing")
      .forEach((element) => element.classList.remove("vex-note-playing"));
    if (!playingNoteId) return;
    host.querySelectorAll(".vex-note-event").forEach((element) => {
      if (element.getAttribute("data-note-id") === playingNoteId) {
        element.classList.add("vex-note-playing");
      }
    });
  }, [playingNoteId, useVexLayer]);

  return (
    <div className="score-shell" style={{ aspectRatio: `${width} / ${scoreHeight}` }}>
      {useVexLayer && <div ref={vexHost} className="vex-score-layer" />}
    <svg className={`score ${useVexLayer ? "score-vex-overlay" : "score-edit-layer"}`} viewBox={`0 0 ${width} ${scoreHeight}`} role="img"
      aria-label={`${meter.beats}/${meter.beatUnit}박자 한 마디 악보${notes.length === 0 ? ", 아직 비어 있음" : `, 음표와 쉼표 ${notes.length}개`}`}>
      {!useVexLayer && staffLines.map((y) => (
        <line key={y} x1={systemMeasure ? 0 : 10} x2={systemMeasure ? width : width - 10}
          y1={y} y2={y} className="staff-line" />
      ))}
      {!useVexLayer && showSignature && <text x="12" y={expandedStaff ? 75 : 41} className="clef" aria-hidden="true">𝄞</text>}
      {!useVexLayer && showSignature && <text x={compact ? 38 : 40} y={expandedStaff ? 42 : 19} className="meter-number">{meter.beats}</text>}
      {!useVexLayer && showSignature && <text x={compact ? 38 : 40} y={expandedStaff ? 72 : 39} className="meter-number">{meter.beatUnit}</text>}
      {!useVexLayer && <line x1={systemMeasure ? width - 1 : width - 10} x2={systemMeasure ? width - 1 : width - 10}
        y1={staffLines[0]} y2={staffLines[staffLines.length - 1]} className="bar-line" />}
      {drawnNotes.map((note, noteIndex) => {
        const { x, y, durationValue: duration } = note;
        const displayX = dragPreview?.id === note.id ? x + dragPreview.dx : x;
        const selected = selectedNoteIds?.includes(note.id) ?? selectedNoteId === note.id;
        const playing = playingNoteId === note.id;
        const handleNoteKeyDown = (event: React.KeyboardEvent<SVGGElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectNote?.(note.id, event.shiftKey);
            return;
          }
          if (note.pitch === null || !onMoveNote) return;
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            onMoveNote(note.id, Math.max(48, Math.min(84, note.pitch + (event.key === "ArrowUp" ? 1 : -1))));
          }
        };
        const selectOnPointerDown = (event: React.PointerEvent<SVGGElement>) => {
          onSelectNote?.(note.id, event.shiftKey);
          if (!onMovePosition && (note.pitch === null || !onMoveNote)) return;
          event.preventDefault();
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Some SVG/browser combinations do not support reliable pointer capture on <g>.
          }
          const svgRect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
          drag.current = {
            id: note.id,
            startX: event.clientX,
            startY: event.clientY,
            startValue: note.pitch === null ? y : note.pitch,
            svgWidth: svgRect?.width ?? width,
            svgHeight: svgRect?.height ?? scoreHeight,
            kind: note.pitch === null ? "rest" : "note",
            hasMoved: false
          };
          const moveFromWindow = (moveEvent: PointerEvent) => {
            if (!drag.current || drag.current.id !== note.id) return;
            moveEvent.preventDefault();
            const pixelDeltaX = moveEvent.clientX - drag.current.startX;
            const pixelDeltaY = moveEvent.clientY - drag.current.startY;
            // A click naturally includes a few pixels of pointer jitter. Do
            // not treat that as a musical edit; drag starts after 6px.
            if (!drag.current.hasMoved && Math.hypot(pixelDeltaX, pixelDeltaY) < 6) return;
            drag.current.hasMoved = true;
            const viewBoxDeltaX = (moveEvent.clientX - drag.current.startX) * width / drag.current.svgWidth;
            setDragPreview({ id: note.id, dx: viewBoxDeltaX });
            if (drag.current.kind === "rest" || !onMoveNote) return;
            const viewBoxDelta = (moveEvent.clientY - drag.current.startY) * scoreHeight / drag.current.svgHeight;
            const semitones = Math.round(-viewBoxDelta / 3);
            onMoveNote(note.id, Math.max(48, Math.min(84, drag.current.startValue + semitones)));
          };
          const endFromWindow = (upEvent: PointerEvent) => {
            if (drag.current?.id !== note.id) return;
            upEvent.preventDefault();
            if (drag.current.hasMoved && onMovePosition) {
              const viewBoxDeltaX = (upEvent.clientX - drag.current.startX) * width / drag.current.svgWidth;
              const targetX = note.logicalX + viewBoxDeltaX;
              const targetBeat = Math.max(0, Math.min(capacity, ((targetX - left - 10) / usable) * capacity));
              onMovePosition(note.id, targetBeat);
            }
            drag.current = null;
            setDragPreview(null);
            window.removeEventListener("pointermove", moveFromWindow);
            window.removeEventListener("pointerup", endFromWindow);
            window.removeEventListener("pointercancel", endFromWindow);
          };
          window.addEventListener("pointermove", moveFromWindow, { passive: false });
          window.addEventListener("pointerup", endFromWindow, { passive: false });
          window.addEventListener("pointercancel", endFromWindow, { passive: false });
        };
        const moveOnPointer = (event: React.PointerEvent<SVGGElement>) => {
          if (!drag.current || drag.current.id !== note.id) return;
          const pixelDeltaX = event.clientX - drag.current.startX;
          const pixelDeltaY = event.clientY - drag.current.startY;
          if (!drag.current.hasMoved && Math.hypot(pixelDeltaX, pixelDeltaY) < 6) return;
          drag.current.hasMoved = true;
          const viewBoxDeltaX = (event.clientX - drag.current.startX) * width / drag.current.svgWidth;
          setDragPreview({ id: note.id, dx: viewBoxDeltaX });
          if (drag.current.kind === "rest" || !onMoveNote) return;
          const viewBoxDelta = (event.clientY - drag.current.startY) * scoreHeight / drag.current.svgHeight;
          const semitones = Math.round(-viewBoxDelta / 3);
          onMoveNote(note.id, Math.max(48, Math.min(84, drag.current.startValue + semitones)));
        };
        const endPointerDrag = (event: React.PointerEvent<SVGGElement>) => {
          if (drag.current?.id === note.id) {
            if (drag.current.hasMoved && onMovePosition) {
              const viewBoxDeltaX = (event.clientX - drag.current.startX) * width / drag.current.svgWidth;
              const targetX = note.logicalX + viewBoxDeltaX;
              const targetBeat = Math.max(0, Math.min(capacity, ((targetX - left - 10) / usable) * capacity));
              onMovePosition(note.id, targetBeat);
            }
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            drag.current = null;
            setDragPreview(null);
          }
        };

        if (note.pitch === null) {
          return (
            <g key={note.id} className={`${onSelectNote ? "note-button rest-button " : "rest-button "}${playing ? "note-playing" : ""}`.trim() || undefined}
              onPointerDown={selectOnPointerDown} onPointerMove={moveOnPointer}
              onPointerUp={endPointerDrag} onPointerCancel={endPointerDrag}
              role={onSelectNote ? "button" : undefined}
              tabIndex={onSelectNote ? 0 : undefined} onKeyDown={handleNoteKeyDown}
              aria-label={onSelectNote ? `${noteIndex + 1}번째 쉼표 선택` : `${noteIndex + 1}번째 쉼표`}>
              <rect x={displayX - 12} y={y - 25} width="28" height="50" rx="9"
                className={selected ? "note-hit selected" : "note-hit"} />
              {!useVexLayer && renderRestMark(displayX, y, duration, note.dotted)}
            </g>
          );
        }

        const isHalf = duration >= 2;
        const stemUp = stemUpById.get(note.id) ?? true;
        const stemX = displayX + (stemUp ? 6 : -6);
        const stemEndY = beamYById.get(note.id) ?? (stemUp ? y - 27 : y + 27);
        return (
          <g key={note.id} className={`${onSelectNote ? "note-button " : ""}${playing ? "note-playing" : ""}`.trim() || undefined}
            onPointerDown={selectOnPointerDown} onPointerMove={moveOnPointer}
            onPointerUp={endPointerDrag} onPointerCancel={endPointerDrag}
            role={onSelectNote ? "button" : undefined}
            tabIndex={onSelectNote ? 0 : undefined} onKeyDown={handleNoteKeyDown}
            aria-label={onSelectNote
              ? `${noteIndex + 1}번째 ${pitchName(note.pitch)} 음표 선택`
              : `${noteIndex + 1}번째 ${pitchName(note.pitch)} 음표`}>
            <rect x={displayX - 12} y={y - 23} width="28" height="48" rx="9"
              className={selected ? "note-hit selected" : "note-hit"} />
            {!useVexLayer && <ellipse cx={displayX} cy={y} rx="7" ry="5" className={isHalf ? "note-head hollow" : "note-head"}
              transform={`rotate(-14 ${displayX} ${y})`} />}
            {!useVexLayer && duration < 4 && <line x1={stemX} x2={stemX} y1={y}
              y2={stemEndY} className="stem" />}
            {!useVexLayer && (note.dotted || duration === 1.5 || duration === 3) &&
              <circle cx={displayX + 11} cy={y - 1} r="2.3" className="duration-dot" />}
            {!useVexLayer && duration <= 0.5 && !beamedIds.has(note.id) && (stemUp ?
              <>
                <path d={`M ${stemX} ${stemEndY} q 14 5 7 16`} className="flag" />
                {duration <= 0.25 && <path d={`M ${stemX} ${stemEndY + 6} q 13 5 7 15`} className="flag" />}
              </> :
              <>
                <path d={`M ${stemX} ${stemEndY} q -14 -5 -7 -16`} className="flag" />
                {duration <= 0.25 && <path d={`M ${stemX} ${stemEndY - 6} q -13 -5 -7 -15`} className="flag" />}
              </>)}
          </g>
        );
      })}
      {!useVexLayer && beamGroups.map((group) => {
        const beamY = beamYById.get(group[0].id) ?? 20;
        const stemUp = stemUpById.get(group[0].id) ?? true;
        const beamOffset = stemUp ? 6 : -6;
        const doubleBeam = group.every((note) => note.durationValue <= 0.25);
        return <g key={`beam-${group[0].id}`}>
          <line x1={group[0].x + beamOffset} x2={group[group.length - 1].x + beamOffset}
            y1={beamY} y2={beamY} className="beam" />
          {doubleBeam && <line x1={group[0].x + beamOffset} x2={group[group.length - 1].x + beamOffset}
            y1={beamY + (stemUp ? 4 : -4)} y2={beamY + (stemUp ? 4 : -4)} className="beam secondary-beam" />}
        </g>;
      })}
      {noteLinks.map((link) => (
        <path key={link.id} d={link.d} className={`note-link ${link.type}`}
          aria-label={link.type === "tie" ? "붙임줄" : "이음줄"} />
      ))}
    </svg>
    </div>
  );
}

