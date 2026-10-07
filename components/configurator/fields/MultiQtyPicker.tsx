'use client'

import { useState } from 'react'
import { usePartsByNumbers } from '@/lib/catalog/usePartsByNumbers'
import type { EquipmentOption } from '@/types/equipment'
import type { SelectedPart } from '@/types/parts'

/**
 * Multi-select with an independent, user-editable quantity per selected option — e.g. Hydraulic
 * Units (pick any combination of port sizes, each with its own quantity), Heated Dryers (Driver
 * / Passenger) or Shower Rinse Manifolds (1-5 rows). `option_label` is the short text shown in
 * the UI (e.g. "Driver (Left)"); the real, full Items.xlsx description shown in the Quote
 * Summary comes from the `parts` table lookup below, falling back to `option_label` for any
 * option not in that table yet. Stores its value as SelectedPart[] so it slots into the existing
 * multi_part_picker Quote Summary rendering and selectionsPartsTotal pricing with zero changes
 * to either.
 *
 * Picking an option opens QuantityModal (same visual language as MultiPartPicker's choice
 * modals) rather than an inline number input next to the checkbox — a bare input squeezed onto
 * a row is easy to miss entirely and doesn't match how every other choice in this app is made.
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

  const { parts: realParts } = usePartsByNumbers(pickableOptions.map((o) => o.option_value))
  const realPartByNumber = new Map(realParts.map((p) => [p.part_number, p]))

  // Awaiting a quantity pick for one option — 'add' (not yet selected, Cancel leaves it
  // unselected) or 'edit' (already selected, reopened to change its quantity).
  const [pending, setPending] = useState<{ option: EquipmentOption; mode: 'add' | 'edit' } | null>(null)

  function confirmQuantity(quantity: number) {
    if (!pending) return
    const { option, mode } = pending
    if (mode === 'edit') {
      onChange(selected.map((p) => (p.part_number === option.option_value ? { ...p, quantity } : p)))
    } else {
      const real = realPartByNumber.get(option.option_value)
      const part: SelectedPart = {
        part_number: option.option_value,
        description: real?.description ?? option.option_label,
        unit_price: real?.unit_price ?? option.price_modifier,
        image_url: real?.image_url ?? null,
        quantity,
      }
      onChange([...selected, part])
    }
    setPending(null)
  }

  function remove(partNumber: string) {
    onChange(selected.filter((p) => p.part_number !== partNumber))
  }

  return (
    <div>
      <label className="block text-sm font-medium text-ink">{label}</label>
      {selected.length > 0 && <p className="mt-1 text-xs text-slate-500">{selected.length} selected</p>}
      {/* Each option is its own pill sized to its own text (inline-flex in a wrapping flex
          row), not a block-level row stretched to the field's full width — a 2-word option
          like "1 Row 90" LG" shouldn't render as a wide empty bar. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {pickableOptions.map((option) => {
          const picked = selectedByNumber.get(option.option_value)
          const isSelected = !!picked
          return (
            <div
              key={option.id}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 transition ${
                isSelected ? 'border-brand bg-mist' : 'border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  isSelected ? remove(option.option_value) : setPending({ option, mode: 'add' })
                }
                className="flex items-center gap-2 text-left text-sm text-ink"
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border-2 text-[10px] font-bold text-white ${
                    isSelected ? 'border-brand bg-brand' : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && '✓'}
                </span>
                <span className="whitespace-nowrap">{option.option_label}</span>
              </button>
              {isSelected && (
                <button
                  type="button"
                  onClick={() => setPending({ option, mode: 'edit' })}
                  className="shrink-0 rounded-full border border-brand/30 bg-white px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-mist"
                >
                  Qty: {picked.quantity ?? 1}
                </button>
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
      {pending && (
        <QuantityModal
          heading={pending.option.option_label}
          max={max}
          current={selectedByNumber.get(pending.option.option_value)?.quantity ?? 1}
          onChoose={confirmQuantity}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}

// Same visual language as MultiPartPicker's choice modals (SubgroupChoiceModal/
// BundleChoiceModal) — a centered card with one row of buttons — so every "pick one of a few
// things" prompt in the configurator looks like it belongs to the same app.
function QuantityModal({
  heading,
  max,
  current,
  onChoose,
  onCancel,
}: {
  heading: string
  // Defined (small — 2, 5) -> a button per number, same look as MultiPartPicker's choice
  // modals. Undefined (Hydraulic Units, Misc Blower Items never had a ceiling) -> a plain
  // number input instead of guessing an arbitrary button-grid cap.
  max?: number
  current: number
  onChoose: (quantity: number) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(String(current))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl">
        <p className="text-sm font-semibold text-ink">{heading}</p>
        <p className="mt-1 text-xs text-slate-500">How many?</p>
        {max !== undefined ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChoose(n)}
                className={`flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium transition ${
                  n === current
                    ? 'border-brand bg-mist text-ink'
                    : 'border-slate-200 text-ink hover:border-brand hover:bg-mist'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={1}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
            <button
              type="button"
              onClick={() => onChoose(Math.max(1, Math.round(Number(draft)) || 1))}
              className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink"
            >
              Confirm
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-mist"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
