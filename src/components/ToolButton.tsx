import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: ReactNode
  shortcut?: string
  active?: boolean
  variant?: 'ghost' | 'primary' | 'danger'
}

export function ToolButton({ label, icon, shortcut, active, variant = 'ghost', className = '', ...props }: ToolButtonProps) {
  return (
    <button className={`tool-button ${variant} ${active ? 'active' : ''} ${className}`} aria-label={label} data-tooltip={shortcut ? `${label} · ${shortcut}` : label} {...props}>
      {icon}
    </button>
  )
}
