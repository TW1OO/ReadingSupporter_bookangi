import { useState } from 'react';

const DEMO_ARTICLE_URL = 'https://www.busan.com/view/busan/view.php?code=2026110112320909454';

export default function Landing({ dragging, notice, onChooseFile, onOpenUrl, onInfo }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    open(url.trim());
  };

  const open = async (value) => {
    if (!value || loading) return;
    setLoading(true);
    setError('');
    try {
      await onOpenUrl(value);
    } catch (err) {
      setError(err?.message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home">
      <div className="home-inner">
        <div className="home-hero">
          <span className="engine-badge"><i />시선·제스처 독서 보조 Engine</span>
          <h1>읽을 책을 쉽게 열어보세요</h1>
          <p>PDF 파일을 올리거나 웹 글·PDF 주소를 입력하면 바로 독서를 시작할 수 있습니다.</p>
        </div>

        <section className="home-card">
          <div className={`dropzone${dragging ? ' over' : ''}`}>
            <span className="dz-icon" aria-hidden="true">⇪</span>
            <strong>파일을 여기에 끌어다 놓으세요</strong>
            <span className="dz-sub">PDF 파일 형식을 지원합니다</span>
            <button className="primary" onClick={onChooseFile}>＋ 파일 선택하기</button>
          </div>
          {notice && <p className="home-error" role="alert">{notice}</p>}

          <div className="or"><span>또는</span></div>

          <form onSubmit={submit}>
            <label className="field-label" htmlFor="urlInput">링크로 열기</label>
            <div className="url-row">
              <input
                id="urlInput" type="url" inputMode="url" autoComplete="off"
                placeholder="https://… 뉴스, 위키독스, 나무위키 등 글 주소나 PDF 링크"
                value={url} onChange={(e) => setUrl(e.target.value)}
              />
              <button type="submit" className="dark" disabled={loading || !url.trim()}>
                {loading ? '불러오는 중…' : '불러오기'}
              </button>
            </div>
            <p className="hint">웹 글은 본문 글자만 가져와 책처럼 펼쳐 보여 주며, 그림은 표시하지 않습니다. 로그인이 필요하거나 외부 접근을 막은 사이트는 열리지 않을 수 있습니다. 저작권이 있는 글은 개인 열람 용도로만 사용해 주세요.</p>
            {error && <p className="home-error" role="alert">{error}</p>}
          </form>

          <div className="sample-row">
            <span>시연 자료: 부산일보 기사 (원문에서 글자만 불러옵니다)</span>
            <button type="button" disabled={loading} onClick={() => open(DEMO_ARTICLE_URL)}>시연 자료 열기</button>
          </div>
        </section>

        <section className="notice-card">
          <h2>⚠ 이용 시 주의사항 및 안내</h2>
          <div className="notice-grid">
            <div>
              <h3>보안 및 프라이버시</h3>
              <p>웹캠 영상과 문서는 이 기기 안에서 처리됩니다. 링크를 열 때는 해당 사이트에서 글을 받아 옵니다. 뜻과 해설을 찾기 위해 선택한 단어와 그 단어가 있는 문장만 서버로 전송되며, 영어·외래어 단어는 번역을 위해 DeepL로도 전달됩니다.</p>
            </div>
            <div>
              <h3>저작권 규정</h3>
              <p>저작권이 적용된 전자책 파일은 타인에게 공유하지 마시고 개인 소장 용도로만 사용해주세요.</p>
            </div>
            <div>
              <h3>권장 브라우저</h3>
              <p>원활한 PDF 렌더링과 시선 추적을 위해 최신 Chrome, Edge, Safari 브라우저 사용을 권장합니다.</p>
            </div>
          </div>
        </section>
      </div>

      <footer className="home-footer">
        <span>© 2026 Book항이. All rights reserved.</span>
        <nav>
          <a href="#help" onClick={(e) => { e.preventDefault(); onInfo('help'); }}>도움말</a>
          <a href="#credits" onClick={(e) => { e.preventDefault(); onInfo('credits'); }}>출처</a>
        </nav>
      </footer>
    </div>
  );
}
