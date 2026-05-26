/**
 * Parse AI suggestion path like "work[0].summary" or "basics.summary"
 * into structured tokens for inline rendering.
 */
export interface ParsedSuggestionPath {
  section: string
  index: number | null
  field: string
}

export function parseSuggestionPath(path: string): ParsedSuggestionPath | null {
  // Array path: work[0].summary, work[0].highlights[0], projects[1].description
  const arrMatch = path.match(/^([a-zA-Z]+)\[(\d+)\]\.(.+)$/)
  if (arrMatch) {
    return {
      section: arrMatch[1],
      index: parseInt(arrMatch[2], 10),
      // Strip trailing nested array index: highlights[0] → highlights
      field: arrMatch[3].replace(/\[\d+\]$/, ''),
    }
  }
  // Scalar path: basics.summary, basics.name
  const scalarMatch = path.match(/^([a-zA-Z]+)\.(.+)$/)
  if (scalarMatch) {
    return {
      section: scalarMatch[1],
      index: null,
      field: scalarMatch[2],
    }
  }
  return null
}
