import Thumbnail from './Thumbnail.jsx';

export default function Sidebar({ pdfDoc, page, onPageSelect, hand, gaze, collapsed, onToggleCollapse }) {
  const total = pdfDoc?.numPages ?? 0;
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <button
        className="side-toggle"
        onClick={onToggleCollapse}
        title={collapsed ? '페이지 패널 열기' : '페이지 패널 닫기'}
        aria-label={collapsed ? '페이지 패널 열기' : '페이지 패널 닫기'}
        aria-expanded={!collapsed}
      >
        {collapsed ? '»' : '«'}
      </button>

      {/* 접어도 언마운트하지 않아야 카메라 <video> 참조가 유지됩니다 */}
      <div className="sidebar-body" aria-hidden={collapsed}>
        <div className="gaze-card">
          <div className={`gaze-preview${hand.enabled ? ' camera-on' : ''}`}>
            손 인식 카메라 미리보기
            <video ref={hand.videoRef} autoPlay muted playsInline />
          </div>
          <div className="gaze-controls">
            <button className="primary" onClick={hand.onToggle}>
              {hand.enabled ? '손 인식 중지' : '손 인식 시작'}
            </button>
            <button onClick={gaze.on ? gaze.onStop : gaze.onCalibrate} disabled={gaze.status === 'loading'}>
              {gaze.on ? '시선 중지' : '시선 보정'}
            </button>
          </div>
        </div>

        <div className="side-state">
          <i className={`dot${hand.enabled ? '' : ' gray'}`} />
          <span>{hand.label}</span>
        </div>
        <div className="side-state">
          <i className={`dot${gaze.on ? '' : ' gray'}`} />
          <span>{gaze.label}</span>
        </div>
        <div className="side-state">
          <i className="dot gray" />
          <span>마우스: 텍스트 드래그</span>
        </div>

        <div className="side-heading">
          <span>페이지</span>
          <span>{pdfDoc ? `${page}/${total}` : '0/0'}</span>
        </div>
        <div id="thumbnails">
          {pdfDoc &&
            Array.from({ length: total }, (_, i) => (
              <Thumbnail
                key={i + 1}
                pdfDoc={pdfDoc}
                pageNumber={i + 1}
                total={total}
                active={i + 1 === page}
                onSelect={() => onPageSelect(i + 1)}
              />
            ))}
        </div>
      </div>
    </aside>
  );
}
