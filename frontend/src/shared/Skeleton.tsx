import type { ReactNode } from 'react'

/** 轻量 Skeleton 加载占位 — Tailwind animate-pulse */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={'space-y-2 ' + className}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-white/10 animate-pulse" style={{ width: [100, 92, 78, 85][i % 4] + '%' }} />
      ))}
    </div>
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={'rounded-xl border border-white/10 bg-[#111827]/60 p-5 ' + className}>
      <div className="h-5 w-1/3 rounded bg-white/10 animate-pulse mb-4" />
      <SkeletonText lines={3} />
    </div>
  )
}

export function SkeletonPage({ children }: { children?: ReactNode }) {
  return (
    <section className="mx-auto max-w-5xl py-12">
      <div className="h-8 w-1/4 rounded bg-white/10 animate-pulse mb-6" />
      <SkeletonText lines={4} />
      {children}
    </section>
  )
}
