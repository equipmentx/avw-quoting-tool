import type { SelectionValue } from '@/store/selectionsStore'
import type { EquipmentItem, EquipmentOption, DependencyRule } from '@/types/equipment'
import type { LineItem, PartWithImage, SelectedPart } from '@/types/parts'
import { generalFields } from '@/lib/configurator/generalFields'
import { isFieldVisible } from '@/lib/rules/engine'
import { computeQuoteTotal, equipmentOptionsTotal } from '@/lib/pricing'
import {
  buildConveyorDescription,
  conveyorInputsFromSelections,
  CONVEYOR_PART_NUMBER_FIELD_KEYS,
  CONVEYOR_DESCRIPTION_DETAIL_FIELD_KEYS,
} from '@/lib/conveyor/beltPartNumber'
import { buildBlowerPart, blowerInputsFromSelections, BLOWER_PART_NUMBER_FIELD_KEYS } from '@/lib/blower/blowerPartNumber'
import { VACUUM_QUOTE_ITEMS_FIELD } from '@/lib/vacuum/vacuumQuote'
import { QUOTE_COMMENT_FIELD } from '@/lib/configurator/commentFields'

const CONVEYOR_PART_NUMBER_FIELDS = new Set<string>(CONVEYOR_PART_NUMBER_FIELD_KEYS)
const BLOWER_PART_NUMBER_FIELDS = new Set<string>(BLOWER_PART_NUMBER_FIELD_KEYS)

/** "No"/"None" both mean "nothing selected" — skipped from every Quote Summary row. */
function isSkippedValue(raw: unknown): boolean {
  return typeof raw === 'string' && (raw.toLowerCase() === 'no' || raw.toLowerCase() === 'none')
}

/** Rate printed on the generated quote, matching the client's existing quote forms. */
export const SALES_TAX_RATE = 0.06

export interface QuoteHeaderRow {
  key: string
  label: string
  value: string
}

export interface QuoteItemRow {
  key: string
  item: string
  description: string
  quantity: number | null
  unitPrice: number | null
  price: number
}

export interface QuoteDocument {
  customerName: string
  /** Free-text "Ship to Address" split into lines for the quote form's Ship To box. */
  shipToLines: string[]
  headerRows: QuoteHeaderRow[]
  itemRows: QuoteItemRow[]
  /** Committed Comment-tab text (empty until the user clicks Next on that tab). */
  comment: string
  discountPercent: number | null
  /** Post-discount subtotal — the same figure TopBar shows and quotes.total_value stores. */
  subtotal: number
  salesTax: number
  total: number
}

export interface QuoteDocumentInput {
  values: Record<string, SelectionValue>
  lineItems: LineItem[]
  items: EquipmentItem[]
  options: EquipmentOption[]
  rules: DependencyRule[]
  conveyorPartNumber: string | null
  conveyorRealPart: PartWithImage | null
  conveyorPrice: number
}

/**
 * Single source of truth for "what is on this quote": the live Quote Summary panel, the Review
 * page and the generated PDF all render this, so the three can never drift apart. Lifted out of
 * SummaryPanel (where it grew) when Review and PDF export needed the same rows.
 */
export function buildQuoteDocument({
  values,
  lineItems,
  items,
  options,
  rules,
  conveyorPartNumber,
  conveyorRealPart,
  conveyorPrice,
}: QuoteDocumentInput): QuoteDocument {
  // General tab fields (Customer, Ship to Address, drive type, voltages, liftgate) are
  // quote-header attributes, not priced items — shown as a header block, not the item table.
  const headerRows: QuoteHeaderRow[] = []
  let customerName = ''
  let shipToAddress = ''

  for (const field of generalFields) {
    const raw = values[field.key]
    if (raw === null || raw === undefined || raw === '') continue
    if (isSkippedValue(raw)) continue
    const displayValue =
      field.widget === 'text' || field.widget === 'address_autocomplete'
        ? String(raw)
        : (field.options?.find((o) => o.value === raw)?.label ?? String(raw))
    if (field.key === 'customer') {
      customerName = displayValue
      continue
    }
    if (field.key === 'ship_to_address') shipToAddress = displayValue
    headerRows.push({ key: field.key, label: field.label, value: displayValue })
  }

  // Yes/No gate fields (e.g. "Sidewashers", "CTA", "Avalanche") that reveal sub-options are never
  // shown as their own row — "Yes" is just a gate, not a priced selection. Whether the answer is
  // Yes or No, the summary stays silent for the gate; only the sub-options that are actually
  // selected ever appear (added below when each sub-field is processed).
  const suppressedTriggerFields = new Set<string>()
  for (const rule of rules) {
    if (rule.action_type !== 'show' || rule.trigger_value !== 'yes') continue
    suppressedTriggerFields.add(rule.trigger_field)
  }

  const itemRows: QuoteItemRow[] = []

  for (const item of items) {
    const { field_key, widget, unit } = item.metadata
    const raw = values[field_key]
    if (raw === null || raw === undefined || raw === '') continue
    if (isSkippedValue(raw)) continue
    if (widget === 'pending') continue
    if (!isFieldVisible(rules, values, field_key)) continue
    if (suppressedTriggerFields.has(field_key)) continue
    // Series/Drive/Config/Horsepower/Length/Type-of-Steel never show as their own rows — they
    // only ever appear combined into the single generated "Belt Part Number" row below.
    if (CONVEYOR_PART_NUMBER_FIELDS.has(field_key)) continue
    // HP class/Nozzle Orientation/Rotation/Housing Color/Number of Blowers never show as their
    // own rows — they only ever appear combined into the single generated Blower row below.
    if (BLOWER_PART_NUMBER_FIELDS.has(field_key)) continue

    // Robot Arch (and any future multi_part_picker field): show each picked part's own
    // detail row instead of a generic "Yes". The same part can be selectable under more
    // than one picker (e.g. also under Applicator Arches), so the Item column shows the
    // trigger field's name (e.g. "Robot Arch") rather than the bare part number, to make
    // clear which selection each row came from; the part number/description move into
    // the Description column.
    if (widget === 'multi_part_picker' || widget === 'multi_qty_picker') {
      // A field can be re-typed to multi_part_picker/multi_qty_picker after quotes already
      // stored a plain string/number under its field_key (e.g. Hydraulic Units used to be a
      // single-select radio) — treat a non-array leftover as "nothing selected" instead of
      // crashing the whole Quote Summary/Review/PDF on .forEach.
      if (!Array.isArray(raw)) continue
      const rule = rules.find((r) => r.action_type === 'show' && r.target_field === field_key)
      const triggerItem = rule ? items.find((i) => i.metadata.field_key === rule.trigger_field) : null
      const groupLabel = triggerItem?.name ?? item.name
      // Index in the key (not just part_number) because two different trigger parts in the
      // same picker can bundle the same required part (e.g. CB0405 and CB0405-EL both pull in
      // CB0405AMC-23-13 as a core item) — those are legitimately separate rows, one set of
      // cores per unit, not a single merged quantity.
      ;(raw as SelectedPart[]).forEach((part, i) => {
        const quantity = part.quantity ?? 1
        itemRows.push({
          key: `${field_key}:${i}:${part.part_number}`,
          item: part.choice_label ? `${groupLabel} — ${part.choice_label}` : groupLabel,
          description: `${part.part_number} — ${part.description}`,
          quantity,
          unitPrice: part.unit_price,
          price: part.unit_price * quantity,
        })
      })
      continue
    }

    let description: string
    let price = 0
    if (widget === 'number' || widget === 'combobox_range' || widget === 'select_range') {
      description = `${raw}${unit ? ' ' + unit : ''}`
    } else {
      const matchedOption = options.find((o) => o.item_id === item.id && o.option_value === raw)
      price = matchedOption?.price_modifier ?? 0
      // A priced option's option_value is the real part number (e.g. "SOB-RECLAIM-100GPM") — lead
      // the description with it, same "PART# — label" shape multi_part_picker rows use, so a
      // priced radio/select choice is just as traceable to its real part in the Quote Summary.
      description = matchedOption
        ? price
          ? `${matchedOption.option_value} — ${matchedOption.option_label}`
          : matchedOption.option_label
        : String(raw)
    }

    itemRows.push({
      key: field_key,
      item: item.name,
      description,
      quantity: price ? 1 : null,
      unitPrice: price ? price : null,
      price,
    })
  }

  // Real pricing/description from the client's Items export (imported into `parts`) always wins
  // when the exact generated part number has been priced; buildConveyorDescription's formula is
  // only a fallback for combinations with no real match yet (price stays $0 in that case, same
  // "no data = no guessed price" convention used everywhere else in this app).
  if (conveyorPartNumber) {
    const baseDescription =
      conveyorRealPart?.description ?? buildConveyorDescription(conveyorInputsFromSelections(values)) ?? ''
    // Belt Specifications selections fold into the description regardless of whether it came
    // from a real priced part or the fallback formula — the price itself is untouched either way.
    const extraDetails = CONVEYOR_DESCRIPTION_DETAIL_FIELD_KEYS.map((fieldKey) => {
      const detailItem = items.find((i) => i.metadata.field_key === fieldKey)
      if (!detailItem) return null
      const raw = values[fieldKey]
      if (raw === null || raw === undefined || raw === '') return null
      if (isSkippedValue(raw)) return null
      if (!isFieldVisible(rules, values, fieldKey)) return null
      const label =
        options.find((o) => o.item_id === detailItem.id && o.option_value === raw)?.option_label ?? String(raw)
      return `${detailItem.name}: ${label}`
    }).filter((s): s is string => s !== null)
    const description = [baseDescription, ...extraDetails].filter(Boolean).join(', ')
    itemRows.push({
      key: 'conveyor_part_number',
      item: conveyorPartNumber,
      description,
      quantity: 1,
      unitPrice: conveyorPrice,
      price: conveyorPrice,
    })
  }

  // Blower Room: HP class + Nozzle Orientation + Rotation + Housing Color select one exact real
  // part number/price (see lib/blower/blowerPartNumber.ts) — folded into a single row, same
  // pattern as the conveyor part number above. Number of Blowers is the row's quantity.
  const blowerPart = buildBlowerPart(blowerInputsFromSelections(values))
  const blowerQty = Number(values['number_of_blowers']) || 1
  const blowerPrice = blowerPart ? blowerPart.price * blowerQty : 0
  if (blowerPart) {
    itemRows.push({
      key: 'blower_part_number',
      item: blowerPart.partNumber,
      description: blowerPart.description,
      quantity: blowerQty,
      unitPrice: blowerPart.price,
      price: blowerPrice,
    })
  }

  // Vacuum system rows, committed by the Next button on the Vacuum tab. They are stored as
  // SelectedPart[] so computeQuoteTotal's selectionsPartsTotal already counts them in the total.
  const vacuumItems = values[VACUUM_QUOTE_ITEMS_FIELD]
  if (Array.isArray(vacuumItems)) {
    ;(vacuumItems as SelectedPart[]).forEach((part, i) => {
      const quantity = part.quantity ?? 1
      itemRows.push({
        key: `vacuum:${i}:${part.part_number}`,
        item: part.part_number,
        description: part.description,
        quantity,
        unitPrice: part.unit_price,
        price: part.unit_price * quantity,
      })
    })
  }

  for (const line of lineItems) {
    itemRows.push({
      key: line.id,
      item: line.part_number ?? 'Custom',
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      price: line.unit_price * line.quantity,
    })
  }

  const discountPercent = (values['items_discount_percent'] as number | null) ?? null
  const subtotal = computeQuoteTotal(
    lineItems,
    values,
    discountPercent,
    conveyorPrice,
    equipmentOptionsTotal(items, options, values) + blowerPrice
  )
  const salesTax = subtotal * SALES_TAX_RATE
  const comment = typeof values[QUOTE_COMMENT_FIELD] === 'string' ? (values[QUOTE_COMMENT_FIELD] as string) : ''

  return {
    customerName,
    shipToLines: shipToAddress
      .split(/\s*,\s*|\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    headerRows,
    itemRows,
    comment,
    discountPercent,
    subtotal,
    salesTax,
    total: subtotal + salesTax,
  }
}
