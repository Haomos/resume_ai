import { useRef, useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { renderJsonResume, THEME_LIST } from '../../../../templates'
import type { ThemeName, ThemeMeta } from '../../../../templates'
import type { JsonResume } from '../../../../api/types'
import { api } from '../../../../api/client'

export function PrintPreview({
  resume,
  resumeId,
  filename,
  onClose,
  lineHeight = '1.7',
}: {
  resume: JsonResume
  resumeId?: number | string
  filename: string
  onClose: () => void
  lineHeight?: string
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [theme, setTheme] = useState<ThemeName>('default')
  const [fitOnePage, setFitOnePage] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [localLineHeight, setLocalLineHeight] = useState(lineHeight)

  const fullHtml = useMemo(
    () => renderJsonResume(resume, theme, localLineHeight),
    [resume, theme, localLineHeight],
  )

  /** 把当前 zoom 注入 HTML，确保打印/导出/下载和预览完全一致 */
  const getExportHtml = () => {
    if (!fitOnePage || zoom >= 0.999) return fullHtml
    // 给 resume-page 注入 style="zoom: X"
    return fullHtml.replace(
      /<div class="resume-page">/,
      `<div class="resume-page" style="zoom: ${zoom}">`
    )
  }

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(fullHtml)
    doc.close()

    /*
     * §8.13 rewrite. The previous version had two bugs:
     *
     *  1. ``智能一页`` used ``transform: scale``. ``transform`` only re-paints,
     *     it does NOT shrink the layout box, so the printed PDF still split
     *     into 2+ pages even when the on-screen preview looked compressed.
     *
     *  2. The natural-height measurement read ``page.scrollHeight`` while
     *     ``min-height: 297mm`` was still applied, so for any sub-A4 content
     *     the measurement was clamped to 1122 px and ratio came out as 1 →
     *     the feature was a no-op.
     *
     * Fix:
     *  - Use ``zoom`` (W3C-standardised in 2024, layout-affecting on Chrome /
     *    Edge / Firefox 109+ / Safari 14+, **including print output**).
     *  - Temporarily zero ``min-height`` while measuring natural height.
     *  - Drive iframe height from ``doc.body.scrollHeight`` so the preview
     *    grows to fit multi-page content (was the cause of the "second page
     *    cut off / black background bleeding through" complaint).
     *  - Re-sync on content reflow (image base64 decode, font load) via
     *    ResizeObserver, with an ``inSync`` reentrancy guard so the zoom
     *    flip-flop doesn't loop forever.
     */
    let inSync = false
    const sync = () => {
      if (inSync) return
      inSync = true
      requestAnimationFrame(() => {
        try {
          const page = doc.querySelector('.resume-page') as HTMLElement | null
          if (!page) return
          page.style.zoom = ''
          setZoom(1)
          if (fitOnePage) {
            // Measure NATURAL height — temporarily defeat the ``min-height: 297mm``
            // CSS so short résumés don't get the floor treatment.
            const oldMinHeight = page.style.minHeight
            page.style.minHeight = '0px'
            const naturalHeight = page.offsetHeight
            page.style.minHeight = oldMinHeight
            const a4Px = 297 * 3.7795275591 // A4 height in CSS pixels (~1122)
            if (naturalHeight > a4Px) {
              const ratio = a4Px / naturalHeight
              // Floor the zoom — below ~0.55 the text becomes uncomfortably
              // small; better to honour 2-page output than produce a 1-page
              // PDF nobody can read.
              const applied = Math.max(ratio, 0.55)
              page.style.zoom = String(applied)
              setZoom(applied)
            } else {
              setZoom(1)
            }
          }
          // Iframe grows with content (page + body margins) — kills the
          // "黑色背景透出" issue regardless of template.
          iframe.style.height = `${doc.body.scrollHeight}px`
        } finally {
          requestAnimationFrame(() => {
            inSync = false
          })
        }
      })
    }

    // Initial sync (after the freshly-written DOM has laid out).
    sync()
    // Re-sync on layout changes within the iframe.
    const ro = new ResizeObserver(sync)
    ro.observe(doc.body)
    return () => ro.disconnect()
  }, [fullHtml, fitOnePage])

  const handlePrint = () => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    // 打印前先同步 zoom 到 DOM（防止用户点击导出前 zoom state 未同步）
    const doc = iframe.contentDocument
    const page = doc?.querySelector('.resume-page') as HTMLElement | null
    if (page && fitOnePage && zoom < 1) page.style.zoom = String(zoom)
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
  }

  const handleExportPDF = async () => {
    if (!resumeId) return
    try {
      // 用 Playwright 原生 scale 代替 CSS zoom（Chromium 打印时 zoom 不影响分页）
      const blob = await api.resumes.exportPdf(resumeId, fullHtml, `${filename}.pdf`, fitOnePage ? zoom : 1)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error('PDF 导出失败: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleDownloadHTML = () => {
    const exportHtml = getExportHtml()
    const blob = new Blob([exportHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-white">📄 简历打印预览（A4）</h3>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeName)}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200"
          >
            {THEME_LIST.map((t: ThemeMeta) => (
              <option key={t.name} value={t.name}>{t.label}</option>
            ))}
          </select>
          <select
            value={localLineHeight}
            onChange={(e) => setLocalLineHeight(e.target.value)}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200"
            title="行距"
          >
            {['1.5', '1.6', '1.7', '1.8', '1.9', '2.0'].map((lh) => (
              <option key={lh} value={lh}>行距 {lh}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setFitOnePage((p) => !p)}
            className={`rounded border px-2 py-1 text-xs transition-colors ${
              fitOnePage
                ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {fitOnePage ? `📄 智能一页 ${Math.round(zoom * 100)}%` : '📄 智能一页'}
          </button>
          {fitOnePage && zoom <= 0.55 && (
            <span className="text-xs text-amber-400">内容过多，已达最小缩放，建议精简</span>
          )}
          <span className="text-xs text-slate-400">「导出 PDF」由服务端 Playwright 渲染，与预览完全一致</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadHTML}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            ⬇️ 下载 HTML
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            🖨️ 打印
          </button>
          {resumeId && (
            <button
              type="button"
              onClick={handleExportPDF}
              className="rounded-lg bg-seeker-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-seeker-700"
            >
              📄 导出 PDF
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            关闭
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex flex-1 justify-center overflow-auto px-6 pb-6 pt-1">
        <iframe
          ref={iframeRef}
          title="resume-preview"
          className="block rounded shadow-2xl"
          style={{ width: '210mm', minHeight: '297mm', background: '#fff' }}
        />
      </div>
    </div>,
    document.body
  )
}

