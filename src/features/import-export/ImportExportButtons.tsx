import { useRef } from 'react'
import { exportPortfolioExcel, importPortfolioExcel } from '@/lib/excel'
import { showToastError, showToastSuccess } from '@/lib/toast'
import type { PortfolioData } from '@/types/domain'

export interface ImportExportButtonsProps {
  portfolio: PortfolioData
  onImport: (data: PortfolioData) => void
  compact?: boolean
}

export function ImportExportButtons({ portfolio, onImport, compact }: ImportExportButtonsProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    exportPortfolioExcel(portfolio)
    showToastSuccess('✓ Excel exported')
  }

  const handleFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer()
      const data = importPortfolioExcel(buffer)
      onImport(data)
      showToastSuccess('✓ Import complete — save to HTML to keep changes.')
    } catch (e) {
      showToastError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn-action${compact ? '' : ' primary'}`}
        onClick={handleExport}
        title="Export portfolio to Excel"
      >
        Export Excel
      </button>
      <button
        type="button"
        className="btn-action"
        onClick={() => inputRef.current?.click()}
        title="Import Excel (Buildings, RTUs, Tenants, Polygons, Utilities)"
      >
        Import Excel
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handleFile(file)
        }}
      />
    </>
  )
}
