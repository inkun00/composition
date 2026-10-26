type PdfLibraries = Readonly<{
  html2canvas: typeof import("html2canvas")["default"];
  jsPDF: typeof import("jspdf")["jsPDF"];
}>;

let libraries: Promise<PdfLibraries> | null = null;

/** Keep loaded export modules alive when another deployment replaces their URLs. */
export function loadScorePdfLibraries(): Promise<PdfLibraries> {
  if (!libraries) {
    libraries = Promise.all([import("html2canvas"), import("jspdf")])
      .then(([canvas, pdf]) => ({ html2canvas: canvas.default, jsPDF: pdf.jsPDF }))
      .catch((error) => { libraries = null; throw error; });
  }
  return libraries;
}

export async function waitForScorePdfPages(timeoutMs = 4000): Promise<readonly HTMLElement[]> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await document.fonts?.ready;
  const pages = [...document.querySelectorAll<HTMLElement>(".pdf-document[aria-hidden='true'] [data-pdf-page]")];
  if (!pages.length) throw new Error("pdf-pages-missing");
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const scores = pages.flatMap((page) => [...page.querySelectorAll<HTMLElement>("[data-vex-score='true']")]);
    if (scores.length && scores.every((score) => score.dataset.vexReady === "true")) return pages;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error("pdf-score-not-ready");
}

export async function saveScorePdf(modules: PdfLibraries, pages: readonly HTMLElement[],
  title: string, includeAccompaniment: boolean): Promise<void> {
  const pdf = new modules.jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  for (const [index, page] of pages.entries()) {
    const canvas = await modules.html2canvas(page, { scale: 2, backgroundColor: "#ffffff", logging: false });
    if (index > 0) pdf.addPage("a4", "portrait");
    pdf.addImage(canvas.toDataURL("image/jpeg", .94), "JPEG", 0, 0, 210, 297, undefined, "FAST");
  }
  const safeTitle = title.trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "마음멜로디";
  pdf.save(`${safeTitle}${includeAccompaniment ? "-반주포함" : ""}.pdf`);
}
