import { useRef } from 'react'
import { useAuthContext } from '@/hooks/useAuthContext'
import { exportPortfolioExcel, importPortfolioExcel } from '@/lib/excel'
import { canPersistToSupabase, importPortfolioToSupabase } from '@/lib/portfolioApi'
import type { PortfolioData } from '@/types/domain'

export interface ImportExportButtonsProps {
  portfolio: PortfolioData
  onImport: (data: PortfolioData) => void
  compact?: boolean
}

export function ImportExportButtons({ portfolio, onImport, compact }: ImportExportButtonsProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { isAuthenticated } = useAuthContext()

  const handleExport = () => {
    exportPortfolioExcel(portfolio)
  }

  const handleFile = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const data = importPortfolioExcel(buffer)
    if (canPersistToSupabase(isAuthenticated)) {
      await importPortfolioToSupabase(data)
    }
    onImport(data)
  }

  return (
    <>
      <button
        type="button"
        className={`btn-action${compact ? '' : ' primary'}`}
        onClick={handleExport}
        title="Export portfolio to Excel"
      >
        Export
      </button>
      <button
        type="button"
        className="btn-action"
        onClick={() => inputRef.current?.click()}
        title="Import Excel (Buildings, RTUs, Tenants, Polygons, Utilities)"
      >
        Import
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
