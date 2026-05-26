import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../../../api/client'
import type { ResumeResponse, JsonResume } from '../../../api/types'
import { renderJsonResume } from '../../../templates'

interface ResultFooterProps {
  snapshot: ResumeResponse
  snapshotData: JsonResume
  onClose: () => void
}

export function ResultFooter({ snapshot, snapshotData, onClose }: ResultFooterProps) {
  const handleExportPdf = async () => {
    try {
      const html = renderJsonResume(snapshotData, 'default')
      const blob = await api.resumes.exportPdf(
        snapshot.id,
        html,
        snapshot.filename.replace(/\.pdf$/, '') || 'resume'
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = snapshot.filename || 'resume.pdf'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF 导出成功')
    } catch (err) {
      toast.error('导出失败: ' + (err instanceof Error ? err.message : 'unknown'))
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Link
          to={`/seeker/resumes/${snapshot.id}`}
          onClick={onClose}
          className="rounded-lg bg-seeker-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700"
        >
          ✏️ 去编辑
        </Link>
        <button
          type="button"
          onClick={handleExportPdf}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          📄 导出 PDF
        </button>
      </div>
      <div className="text-xs text-slate-500">
        <span>快照 ID: #{snapshot.id}</span>
        <span className="ml-2">生成时间: {new Date(snapshot.created_at).toLocaleString()}</span>
      </div>
    </div>
  )
}
