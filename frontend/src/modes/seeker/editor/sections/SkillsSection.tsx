import type { ResumeSkill } from '../../../../api/types'
import type { ResumeAction } from '../_hooks/useStructuredResume'

export function SkillsSection({ items, dispatch }: { items: ResumeSkill[]; dispatch: (a: ResumeAction) => void }) {
  const set = (idx: number, path: string, value: unknown) => dispatch({ type: 'SET_FIELD', path: `skills[${idx}].${path}`, value })
  const add = () => dispatch({ type: 'ADD_ITEM', section: 'skills', template: { name: '', level: '', keywords: [] } })
  const rm = (idx: number) => dispatch({ type: 'REMOVE_ITEM', section: 'skills', index: idx })

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">🛠 技能</h2>
        <button type="button" onClick={add} className="rounded-md bg-seeker-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-seeker-700">+ 新增</button>
      </header>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
              <input className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="技能名" value={item.name} onChange={(e) => set(i, 'name', e.target.value)} />
              <input className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="熟练度" value={item.level} onChange={(e) => set(i, 'level', e.target.value)} />
            </div>
            <button type="button" onClick={() => rm(i)} className="mt-2 text-xs text-red-500 hover:text-red-700">删除</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-sm text-slate-400">暂无技能列表</p>}
      </div>
    </section>
  )
}
