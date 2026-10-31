import Thumbnail from './Thumbnail.jsx';

export default function Sidebar({ pdfDoc, page, onPageSelect, gaze, collapsed, onToggleCollapse }) {
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
          <div className={`gaze-preview${(gaze.cameraOn || gaze.enabled) ? ' camera-on' : ''}`}>
            공유 카메라 미리보기 · 손/눈 동시 인식
            <video ref={gaze.videoRef} autoPlay muted playsInline />
          </div>
          <div className="gaze-controls">
            <button className="primary" onClick={gaze.onToggle}>
              {gaze.enabled ? '카메라 및 인식 중지' : '카메라 및 손·눈 인식 시작'}
            </button>
            <span className="gaze-status">{gaze.label}</span>
          </div>
        </div>

        <div className="side-state">
          <i className={`dot${gaze.enabled ? '' : ' gray'}`} />
          <span>{gaze.enabled ? '손 인식 + 눈 인식 활성화' : '손·눈 인식 대기 중'}</span>
        </div>
        <div className="side-state">
          <i className="dot gray" />
          <span>선택 동작: 텍스트 드래그</span>
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
