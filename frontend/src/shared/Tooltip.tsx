import type { ReactNode } from 'react'

/** 纯 CSS Tooltip — hover 显示，无 JS 依赖 */
export function Tooltip({ children, tip }: { children: ReactNode; tip: string }) {
  return (
    <span className="group relative inline-block">
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 hidden w-max max-w-[220px] -translate-x-1/2 rounded bg-slate-800 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block dark:bg-slate-700">
        {tip}
        <span className="absolute -top-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-800 dark:border-b-slate-700" />
      </span>
    </span>
  )
}
