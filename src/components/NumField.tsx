import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number | null
  onChange: (n: number | null) => void
  placeholder?: string
  className?: string
  'aria-label'?: string
}

const show = (n: number | null) => (n == null || n === 0 ? '' : String(n))

/**
 * Number input that keeps the raw text while typing (so "0." or "" don't snap back)
 * and reports a parsed number, or null when empty.
 */
export function NumField({ value, onChange, placeholder, className = 'input num', ...rest }: Props) {
  const [text, setText] = useState(show(value))
  const emitted = useRef(value)

  // Resync only when the value changes from outside (not from our own typing).
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value
      setText(show(value))
    }
  }, [value])

  return (
    <input
      {...rest}
      className={className}
      inputMode="decimal"
      placeholder={placeholder ?? '0'}
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.]/g, '')
        setText(t)
        const n = t === '' ? null : Number(t)
        if (n === null || !Number.isNaN(n)) {
          emitted.current = n
          onChange(n)
        }
      }}
    />
  )
}
