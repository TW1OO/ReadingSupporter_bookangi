export default function Header({ hasDoc, fileName, dark, onHome, onOpen, onInfo, onToggleTheme }) {
  return (
    <header>
      <button className="brand" onClick={onHome} title="홈으로" aria-label="Book항이 홈">
        <span className="logo">📖</span>
        <span>Book항이</span>
        <span className="ver">v2.0</span>
      </button>
      {hasDoc && (
        <div className="filename" id="filename" title={fileName || undefined}>{fileName}</div>
      )}
      <nav className="header-actions">
        <button className={`top-link${hasDoc ? '' : ' active'}`} onClick={onHome}>홈</button>
        <button className="top-link" onClick={() => onInfo('help')}>도움말</button>
        <button className="top-link" onClick={() => onInfo('features')}>기능/설명</button>
        <button className="top-link" onClick={() => onInfo('credits')}>출처</button>
        {hasDoc && <button id="openBtn" className="primary" onClick={onOpen}>＋ 파일 열기</button>}
        <button
          id="themeBtn"
          title={dark ? '라이트 모드 전환' : '다크 모드 전환'}
          aria-label={dark ? '라이트 모드 전환' : '다크 모드 전환'}
          onClick={onToggleTheme}
        >
          {dark ? '☀' : '☾'}
        </button>
      </nav>
    </header>
  );
}
