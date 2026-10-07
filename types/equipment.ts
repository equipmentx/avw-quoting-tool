export type FieldWidget =
  | 'text'
  | 'radio'
  | 'select'
  | 'number'
  | 'select_range'
  | 'combobox_range'
  | 'pending'
  | 'multi_part_picker'
  | 'multi_qty_picker'
  // A field whose value is always set by a set_value rule (e.g. Avalanche's Yes -> J3179) and
  // never shown to the user — there's nothing to pick, so a visible "Yes" radio or a long part
  // description would just be clutter. Still a normal row in the Quote Summary.
  | 'hidden'

export interface EquipmentItemMetadata {
  field_key: string
  widget: FieldWidget
  required?: boolean
  helper_text?: string
  helper_link_text?: string
  helper_link_href?: string
  // Small red label next to the field's own label, for fields still missing real logic/data
  // (e.g. a stub question) — see components/configurator/fields/RadioGroup.tsx.
  warning_label?: string
  // text widget only — renders disabled/greyed; value is derived (see useApplyForcedValues),
  // never typed by the user.
  readonly?: boolean
  // number / combobox_range widgets
  min?: number
  max?: number
  unit?: string
  allow_none?: boolean
}

export interface Category {
  id: string
  tab: string
  section: string
  display_name: string
  sort_order: number
}

export interface EquipmentItem {
  id: string
  sku: string
  name: string
  description: string | null
  category_id: string | null
  unit_price: number
  is_active: boolean
  metadata: EquipmentItemMetadata
}

export interface EquipmentOption {
  id: string
  item_id: string
  option_key: string
  option_label: string
  option_value: string
  price_modifier: number
  sort_order: number
}

export type RuleActionType = 'show' | 'hide' | 'require' | 'set_value' | 'exclude'

export interface DependencyRule {
  id: string
  rule_name: string
  trigger_field: string
  trigger_value: string
  action_type: RuleActionType
  target_field: string
  target_value: string | null
}
