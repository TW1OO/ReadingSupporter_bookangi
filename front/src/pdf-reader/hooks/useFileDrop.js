import { useEffect, useRef, useState } from 'react';
import { isPdfFile } from '../lib/pdf.js';

/** 창 전체에 PDF 드래그&드롭을 연결하고, 드래그 중 여부를 반환합니다. */
export function useFileDrop(onFile) {
  const [dragging, setDragging] = useState(false);
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;

  useEffect(() => {
    let depth = 0;
    const enter = (e) => { e.preventDefault(); depth++; setDragging(true); };
    const over = (e) => e.preventDefault();
    const leave = (e) => {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = [...(e.dataTransfer?.files || [])].find(isPdfFile);
      if (file) onFileRef.current(file);
    };
    document.addEventListener('dragenter', enter);
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragenter', enter);
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
    };
  }, []);

  return dragging;
}
