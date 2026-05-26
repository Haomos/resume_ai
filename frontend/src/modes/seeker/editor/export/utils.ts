/** Export a clean filename (yyyymmdd suffix). */
export function resumeFileName(base = 'resume'): string {
  const d = new Date()
  const suffix = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `${base}_${suffix}`
}
