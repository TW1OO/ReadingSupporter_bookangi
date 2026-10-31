export default function DropOverlay({ visible }) {
  return (
    <div id="dropOverlay" className={`drop-overlay${visible ? ' visible' : ''}`}>
      여기에 PDF 파일을 놓으세요
    </div>
  );
}
