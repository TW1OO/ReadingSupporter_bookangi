export default function StatusBar({ status }) {
  return (
    <div className="statusbar">
      <span id="status">{status}</span>
      <span>Book항이 · 시선 및 제스처 기반 맞춤형 독서 보조 서비스</span>
    </div>
  );
}
