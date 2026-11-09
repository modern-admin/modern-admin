// Password field with a built-in show/hide toggle. Drops in anywhere a
// regular <Input type="password" /> would — `ref`, `id` and `aria-*` land on
// the `<input>`; `className` styles the visible box (see `InputGroup`).

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group.js'

export interface PasswordInputLabels {
  /** Accessible label of the toggle while the value is hidden. Default: 'Show password'. */
  show?: string
  /** Accessible label of the toggle while the value is visible. Default: 'Hide password'. */
  hide?: string
}

export interface PasswordInputProps extends Omit<React.ComponentProps<'input'>, 'type'> {
  labels?: PasswordInputLabels
  invalid?: boolean
  /** @deprecated Use `labels` — same shape. */
  toggleLabel?: { show: string; hide: string }
}

export function PasswordInput({
  className,
  labels,
  toggleLabel,
  disabled,
  invalid,
  ...props
}: PasswordInputProps): React.ReactElement {
  const [revealed, setRevealed] = React.useState(false)
  const l = {
    show: labels?.show ?? toggleLabel?.show ?? 'Show password',
    hide: labels?.hide ?? toggleLabel?.hide ?? 'Hide password',
  }
  return (
    <InputGroup className={className}>
      <InputGroupInput
        type={revealed ? 'text' : 'password'}
        disabled={disabled}
        {...props}
        aria-invalid={invalid || props['aria-invalid'] || undefined}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          onClick={() => setRevealed((v) => !v)}
          disabled={disabled}
          aria-label={revealed ? l.hide : l.show}
          aria-pressed={revealed}
        >
          {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
