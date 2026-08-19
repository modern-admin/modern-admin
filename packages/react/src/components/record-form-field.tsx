// One labelled field on a record form — the edit screen and the create
// wizard render the identical thing, and both need the same accessibility
// wiring, so it lives here rather than being duplicated.
//
// What the wiring buys:
//   * the label's `htmlFor` points at a control that actually exists, so the
//     field has an accessible name (previously every `htmlFor` on these two
//     screens dangled: `<PropertyEditor>` never set an `id`);
//   * composite editors — reference pickers, key-value grids, richtext — are
//     labelled through `role="group"` + `aria-labelledby` instead, because a
//     `<label for>` can only name a single form control;
//   * validation errors are associated via `aria-describedby` and announced
//     through `role="alert"`, and the control is marked `aria-invalid`;
//   * a required field is `aria-required`, not just a red asterisk.

import * as React from 'react'
import {
  Field,
  FieldError,
  FieldLabel,
  FormField,
  InfoTooltip,
} from '@modern-admin/ui'
import type { Control } from 'react-hook-form'
import { PropertyEditor, isGroupPropertyEditor } from '../property-renderer.js'
import type { PropertyJSON } from '../types.js'

export interface RecordFormFieldProps {
  control: Control<Record<string, unknown>>
  property: PropertyJSON
  disabled?: boolean
  resourceId?: string
  /**
   * Distinguishes the ids when two forms with the same properties are on
   * screen at once (e.g. the wizard inside a dialog over the edit page).
   */
  idPrefix?: string
}

export function RecordFormField({
  control,
  property,
  disabled,
  resourceId,
  idPrefix = 'field',
}: RecordFormFieldProps): React.ReactElement {
  // `property.path` can contain dots (`meta.title`); ids allow them.
  const base = `${idPrefix}-${property.path}`
  const controlId = base
  const labelId = `${base}-label`
  const errorId = `${base}-error`
  const isGroup = isGroupPropertyEditor(property)

  return (
    <FormField
      control={control}
      name={property.path}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message
        return (
          <Field
            data-invalid={error ? true : undefined}
            className="mb-8 break-inside-avoid"
            // A composite editor is named by this wrapper's label instead of
            // by `htmlFor`; the group role is what makes that association
            // legal.
            {...(isGroup ? { role: 'group', 'aria-labelledby': labelId } : {})}
          >
            <FieldLabel id={labelId} htmlFor={isGroup ? undefined : controlId}>
              {property.label}
              {property.description ? (
                <InfoTooltip
                  content={property.description}
                  ariaLabel={property.description}
                />
              ) : null}
              {property.isRequired && (
                <span className="ml-1 text-destructive" aria-hidden="true">*</span>
              )}
            </FieldLabel>
            <PropertyEditor
              property={property}
              value={field.value}
              onChange={field.onChange}
              disabled={disabled}
              resourceId={resourceId}
              id={controlId}
              // Deliberately constant, not `error ? errorId : undefined`.
              // Assistive tech ignores an `aria-describedby` pointing at an
              // element that is not in the DOM, and this package's own
              // `FormControl` wires it the same way — whereas a value that
              // flips with validation state is a prop change, and the
              // richtext editor rebuilds its Tiptap instance (losing focus
              // and caret mid-typing) on exactly that.
              describedBy={errorId}
              invalid={Boolean(error)}
              required={property.isRequired}
            />
            {error && (
              <FieldError id={errorId} role="alert">
                {error}
              </FieldError>
            )}
          </Field>
        )
      }}
    />
  )
}
