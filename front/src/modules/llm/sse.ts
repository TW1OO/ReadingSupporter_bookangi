// SSE 바이트 스트림을 이벤트(data 문자열)로 쪼갠다. 청크 경계가 어디서 잘려도 동작해야 한다.
export function createSseParser(onData: (data: string) => void): (chunk: string) => void {
  let buf = ''
  return (chunk) => {
    buf += chunk.replace(/\r\n/g, '\n')
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n')
      if (data) onData(data)
    }
  }
}
