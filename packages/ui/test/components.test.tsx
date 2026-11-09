import './dom.js'
import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import * as React from 'react'
const { cleanup, fireEvent, render, screen, waitFor, act } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
import { useForm } from 'react-hook-form'
import { mergeRefs } from '../src/lib/floating-layer.js'
import { TooltipProvider } from '../src/components/tooltip.js'
import { RadioGroup, RadioGroupItem } from '../src/components/radio-group.js'
import { ToggleGroup, ToggleGroupItem } from '../src/components/toggle-group.js'
import { Progress } from '../src/components/progress.js'
import { Slider } from '../src/components/slider.js'
import { Button } from '../src/components/button.js'
import { Input } from '../src/components/input.js'
import { PasswordInput } from '../src/components/password-input.js'
import { Combobox } from '../src/components/combobox.js'
import { DatePicker } from '../src/components/date-picker.js'
import { DateRangeInput } from '../src/components/date-range-input.js'
import { JsonEditor } from '../src/components/json-editor.js'
import { ColorSwatchPicker } from '../src/components/color-swatch-picker.js'
import { FileInput } from '../src/components/file-input.js'
import { KeyValueEditor, type KeyValueEditorHandle } from '../src/components/key-value-editor.js'
import { Pagination, getPageWindow } from '../src/components/pagination.js'
import {
  Form,
  FormField,
  FormItem,
  FormControl,
  FormDescription,
  FormMessage,
} from '../src/components/form.js'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../src/components/select.js'

afterEach(cleanup)
afterAll(() => GlobalRegistrator.unregister())

test('composed refs invoke React 19 cleanup and clear object/legacy refs', () => {
  const objectRef = React.createRef<HTMLInputElement>()
  const seen: Array<HTMLInputElement | null> = []
  let cleanups = 0
  const callback = mergeRefs(
    objectRef,
    (node) => {
      seen.push(node)
    },
    () => () => {
      cleanups++
    },
  )
  const node = document.createElement('input')
  const cleanupRef = callback(node)
  expect(objectRef.current).toBe(node)
  if (typeof cleanupRef !== 'function') throw new Error('Missing ref cleanup')
  cleanupRef()
  expect(objectRef.current).toBeNull()
  expect(seen).toEqual([node, null])
  expect(cleanups).toBe(1)
})

for (const mode of ['date', 'datetime'] as const) {
  test(`required ${mode} fields reach form validation and receive focus on submit`, async () => {
    function Example() {
      const form = useForm({ defaultValues: { date: '' } })
      return (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(() => {})}>
            <FormField
              control={form.control}
              name="date"
              rules={{ required: true }}
              render={({ field, fieldState }) => (
                <DatePicker
                  {...field}
                  mode={mode}
                  required
                  aria-label="Date"
                  invalid={fieldState.invalid}
                />
              )}
            />
            <Button type="submit">Submit</Button>
          </form>
        </Form>
      )
    }
    render(<Example />)
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Date' })),
    )
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement?.getAttribute('aria-required')).toBe('true')
  })
}

test('key/value focus skips description buttons', () => {
  const ref = React.createRef<KeyValueEditorHandle>()
  render(
    <TooltipProvider>
      <KeyValueEditor
        ref={ref}
        fields={[{ key: 'name', label: 'Name', type: 'string', description: 'A hint' }]}
        value={{}}
        onChange={() => {}}
      />
    </TooltipProvider>,
  )
  act(() => ref.current?.focus())
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }))
})

test('radio and toggle groups expose selection', async () => {
  const user = userEvent.setup()
  render(
    <>
      <RadioGroup defaultValue="a" aria-label="Choice">
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>
      <ToggleGroup type="single" defaultValue="a" aria-label="View">
        <ToggleGroupItem value="a">First</ToggleGroupItem>
        <ToggleGroupItem value="b">Second</ToggleGroupItem>
      </ToggleGroup>
    </>,
  )
  await user.click(screen.getByRole('radio', { name: 'B' }))
  expect(screen.getByRole('radio', { name: 'B' }).getAttribute('aria-checked')).toBe('true')
  await user.click(screen.getByText('Second'))
  expect(screen.getByText('Second').getAttribute('aria-checked')).toBe('true')
})

test('progress clamps invalid bounds consistently for visuals and ARIA', () => {
  const { rerender } = render(<Progress value={200} max={0} aria-label="Upload" />)
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
  expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('100')
  rerender(<Progress value={null} aria-label="Upload" />)
  expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false)
})

test('slider thumbs receive their accessible name from an external label', async () => {
  const { rerender } = render(
    <>
      <span id="volume-label">Volume</span>
      <Slider aria-labelledby="volume-label" defaultValue={[50]} />
    </>,
  )
  const slider = screen.getByRole('slider', { name: 'Volume' })
  await userEvent.tab()
  expect(document.activeElement).toBe(slider)
  rerender(<Slider aria-label="Brightness" defaultValue={[50]} />)
  expect(screen.getByRole('slider', { name: 'Brightness' })).toBeDefined()
  rerender(<Slider key="range" defaultValue={[20, 80]} thumbLabels={['Minimum', 'Maximum']} />)
  expect(screen.getByRole('slider', { name: 'Minimum' })).toBeDefined()
  expect(screen.getByRole('slider', { name: 'Maximum' })).toBeDefined()
})

describe('button loading', () => {
  test('preserves component labels and prevents duplicate submissions', async () => {
    let clicks = 0
    function Label() {
      return <>Save record</>
    }
    const { rerender } = render(
      <Button loading onClick={() => clicks++}>
        <Label />
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save record' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    await userEvent.click(button)
    expect(clicks).toBe(0)
    rerender(
      <Button onClick={() => clicks++}>
        <Label />
      </Button>,
    )
    await userEvent.click(button)
    expect(clicks).toBe(1)
  })

  test('blocks slotted links while loading, preserving the link label', () => {
    let clicks = 0
    render(
      <Button asChild loading>
        <a href="#saved" onClick={() => clicks++}>
          Save record
        </a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Save record' })
    expect(link.getAttribute('aria-disabled')).toBe('true')
    expect(fireEvent.click(link)).toBe(false)
    expect(clicks).toBe(0)
  })
})

test('clearable input forwards focus, label and invalid state; read-only fields cannot clear', async () => {
  const ref = React.createRef<HTMLInputElement>()
  let clears = 0
  const props = {
    ref,
    value: 'hello',
    onChange: () => {},
    onClear: () => clears++,
    labels: { clear: 'Effacer' },
    'aria-label': 'Search',
    'aria-invalid': true as const,
  }
  const { rerender } = render(<Input {...props} className="w-64" />)
  act(() => ref.current?.focus())
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search' }))
  expect(ref.current?.getAttribute('aria-invalid')).toBe('true')
  expect(ref.current?.parentElement?.classList.contains('w-64')).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Effacer' }))
  expect(clears).toBe(1)
  expect(document.activeElement).toBe(ref.current)
  rerender(<Input {...props} readOnly />)
  expect(screen.queryByRole('button')).toBeNull()
})

test('password reveal is reachable by keyboard and uses translated labels', async () => {
  const user = userEvent.setup()
  render(<PasswordInput aria-label="Password" labels={{ show: 'Afficher', hide: 'Masquer' }} />)
  await user.tab()
  await user.tab()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Afficher' }))
  await user.keyboard(' ')
  expect(screen.getByLabelText('Password').getAttribute('type')).toBe('text')
  expect(screen.getByRole('button', { name: 'Masquer' }).getAttribute('aria-pressed')).toBe('true')
})

test('combobox exposes its active option, deduplicates suggestions and reopens after Escape', async () => {
  const user = userEvent.setup()
  const ref = React.createRef<HTMLInputElement>()
  let value = ''
  render(
    <Combobox
      ref={ref}
      aria-label="City"
      value=""
      onChange={(next) => {
        value = next
      }}
      suggestions={['Berlin', 'Berlin', 'Paris']}
    />,
  )
  await user.click(screen.getByRole('combobox'))
  expect(screen.getAllByRole('option').length).toBe(2)
  await user.keyboard('{ArrowDown}')
  expect(
    document.getElementById(ref.current!.getAttribute('aria-activedescendant')!)?.textContent,
  ).toBe('Paris')
  expect(
    document.getElementById(ref.current!.getAttribute('aria-controls')!)?.getAttribute('role'),
  ).toBe('listbox')
  await user.keyboard('{Escape}')
  expect(ref.current?.getAttribute('aria-expanded')).toBe('false')
  await user.keyboard('{ArrowDown}{Enter}')
  expect(value).toBe('Paris')
})

test('combobox announces no matches and never references a missing loading listbox', async () => {
  const { rerender } = render(
    <Combobox
      aria-label="City"
      value="Rome"
      onChange={() => {}}
      suggestions={['Paris']}
      labels={{ noMatches: 'No city: {value}' }}
    />,
  )
  await userEvent.click(screen.getByRole('combobox'))
  expect(screen.getByRole('status').textContent).toBe('No city: Rome')
  rerender(<Combobox aria-label="City" value="Rome" onChange={() => {}} loading />)
  const controls = screen.getByRole('combobox').getAttribute('aria-controls')!
  expect(document.getElementById(controls)).not.toBeNull()
  expect(screen.getByRole('combobox').hasAttribute('aria-activedescendant')).toBe(false)
})

test('date picker commits valid typed dates, rejects impossible dates and restores on blur', () => {
  const values: string[] = []
  const ref = React.createRef<HTMLInputElement>()
  render(
    <DatePicker
      ref={ref}
      aria-label="Date"
      value="2026-11-06"
      onChange={(next) => values.push(next)}
      invalid
    />,
  )
  const input = screen.getByRole('textbox') as HTMLInputElement
  expect(ref.current).toBe(input)
  expect(input.getAttribute('aria-invalid')).toBe('true')
  fireEvent.change(input, { target: { value: '2026-12-25' } })
  expect(values).toEqual(['2026-12-25'])
  fireEvent.change(input, { target: { value: '2026-02-30' } })
  expect(values.length).toBe(1)
  fireEvent.blur(input)
  expect(input.value).toBe('2026-11-06')
  fireEvent.change(input, { target: { value: '' } })
  expect(values.at(-1)).toBe('')
})

test('datetime input emits a UTC instant for local wall time', () => {
  let emitted = ''
  render(
    <DatePicker
      mode="datetime"
      aria-label="Date"
      value=""
      onChange={(next) => {
        emitted = next
      }}
    />,
  )
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '2026-11-06 12:34' } })
  expect(emitted).toBe(new Date(2026, 10, 6, 12, 34).toISOString())
})

test('date range clear is a sibling button and does not open the calendar', async () => {
  let cleared = false
  render(
    <DateRangeInput
      from="2026-11-01"
      to="2026-11-06"
      onChange={(from, to) => {
        cleared = from === '' && to === ''
      }}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
  expect(cleared).toBe(true)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.querySelector('button button')).toBeNull()
})

test('JSON parse errors preserve the last valid value and have an associated message', () => {
  const values: unknown[] = []
  render(<JsonEditor value={{ a: 1 }} onChange={(next) => values.push(next)} aria-label="JSON" />)
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: '{broken' } })
  expect(values).toEqual([])
  expect(input.getAttribute('aria-invalid')).toBe('true')
  const error = document.getElementById(input.getAttribute('aria-describedby')!)
  expect(error?.getAttribute('role')).toBe('alert')
  fireEvent.change(input, { target: { value: '{"a":2}' } })
  expect(values).toEqual([{ a: 2 }])
  expect(input.hasAttribute('aria-invalid')).toBe(false)
})

test('composite field refs focus an actual control', () => {
  const colorRef = React.createRef<HTMLInputElement>()
  const fileRef = React.createRef<HTMLDivElement>()
  const kvRef = React.createRef<KeyValueEditorHandle>()
  render(
    <>
      <ColorSwatchPicker ref={colorRef} presets={['#123456']} onChange={() => {}} invalid />
      <FileInput ref={fileRef} onFileSelect={() => {}} invalid />
      <KeyValueEditor
        ref={kvRef}
        fields={[{ key: 'name', type: 'string', label: 'Name' }]}
        value={{}}
        onChange={() => {}}
        invalid
      />
    </>,
  )
  act(() => colorRef.current?.focus())
  expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true')
  act(() => fileRef.current?.focus())
  expect(document.activeElement).toBe(fileRef.current)
  act(() => kvRef.current?.focus())
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }))
})

test('pagination clamps its window and disables navigation for an empty result', async () => {
  expect(getPageWindow(0, 20, 3)).toEqual([0, 1, 2])
  expect(getPageWindow(19, 20, 3)).toEqual([17, 18, 19])
  let next = -1
  const { rerender } = render(
    <Pagination
      pageIndex={1}
      pageCount={3}
      onPageChange={(value) => {
        next = value
      }}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(next).toBe(2)
  expect(screen.getByRole('button', { name: '2' }).getAttribute('aria-current')).toBe('page')
  rerender(
    <Pagination
      pageIndex={9}
      pageCount={0}
      onPageChange={() => {
        throw new Error('empty navigation')
      }}
    />,
  )
  expect(
    screen.getAllByRole('button').every((button) => (button as HTMLButtonElement).disabled),
  ).toBe(true)
})

test('legacy FormControl describes only mounted description and message nodes', async () => {
  function Example({ description }: { description: boolean }) {
    const form = useForm({ defaultValues: { name: '' } })
    return (
      <Form {...form}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input aria-label="Name" {...field} />
              </FormControl>
              {description && <FormDescription>Hint</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    )
  }
  const { rerender } = render(<Example description={false} />)
  expect(screen.getByRole('textbox').hasAttribute('aria-describedby')).toBe(false)
  rerender(<Example description />)
  await waitFor(() =>
    expect(
      document.getElementById(screen.getByRole('textbox').getAttribute('aria-describedby')!)
        ?.textContent,
    ).toBe('Hint'),
  )
  rerender(<Example description={false} />)
  expect(screen.getByRole('textbox').hasAttribute('aria-describedby')).toBe(false)
})

test('select keeps an externally reset value without emitting an empty selection', async () => {
  const changes: string[] = []
  function Example({ value }: { value: string }) {
    return (
      <form>
        <Select value={value} onValueChange={(next) => changes.push(next)}>
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </form>
    )
  }
  const { rerender } = render(<Example value="new" />)
  rerender(<Example value="done" />)
  await waitFor(() => expect(screen.getByRole('combobox').textContent).toContain('Done'))
  expect(changes).toEqual([])
})
