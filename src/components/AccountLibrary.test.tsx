// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountLibrary from "./AccountLibrary";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderAccountLibrary(onEmailAuth = vi.fn().mockResolvedValue(true)) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<AccountLibrary configured user={null} authReady scores={[]} loading={false}
    busy={false} error="" currentScoreId={null} onClose={() => undefined}
    onGoogleSignIn={() => undefined} onEmailAuth={onEmailAuth}
    onPasswordReset={vi.fn().mockResolvedValue(true)} onClearError={() => undefined} onSignOut={() => undefined}
    onSave={() => undefined} onLoad={() => undefined} onDelete={() => undefined} />));
  return { container, onEmailAuth };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("이메일 계정 화면", () => {
  it("이메일 로그인과 Google 로그인을 함께 제공한다", () => {
    const view = renderAccountLibrary();
    expect(view.container.querySelector('input[type="email"]')).not.toBeNull();
    expect(view.container.textContent).toContain("이메일로 로그인");
    expect(view.container.textContent).toContain("Google로 계속하기");
  });

  it("회원가입에서 비밀번호 확인이 다르면 요청하지 않는다", async () => {
    const view = renderAccountLibrary();
    const signupTab = [...view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find((button) => button.textContent === "회원가입");
    await act(async () => signupTab?.click());

    const inputs = view.container.querySelectorAll<HTMLInputElement>("input");
    await act(async () => {
      const values = ["student@example.com", "secret1", "secret2"];
      inputs.forEach((input, index) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, values[index]);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    await act(async () => view.container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    expect(view.container.textContent).toContain("비밀번호가 서로 같지 않아요.");
    expect(view.onEmailAuth).not.toHaveBeenCalled();
  });
});
