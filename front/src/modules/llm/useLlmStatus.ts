import { useCallback, useEffect, useState } from 'react'
import type { LlmStatus } from '@/shared/api'
import { getLlmStatus } from './client'

// 모델이 올라가는 동안은 자주, 평소에는 가끔 서버 상태를 확인한다.
export function useLlmStatus() {
  const [status, setStatus] = useState<LlmStatus | null>(null)
  const [offline, setOffline] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setStatus(await getLlmStatus())
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [])

  const state = status?.state
  useEffect(() => {
    void refresh()
    const id = setInterval(refresh, state === 'loading' ? 1500 : 10000)
    return () => clearInterval(id)
  }, [refresh, state])

  return { status, offline, refresh }
}
