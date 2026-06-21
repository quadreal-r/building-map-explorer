import type { InputHTMLAttributes } from 'react'
import styles from './SearchInput.module.css'

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onValueChange?: (value: string) => void
}

export function SearchInput({
  className,
  onChange,
  onValueChange,
  placeholder = 'Search buildings, RTUs, tenants…',
  ...props
}: SearchInputProps) {
  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
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
        onChange={(event) => {
          onChange?.(event)
          onValueChange?.(event.target.value)
        }}
        {...props}
      />
    </div>
  )
}
