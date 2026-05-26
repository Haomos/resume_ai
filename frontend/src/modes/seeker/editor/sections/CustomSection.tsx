import type { ResumeCustomSection } from '../../../../api/types'
import type { ResumeAction } from '../_hooks/useStructuredResume'
import { SortableSection } from './SortableSection'
import { MarkdownHint } from '../_utils/MarkdownHint'
import { memo } from 'react'
import { Paperclip } from 'lucide-react'

function CustomSectionComponent({
  items,
  dispatch,
}: {
  items: ResumeCustomSection[]
  dispatch: (action: ResumeAction) => void
}) {
  const set = (idx: number, path: string, value: unknown) =>
    dispatch({ type: 'SET_FIELD', path: `customSections[${idx}].${path}`, value })

  const add = () =>
    dispatch({
      type: 'ADD_ITEM',
      section: 'customSections',
      template: { title: '', content: '' },
    })

  const rm = (idx: number) => dispatch({ type: 'REMOVE_ITEM', section: 'customSections', index: idx })
  const reorder = (oldIdx: number, newIdx: number) => dispatch({ type: 'REORDER_ITEM', section: 'customSections', oldIndex: oldIdx, newIndex: newIdx })

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-200">
          <Paperclip className="h-4 w-4 text-seeker-600 dark:text-seeker-400" strokeWidth={1.75} />
          自定义区块
        </h2>
        <button
          type="button"
          onClick={add}
          className="rounded-md bg-seeker-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-seeker-700"
        >
          + 新增区块
        </button>
      </header>

      <div className="space-y-4">
        {items.length > 0 ? (
          <SortableSection items={items} onReorder={reorder}
            renderItem={(item, i) => (
              <div className="relative rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => rm(i)}
                  className="absolute right-2 top-2 text-xs text-red-500 hover:text-red-700"
                  title="删除本条"
                >
                  删除
                </button>
                <input
                  className="mb-3 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-700 dark:bg-slate-950"
                  placeholder="区块标题，如：专利、演讲、志愿者经历"
                  value={item.title}
                  onChange={(e) => set(i, 'title', e.target.value)}
                />
                <textarea
                  value={item.content}
                  onChange={(e) => set(i, 'content', e.target.value)}
                  placeholder="正文内容..."
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  style={{ minHeight: '80px' }}
                />
                <MarkdownHint />
              </div>
            )}
          />
        ) : (
          <p className="text-center text-sm text-slate-400">暂无自定义区块，点击上方按钮添加</p>
        )}
      </div>
    </section>
  )
}

export const CustomSection = memo(CustomSectionComponent)
