import { type InputHTMLAttributes, type KeyboardEvent } from 'react'
import styles from './SearchInput.module.css'

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onValueChange?: (value: string) => void
  onApply?: () => void
  onClear?: () => void
}

export function SearchInput({
  className,
  value,
  onChange,
  onValueChange,
  onApply,
  onClear,
  placeholder = 'Search address, tenant or RTU…',
  ...props
}: SearchInputProps) {
  const text = typeof value === 'string' ? value : ''
  const showClear = text.length > 0

  const handleClear = () => {
    onValueChange?.('')
    onClear?.()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onApply?.()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      handleClear()
    }
    props.onKeyDown?.(event)
  }

  return (
    <div className={[styles.wrap, 'search-wrap', className].filter(Boolean).join(' ')}>
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3-3" />
      </svg>
      <input
        type="text"
        className={styles.input}
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange?.(event)
          onValueChange?.(event.target.value)
        }}
        onKeyDown={handleKeyDown}
        {...props}
      />
      <button
        type="button"
        id="search-clear"
        className={`search-clear${showClear ? ' show' : ''}`}
        title="Clear search"
        aria-label="Clear search"
        onClick={handleClear}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
