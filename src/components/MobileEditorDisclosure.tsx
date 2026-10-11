import { useEffect, useState, type ReactNode } from "react";

type MobileEditorDisclosureProps = {
  children: ReactNode;
  enabled: boolean;
};

const mobileQuery = "(max-width: 900px)";

function isMobileWidth(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(mobileQuery).matches;
}

export default function MobileEditorDisclosure({ children, enabled }: MobileEditorDisclosureProps) {
  const [isMobile, setIsMobile] = useState(isMobileWidth);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(mobileQuery);
    const updateWidth = () => setIsMobile(media.matches);
    updateWidth();
    media.addEventListener("change", updateWidth);
    return () => media.removeEventListener("change", updateWidth);
  }, []);

  const showEditor = !isMobile || (enabled && expanded);

  return (
    <div className="mobile-editor-disclosure">
      <button type="button" className="mobile-editor-disclosure-button"
        aria-expanded={showEditor} aria-controls="melody-note-editor-content"
        disabled={!enabled} onClick={() => setExpanded((current) => !current)}>
        {showEditor ? "음표 직접 다듬기 닫기" : "고른 가락의 음표 직접 다듬기"}
      </button>
      <div id="melody-note-editor-content" hidden={!showEditor}>
        {showEditor ? children : null}
      </div>
    </div>
  );
}
