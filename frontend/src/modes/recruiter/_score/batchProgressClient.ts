/**
 * batchProgressClient — 招聘者批量评分进度订阅 + localStorage 持久化
 *
 * 从 RecruiterScore.tsx 拆出来（2026-05-09 §8.26），避免父组件破 500 行红线。
 *
 * 提供两组工具：
 *   1) subscribeBatchProgress(batchId, handlers) — SSE 优先 + 轮询降级
 *   2) saveActiveBatch / clearActiveBatch / loadActiveBatch — localStorage 持久化
 *
 * 设计文档：
 *   - SSE 协议：MEMORY/LOG.md §8.22
 *   - 跨页恢复：MEMORY/LOG.md §8.23
 *   - localStorage 兜底：try/catch 包好（隐私模式 / quota 满不报错）
 */
import { api } from '../../../api/client'

// ─── SSE 进度订阅 ───────────────────────────────────────

export interface ProgressPayload {
  batch_id: string
  completed: number
  total: number
  status: string
}

export interface ProgressHandlers {
  onProgress: (p: ProgressPayload) => void
  onDone: (p: ProgressPayload) => void
}

/**
 * Issue #003 ③: 订阅 batch 进度 — 优先 SSE，失败时降级到轮询。
 *
 * 返回 ``unsubscribe`` 函数用于清理。
 *
 * SSE 失败定义：``onerror`` 触发**且**未收到任何 progress 事件（说明是连接级问题，
 * 而非网络抖动）。已收到 progress 后再 error 则不降级，因为此时 batch 多半已接近完成。
 */
export function subscribeBatchProgress(
  batchId: string,
  handlers: ProgressHandlers,
): () => void {
  let receivedAny = false
  let cleaned = false
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let es: EventSource | null = null

  const cleanup = () => {
    cleaned = true
    if (es) {
      es.close()
      es = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  const startPolling = () => {
    if (cleaned) return
    pollTimer = setInterval(async () => {
      try {
        const s = await api.analysis.batch.get(batchId)
        const payload: ProgressPayload = {
          batch_id: s.batch_id,
          completed: s.completed,
          total: s.total,
          status: s.status,
        }
        if (s.status === 'completed' || s.status === 'failed') {
          cleanup()
          handlers.onDone(payload)
        } else {
          handlers.onProgress(payload)
        }
      } catch {
        // 轮询失败也只能停下来，避免无限错误
        cleanup()
      }
    }, 3000)
  }

  // 优先尝试 SSE
  try {
    es = new EventSource(api.analysis.batch.streamUrl(batchId))
    es.addEventListener('progress', (e) => {
      receivedAny = true
      try {
        const payload = JSON.parse((e as MessageEvent).data) as ProgressPayload
        handlers.onProgress(payload)
      } catch (err) {
        // ignore malformed event
        console.warn('SSE progress parse error', err)
      }
    })
    es.addEventListener('done', (e) => {
      receivedAny = true
      try {
        const payload = JSON.parse((e as MessageEvent).data) as ProgressPayload
        cleanup()
        handlers.onDone(payload)
      } catch (err) {
        console.warn('SSE done parse error', err)
        cleanup()
      }
    })
    es.onerror = () => {
      // 如果完全没收到事件就 error，说明 SSE 通道不可用 → 降级到轮询
      if (!receivedAny && !cleaned) {
        if (es) {
          es.close()
          es = null
        }
        console.info('[batch-progress] SSE unavailable, falling back to polling')
        startPolling()
      } else if (es) {
        // 已经收到过事件，但中途 error：可能 batch 已结束，关掉就行（done 事件应该已触发）
        es.close()
        es = null
      }
    }
  } catch {
    // 浏览器不支持 EventSource（极小概率），直接降级
    startPolling()
  }

  return cleanup
}

// ─── 跨页 batchId 持久化（Issue A）────────────────────────
// 跳走再回来不丢失正在跑的批次。Backend 是无状态架构，这是前端的责任。

const ACTIVE_BATCH_STORAGE_KEY = 'resumeai.activeBatch'

export function saveActiveBatch(batchId: string): void {
  try {
    localStorage.setItem(ACTIVE_BATCH_STORAGE_KEY, batchId)
  } catch {
    // localStorage 满 / 隐私模式禁用 → 仅当次会话生效，不报错
  }
}

export function clearActiveBatch(): void {
  try {
    localStorage.removeItem(ACTIVE_BATCH_STORAGE_KEY)
  } catch {
    /* noop */
  }
}

export function loadActiveBatch(): string | null {
  try {
    return localStorage.getItem(ACTIVE_BATCH_STORAGE_KEY)
  } catch {
    return null
  }
}
