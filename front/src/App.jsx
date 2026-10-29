import { useCallback, useEffect, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Toolbar from './components/Toolbar.jsx';
import SearchBar from './components/SearchBar.jsx';
import PdfViewer from './components/PdfViewer.jsx';
import WordPopup from './components/WordPopup.jsx';
import StatusBar from './components/StatusBar.jsx';
import DropOverlay from './components/DropOverlay.jsx';
import Landing from './components/Landing.jsx';
import InfoModal from './components/InfoModal.jsx';
import { SCALE, clamp, isPdfFile, openPdf, fetchRemoteFile } from './lib/pdf.js';
import { usePdfSearch } from './hooks/usePdfSearch.js';
import { useGazeTracker } from './hooks/useGazeTracker.js';
import { useHandGestures } from './hooks/useHandGestures.js';
import { useFileDrop } from './hooks/useFileDrop.js';

export default function App() {
  // ---------- 문서 / 뷰 상태 ----------
  const [pdfDoc, setPdfDoc] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [status, setStatus] = useState('준비됨 · 프론트엔드 데모');
  const [selection, setSelection] = useState(null); // { word, rect }
  const [notice, setNotice] = useState('');
  const [info, setInfo] = useState(null); // 'help' | 'features' | 'credits' | null
  const [handEnabled, setHandEnabled] = useState(false);
  const [handStatus, setHandStatus] = useState('손 인식 대기 중');
  const [handGestureChoice, setHandGestureChoice] = useState(null);
  const [handPointer, setHandPointer] = useState(null);

  // ---------- 시선 추적 상태 ----------
  const [gazeEnabled, setGazeEnabled] = useState(false);
  const [gazeLabel, setGazeLabel] = useState('데모 모드');

  const fileInputRef = useRef(null);
  const stageRef = useRef(null);
  const viewerRef = useRef(null);
  const videoRef = useRef(null);
  const handVideoRef = videoRef; // 시선 추적과 손동작이 같은 카메라/비디오를 공유
  const pageTextsRef = useRef([]);

  const totalPages = pdfDoc?.numPages ?? 0;

  // ---------- 검색 ----------
  const search = usePdfSearch({ pdfDoc, pageTextsRef, onStatus: setStatus });
  // 설명창 닫기 콜백은 손동작 처리기에서 사용하므로 먼저 선언합니다.
  const closePopup = useCallback(() => setSelection(null), []);
  useEffect(() => {
    if (search.current) setPage(search.current.page);
  }, [search.current]);

  // ---------- 시선 ----------
  const handleGazeStatus = useCallback((label, message) => {
    setGazeLabel(label);
    setStatus(message);
  }, []);
  const { cameraOn } = useGazeTracker({
    enabled: gazeEnabled,
    videoRef,
    onPoint: (p) => viewerRef.current?.updateGaze(p),
    onStatus: handleGazeStatus,
    // 시선 모델 오류가 나도 손 인식까지 강제로 끄지 않습니다.
    onError: () => { setGazeEnabled(false); },
  });

  const selectWordAtPoint = useCallback((point) => {
    if (!point || !pdfDoc) return;
    const layer = document.getElementById('textLayer');
    if (!layer) return;
    const spans = Array.from(layer.querySelectorAll('span'));
    let nearest = null;
    let best = Infinity;
    for (const el of spans) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
      const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
      const distance = Math.hypot(dx, dy);
      if (distance < best) { best = distance; nearest = { el, rect }; }
    }
    if (!nearest || best > 75) return;
    const raw = nearest.el.textContent || '';
    const words = raw.match(/[\p{L}\p{N}_'-]+/gu) || [];
    if (!words.length) return;
    const rect = nearest.rect;
    const ratio = Math.max(0, Math.min(0.999, (point.x - rect.left) / Math.max(1, rect.width)));
    const index = Math.min(words.length - 1, Math.floor(ratio * words.length));
    const word = words[index].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!word) return;
    setSelection({ word, rect: { left: point.x, top: point.y, bottom: point.y + 4 } });
    setHandStatus(`선택한 단어: ${word}`);
  }, [pdfDoc]);

  const handleHandGesture = useCallback((count, point) => {
    // 주먹(손가락 0개)을 유지하면 검색창을 확실히 닫고 입력값도 비웁니다.
    if (count === 0) {
      // 주먹은 손가락 0개로 처리하고, 키보드 0과 동일하게 단어 설명창도 닫습니다.
      closePopup();
      search.setOpen(false);
      search.setQuery('');
      setHandStatus('주먹 인식: 0개 · 설명창/검색창 닫기');
      return;
    }
    if (count === 1) {
      if (!selection) { selectWordAtPoint(point); setHandStatus('1개: 단어 선택 / 뜻 보기'); }
      else { setHandGestureChoice((v) => v === 1 ? 11 : 1); setHandStatus('1개: 단어 뜻 보기'); }
    } else if (count === 2) {
      if (selection) { setHandGestureChoice((v) => v === 2 ? 22 : 2); setHandStatus('2개: 단어 해설 보기'); }
      else setHandStatus('단어를 먼저 선택해 주세요.');
    } else if (count === 3) {
      if (selection) { setHandGestureChoice((v) => v === 3 ? 33 : 3); setHandStatus('3개: 예문 보기'); }
      else setHandStatus('단어를 먼저 선택해 주세요.');
    }
  }, [selection, selectWordAtPoint, closePopup, search.setOpen, search.setQuery]);

  const hand = useHandGestures({
    enabled: handEnabled, videoRef: handVideoRef, onGesture: handleHandGesture,
    onPoint: setHandPointer, onStatus: (message) => { setHandStatus(message); setStatus(message); },
  });

  // ---------- 파일 ----------
  const loadFile = useCallback(async (file) => {
    if (!isPdfFile(file)) {
      const msg = 'PDF 파일을 선택해 주세요.';
      setNotice(msg); setStatus(msg);
      return msg;
    }
    try {
      setStatus('PDF 불러오는 중…');
      const pdf = await openPdf(file);
      pageTextsRef.current = new Array(pdf.numPages);
      search.reset();
      setPdfDoc(pdf);
      setFileName(file.name);
      setFileUrl(URL.createObjectURL(file));
      setPage(1);
      setScale(1);
      setRotation(0);
      setNotice('');
      return null;
    } catch (err) {
      console.error(err);
      const msg = 'PDF를 열 수 없습니다. 파일이 손상되었거나 암호화되었을 수 있습니다.';
      setNotice(msg); setStatus(msg);
      return msg;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openUrl = useCallback(async (url) => {
    setStatus('주소에서 불러오는 중…');
    const file = await fetchRemoteFile(url);
    const err = await loadFile(file);
    if (err) { setNotice(''); throw new Error(err); }
  }, [loadFile]);

  const goHome = useCallback(() => {
    setGazeEnabled(false);
    setHandEnabled(false);
    search.close();
    setSelection(null);
    setPdfDoc(null);
    setFileName('');
    setFileUrl(null);
    setStatus('준비됨 · 프론트엔드 데모');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseFile = () => fileInputRef.current?.click();
  const dragging = useFileDrop(loadFile);

  // 이전 문서/URL 정리
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  useEffect(() => () => { try { pdfDoc?.destroy(); } catch { /* noop */ } }, [pdfDoc]);

  // 테마
  useEffect(() => { document.body.classList.toggle('dark', dark); }, [dark]);

  // 페이지/배율/회전이 바뀌면 단어 팝업 닫기
  useEffect(() => setSelection(null), [page, scale, rotation, pdfDoc]);

  // ---------- 동작 ----------
  const goToPage = useCallback(
    (n) => { if (pdfDoc) setPage(clamp(n, 1, pdfDoc.numPages)); },
    [pdfDoc]
  );
  const zoom = (delta) => setScale((s) => clamp(s + delta, SCALE.min, SCALE.max));
  const fitWidth = async () => {
    if (!pdfDoc || !stageRef.current) return;
    const p = await pdfDoc.getPage(page);
    const vp = p.getViewport({ scale: 1, rotation });
    setScale(clamp((stageRef.current.clientWidth - 52) / vp.width, SCALE.min, SCALE.fitMax));
  };
  const fitHeight = async () => {
    if (!pdfDoc || !stageRef.current) return;
    const p = await pdfDoc.getPage(page);
    const vp = p.getViewport({ scale: 1, rotation });
    // 페이지 아래 그림자(12px) 등을 고려해 약간의 여유를 둡니다.
    setScale(clamp((stageRef.current.clientHeight - 24) / vp.height, SCALE.min, SCALE.fitMax));
  };
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setStatus('전체 화면을 사용할 수 없습니다.');
    }
  };
  const download = () => {
    if (!fileUrl) return;
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const print = () => {
    if (!fileUrl) return;
    const win = window.open(fileUrl, '_blank');
    setStatus(win ? '열린 PDF 창에서 인쇄를 실행하세요.' : '팝업이 차단되었습니다. 다운로드 후 PDF를 인쇄해 주세요.');
  };

  // 카메라를 켜면 손 인식과 눈(시선) 인식을 항상 동시에 실행합니다.
  // 두 UI 버튼 모두 같은 추적 상태를 제어합니다.
  const trackingEnabled = handEnabled || gazeEnabled;
  const toggleTracking = () => {
    const next = !trackingEnabled;
    setGazeEnabled(next);
    setHandEnabled(next);
  };

  // ---------- 단축키 ----------
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches?.('input')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === '0') { closePopup(); search.setOpen(false); search.setQuery(''); }
      if (pdfDoc && e.key === 'ArrowLeft') goToPage(page - 1);
      if (pdfDoc && e.key === 'ArrowRight') goToPage(page + 1);
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); chooseFile(); }
      if (mod && e.key.toLowerCase() === 'f' && pdfDoc) { e.preventDefault(); search.setOpen(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [page, pdfDoc, goToPage, closePopup, search.setOpen, search.setQuery]);

  return (
    <>
      <div className="app">
        <Header
          hasDoc={!!pdfDoc}
          fileName={fileName}
          dark={dark}
          onHome={goHome}
          onOpen={chooseFile}
          onInfo={setInfo}
          onToggleTheme={() => setDark((v) => !v)}
        />

        {pdfDoc ? (
          <>
            <div className="workspace">
              <Sidebar
                pdfDoc={pdfDoc}
                page={page}
                onPageSelect={setPage}
                collapsed={!sidebarOpen}
                onToggleCollapse={() => setSidebarOpen((v) => !v)}
                gaze={{ enabled: trackingEnabled, label: gazeLabel, cameraOn, videoRef, onToggle: toggleTracking }}
              />

              <main className="viewer">
                <Toolbar
                  hasDoc
                  page={page}
                  totalPages={totalPages}
                  scale={scale}
                  onPageChange={goToPage}
                  onZoomIn={() => zoom(SCALE.step)}
                  onZoomOut={() => zoom(-SCALE.step)}
                  onFit={fitWidth}
                  onFitHeight={fitHeight}
                  onRotate={() => setRotation((r) => (r + 90) % 360)}
                  onToggleSearch={search.toggle}
                  onFullscreen={toggleFullscreen}
                  onPrint={print}
                  onDownload={download}
                />
                <SearchBar search={search} />
                <PdfViewer
                  ref={viewerRef}
                  stageRef={stageRef}
                  pdfDoc={pdfDoc}
                  pageNumber={page}
                  scale={scale}
                  rotation={rotation}
                  highlightTerm={search.term}
                  onOpen={chooseFile}
                  onPageText={(n, text) => { pageTextsRef.current[n - 1] = text; }}
                  onRendered={(n) => setStatus(`페이지 ${n} / ${totalPages} · 텍스트를 드래그해 단어를 선택하세요`)}
                  onSelectText={setSelection}
                />
              </main>
            </div>
            <StatusBar status={status} />
          </>
        ) : (
          <Landing dragging={dragging} notice={notice} onChooseFile={chooseFile} onOpenUrl={openUrl} />
        )}
      </div>

      <WordPopup selection={selection} stageRef={stageRef} onClose={closePopup} gestureChoice={handGestureChoice} />
      {handPointer && handEnabled && <div className="hand-pointer" style={{ left: handPointer.x, top: handPointer.y }} aria-hidden="true" />}
      <input
        ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadFile(file);
          e.target.value = '';
        }}
      />
      <InfoModal section={info} onClose={() => setInfo(null)} />
      <DropOverlay visible={dragging} />
    </>
  );
}
