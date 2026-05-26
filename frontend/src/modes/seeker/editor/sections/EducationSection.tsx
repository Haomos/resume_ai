import type { ResumeEducation } from '../../../../api/types'
import type { ResumeAction } from '../_hooks/useStructuredResume'
import { SortableSection } from './SortableSection'
import { InlineSuggestion, type SuggestionItem } from '../InlineSuggestion'
import { parseSuggestionPath } from '../_utils/parseSuggestionPath'
import { MarkdownHint } from '../_utils/MarkdownHint'
import { memo } from 'react'
import { GraduationCap } from 'lucide-react'
import { EntryTags } from './EntryTags'

function EducationSectionComponent({
  items,
  dispatch,
  suggestions,
  onApplySuggestion,
}: {
  items: ResumeEducation[]
  dispatch: (a: ResumeAction) => void
  suggestions?: SuggestionItem[]
  onApplySuggestion?: (path: string, value: unknown) => void
}) {
  const getSugs = (idx: number, field: string) =>
    suggestions?.filter((s) => {
      const p = parseSuggestionPath(s.path ?? '')
      return p?.section === 'education' && p.index === idx && p.field === field
    }) ?? []

  const set = (idx: number, path: string, value: unknown) =>
    dispatch({ type: 'SET_FIELD', path: `education[${idx}].${path}`, value })

  const add = () =>
    dispatch({
      type: 'ADD_ITEM',
      section: 'education',
      template: { institution: '', studyType: '', area: '', startDate: '', endDate: '', url: '', score: '', summary: '', courses: [], tags: [] },
    })

  const rm = (idx: number) => dispatch({ type: 'REMOVE_ITEM', section: 'education', index: idx })
  const reorder = (oldIdx: number, newIdx: number) =>
    dispatch({ type: 'REORDER_ITEM', section: 'education', oldIndex: oldIdx, newIndex: newIdx })

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
          <GraduationCap className="h-4 w-4 text-seeker-600 dark:text-seeker-400" strokeWidth={1.75} />
          教育经历
        </h2>
        <button type="button" onClick={add} className="rounded-md bg-seeker-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-seeker-700">
          + 新增
        </button>
      </header>
      <div className="space-y-4">
        {items.length > 0 ? (
          <SortableSection
            items={items}
            onReorder={reorder}
            renderItem={(item, i) => (
              <div className="relative rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-slate-400 dark:text-slate-500">#{i + 1}</span>
                  <div className="flex items-center gap-2">
                    <EntryTags tags={(item.tags ?? []) as string[]} onChange={(tags) => set(i, 'tags', tags)} />
                    <button type="button" onClick={() => rm(i)} className="text-xs text-red-500 hover:text-red-700">
                      删除
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    placeholder="学校/机构"
                    value={item.institution}
                    onChange={(e) => set(i, 'institution', e.target.value)}
                  />
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    placeholder="学位"
                    value={item.studyType}
                    onChange={(e) => set(i, 'studyType', e.target.value)}
                  />
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    placeholder="专业"
                    value={item.area}
                    onChange={(e) => set(i, 'area', e.target.value)}
                  />
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    placeholder="成绩/GPA/排名描述（AI 可改写）"
                    value={item.score}
                    onChange={(e) => set(i, 'score', e.target.value)}
                  />
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    placeholder="开始日期，如 2018-09"
                    value={item.startDate}
                    onChange={(e) => set(i, 'startDate', e.target.value)}
                  />
                  <input
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    placeholder="结束日期，如 2022-06（空 = 至今）"
                    value={item.endDate}
                    onChange={(e) => set(i, 'endDate', e.target.value)}
                  />
                </div>

                <div className="mt-3">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">在校经历 / 主修课程 / 荣誉奖项</label>
                  <p className="text-[10px] text-slate-500">⚠️ AI 可改写以更好对齐目标 JD</p>
                  <textarea
                    value={item.summary}
                    onChange={(e) => set(i, 'summary', e.target.value)}
                    placeholder="描述在校期间的核心课程、学术项目、社团活动、获奖情况等（尽量量化成果）..."
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    style={{ minHeight: '80px' }}
                  />
                  <MarkdownHint />
                </div>

                {getSugs(i, 'summary').map((s, si) => (
                  <InlineSuggestion
                    key={`summary-${si}`}
                    suggestion={s}
                    onApply={() => onApplySuggestion?.(s.path!, s.rewritten ?? '')}
                    onRevert={() => onApplySuggestion?.(s.path!, item.summary)}
                  />
                ))}
              </div>
            )}
          />
        ) : (
          <p className="text-center text-sm text-slate-400">暂无教育经历</p>
        )}
      </div>
    </section>
  )
}

export const EducationSection = memo(EducationSectionComponent)
