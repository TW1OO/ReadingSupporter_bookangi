import { useEffect, useRef, useState } from 'react';
import Thumbnail from './Thumbnail.jsx';
import {
  AlertCircle, BookOpen, Camera, Check, ChevronLeft, ChevronRight, Close, FitPage, FolderPlus, Fullscreen, Eye, Hand, Minus, Moon, More, Plus, Rotate, Search, Sun,
} from './icons.jsx';
import { clamp } from '../lib/pdf.js';

// 위에서 내려오는 머리글과 ⋮ 메뉴
export function ReaderHeader({ open, title, dark, onHide, onOpenFile, onToggleTheme, menu, menuOpen, onMenuToggle }) {
  return (
    <header className={`rd-header${open ? ' open' : ''}`} onPointerLeave={(e) => { if (e.pointerType === 'mouse') onHide(); }}>
      <button className="rd-brand" onClick={menu.onHome} title="홈으로">
        <span className="rd-logo"><BookOpen /></span>
        <b>Book항이</b>
        <span className="rd-doc-title">/ {title}</span>
      </button>
      <div className="rd-header-actions">
        <button className="rd-ghost" onClick={onOpenFile} aria-label="파일 열기"><FolderPlus /> 파일 열기</button>
        <button className="rd-icon" onClick={onToggleTheme} aria-label={dark ? '밝은 화면' : '어두운 화면'}>{dark ? <Sun /> : <Moon />}</button>
        <button className={`rd-icon boxed${menuOpen ? ' on' : ''}`} onClick={onMenuToggle} aria-label="메뉴" aria-expanded={menuOpen}><More /></button>
      </div>
      {menuOpen && (
        <div className="rd-menu" role="menu">
          <button role="menuitem" onClick={menu.onHome}>홈</button>
          <button role="menuitem" onClick={() => menu.onInfo('help')}>도움말</button>
          <button role="menuitem" onClick={() => menu.onInfo('features')}>기능 설명</button>
          <button role="menuitem" onClick={() => menu.onInfo('credits')}>출처</button>
          {menu.onDownload && <button role="menuitem" onClick={menu.onDownload}>다운로드</button>}
          {menu.onPrint && <button role="menuitem" onClick={menu.onPrint}>인쇄</button>}
          <div className="rd-menu-info">
            <small>문서 정보</small>
            <span>{menu.info}</span>
          </div>
        </div>
      )}
    </header>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="rd-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

// 왼쪽 읽기 도구 패널. PDF 는 쪽 미리보기도 함께 보여 준다.
export function ReaderPanel({ open, onClose, onHome, hand, gaze, mouse, canPeek, onPeek, page, total, pdfDoc, onPageSelect, status, handDebugRef }) {
  return (
    <aside className={`rd-panel${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="rd-panel-head">
        <b>읽기 도구</b>
        <button className="rd-icon rd-panel-close" onClick={onClose} aria-label="읽기 도구 닫기"><ChevronLeft /></button>
        {/* 휴대폰에서는 왼쪽 위 단추가 접기를 맡고, 이 자리는 홈으로 쓴다 (styles.css) */}
        <button className="rd-panel-home" onClick={onHome}>홈</button>
      </div>
      <div className="rd-panel-card">
        <div className="rd-camera-note">
          <Camera />
          <p>카메라 영상은 보정할 때만 보여요. 읽는 동안에는 오른쪽 위 작은 표시로 상태를 알려 드려요.</p>
        </div>
        <button className="rd-link" onClick={onPeek} disabled={!canPeek} title={canPeek ? undefined : '손 인식이나 시선 보정을 켜면 볼 수 있어요'}>카메라 화면 잠깐 보기</button>
        <div className="rd-panel-actions">
          <button className={hand.enabled ? 'rd-btn outline on' : 'rd-btn outline'} onClick={hand.onToggle}>
            {hand.enabled ? '손 인식 중지' : '손 인식 시작'}
          </button>
          <button className="rd-btn outline" onClick={gaze.on ? gaze.onStop : gaze.onCalibrate} disabled={gaze.status === 'loading'}>
            {gaze.on ? '시선 중지' : '시선 보정'}
          </button>
        </div>
      </div>
      <ul className="rd-states">
        <li><i className={`rd-dot${hand.enabled ? ' ok' : ''}`} />{hand.label}</li>
        <li><i className={`rd-dot${gaze.on ? (gaze.warn ? ' warn' : ' ok') : ''}`} />{gaze.label}</li>
        {hand.enabled && <li className="rd-hand-debug" ref={handDebugRef} />}
      </ul>
      <div className="rd-divider" />
      <Toggle label="시선 1초 멈춤으로 문장 지정" checked={gaze.dwellEnabled} onChange={gaze.onDwellChange} />
      <Toggle label="마우스로 단어 클릭·드래그" checked={mouse.enabled} onChange={mouse.onChange} />
      {pdfDoc && (
        <div className="rd-thumbs">
          {Array.from({ length: total }, (_, i) => (
            <Thumbnail key={i + 1} pdfDoc={pdfDoc} pageNumber={i + 1} total={total} active={i + 1 === page} onSelect={() => onPageSelect(i + 1)} />
          ))}
        </div>
      )}
      <div className="rd-panel-foot">
        <span title={status}>페이지</span>
        <span>{page} / {total}</span>
      </div>
    </aside>
  );
}

// 오른쪽 위 작은 상태 표시. 시선·손이 정상인지 눈과 손 모양으로 알려 준다.
export function StatusPill({ gazeState, handState, chip, warn, onClick }) {
  return (
    <div className="rd-status">
      {chip && <span className="rd-chip" role="status"><Check size={14} /> {chip}</span>}
      <button className={`rd-pill${warn ? ' warn' : ''}`} onClick={onClick} aria-label={`읽기 도구 열기. 시선 ${gazeState}, 손 ${handState}`}>
        <Eye size={16} /><i className={`rd-dot ${gazeState}`} />
        <Hand size={16} /><i className={`rd-dot ${handState}`} />
      </button>
    </div>
  );
}

export function FaceToast() {
  return (
    <div className="rd-toast" role="alert">
      <AlertCircle />
      <div>
        <b>얼굴이 카메라 범위를 벗어났어요</b>
        <p>화면 쪽으로 조금 돌아와 주세요. 그동안 읽는 문장 표시는 잠시 멈춰요.</p>
      </div>
    </div>
  );
}

// 얼굴이 벗어났을 때 어디로 돌아와야 하는지 보여 준다
export function FaceGuideCard({ onClose }) {
  return (
    <div className="rd-camera-card">
      <div className="rd-camera-view">
        <svg viewBox="0 0 240 136" aria-hidden="true">
          <circle cx="20" cy="62" r="22" fill="#4b5563" />
          <path d="M-14 136c0-30 16-46 34-46s34 16 34 46z" fill="#4b5563" />
          <path d="M60 60h26M78 52l8 8-8 8" fill="none" stroke="#f0b458" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="120" cy="60" rx="30" ry="38" fill="none" stroke="#f0b458" strokeWidth="2" strokeDasharray="5 5" />
        </svg>
        <button className="rd-camera-close" onClick={onClose} aria-label="닫기"><Close size={14} /></button>
      </div>
      <p>가운데 점선 원에 얼굴을 맞추면 이 창은 저절로 닫혀요.</p>
    </div>
  );
}

// 카메라 화면 잠깐 보기
export function CameraPeek({ getStream, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = getStream() ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="rd-camera-card">
      <div className="rd-camera-view">
        <video ref={ref} autoPlay muted playsInline />
        <button className="rd-camera-close" onClick={onClose} aria-label="닫기"><Close size={14} /></button>
      </div>
      <p>카메라 영상은 이 기기 안에서만 처리돼요.</p>
    </div>
  );
}

// 단어 조정 단추. 키보드가 없는 터치 기기에서만 보인다 (styles.css). 제스처와 같은 이벤트를 보낸다.
export function TouchAdjustBar({ level, onMove, onBack, onConfirm, onCancel }) {
  const unit = level === 'sentence' ? '문장' : '단어';
  // 휴대폰에서는 한 줄에 들어가도록 뒷말을 숨긴다 (styles.css)
  return (
    <div className="rd-adjust" role="toolbar" aria-label={`${unit} 조정`}>
      <button onClick={() => onMove(-1)} aria-label={`이전 ${unit}`}><ChevronLeft /> <span>이전<i> {unit}</i></span></button>
      <button onClick={() => onMove(1)} aria-label={`다음 ${unit}`}><span>다음<i> {unit}</i></span> <ChevronRight /></button>
      {level !== 'sentence' && <button onClick={onBack} aria-label="문장 바꾸기"><span>문장<i> 바꾸기</i></span></button>}
      <button className="primary" onClick={onConfirm}><Check size={18} /> 확정</button>
      <button onClick={onCancel}><Close size={18} /> 취소</button>
    </div>
  );
}

// 아래쪽 떠 있는 쪽 이동 막대. PDF 에서는 확대·회전도 쓴다.
export function ReaderPager({ page, totalPages, pdf, onPageChange, onToggleSearch, onFullscreen }) {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);
  // 휴대폰에서는 쪽 이동만 두고 나머지는 더보기로 접는다 (styles.css)
  const [moreOpen, setMoreOpen] = useState(false);
  const navRef = useRef(null);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDown = (e) => { if (!navRef.current?.contains(e.target)) setMoreOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [moreOpen]);
  const commit = () => {
    const v = Number.parseInt(draft, 10);
    if (!Number.isFinite(v)) return setDraft(String(page));
    const next = clamp(v, 1, totalPages);
    setDraft(String(next));
    onPageChange(next);
  };
  return (
    <nav className="rd-pager" aria-label="쪽 이동" ref={navRef}>
      <button className="rd-icon" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="이전 쪽"><ChevronLeft /></button>
      <span className="rd-page-no">
        <input
          id="pageNumber" aria-label="쪽 번호" inputMode="numeric" value={draft}
          style={{ width: `${Math.max(1, draft.length) + 0.6}ch` }}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        <span id="totalPages">/ {totalPages}</span>
      </span>
      <button className="rd-icon" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="다음 쪽"><ChevronRight /></button>
      <button className="rd-icon rd-more-btn" onClick={() => setMoreOpen((v) => !v)} aria-label="더보기" aria-expanded={moreOpen}><More /></button>
      <div className={`rd-pager-extra${moreOpen ? ' open' : ''}`}>
        <span className="rd-sep" />
        {pdf && (
          <>
            <button className="rd-icon" onClick={pdf.onZoomOut} aria-label="축소"><Minus /></button>
            <span className="rd-zoom">{Math.round(pdf.scale * 100)}%</span>
            <button className="rd-icon" onClick={pdf.onZoomIn} aria-label="확대"><Plus /></button>
            <button className="rd-icon" onClick={pdf.onFit} aria-label="쪽 맞춤" title="쪽 맞춤"><FitPage /></button>
            <button className="rd-icon" onClick={pdf.onRotate} aria-label="회전" title="회전"><Rotate /></button>
            <span className="rd-sep" />
          </>
        )}
        <button className="rd-icon" onClick={() => { setMoreOpen(false); onToggleSearch(); }} aria-label="검색"><Search /></button>
        <button className="rd-icon" onClick={() => { setMoreOpen(false); onFullscreen(); }} aria-label="전체 화면"><Fullscreen /></button>
      </div>
    </nav>
  );
}
