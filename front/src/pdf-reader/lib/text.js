// 드래그로 선택한 텍스트에서 공백·양끝 문장부호를 정리합니다.
export function cleanSelection(raw) {
  return (raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[“”"'`.,!?;:()[\]{}]+|[“”"'`.,!?;:()[\]{}]+$/g, '');
}
