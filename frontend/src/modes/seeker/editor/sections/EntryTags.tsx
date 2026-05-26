import { useState } from 'react'
import { Tag } from 'lucide-react'

interface EntryTagsProps {
  tags: string[]
  onChange: (v: string[]) => void
}

/**
 * EntryTags — Phase 7 §8.48
 *
 * 每条经历的可折叠 Tags 面板。
 * - 默认收起，点击 🏷️ 按钮展开
 * - 回车添加标签，点击 ✕ 删除
 * - Tags 用于 AI 生成时的 Entry Scorer 匹配精度提升
 */
export function EntryTags({ tags, onChange }: EntryTagsProps) {
  const [expanded, setExpanded] = useState(false)

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        title="管理标签，提升 AI 岗位匹配精度"
      >
        <Tag className="h-3 w-3" />
        {tags.length > 0 ? `${tags.length} 个标签` : '标签'}
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          🏷️ 标签（用于 AI 匹配岗位）
        </span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          收起
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((t, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 rounded-full bg-seeker-50 px-2.5 py-1 text-xs text-seeker-700 dark:bg-seeker-950/30 dark:text-seeker-300"
          >
            {t}
            <button
              type="button"
              className="text-seeker-500 hover:text-seeker-800"
              onClick={() => onChange(tags.filter((_, j) => j !== idx))}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          type="text"
          className="min-w-[100px] rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
          placeholder="回车添加"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const val = (e.target as HTMLInputElement).value.trim()
              if (val && !tags.includes(val)) {
                onChange([...tags, val])
                ;(e.target as HTMLInputElement).value = ''
              }
            }
          }}
        />
      </div>
    </div>
  )
}
