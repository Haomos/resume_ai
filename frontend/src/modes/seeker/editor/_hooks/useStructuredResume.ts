/**
 * useStructuredResume — Phase 5 §8.36 A8/A13 状态管理 + 自动保存。
 *
 * 用 useReducer 管理 JsonResume 整棵树。所有 section 编辑产生的 mutation
 * 走 dispatch(action)，再由顶层 hook debounce 调用 PUT /structured 保存。
 *
 * 保存策略：
 *  - 编辑后 3s debounce → PUT 全量 structured_json
 *  - 失败时 setStatus('error')，提示用户手动保存（治本到 A2 级 retry 留给 P2）
 *
 * Action 设计：
 *  - SET_FIELD: 设单个 path（"basics.summary" / "work[0].summary" 等）
 *  - SET_LIST_ITEM: 设 work[i] / education[i] 等整项
 *  - ADD_ITEM: 在 list 末尾追加空 item
 *  - REMOVE_ITEM: 删除 list[index]
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { api } from '../../../../api/client'
import type { JsonResume } from '../../../../api/types'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface SetFieldAction {
  type: 'SET_FIELD'
  path: string  // dot.path[index] e.g. "basics.summary" or "work[0].summary"
  value: unknown
}

interface SetListItemAction {
  type: 'SET_LIST_ITEM'
  section: string
  index: number
  item: Record<string, unknown>
}

interface AddItemAction {
  type: 'ADD_ITEM'
  section: string
  template: Record<string, unknown>
}

interface RemoveItemAction {
  type: 'REMOVE_ITEM'
  section: string
  index: number
}

interface ReorderItemAction {
  type: 'REORDER_ITEM'
  section: string
  oldIndex: number
  newIndex: number
}

interface ReorderSectionAction {
  type: 'REORDER_SECTION'
  oldIndex: number
  newIndex: number
}

interface ReplaceAllAction {
  type: 'REPLACE_ALL'
  resume: JsonResume
}

export type ResumeAction =
  | SetFieldAction
  | SetListItemAction
  | AddItemAction
  | RemoveItemAction
  | ReorderItemAction
  | ReorderSectionAction
  | ReplaceAllAction

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  // Simple path parser: "basics.summary" / "work[0].summary" / "skills[2].keywords[1]"
  const parts: Array<string | number> = []
  const tokens = path.split('.')
  for (const token of tokens) {
    const m = token.match(/^([a-zA-Z]+)((?:\[\d+\])*)$/)
    if (!m) {
      console.warn('[setByPath] invalid token, aborting:', token, 'full path:', path)
      return obj  // invalid path, ignore
    }
    parts.push(m[1])
    const indexes = m[2].match(/\[(\d+)\]/g)
    if (indexes) {
      for (const idx of indexes) {
        parts.push(parseInt(idx.slice(1, -1), 10))
      }
    }
  }
  // Walk and clone
  const next = { ...obj } as Record<string, unknown>
  let cur: Record<string, unknown> | unknown[] = next
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (Array.isArray(cur)) {
      const idx = key as number
      const newArr = [...cur]
      newArr[idx] = typeof newArr[idx] === 'object' && newArr[idx] !== null
        ? Array.isArray(newArr[idx]) ? [...(newArr[idx] as unknown[])] : { ...(newArr[idx] as Record<string, unknown>) }
        : newArr[idx]
      cur[idx] = newArr[idx]  // copy back to parent
      cur = newArr[idx] as Record<string, unknown> | unknown[]
    } else {
      const k = key as string
      const child = cur[k]
      if (Array.isArray(child)) {
        cur[k] = [...child]
      } else if (typeof child === 'object' && child !== null) {
        cur[k] = { ...(child as Record<string, unknown>) }
      }
      cur = cur[k] as Record<string, unknown> | unknown[]
    }
  }
  // Set the final
  const lastKey = parts[parts.length - 1]
  if (Array.isArray(cur)) {
    (cur as unknown[])[lastKey as number] = value
  } else {
    (cur as Record<string, unknown>)[lastKey as string] = value
  }
  return next
}

function reducer(state: JsonResume, action: ResumeAction): JsonResume {
  switch (action.type) {
    case 'REPLACE_ALL':
      return action.resume
    case 'SET_FIELD':
      return setByPath(state as unknown as Record<string, unknown>, action.path, action.value) as unknown as JsonResume
    case 'SET_LIST_ITEM': {
      const existing = ((state as unknown as Record<string, unknown>)[action.section] as unknown[]) ?? []
      const list = [...existing]
      list[action.index] = action.item
      return { ...state, [action.section]: list } as JsonResume
    }
    case 'ADD_ITEM': {
      const existing = ((state as unknown as Record<string, unknown>)[action.section] as unknown[]) ?? []
      const template = { ...action.template }
      // Phase 7 §8.48: 每个条目必须有稳定 id，供 AI 生成器做 source_entry_id 溯源
      if (!template.id) {
        template.id = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      }
      const list = [...existing, template]
      return { ...state, [action.section]: list } as JsonResume
    }
    case 'REMOVE_ITEM': {
      const existing = ((state as unknown as Record<string, unknown>)[action.section] as unknown[]) ?? []
      const list = existing.filter((_, i) => i !== action.index)
      return { ...state, [action.section]: list } as JsonResume
    }
    case 'REORDER_ITEM': {
      const existing = ((state as unknown as Record<string, unknown>)[action.section] as unknown[]) ?? []
      const list = [...existing]
      const [moved] = list.splice(action.oldIndex, 1)
      list.splice(action.newIndex, 0, moved)
      return { ...state, [action.section]: list } as JsonResume
    }
    case 'REORDER_SECTION': {
      const order = [...(state.meta?.section_order ?? ['basics', 'work', 'education', 'projects', 'skills'])]
      const [moved] = order.splice(action.oldIndex, 1)
      order.splice(action.newIndex, 0, moved)
      return {
        ...state,
        meta: { ...(state.meta ?? {}), section_order: order },
      } as JsonResume
    }
    default:
      return state
  }
}

export function useStructuredResume(
  resumeId: string | undefined,
  initial: JsonResume,
  saveOverride?: (snapshot: JsonResume) => Promise<unknown>,
) {
  const [resume, dispatch] = useReducer(reducer, initial)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)

  const saveNow = useCallback(async (snapshot: JsonResume) => {
    if (!resumeId && !saveOverride) return
    setStatus('saving')
    try {
      if (saveOverride) {
        await saveOverride(snapshot)
      } else if (resumeId) {
        await api.resumes.saveStructured(resumeId, snapshot)
      }
      setStatus('saved')
      dirtyRef.current = false
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1500)
    } catch (err) {
      console.warn('[useStructuredResume] save failed:', err)
      setStatus('error')
    }
  }, [resumeId, saveOverride])

  // Debounced auto-save when state changes (but skip the initial mount)
  const initialMountRef = useRef(true)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    dirtyRef.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNow(resume), 3000)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [resume, saveNow])

  return {
    resume,
    dispatch,
    status,
    /** 立即保存（用户点击 Save 按钮时） */
    saveNow: () => saveNow(resume),
  }
}