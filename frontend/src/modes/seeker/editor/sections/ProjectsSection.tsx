import type { ResumeProject } from '../../../../api/types'
import type { ResumeAction } from '../_hooks/useStructuredResume'
import { SortableSection } from './SortableSection'
import { InlineSuggestion, type SuggestionItem } from '../InlineSuggestion'
import { parseSuggestionPath } from '../_utils/parseSuggestionPath'
import { MarkdownHint } from '../_utils/MarkdownHint'
import { memo } from 'react'
import { Rocket } from 'lucide-react'
import { EntryTags } from './EntryTags'

function ProjectsSectionComponent({ items, dispatch, suggestions, onApplySuggestion }: { items: ResumeProject[]; dispatch: (a: ResumeAction) => void; suggestions?: SuggestionItem[]; onApplySuggestion?: (path: string, value: unknown) => void }) {
  const set = (idx: number, path: string, value: unknown) => dispatch({ type: 'SET_FIELD', path: `projects[${idx}].${path}`, value })
  const add = () => dispatch({ type: 'ADD_ITEM', section: 'projects', template: { name: '', description: '', highlights: [], keywords: [], startDate: '', endDate: '', url: '', roles: [], entity: '', type: '', tags: [] } })
  const rm = (idx: number) => dispatch({ type: 'REMOVE_ITEM', section: 'projects', index: idx })
  const reorder = (oldIdx: number, newIdx: number) => dispatch({ type: 'REORDER_ITEM', section: 'projects', oldIndex: oldIdx, newIndex: newIdx })

  const getSugs = (idx: number, field: string) =>
    suggestions?.filter((s) => {
      const p = parseSuggestionPath(s.path ?? '')
      return p?.section === 'projects' && p.index === idx && p.field === field
    }) ?? []

  const TagInput = ({ tags, onChange }: { tags: string[]; onChange: (v: string[]) => void }) => (
    <div className="mt-1 flex flex-wrap gap-2">
      {tags.map((t, idx) => (
        <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-seeker-50 px-2.5 py-1 text-xs text-seeker-700 dark:bg-seeker-950/30 dark:text-seeker-300">
          {t}
          <button type="button" className="text-seeker-500 hover:text-seeker-800" onClick={() => onChange(tags.filter((_, j) => j !== idx))}>✕</button>
        </span>
      ))}
      <input type="text" className="min-w-[120px] rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="回车添加" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const val = (e.target as HTMLInputElement).value.trim(); if (val) { onChange([...tags, val]); (e.target as HTMLInputElement).value = '' } } } } />
    </div>
  )

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
          <Rocket className="h-4 w-4 text-seeker-600 dark:text-seeker-400" strokeWidth={1.75} />
          项目经历
        </h2>
        <button type="button" onClick={add} className="rounded-md bg-seeker-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-seeker-700">+ 新增</button>
      </header>
      <div className="space-y-4">
        {items.length > 0 ? (
          <SortableSection items={items} onReorder={reorder}
            renderItem={(item, i) => (
              <div className="relative rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-slate-400 dark:text-slate-500">#{i + 1}</span>
                  <div className="flex items-center gap-2">
                    <EntryTags tags={(item.tags ?? []) as string[]} onChange={(tags) => set(i, 'tags', tags)} />
                    <button type="button" onClick={() => rm(i)} className="text-xs text-red-500 hover:text-red-700">删除</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="项目名称" value={item.name} onChange={(e) => set(i, 'name', e.target.value)} />
                  <input className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="开始日期，如 2021-01" value={item.startDate} onChange={(e) => set(i, 'startDate', e.target.value)} />
                  <input className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="结束日期（空 = 至今）" value={item.endDate} onChange={(e) => set(i, 'endDate', e.target.value)} />
                </div>
                {/* §8.38 Inline AI suggestions for project name */}
                {getSugs(i, 'name').map((s, si) => (
                  <InlineSuggestion
                    key={`name-${si}`}
                    suggestion={s}
                    onApply={() => onApplySuggestion?.(s.path!, s.rewritten ?? '')}
                    onRevert={() => onApplySuggestion?.(s.path!, item.name)}
                  />
                ))}
                <div className="mt-3">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">项目描述</label>
                  <p className="text-[10px] text-slate-500">⚠️ AI 可改写以更好对齐目标 JD</p>
                  <textarea value={item.description} onChange={(e) => set(i, 'description', e.target.value)} placeholder="项目背景、你的职责、技术栈、量化成果..." className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" style={{ minHeight: '80px' }} />
                  <MarkdownHint />
                </div>
                <div className="mt-3">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">关键词 / 技术栈</label>
                  <TagInput tags={item.keywords} onChange={(tags) => set(i, 'keywords', tags)} />
                </div>
                <div className="mt-3">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">亮点 / 成果</label>
                  <TagInput tags={item.highlights} onChange={(tags) => set(i, 'highlights', tags)} />
                </div>

                {/* §8.38 Inline AI suggestions for this project item */}
                {getSugs(i, 'description').map((s, si) => (
                  <InlineSuggestion
                    key={`desc-${si}`}
                    suggestion={s}
                    onApply={() => onApplySuggestion?.(s.path!, s.rewritten ?? '')}
                    onRevert={() => onApplySuggestion?.(s.path!, item.description)}
                  />
                ))}
                {getSugs(i, 'highlights').map((s, si) => (
                  <InlineSuggestion
                    key={`highlights-${si}`}
                    suggestion={s}
                    onApply={() => onApplySuggestion?.(s.path!, [s.rewritten ?? ''])}
                    onRevert={() => onApplySuggestion?.(s.path!, item.highlights)}
                  />
                ))}
              </div>
            )}
          />
        ) : (
          <p className="text-center text-sm text-slate-400">暂无项目经历</p>
        )}
      </div>
    </section>
  )
}

export const ProjectsSection = memo(ProjectsSectionComponent)
