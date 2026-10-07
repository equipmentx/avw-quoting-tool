'use client'

import { memo } from 'react'
import { useSelectionsStore } from '@/store/selectionsStore'
import RadioGroup from './fields/RadioGroup'
import SelectField from './fields/SelectField'
import NumberField from './fields/NumberField'
import ComboNumberField from './fields/ComboNumberField'
import MultiPartPicker from './fields/MultiPartPicker'
import MultiQtyPicker from './fields/MultiQtyPicker'
import type { EquipmentItem, EquipmentOption } from '@/types/equipment'
import type { SelectedPart } from '@/types/parts'

export const EMPTY_OPTIONS: EquipmentOption[] = []

export function rangeOptions(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, i) => {
    const n = min + i
    return { value: String(n), label: String(n) }
  })
}

/**
 * Memoized catalog field renderer shared by EquipmentTab and BackroomTab.
 * Each instance subscribes only to its own field_key in the store so unrelated
 * field changes don't trigger a re-render of every field on the tab.
 */
const CatalogField = memo(function CatalogField({
  item,
  options,
  visible,
  excludedOptionsKey,
}: {
  item: EquipmentItem
  options: EquipmentOption[]
  visible: boolean
  excludedOptionsKey: string
}) {
  const {
    field_key,
    widget,
    required,
    min,
    max,
    unit,
    allow_none,
    helper_text,
    helper_link_text,
    helper_link_href,
    warning_label,
    readonly,
  } = item.metadata
  const value = useSelectionsStore((s) => s.values[field_key] ?? null)
  const setField = useSelectionsStore((s) => s.setField)

  if (!visible) return null

  // Nothing to render — useApplyForcedValues already drives this field's value via its
  // set_value rule, and it still shows up as its own row in the Quote Summary.
  if (widget === 'hidden') return null

  if (widget === 'pending') {
    return (
      <div>
        <span className="block text-sm font-medium text-ink">
          {item.name}
          {warning_label && <span className="ml-2 text-xs font-semibold text-red-500">{warning_label}</span>}
        </span>
        <p className="mt-1 text-xs italic text-slate-400">Waiting for Scott</p>
      </div>
    )
  }

  if (widget === 'multi_part_picker') {
    return (
      <MultiPartPicker
        label={item.name}
        options={options}
        value={value as SelectedPart[] | null}
        onChange={(parts) => setField(field_key, parts)}
      />
    )
  }

  if (widget === 'multi_qty_picker') {
    return (
      <MultiQtyPicker
        label={item.name}
        options={options}
        value={value as SelectedPart[] | null}
        onChange={(parts) => setField(field_key, parts)}
        max={max}
      />
    )
  }

  if (widget === 'combobox_range') {
    return (
      <ComboNumberField
        label={item.name}
        value={value as string | number | null}
        onChange={(v) => setField(field_key, v)}
        min={min}
        max={max}
        unit={unit}
        allowNone={allow_none}
        helperText={helper_text}
        helperLinkText={helper_link_text}
        helperLinkHref={helper_link_href}
      />
    )
  }

  if (widget === 'text') {
    return (
      <div>
        <label className="block text-sm font-medium text-ink">
          {item.name}
          {required && <span className="ml-1 text-brand">*</span>}
        </label>
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => setField(field_key, e.target.value)}
          readOnly={readonly}
          disabled={readonly}
          className={`mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition ${
            readonly
              ? 'cursor-not-allowed bg-slate-50 text-slate-500'
              : 'text-ink focus:border-brand focus:ring-2 focus:ring-brand/30'
          }`}
        />
      </div>
    )
  }

  if (widget === 'number') {
    return (
      <NumberField
        label={item.name}
        value={value as string | number | null}
        onChange={(v) => setField(field_key, v)}
        min={min}
        max={max}
        unit={unit}
        allowNone={allow_none}
        helperText={helper_text}
      />
    )
  }

  const excluded = new Set(excludedOptionsKey ? excludedOptionsKey.split(',') : [])
  const fieldOptions =
    widget === 'select_range' && min !== undefined && max !== undefined
      ? rangeOptions(min, max)
      : options
          .filter((o) => !excluded.has(o.option_value))
          .map((o) => ({ value: o.option_value, label: o.option_label }))

  if (widget === 'select' || widget === 'select_range') {
    return (
      <SelectField
        label={item.name}
        required={required}
        warningLabel={warning_label}
        options={fieldOptions}
        value={value as string | null}
        onChange={(v) => setField(field_key, v)}
      />
    )
  }

  return (
    <RadioGroup
      name={field_key}
      label={item.name}
      required={required}
      warningLabel={warning_label}
      options={fieldOptions}
      value={value as string | null}
      onChange={(v) => setField(field_key, v)}
    />
  )
})

export default CatalogField
