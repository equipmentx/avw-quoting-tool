'use client'

import type { EquipmentOption } from '@/types/equipment'
import type { SelectedPart } from '@/types/parts'

/**
 * Multi-select with an independent, user-editable quantity per selected option — e.g. Hydraulic
 * Units (pick any combination of port sizes, each with its own quantity) or Miscellaneous Blower
 * Items (pick any combination of add-ons). Simpler than MultiPartPicker on purpose: no bundle
 * rules, no color modals, no `parts`-table lookup — these are flat-priced `equipment_options`
 * rows. Stores its value as SelectedPart[] so it slots into the existing multi_part_picker Quote
 * Summary rendering and selectionsPartsTotal pricing with zero changes to either.
 *
 * An option with option_value === 'none' renders as a separate "clear all" pill instead of a
 * normal checkbox row — clicking it empties the whole selection rather than being stored as a
 * part, so it can never itself show up as a stray $0 row in the Quote Summary.
 */
export default function MultiQtyPicker({
  label,
  options,
  value,
  onChange,
  max,
}: {
  label: string
  options: EquipmentOption[]
  value: SelectedPart[] | null
  onChange: (parts: SelectedPart[]) => void
  // Optional per-option quantity ceiling (e.g. Shower Rinse Manifolds 1-5, Heated Dryers 1-2).
  max?: number
}) {
  // A field re-typed to multi_qty_picker can still have a leftover plain string/number in the
  // store from before the change (e.g. Hydraulic Units used to be a single-select radio) —
  // treat anything that isn't actually an array as "nothing selected" rather than crashing.
  const selected = Array.isArray(value) ? value : []
  const selectedByNumber = new Map(selected.map((p) => [p.part_number, p]))
  const noneOption = options.find((o) => o.option_value === 'none')
  const pickableOptions = options.filter((o) => o.option_value !== 'none')

  function toggle(option: EquipmentOption) {
    if (selectedByNumber.has(option.option_value)) {
      onChange(selected.filter((p) => p.part_number !== option.option_value))
      return
    }
    const part: SelectedPart = {
      part_number: option.option_value,
      description: option.option_label,
      unit_price: option.price_modifier,
      image_url: null,
      quantity: 1,
    }
    onChange([...selected, part])
  }

  function setQuantity(partNumber: string, quantity: number) {
    const floored = Math.max(1, Math.round(quantity) || 1)
    const clamped = max === undefined ? floored : Math.min(max, floored)
    onChange(selected.map((p) => (p.part_number === partNumber ? { ...p, quantity: clamped } : p)))
  }

  return (
    <div>
      <label className="block text-sm font-medium text-ink">{label}</label>
      {selected.length > 0 && <p className="mt-1 text-xs text-slate-500">{selected.length} selected</p>}
      <div className="mt-2 space-y-2">
        {pickableOptions.map((option) => {
          const picked = selectedByNumber.get(option.option_value)
          const isSelected = !!picked
          return (
            <div
              key={option.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition ${
                isSelected ? 'border-brand bg-mist' : 'border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(option)}
                className="flex flex-1 items-center gap-2 text-left text-sm text-ink"
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border-2 text-[10px] font-bold text-white ${
                    isSelected ? 'border-brand bg-brand' : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && '✓'}
                </span>
                {option.option_label}
              </button>
              {isSelected && (
                <input
                  type="number"
                  min={1}
                  max={max}
                  value={picked.quantity ?? 1}
                  onChange={(e) => setQuantity(option.option_value, Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  className="w-16 shrink-0 rounded-md border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                />
              )}
            </div>
          )
        })}
        {noneOption && (
          <button
            type="button"
            onClick={() => onChange([])}
            className={`w-full rounded-lg border px-3 py-2 text-sm font-medium transition ${
              selected.length === 0
                ? 'border-brand bg-mist text-ink'
                : 'border-slate-200 text-slate-500 hover:bg-mist'
            }`}
          >
            {noneOption.option_label}
          </button>
        )}
      </div>
    </div>
  )
}
