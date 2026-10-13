type Style = Readonly<{ strokeStyle?: string; fillStyle?: string }>;

export const scoreDrawing = {
  staves: [] as { x: number; y: number; width: number; clef: boolean; timeSignature?: string }[],
  styles: [] as Style[]
};

export function clearScoreDrawing(): void {
  scoreDrawing.staves.length = 0;
  scoreDrawing.styles.length = 0;
}

/** VexFlow owns glyph drawing; this mock preserves its score geometry and paint contracts. */
export function testVexFlow() {
  class StyledShape {
    setStyle(style: Style) { scoreDrawing.styles.push(style); return this; }
    setContext(_context: unknown) { return this; }
    draw() { return this; }
    drawWithStyle() { return this.draw(); }
  }
  class CanvasContext {
    constructor(readonly context: CanvasRenderingContext2D) {}
  }
  class Stave extends StyledShape {
    readonly record: (typeof scoreDrawing.staves)[number];
    constructor(x: number, y: number, width: number, _options: unknown) {
      super();
      this.record = { x, y, width, clef: false };
      scoreDrawing.staves.push(this.record);
    }
    addClef(_clef: string) { this.record.clef = true; return this; }
    addTimeSignature(signature: string) { this.record.timeSignature = signature; return this; }
    setEndBarType(_type: unknown) { return this; }
    getNoteStartX() { return this.record.x + (this.record.clef ? 65 : 15); }
    getNoteEndX() { return this.record.x + this.record.width - 12; }
  }
  class StaveNote extends StyledShape {
    x = 0;
    y = 0;
    constructor(_notation: unknown) { super(); }
    addModifier(_modifier: unknown) { return this; }
    setLedgerLineStyle(style: Style) { scoreDrawing.styles.push(style); return this; }
    getAbsoluteX() { return this.x; }
    getYs() { return [this.y]; }
  }
  class Voice {
    static Mode = { SOFT: "soft" };
    notes: StaveNote[] = [];
    constructor(_meter: unknown) {}
    setMode(_mode: unknown) { return this; }
    addTickables(notes: StaveNote[]) { this.notes = notes; return this; }
    draw(_context: unknown, stave: Stave) {
      const width = stave.getNoteEndX() - stave.getNoteStartX();
      this.notes.forEach((note, index) => {
        note.x = stave.getNoteStartX() + (index + 0.2) / this.notes.length * width;
        note.y = stave.record.y + 55;
      });
      return this;
    }
  }
  class Formatter {
    constructor(_options: unknown) {}
    joinVoices(_voices: unknown) { return this; }
    format(_voices: unknown, _width: number) { return this; }
  }
  class Beam extends StyledShape {
    static getDefaultBeamGroups(_meter: string) { return []; }
    static generateBeams(_notes: unknown, _options: unknown) { return [new Beam()]; }
  }
  class Accidental extends StyledShape { constructor(_accidental: string) { super(); } }
  class StaveTie extends StyledShape { constructor(_options: unknown) { super(); } }
  class Curve extends StyledShape {
    static Position = { NEAR_HEAD: "near-head" };
    constructor(_first: unknown, _last: unknown, _options: unknown) { super(); }
  }
  return {
    CanvasContext, Stave, StaveNote, Voice, Formatter, Beam, Accidental, StaveTie, Curve,
    Dot: { buildAndAttach(_notes: unknown, _options: unknown) {} },
    BarlineType: { END: "end", SINGLE: "single" }
  };
}
