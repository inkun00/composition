export default function ComposerWorkspaceEmpty({ complete, onReturn, onComplete }: Readonly<{
  complete: boolean;
  onReturn: () => void;
  onComplete: () => void;
}>) {
  return <div className="workspace-empty">
    <h2>{complete ? "가락이 준비되었어요" : "가락을 채우면 이어서 만들 수 있어요"}</h2>
    <p>{complete ? "완성을 누르면 악기, 반주, 가사와 저장 도구가 열려요." : "각 마디의 가락을 고르고 완성하면 악기, 반주, 가사와 저장 도구가 열려요."}</p>
    <button type="button" className="primary action-button" onClick={complete ? onComplete : onReturn}>
      {complete ? "가락 완성하기" : "가락 만들기로"}
    </button>
  </div>;
}
