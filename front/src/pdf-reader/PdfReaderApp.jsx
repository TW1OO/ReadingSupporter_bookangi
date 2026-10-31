import './styles.css';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { initialState, reduce } from '@/modules/state/machine';
import { startHandInput } from '@/modules/hand';
import { CalibrationOverlay, toInputEvent, useGaze } from '@/modules/gaze';
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
import { useFileDrop } from './hooks/useFileDrop.js';

export default function PdfReaderApp() {
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
  const [input, dispatch] = useReducer(reduce, initialState); // 손·시선·마우스는 모두 InputEvent 로만 여기에 들어옵니다
  const [picked, setPicked] = useState(null); // { id, word, rect } : wordId 가 가리키는 단어의 내용
  const [notice, setNotice] = useState('');
  const [info, setInfo] = useState(null); // 'help' | 'features' | 'credits' | null
  const [handEnabled, setHandEnabled] = useState(false);
  const [handStatus, setHandStatus] = useState('손 인식 대기 중');
  const handPointerRef = useRef(null); // 포인터는 프레임마다 바뀌므로 state 대신 DOM 직접 갱신(전체 리렌더·텍스트 레이어 재그리기 방지)

  const fileInputRef = useRef(null);
  const stageRef = useRef(null);
  const viewerRef = useRef(null);
  const videoRef = useRef(null);
  const pageTextsRef = useRef([]);

  const totalPages = pdfDoc?.numPages ?? 0;

  // ---------- 검색 ----------
  const search = usePdfSearch({ pdfDoc, pageTextsRef, onStatus: setStatus });
  const selection = picked && picked.id === input.wordId ? picked : null;
  const closePopup = useCallback(() => dispatch({ type: 'CANCEL' }), []);
  const chooseTab = useCallback((choice) => dispatch({ type: 'MENU_SELECTED', choice }), []);
  useEffect(() => {
    if (search.current) setPage(search.current.page);
  }, [search.current]);

  // 마우스 드래그로 고른 단어도 손과 같은 경로(WORD_POINTED)로 보냅니다.
  const selectionSeq = useRef(0);
  const selectByMouse = useCallback(({ word, rect }) => {
    const id = `sel:${++selectionSeq.current}`;
    setPicked({ id, word, rect });
    dispatch({ type: 'WORD_POINTED', wordId: id, source: 'mouse' });
  }, []);

  // ---------- 시선 (modules/gaze) ----------
  // 읽는 중 클릭은 도구 막대 클릭도 많아 학습에 쓰지 않습니다.
  const gaze = useGaze({ implicitClickTraining: false });
  const [calibrating, setCalibrating] = useState(false);
  const gazeOn = gaze.status === 'ready' || gaze.status === 'paused';
  useEffect(() => gaze.controller.on((e) => {
    const ev = toInputEvent(e);
    if (ev) dispatch(ev);
  }), [gaze.controller]);
  useEffect(() => {
    if (!gazeOn) dispatch({ type: 'GAZE_PARAGRAPH', paragraphId: null });
  }, [gazeOn]);
  const startCalibration = async () => {
    try {
      await gaze.start();
      setCalibrating(true);
    } catch {
      setStatus('시선 인식을 시작하지 못했습니다. 손 인식과 마우스는 그대로 쓸 수 있습니다.');
    }
  };
  const stopGaze = () => {
    setCalibrating(false);
    gaze.stop();
  };

  // ---------- 손 (modules/hand) ----------
  const phaseRef = useRef(input.phase);
  phaseRef.current = input.phase;
  useEffect(() => {
    if (!handEnabled || !videoRef.current) return undefined;
    const pointer = handPointerRef.current;
    const stop = startHandInput(
      (ev) => {
        if (ev.type === 'WORD_POINTED') {
          const info = viewerRef.current?.wordInfo(ev.wordId);
          if (!info) return;
          setPicked({ id: ev.wordId, ...info });
        }
        dispatch(ev);
      },
      {
        video: videoRef.current,
        getPhase: () => phaseRef.current,
        getWordRects: () => viewerRef.current?.getWordRects() ?? [],
        onPointer: (p) => {
          // 포인터는 프레임마다 바뀌므로 DOM 을 직접 갱신합니다.
          if (!pointer) return;
          pointer.style.display = p ? 'block' : 'none';
          if (p) {
            pointer.style.left = `${p.x}px`;
            pointer.style.top = `${p.y}px`;
            pointer.style.boxShadow = `0 0 0 ${6 + Math.round(p.progress * 10)}px #f9731622`;
          }
        },
        onGuide: (g) => setHandStatus(g.msg || '손 인식 중 · 검지로 단어를 가리키세요'),
        onError: (e) => {
          setHandStatus(`손 인식 시작 실패: ${e.message}`);
          setHandEnabled(false);
        },
      },
    );
    setHandStatus('손 인식 중 · 검지로 단어를 가리키세요');
    return stop;
  }, [handEnabled]);

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
    stopGaze();
    setHandEnabled(false);
    search.close();
    dispatch({ type: 'CANCEL' });
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
  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    return () => document.body.classList.remove('dark'); // 다른 화면(?gaze 등)으로 전환돼도 body 에 남지 않게
  }, [dark]);

  // 페이지/배율/회전이 바뀌면 단어 팝업 닫기
  useEffect(() => dispatch({ type: 'CANCEL' }), [page, scale, rotation, pdfDoc]);

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
                hand={{
                  enabled: handEnabled,
                  label: handEnabled ? handStatus : '손 인식 꺼짐',
                  videoRef,
                  onToggle: () => setHandEnabled((v) => !v),
                }}
                gaze={{
                  on: gazeOn,
                  status: gaze.status,
                  label: gaze.error ? `시선 오류: ${gaze.error}` : gazeOn ? '시선 보조 켜짐 · 줄 강조' : '시선 보조 꺼짐',
                  onCalibrate: startCalibration,
                  onStop: stopGaze,
                }}
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
                  gazeRegionId={input.gazeParagraphId}
                  onOpen={chooseFile}
                  onPageText={(n, text) => { pageTextsRef.current[n - 1] = text; }}
                  onRendered={(n) => setStatus(`페이지 ${n} / ${totalPages} · 텍스트를 드래그해 단어를 선택하세요`)}
                  onSelectText={selectByMouse}
                />
              </main>
            </div>
            <StatusBar status={status} />
          </>
        ) : (
          <Landing dragging={dragging} notice={notice} onChooseFile={chooseFile} onOpenUrl={openUrl} onInfo={setInfo} />
        )}
      </div>

      <WordPopup selection={selection} stageRef={stageRef} onClose={closePopup} choice={input.choice} onChoice={chooseTab} />
      <div ref={handPointerRef} className="hand-pointer" style={{ display: 'none' }} aria-hidden="true" />
      <input
        ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadFile(file);
          e.target.value = '';
        }}
      />
      {calibrating && (
        <CalibrationOverlay
          controller={gaze.controller}
          onCancel={stopGaze}
          onDone={() => setCalibrating(false)}
        />
      )}
      <InfoModal section={info} onClose={() => setInfo(null)} />
      <DropOverlay visible={dragging} />
    </>
  );
}
