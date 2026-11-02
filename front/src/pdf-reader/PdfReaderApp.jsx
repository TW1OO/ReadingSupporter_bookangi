import './styles.css';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { initialState, reduce } from '@/modules/state/machine';
import { startHandInput } from '@/modules/hand';
import { CalibrationOverlay, GazeHeatLayer, READING_HEATMAP, toInputEvent, useGaze } from '@/modules/gaze';
import Header from './components/Header.jsx';
import { CameraPeek, FaceGuideCard, FaceToast, ReaderHeader, ReaderPager, ReaderPanel, StatusPill, TouchAdjustBar } from './components/ReaderChrome.jsx';
import { ChevronLeft, ChevronRight } from './components/icons.jsx';
import SearchBar from './components/SearchBar.jsx';
import PdfViewer from './components/PdfViewer.jsx';
import ArticleViewer from './components/ArticleViewer.jsx';
import WordPopup from './components/WordPopup.jsx';
import DropOverlay from './components/DropOverlay.jsx';
import Landing from './components/Landing.jsx';
import InfoModal from './components/InfoModal.jsx';
import { SCALE, clamp, isPdfFile, openPdf, fetchRemoteFile } from './lib/pdf.js';
import { fetchArticle, looksLikePdf } from './lib/webArticle.js';
import { averageX, gazeEdge } from './lib/gazeEdge.js';
import { isPhone } from './lib/device.js';
import { pageFitScale } from './lib/pageFit.js';
import { swipeDirection } from './lib/swipe.js';
import { usePdfSearch } from './hooks/usePdfSearch.js';
import { useArticleSearch } from './hooks/useArticleSearch.js';
import { useFileDrop } from './hooks/useFileDrop.js';

const HAND_READY = '손 인식 중 · 엄지를 들어 단어 지정';
const NO_TEXT = '이 쪽에는 고를 글자가 없습니다. 이미지·스캔으로 된 내용은 아직 고를 수 없어요.';
const FIT_SLACK_Y = 20; // 쪽 맞춤 때 세로 스크롤 막대가 생기지 않게 남기는 여유
const DWELL_KEY = 'bookangi.dwellLock';
const MOUSE_KEY = 'bookangi.mousePick';
const CHIP_MS = 1500;
const DWELL_MS = 1000; // 시선이 이만큼 머물면 문장 지정
const GAZE_WINDOW_MS = 500; // 엄지를 들 때 이 시간의 시선 평균을 쓴다
const RELOCK_MS = 2000; // 닫은 직후에는 시선 멈춤으로 다시 지정하지 않는다
const ADJUST_TIMEOUT_MS = 10000; // 조정 중 입력이 없으면 읽기로 돌아간다
const SHAPE_LABEL = { fist: '주먹', thumb: '엄지', confirm: '엄지+검지', one: '1', two: '2', three: '3', palm: '손 폄', ok: 'OK', none: '-' };

function loadOn(key) {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
}
function saveOn(key, on) {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    /* 저장 실패는 무시 */
  }
}
const GUIDE = {
  word: '엄지 기울이기: 앞뒤 단어 · 엄지+검지: 확정 · 손 펴기: 문장 바꾸기 · 주먹: 취소',
  sentence: '엄지 기울이기: 앞뒤 문장 · 엄지+검지: 문장 결정 · 주먹: 취소',
  result: '손을 펴고 좌우로 흔들면 닫습니다 · 주먹: 취소',
};

export default function PdfReaderApp() {
  // ---------- 문서 / 뷰 상태 ----------
  const [pdfDoc, setPdfDoc] = useState(null);
  const [article, setArticle] = useState(null); // 링크로 연 웹 글
  const [articlePages, setArticlePages] = useState(1);
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [dark, setDark] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [headerPinned, setHeaderPinned] = useState(false); // 탭으로 연 머리글. 호버가 없으니 바깥을 눌러 닫는다
  const [menuOpen, setMenuOpen] = useState(false);
  const [peek, setPeek] = useState(false); // 카메라 화면 잠깐 보기
  const [chip, setChip] = useState(''); // 제스처 결과를 잠깐 알려 준다
  const [handSeen, setHandSeen] = useState(false);
  const [faceCardClosed, setFaceCardClosed] = useState(false);
  const [mouseEnabled, setMouseEnabled] = useState(() => loadOn(MOUSE_KEY));
  const [status, setStatus] = useState('준비됨 · 프론트엔드 데모');
  const [input, dispatch] = useReducer(reduce, initialState); // 손·시선·마우스는 모두 InputEvent 로만 여기에 들어옵니다
  const [picked, setPicked] = useState(null); // { id, word, rect } : wordId 가 가리키는 단어의 내용
  const [notice, setNotice] = useState('');
  const [info, setInfo] = useState(null); // 'help' | 'features' | 'credits' | null
  const [handEnabled, setHandEnabled] = useState(false);
  const [handStatus, setHandStatus] = useState('손 인식 대기 중');

  const fileInputRef = useRef(null);
  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const viewerRef = useRef(null);
  const handDebugRef = useRef(null);
  const handCenterRef = useRef(null);
  const pageTextsRef = useRef([]);

  const hasDoc = !!pdfDoc || !!article;
  const totalPages = pdfDoc?.numPages ?? (article ? articlePages : 0);

  // ---------- 검색 ----------
  const pdfSearch = usePdfSearch({ pdfDoc, pageTextsRef, onStatus: setStatus });
  const articleSearch = useArticleSearch(article);
  const search = article ? articleSearch : pdfSearch;
  // 드래그로 고른 글은 picked 에, 제스처로 고른 단어는 뷰어에 내용이 있다.
  const selection = useMemo(() => {
    if (!input.wordId) return null;
    if (picked?.id === input.wordId) return picked;
    return viewerRef.current?.wordInfo(input.wordId) ?? null;
  }, [input.wordId, picked]);
  const closePopup = useCallback(() => dispatch({ type: 'CANCEL' }), []);
  const chooseTab = useCallback((choice) => dispatch({ type: 'MENU_SELECTED', choice }), []);
  useEffect(() => {
    if (pdfSearch.current) setPage(pdfSearch.current.page);
  }, [pdfSearch.current]);
  useEffect(() => {
    if (!articleSearch.current) return;
    const p = viewerRef.current?.pageOfBlock?.(articleSearch.current.block);
    if (p) setPage(p);
  }, [articleSearch.current]);

  // 마우스 드래그로 고른 단어도 손과 같은 경로(WORD_POINTED)로 보냅니다.
  const selectionSeq = useRef(0);
  const mouseRef = useRef(mouseEnabled);
  mouseRef.current = mouseEnabled;
  const selectByMouse = useCallback(({ word, context, rect }) => {
    if (!mouseRef.current) return;
    const id = `sel:${++selectionSeq.current}`;
    setPicked({ id, word, context, rect });
    dispatch({ type: 'WORD_POINTED', wordId: id, source: 'mouse' });
  }, []);

  // ---------- 시선 (modules/gaze) ----------
  // 읽는 중 클릭은 도구 막대 클릭도 많아 학습에 쓰지 않습니다.
  const gaze = useGaze({
    implicitClickTraining: false,
    dwell: { minDurationMs: DWELL_MS, maxDispersionPx: 140, releaseRadiusPx: 180, windowMs: 2000 },
  });
  const [calibrating, setCalibrating] = useState(false);
  const gazeOn = gaze.status === 'ready' || gaze.status === 'paused';
  const [dwellEnabled, setDwellEnabled] = useState(() => loadOn(DWELL_KEY));
  const changeDwell = (on) => {
    setDwellEnabled(on);
    saveOn(DWELL_KEY, on);
  };
  const phaseRef = useRef(input.phase);
  phaseRef.current = input.phase;
  const live = useRef({});
  live.current = { dwellEnabled, calibrating, gazeOn };
  const relockAt = useRef(0);
  const gazeTrail = useRef([]);
  const [edge, setEdge] = useState(null); // 시선이 머무는 화면 끝

  // 제스처가 실패한 이유를 잠깐 보여 준다 (아무 반응이 없어 보이지 않도록)
  const [flowNotice, setFlowNotice] = useState('');
  useEffect(() => {
    if (!flowNotice) return undefined;
    const id = setTimeout(() => setFlowNotice(''), 4000);
    return () => clearTimeout(id);
  }, [flowNotice]);

  useEffect(() => gaze.controller.on((e) => {
    if (e.type === 'gaze.point') {
      const trail = gazeTrail.current;
      trail.push({ x: e.x, y: e.y, t: e.t });
      while (trail.length && e.t - trail[0].t > GAZE_WINDOW_MS) trail.shift();
      setEdge(gazeEdge(averageX(trail, e.t, GAZE_WINDOW_MS), window.innerWidth));
    } else if (e.type === 'gaze.dwell') {
      const { dwellEnabled: on, calibrating: busy } = live.current;
      // 화면 끝은 쪽을 넘기려고 보는 곳이라 단어를 지정하지 않는다
      if (on && !busy && phaseRef.current === 'idle' && performance.now() >= relockAt.current && !gazeEdge(e.x, window.innerWidth)) {
        // 읽다가 머문 것일 수 있으니 글자 근처일 때만, 실패해도 조용히 넘어간다
        const target = viewerRef.current?.targetAt(e.x, e.y);
        if (target) dispatch({ type: 'TARGET_LOCKED', ...target, source: 'dwell' });
      }
    }
    const ev = toInputEvent(e);
    if (ev) dispatch(ev);
  }), [gaze.controller]);

  // 엄지를 든 순간 지정할 후보: 직전 시선의 평균 위치
  const targetFromGaze = useCallback(() => {
    const trail = gazeTrail.current;
    if (!trail.length || performance.now() - trail[trail.length - 1].t > GAZE_WINDOW_MS) {
      setFlowNotice('시선 위치를 찾지 못했습니다. 시선 보정을 켜거나 단어를 클릭해 주세요.');
      return null;
    }
    const x = trail.reduce((a, p) => a + p.x, 0) / trail.length;
    const y = trail.reduce((a, p) => a + p.y, 0) / trail.length;
    // 엄지는 일부러 든 것이므로 멀어도 이 쪽에서 가장 가까운 단어를 잡는다
    const target = viewerRef.current?.targetAt(x, y, Infinity) ?? null;
    if (!target) setFlowNotice(NO_TEXT);
    return target;
  }, []);

  // 화면 끝을 보며 손바닥을 유지하면 쪽을 넘긴다. 가운데를 보고 있으면 아무 일도 하지 않는다
  const turnPage = useRef(() => {});
  const onPalmHeld = useCallback(() => {
    const x = averageX(gazeTrail.current, performance.now(), GAZE_WINDOW_MS);
    const side = x === null ? null : gazeEdge(x, window.innerWidth);
    if (side) turnPage.current(side === 'right' ? 1 : -1, side === 'right' ? '다음 페이지' : '이전 페이지');
  }, []);

  // 읽기로 돌아오면 잠시 다시 지정하지 않는다
  useEffect(() => {
    if (input.phase === 'idle') relockAt.current = performance.now() + RELOCK_MS;
  }, [input.phase]);
  // 단어를 확정하면(조정 → 메뉴) 그 단어를 보고 있다고 보고 시선 좌표를 조금 옮긴다. 드래그 선택은 시선과 무관해 제외한다
  const prevPhase = useRef(input.phase);
  useEffect(() => {
    if (prevPhase.current === 'adjusting' && input.phase === 'menu' && input.wordId) {
      const rect = viewerRef.current?.wordInfo(input.wordId)?.rect;
      if (rect) {
        gaze.controller.correctFromWord(gazeTrail.current, { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 });
      }
    }
    prevPhase.current = input.phase;
  }, [input.phase, input.wordId, gaze.controller]);
  // 조정 중 아무 입력이 없으면 읽기로 돌아간다 (시선 멈춤으로 잘못 지정됐을 때 글을 계속 읽도록)
  useEffect(() => {
    if (input.phase !== 'adjusting') return undefined;
    const id = setTimeout(() => dispatch({ type: 'CANCEL' }), ADJUST_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [input.phase, input.target]);

  const lockByClick = useCallback(({ x, y }) => {
    if (phaseRef.current !== 'idle' || !mouseRef.current) return;
    const target = viewerRef.current?.targetAt(x, y);
    if (target) dispatch({ type: 'TARGET_LOCKED', ...target, source: 'mouse' });
    else setFlowNotice(NO_TEXT);
  }, []);

  useEffect(() => {
    if (!gazeOn) dispatch({ type: 'GAZE_PARAGRAPH', paragraphId: null });
  }, [gazeOn]);
  const startCalibration = async () => {
    try {
      setPanelOpen(false);
      setHeaderOpen(false);
      setMenuOpen(false);
      await gaze.start();
      setCalibrating(true);
    } catch {
      setFlowNotice('시선 인식을 시작하지 못했습니다. 손 인식과 마우스는 그대로 쓸 수 있습니다.');
    }
  };
  // 패드를 돌리면 카메라와 화면의 위치 관계가 바뀌어 보정이 맞지 않는다. 다시 보정하도록 안내한다.
  const startCalibrationRef = useRef(startCalibration);
  startCalibrationRef.current = startCalibration;
  useEffect(() => {
    const onRotate = () => {
      const { gazeOn: on, calibrating: busy } = live.current;
      if (on && !busy) startCalibrationRef.current();
    };
    window.addEventListener('orientationchange', onRotate);
    return () => window.removeEventListener('orientationchange', onRotate);
  }, []);
  // 손 모듈과 보정 화면은 서로 모르므로 앱이 제스처를 전달한다
  const calibrationListeners = useRef(new Set());
  const subscribeGesture = useCallback((listener) => {
    calibrationListeners.current.add(listener);
    return () => calibrationListeners.current.delete(listener);
  }, []);
  // 뷰어에 들어오면 바로 시선 보정 안내를 띄운다. '나중에'를 누르면 다시 들어올 때까지 묻지 않는다.
  const wasInViewer = useRef(false);
  useEffect(() => {
    // 손은 시선 다음에 켠다. MediaPipe 모델 두 개를 동시에 불러오면 서로 충돌할 수 있다.
    // 휴대폰은 터치로 읽는다. 시선 오차가 화면 폭의 4분의 1이나 되므로 카메라를 자동으로 켜지 않는다.
    if (hasDoc && !wasInViewer.current && !isPhone()) {
      (gazeOn ? Promise.resolve() : startCalibration()).then(() => {
        if (wasInViewer.current) setHandEnabled(true);
      });
    }
    wasInViewer.current = hasDoc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDoc]);
  const stopGaze = () => {
    setCalibrating(false);
    setEdge(null);
    gaze.stop();
  };

  // ---------- 손 (modules/hand) ----------
  useEffect(() => {
    if (!handEnabled || !videoRef.current) return undefined;
    const stop = startHandInput(
      dispatch,
      {
        video: videoRef.current,
        getPhase: () => phaseRef.current,
        getTarget: targetFromGaze,
        onPalmHeld,
        isCalibrating: () => live.current.calibrating,
        onCalibrationGesture: (g) => calibrationListeners.current.forEach((l) => l(g)),
        // 인식 결과는 프레임마다 바뀌므로 DOM 을 직접 갱신합니다.
        onFrame: (f) => {
          handCenterRef.current = f ? f.center : null;
          setHandSeen(!!f);
          if (handDebugRef.current) {
            handDebugRef.current.textContent = f ? `손 모양: ${SHAPE_LABEL[f.shape]} · 엄지 ${Math.round(f.thumbDeg)}°` : '손이 보이지 않습니다';
          }
        },
        onGuide: (g) => setHandStatus(g.msg || HAND_READY),
        onError: (e) => {
          setHandStatus(`손 인식 시작 실패: ${e.message}`);
          setHandEnabled(false);
        },
      },
    );
    setHandStatus(HAND_READY);
    return () => {
      stop();
      handCenterRef.current = null;
      setHandSeen(false);
    };
  }, [handEnabled, targetFromGaze, onPalmHeld]);

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
      setArticle(null);
      setPdfDoc(pdf);
      needsFit.current = true;
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
    const web = looksLikePdf(url) ? null : await fetchArticle(url);
    if (web) {
      search.reset();
      setPdfDoc(null);
      setFileUrl(null);
      setArticle(web);
      setFileName(web.title);
      setPage(1);
      setNotice('');
      setStatus(`${web.siteName} · 단어를 클릭하거나 시선·엄지로 고르세요`);
      return;
    }
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
    setArticle(null);
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
  useEffect(() => dispatch({ type: 'CANCEL' }), [page, scale, rotation, pdfDoc, article]);

  // 창 크기가 바뀌어 쪽 수가 줄면 범위 안으로
  useEffect(() => {
    if (article && page > articlePages) setPage(articlePages);
  }, [article, page, articlePages]);

  // ---------- 동작 ----------
  const goToPage = useCallback(
    (n) => { if (totalPages) setPage(clamp(n, 1, totalPages)); },
    [totalPages]
  );
  turnPage.current = (d, label) => {
    const next = clamp(page + d, 1, totalPages || 1);
    if (next === page) return;
    goToPage(next);
    setChip(label);
  };
  // 읽는 중 좌우로 밀면 쪽을 넘긴다. 확대한 PDF 의 가로 스크롤과 글자 선택은 방해하지 않는다.
  const swipeStart = useRef(null);
  const onSwipeStart = (e) => {
    const t = e.touches[0];
    swipeStart.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: performance.now() } : null;
  };
  const onSwipeEnd = (e) => {
    const s = swipeStart.current;
    swipeStart.current = null;
    const t = e.changedTouches[0];
    const stage = stageRef.current;
    if (!s || !t || input.phase !== 'idle' || (stage && stage.scrollWidth > stage.clientWidth)) return;
    if (!(window.getSelection()?.isCollapsed ?? true)) return;
    const d = swipeDirection(t.clientX - s.x, t.clientY - s.y, performance.now() - s.at);
    if (d) turnPage.current(d, d > 0 ? '다음 페이지' : '이전 페이지');
  };
  useEffect(() => {
    if (!chip) return undefined;
    const id = setTimeout(() => setChip(''), CHIP_MS);
    return () => clearTimeout(id);
  }, [chip]);
  const autoFit = useRef(true); // 직접 확대·축소하기 전까지는 화면 크기가 바뀌면 다시 맞춘다
  const zoom = (delta) => {
    autoFit.current = false;
    setScale((s) => clamp(s + delta, SCALE.min, SCALE.max));
  };
  // 쪽 전체가 화면에 들어오게 맞춘다. PDF 를 처음 열 때도 쓴다. 여백은 화면 크기별 CSS 값을 읽는다.
  const fitPage = async () => {
    if (!pdfDoc || !stageRef.current) return;
    autoFit.current = true;
    const p = await pdfDoc.getPage(page);
    const vp = p.getViewport({ scale: 1, rotation });
    if (!stageRef.current) return;
    const { clientWidth: w, clientHeight: h } = stageRef.current;
    const cs = getComputedStyle(stageRef.current);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + FIT_SLACK_Y;
    // 휴대폰 가로 화면은 높이가 낮아 쪽 전체를 맞추면 글자를 읽을 수 없다. 터치로 스크롤하므로 너비에 맞춘다.
    const widthOnly = isPhone() && w > h;
    setScale(clamp(pageFitScale({ stageW: w, stageH: h, padX, padY, pageW: vp.width, pageH: vp.height, widthOnly }), SCALE.min, SCALE.fitMax));
  };
  const fitPageRef = useRef(fitPage);
  fitPageRef.current = fitPage;
  // 쪽을 넘기면 맨 위부터 읽는다. 쪽마다 크기가 다를 수 있고 회전하면 비율이 바뀌니 다시 맞춘다.
  useEffect(() => {
    if (!pdfDoc) return;
    stageRef.current?.scrollTo(0, 0);
    if (autoFit.current) fitPageRef.current();
  }, [page, rotation, pdfDoc]);
  useEffect(() => {
    let timer = 0;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (autoFit.current) fitPageRef.current(); }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  const needsFit = useRef(false);
  useEffect(() => {
    if (!pdfDoc || !needsFit.current) return;
    needsFit.current = false;
    fitPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc]);
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
      // 단어 조정 중에는 키보드로도 제스처와 같은 동작을 한다 (시선·손 없이 시연할 때)
      if (input.phase === 'adjusting') {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          dispatch({ type: 'TARGET_MOVED', direction: e.key === 'ArrowRight' ? 1 : -1 });
          return;
        }
        if (e.key === 'Enter') dispatch({ type: 'TARGET_CONFIRMED' });
        if (e.key === 'Backspace') dispatch({ type: 'TARGET_BACK' });
        if (e.key === 'Escape') closePopup();
      }
      if (e.key === 'Escape') {
        setPanelOpen(false);
        setMenuOpen(false);
        setHeaderOpen(false);
      }
      if (hasDoc && e.key === 'ArrowLeft') goToPage(page - 1);
      if (hasDoc && e.key === 'ArrowRight') goToPage(page + 1);
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); chooseFile(); }
      if (mod && e.key.toLowerCase() === 'f' && hasDoc) { e.preventDefault(); search.setOpen(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [page, pdfDoc, hasDoc, goToPage, closePopup, search.setOpen, search.setQuery, input.phase]);

  const getHandCenter = useCallback(() => handCenterRef.current, []);
  const closeChrome = () => {
    setPanelOpen(false);
    setMenuOpen(false);
    setHeaderOpen(false);
    setHeaderPinned(false);
  };
  const faceLost = gazeOn && !calibrating && !gaze.faceDetected;
  useEffect(() => {
    if (gaze.faceDetected) setFaceCardClosed(false);
  }, [gaze.faceDetected]);
  const gazeDot = !gazeOn ? 'off' : faceLost ? 'warn' : 'ok';
  const handDot = !handEnabled ? 'off' : handSeen ? 'ok seen' : 'ok';
  const canPeek = handEnabled || gazeOn;
  useEffect(() => {
    if (!canPeek) setPeek(false);
  }, [canPeek]);
  const docInfo = article ? `${article.siteName} · ${totalPages}쪽` : `PDF · ${totalPages}쪽`;
  const fileInput = (
    <input
      ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) loadFile(file);
        e.target.value = '';
      }}
    />
  );
  const popups = (
    <>
      <WordPopup selection={selection} stageRef={stageRef} onClose={closePopup} choice={input.choice} onChoice={chooseTab} />
      {fileInput}
      <InfoModal section={info} onClose={() => setInfo(null)} />
      <DropOverlay visible={dragging} />
    </>
  );

  if (!hasDoc) {
    return (
      <>
        <div className="app">
          <Header hasDoc={false} fileName="" dark={dark} onHome={goHome} onOpen={chooseFile} onInfo={setInfo} onToggleTheme={() => setDark((v) => !v)} />
          <Landing dragging={dragging} notice={notice} onChooseFile={chooseFile} onOpenUrl={openUrl} onInfo={setInfo} />
        </div>
        {popups}
      </>
    );
  }

  return (
    <>
      <div className={`rd-reader${pdfDoc ? ' is-pdf' : ''}`}>
        <div className="rd-stage" onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
          {article ? (
            <ArticleViewer
              ref={viewerRef}
              article={article}
              page={page}
              target={input.target}
              highlightTerm={search.term}
              gazeRegionId={input.gazeParagraphId}
              stageRef={stageRef}
              onPageCount={setArticlePages}
              onClickPoint={lockByClick}
              onSelectText={selectByMouse}
            />
          ) : (
            <PdfViewer
              ref={viewerRef}
              target={input.target}
              onClickPoint={lockByClick}
              stageRef={stageRef}
              pdfDoc={pdfDoc}
              pageNumber={page}
              scale={scale}
              rotation={rotation}
              highlightTerm={search.term}
              gazeRegionId={input.gazeParagraphId}
              onOpen={chooseFile}
              onPageText={(n, text) => { pageTextsRef.current[n - 1] = text; }}
              onRendered={(n) => setStatus(`${n} / ${totalPages}쪽`)}
              onSelectText={selectByMouse}
            />
          )}
        </div>

        <button
          className="rd-handle"
          onClick={() => { setHeaderOpen(true); setHeaderPinned(true); }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHeaderOpen(true); }}
          aria-label="메뉴 보기"
        />
        <button className="rd-open-panel" onClick={() => setPanelOpen((v) => !v)} aria-label={panelOpen ? '읽기 도구 닫기' : '읽기 도구 열기'} aria-expanded={panelOpen}>
          {panelOpen ? <ChevronLeft /> : <ChevronRight />}
        </button>
        <StatusPill gazeState={gazeDot} handState={handDot} chip={chip} warn={faceLost} onClick={() => setPanelOpen(true)} />
        {faceLost && <FaceToast />}
        {faceLost && !faceCardClosed && !peek && <FaceGuideCard onClose={() => setFaceCardClosed(true)} />}
        {/* 손 인식 영상은 화면 밖에 둔다. '잠깐 보기'는 같은 카메라 스트림을 따로 보여 준다 */}
        <div className="rd-offscreen" aria-hidden="true"><video ref={videoRef} className="rd-hand-video" autoPlay muted playsInline /></div>
        {peek && <CameraPeek getStream={() => (handEnabled ? videoRef.current?.srcObject : gaze.controller.getStream())} onClose={() => setPeek(false)} />}

        <div className="rd-search"><SearchBar search={search} placeholder={article ? '이 글에서 검색...' : 'PDF에서 검색...'} /></div>
        {input.phase === 'adjusting' && (
          <TouchAdjustBar
            level={input.target?.level ?? 'word'}
            onMove={(direction) => dispatch({ type: 'TARGET_MOVED', direction })}
            onBack={() => dispatch({ type: 'TARGET_BACK' })}
            onConfirm={() => dispatch({ type: 'TARGET_CONFIRMED' })}
            onCancel={closePopup}
          />
        )}
        <ReaderPager
          page={page}
          totalPages={totalPages}
          onPageChange={goToPage}
          onToggleSearch={search.toggle}
          onFullscreen={toggleFullscreen}
          pdf={pdfDoc ? {
            scale,
            onZoomIn: () => zoom(SCALE.step),
            onZoomOut: () => zoom(-SCALE.step),
            onFit: fitPage,
            onRotate: () => setRotation((r) => (r + 90) % 360),
          } : null}
        />

        {(panelOpen || menuOpen || (headerOpen && headerPinned)) && <div className="rd-veil" onClick={closeChrome} />}
        <ReaderHeader
          open={headerOpen || panelOpen || menuOpen}
          title={fileName}
          dark={dark}
          onHide={() => { if (!menuOpen && !panelOpen && !headerPinned) setHeaderOpen(false); }}
          onOpenFile={chooseFile}
          onToggleTheme={() => setDark((v) => !v)}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((v) => !v)}
          menu={{
            onHome: () => { closeChrome(); goHome(); },
            onInfo: (k) => { setMenuOpen(false); setInfo(k); },
            onDownload: pdfDoc ? download : null,
            onPrint: pdfDoc ? print : null,
            info: docInfo,
          }}
        />
        <ReaderPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          onHome={() => { closeChrome(); goHome(); }}
          handDebugRef={handDebugRef}
          page={page}
          total={totalPages}
          pdfDoc={pdfDoc}
          status={status}
          onPageSelect={setPage}
          canPeek={canPeek}
          onPeek={() => { setPeek(true); closeChrome(); }}
          hand={{
            enabled: handEnabled,
            label: handEnabled ? handStatus : '손 인식 꺼짐',
            onToggle: () => setHandEnabled((v) => !v),
          }}
          gaze={{
            on: gazeOn,
            warn: faceLost,
            status: gaze.status,
            label: gaze.error ? `시선 오류: ${gaze.error}` : gazeOn ? (faceLost ? '얼굴이 보이지 않아요' : '시선 보조 켜짐') : '시선 보조 꺼짐',
            onCalibrate: startCalibration,
            dwellEnabled,
            onDwellChange: changeDwell,
            onStop: stopGaze,
          }}
          mouse={{
            enabled: mouseEnabled,
            onChange: (on) => { setMouseEnabled(on); saveOn(MOUSE_KEY, on); },
          }}
        />
      </div>

      {gazeOn && !calibrating && <GazeHeatLayer controller={gaze.controller} options={READING_HEATMAP} />}
      {hasDoc && gazeOn && !calibrating && input.phase === 'idle' && edge && <div className={`edge-glow ${edge}`} aria-hidden="true" />}
      {(input.phase === 'adjusting' || input.phase === 'result' || flowNotice) && (
        <div className={`flow-guide${input.phase === 'idle' ? '' : ' is-gesture'}`} role="status">
          {input.phase === 'result' ? GUIDE.result : input.phase === 'adjusting' ? GUIDE[input.target?.level ?? 'word'] : flowNotice}
        </div>
      )}
      {popups}
      {calibrating && (
        <CalibrationOverlay
          controller={gaze.controller}
          variant="reader"
          handOn={handEnabled}
          getHandCenter={getHandCenter}
          subscribeGesture={subscribeGesture}
          onCancel={stopGaze}
          onDone={() => setCalibrating(false)}
        />
      )}
    </>
  );
}
