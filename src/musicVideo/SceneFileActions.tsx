import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import StudioArtwork from "./StudioArtwork";
import type { MusicVideoScene } from "../video/musicVideoModel";
import { readSceneFile, saveSceneFile, saveScenePng } from "./sceneFile";
import "./SceneFileActions.css";

type Props = Readonly<{
  scene: MusicVideoScene;
  sceneNumber: number;
  title: string;
  disabled: boolean;
  onImport: (scene: MusicVideoScene) => void;
  onReset: () => void;
  onStatus: (message: string) => void;
}>;

export default function SceneFileActions(props: Props) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState<"png" | "import" | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const optionsButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(props);
  const mounted = useRef(true);
  const optionId = useId();
  const unavailable = props.disabled || working !== null;
  latest.current = props;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (unavailable) setOpen(false);
  }, [unavailable]);

  function closeOnEscape(event: KeyboardEvent) {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    optionsButton.current?.focus();
  }

  function save() {
    if (unavailable) return;
    setOpen(false);
    try {
      saveSceneFile(props.scene, props.title, props.sceneNumber);
      props.onStatus(`장면 ${props.sceneNumber} 파일 다운로드를 시작했어요. 그림과 동작을 다시 불러올 수 있어요.`);
    } catch (error) {
      props.onStatus(error instanceof Error ? error.message : "장면 파일을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function savePng() {
    if (unavailable) return;
    setOpen(false);
    setWorking("png");
    try {
      await saveScenePng(props.scene, props.title, props.sceneNumber);
      if (mounted.current) latest.current.onStatus(`장면 ${props.sceneNumber} 이미지 다운로드를 시작했어요.`);
    } catch (error) {
      if (mounted.current) latest.current.onStatus(error instanceof Error ? error.message : "이미지를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      if (mounted.current) setWorking(null);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || unavailable) return;
    setOpen(false);
    setWorking("import");
    const targetId = props.scene.id;
    try {
      const imported = await readSceneFile(file);
      if (!mounted.current) return;
      const current = latest.current;
      if (targetId !== current.scene.id) {
        current.onStatus("선택한 장면이 바뀌어 불러오기를 취소했어요. 다시 파일을 선택해 주세요.");
        return;
      }
      if (current.disabled) {
        current.onStatus("영상을 만드는 중에는 장면을 불러올 수 없어요. 완료 후 다시 파일을 선택해 주세요.");
        return;
      }
      current.onImport(imported);
      current.onStatus(`장면 ${current.sceneNumber}에 그림과 동작을 불러왔어요. 장면 구간은 유지돼요. 동작 시작 마디를 확인해 주세요.`);
    } catch (error) {
      if (mounted.current) latest.current.onStatus(error instanceof Error ? error.message : "장면 파일을 불러오지 못했어요. 파일을 확인해 주세요.");
    } finally {
      if (mounted.current) setWorking(null);
    }
  }

  return <div className="mv-scene-file-actions" ref={root} onKeyDown={closeOnEscape}
    role="group" aria-label="현재 장면 저장 및 초기화" aria-busy={working !== null}>
    <div className="mv-scene-save-group">
      <button type="button" className="mv-scene-save" data-testid="scene-save"
        title="현재 장면의 그림과 동작을 파일로 저장"
        disabled={unavailable} onClick={save}>
        {working ? <StudioArtwork name="loading" size={22} className="mv-scene-file-spinner" />
          : <StudioArtwork name="save" size={23} />}
        <span>{working === "png" ? "이미지 저장 중" : working === "import" ? "불러오는 중" : "장면 저장"}</span>
      </button>
      <div className="mv-scene-save-options">
        <button ref={optionsButton} type="button" className="mv-scene-options-button"
          data-testid="scene-save-options" aria-label="저장 옵션" title="저장 옵션"
          aria-expanded={open} aria-controls={open ? optionId : undefined}
          disabled={unavailable} onClick={() => setOpen((value) => !value)}>
          <StudioArtwork name="chevron-down" size={18} />
        </button>
        {open && <div className="mv-scene-file-popover" id={optionId} aria-label="장면 파일 옵션">
          <button type="button" onClick={() => void savePng()}>
            <StudioArtwork name="download" size={24} /><span>이미지(PNG)로 저장<small>현재 그림을 이미지로 내려받아요</small></span>
          </button>
          <button type="button" onClick={() => { setOpen(false); input.current?.click(); }}>
            <StudioArtwork name="upload" size={24} /><span>장면 파일 불러오기<small>저장한 그림과 동작을 다시 편집해요</small></span>
          </button>
          <p><StudioArtwork name="download" size={15} />장면 저장은 편집 가능한 JSON 파일이에요.</p>
        </div>}
      </div>
    </div>
    <button type="button" className="mv-scene-reset" data-testid="scene-reset"
      title="현재 장면의 그림, 배경과 동작을 초기화해요. 장면 구간은 유지되며 되돌릴 수 있어요."
      disabled={unavailable} onClick={() => { setOpen(false); props.onReset(); }}>
      <StudioArtwork name="rotate-back" size={23} /><span>장면 초기화</span>
    </button>
    <input ref={input} type="file" accept=".json,application/json" className="mv-scene-file-input"
      data-testid="scene-import-file" aria-label="장면 파일 불러오기" tabIndex={-1}
      disabled={unavailable} onChange={(event) => void importFile(event)} />
  </div>;
}
