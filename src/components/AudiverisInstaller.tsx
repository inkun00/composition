import { useEffect, useMemo, useState } from "react";
import { Check, Download, ExternalLink, Laptop, LoaderCircle, Smartphone } from "lucide-react";
import "./AudiverisInstaller.css";

const RELEASE_API_URL = "https://api.github.com/repos/Audiveris/audiveris/releases/latest";
const RELEASE_PAGE_URL = "https://github.com/Audiveris/audiveris/releases/latest";
const FLATPAK_URL = "https://flathub.org/apps/org.audiveris.audiveris";

export type AudiverisTarget = "windows" | "mac-arm" | "mac-intel" | "mac-unknown" | "linux" | "mobile" | "unknown";

type ReleaseAsset = Readonly<{
  name: string;
  browser_download_url: string;
}>;

type LatestRelease = Readonly<{
  tag_name?: string;
  assets?: ReleaseAsset[];
}>;

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
  };
};

type AudiverisInstallerProps = Readonly<{
  onChooseMxl: () => void;
}>;

const targetChoices: ReadonlyArray<{ target: AudiverisTarget; label: string }> = [
  { target: "windows", label: "Windows" },
  { target: "mac-arm", label: "Mac · Apple 칩" },
  { target: "mac-intel", label: "Mac · Intel" },
  { target: "linux", label: "Linux" }
];

function normalizedArchitecture(value: string): "arm64" | "x64" | "unknown" {
  const architecture = value.toLowerCase();
  if (architecture.includes("arm") || architecture.includes("aarch")) return "arm64";
  if (architecture.includes("x86") || architecture.includes("x64") || architecture.includes("amd64")) return "x64";
  return "unknown";
}

export function detectAudiverisTarget(userAgent: string, platform = "", maxTouchPoints = 0): AudiverisTarget {
  const source = `${userAgent} ${platform}`.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(source) || (source.includes("macintel") && maxTouchPoints > 1)) return "mobile";
  if (/windows|win32|win64/.test(source)) return "windows";
  if (/macintosh|mac os|macintel/.test(source)) {
    const architecture = normalizedArchitecture(source);
    if (architecture === "arm64") return "mac-arm";
    if (architecture === "x64") return "mac-intel";
    return "mac-unknown";
  }
  if (/linux|x11|ubuntu/.test(source)) return "linux";
  return "unknown";
}

export function findAudiverisAsset(assets: readonly ReleaseAsset[], target: AudiverisTarget): ReleaseAsset | null {
  const pattern = target === "windows"
    ? /windows-x86_64\.msi$/i
    : target === "mac-arm"
      ? /macosx-arm64\.dmg$/i
      : target === "mac-intel"
        ? /macosx-x86_64\.dmg$/i
        : null;
  if (!pattern) return null;
  return assets.find((asset) => pattern.test(asset.name) && !asset.name.includes("windowsConsole")) ?? null;
}

function targetTitle(target: AudiverisTarget): string {
  if (target === "windows") return "Windows용 설치 파일을 찾았어요";
  if (target === "mac-arm") return "Apple 칩 Mac용 설치 파일을 찾았어요";
  if (target === "mac-intel") return "Intel Mac용 설치 파일을 찾았어요";
  if (target === "mac-unknown") return "Mac의 칩 종류만 확인해 주세요";
  if (target === "linux") return "Linux용 간편 설치를 준비했어요";
  if (target === "mobile") return "휴대폰·태블릿에는 설치할 수 없어요";
  return "사용 중인 컴퓨터를 골라 주세요";
}

function installSteps(target: AudiverisTarget): readonly string[] {
  if (target === "windows") return [
    "아래 버튼으로 Windows 설치 파일을 받습니다.",
    "다운로드된 .msi 파일을 열고 ‘다음’을 누릅니다.",
    "Windows가 권한을 물으면 ‘예’를 눌러 설치를 마칩니다."
  ];
  if (target === "mac-arm" || target === "mac-intel") return [
    "아래 버튼으로 Mac 설치 파일을 받습니다.",
    "다운로드된 DMG를 열고 Audiveris를 응용 프로그램 폴더로 옮깁니다.",
    "처음 실행이 막히면 시스템 설정 → 개인정보 보호 및 보안 → ‘확인 없이 열기’를 누릅니다."
  ];
  if (target === "linux") return [
    "아래 버튼으로 Flathub의 Audiveris 페이지를 엽니다.",
    "Install을 누르고 내려받은 파일을 소프트웨어 설치 앱으로 엽니다.",
    "설치가 끝나면 앱 목록에서 Audiveris를 실행합니다."
  ];
  return [];
}

export default function AudiverisInstaller({ onChooseMxl }: AudiverisInstallerProps) {
  const detectedTarget = useMemo(() => detectAudiverisTarget(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints
  ), []);
  const [target, setTarget] = useState<AudiverisTarget>(detectedTarget);
  const [assets, setAssets] = useState<readonly ReleaseAsset[]>([]);
  const [version, setVersion] = useState("");
  const [releaseState, setReleaseState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (target !== "mac-unknown") return;
    const userAgentData = (navigator as NavigatorWithUserAgentData).userAgentData;
    if (!userAgentData?.getHighEntropyValues) return;
    let active = true;
    void userAgentData.getHighEntropyValues(["architecture"]).then(({ architecture = "" }) => {
      if (!active) return;
      const normalized = normalizedArchitecture(architecture);
      if (normalized === "arm64") setTarget("mac-arm");
      if (normalized === "x64") setTarget("mac-intel");
    }).catch(() => undefined);
    return () => { active = false; };
  }, [target]);

  useEffect(() => {
    let active = true;
    void fetch(RELEASE_API_URL, { headers: { Accept: "application/vnd.github+json" } })
      .then((response) => {
        if (!response.ok) throw new Error("최신 설치 파일을 확인하지 못했습니다.");
        return response.json() as Promise<LatestRelease>;
      })
      .then((release) => {
        if (!active) return;
        setAssets(release.assets ?? []);
        setVersion(release.tag_name ?? "");
        setReleaseState("ready");
      })
      .catch(() => {
        if (active) setReleaseState("error");
      });
    return () => { active = false; };
  }, []);

  const selectedAsset = findAudiverisAsset(assets, target);
  const isDesktopChoice = target === "windows" || target === "mac-arm" || target === "mac-intel" || target === "linux";
  const installUrl = target === "linux" ? FLATPAK_URL : selectedAsset?.browser_download_url ?? "";
  const steps = installSteps(target);

  return (
    <section className="audiveris-installer" aria-labelledby="audiveris-installer-heading">
      <div className="audiveris-installer-heading">
        {target === "mobile" ? <Smartphone size={22} /> : <Laptop size={22} />}
        <div>
          <strong id="audiveris-installer-heading">{targetTitle(target)}</strong>
          <span>기기를 자동으로 확인했어요. 다르면 아래에서 바꿀 수 있어요.</span>
        </div>
      </div>

      {target !== "mobile" && (
        <div className="audiveris-target-choices" aria-label="Audiveris 설치 기기 선택">
          {targetChoices.map((choice) => (
            <button key={choice.target} type="button" aria-pressed={target === choice.target}
              onClick={() => setTarget(choice.target)}>{choice.label}</button>
          ))}
        </div>
      )}

      {target === "mobile" ? (
        <p className="audiveris-mobile-notice">Audiveris는 Windows·Mac·Linux 컴퓨터용 프로그램이에요.
          이 페이지를 컴퓨터에서 열고 같은 악보를 선택해 주세요.</p>
      ) : target === "mac-unknown" || target === "unknown" ? (
        <p className="audiveris-device-question">위에서 사용하는 컴퓨터를 한 번만 골라 주세요.</p>
      ) : (
        <>
          <ol className="audiveris-install-steps">
            {steps.map((step) => <li key={step}><Check size={14} /> <span>{step}</span></li>)}
          </ol>
          <div className="audiveris-download-row">
            {releaseState === "loading" && target !== "linux" ? (
              <span className="audiveris-release-loading"><LoaderCircle className="spin" size={16} /> 최신 공식 파일 확인 중…</span>
            ) : installUrl ? (
              <a className="audiveris-download" href={installUrl} target="_blank" rel="noreferrer"
                data-testid="audiveris-device-download">
                <Download size={17} /> {target === "linux" ? "Linux에서 설치하기" : `${version || "최신"} 설치 파일 받기`}
              </a>
            ) : (
              <a className="audiveris-download fallback" href={RELEASE_PAGE_URL} target="_blank" rel="noreferrer">
                <ExternalLink size={17} /> 공식 다운로드 페이지 열기
              </a>
            )}
            {isDesktopChoice && <small>Java가 함께 들어 있어 따로 설치할 필요가 없어요.</small>}
          </div>
        </>
      )}

      <div className="audiveris-after-install">
        <div><strong>설치가 끝났나요?</strong><span>변환한 악보 파일을 다시 가져오면 돼요.</span></div>
        <button type="button" onClick={onChooseMxl}>변환한 악보 파일 고르기</button>
      </div>
      <p className="audiveris-browser-limit">브라우저 보안상 설치 파일 실행과 권한 승인은 직접 한 번 눌러야 해요.</p>
    </section>
  );
}
