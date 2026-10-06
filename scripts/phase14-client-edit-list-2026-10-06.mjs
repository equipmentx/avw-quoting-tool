// AVW Quoting Tool — Phase 14 batch fixes (2026-10-06 client edit list)
// Idempotent: every block deletes-before-inserting or updates by stable key, safe to re-run.
// Run with: node scripts/phase14-client-edit-list-2026-10-06.mjs
//
// Part numbers, descriptions and prices are taken verbatim from Items.xlsx (Desktop), not from
// the client's pasted text (PDF extraction mangled "DJTE" as "D..TE" / "D􀁊TE" etc.):
//   J3179 3696 · RC4A 2693 · RC3DG-UHMW 1373 · AA5D-1..5 900 each · AA5B-C 1638
//   DJTE-95L 17474.54 · DJTE-95R 17051.13
//
// Summary of changes:
//  1. Belt Texture: "Diamond Plate — discuss autopopulate/pricing with sales" -> "Diamond Plate".
//  2. Mitters Selection: remove DM2-EL, DMM5, DMM5-EL.
//  3. Shower Rinse Manifolds: 1..5 row options, multi-select, quantity 1-5 each.
//  4. Mirror Rinse: Yes/No; Yes auto-selects AA5B-C.
//  5. Avalanche: Yes auto-selects J3179 (the Yes/No row itself no longer shows in the summary).
//  6. Roller Correlator: Yes auto-selects RC4A; new Guide Rollers Yes/No; Yes auto-selects RC3DG-UHMW.
//     The old Roller Correlator Selection picker is kept as a permanently hidden legacy field so
//     saved quotes that stored RC4A under the old key have it cleared (no double count).
//  7. Heated Dryers: Yes/No; Yes -> Driver (DJTE-95L) / Passenger (DJTE-95R) multi-select, each with
//     quantity 1-2. Old "How Many" radio and Description text removed.
//  8. CTA / other Yes gates: the Yes row itself is suppressed in the Quote Summary (code change in
//     lib/quote/buildQuoteDocument.ts), so only the selected sub-options appear.

import { readFileSync } from 'fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function step(label, fn) {
  process.stdout.write(`\n--- ${label} ---\n`)
  await fn()
}

async function getItemBySku(sku) {
  const { data, error } = await supabase.from('equipment_items').select('*').eq('sku', sku).single()
  if (error) throw error
  return data
}

// rows: [label, value, price_modifier]
async function replaceOptionsWithPrice(itemId, optionKey, rows) {
  const del = await supabase.from('equipment_options').delete().eq('item_id', itemId)
  if (del.error) throw del.error
  if (rows.length === 0) return
  const ins = await supabase.from('equipment_options').insert(
    rows.map((r, i) => ({
      item_id: itemId,
      option_key: optionKey,
      option_label: r[0],
      option_value: r[1],
      price_modifier: r[2],
      sort_order: i + 1,
    }))
  )
  if (ins.error) throw ins.error
}

async function upsertItem({ sku, name, category_id, metadata }) {
  const { data: existing } = await supabase.from('equipment_items').select('id').eq('sku', sku).maybeSingle()
  if (existing) {
    const upd = await supabase.from('equipment_items').update({ name, category_id, metadata }).eq('id', existing.id)
    if (upd.error) throw upd.error
    return existing.id
  }
  const ins = await supabase.from('equipment_items').insert({ sku, name, category_id, metadata }).select('id').single()
  if (ins.error) throw ins.error
  return ins.data.id
}

async function upsertDependencyRule(rule) {
  const { data: existing } = await supabase.from('dependency_rules').select('id').eq('rule_name', rule.rule_name).maybeSingle()
  if (existing) {
    const upd = await supabase.from('dependency_rules').update(rule).eq('id', existing.id)
    if (upd.error) throw upd.error
  } else {
    const ins = await supabase.from('dependency_rules').insert(rule)
    if (ins.error) throw ins.error
  }
}

async function deleteRuleByName(rule_name) {
  const del = await supabase.from('dependency_rules').delete().eq('rule_name', rule_name)
  if (del.error) throw del.error
}

async function deleteItemBySku(sku) {
  const { data: item } = await supabase.from('equipment_items').select('id').eq('sku', sku).maybeSingle()
  if (!item) return
  const delOpts = await supabase.from('equipment_options').delete().eq('item_id', item.id)
  if (delOpts.error) throw delOpts.error
  const delItem = await supabase.from('equipment_items').delete().eq('id', item.id)
  if (delItem.error) throw delItem.error
}

// Yes/No gate reveals a single-option radio whose one choice is set automatically when the gate
// is Yes (same set_value pattern as Belt Texture -> Diamond Plate, migration phase13 step 1).
async function autoSelectPartRules({ base, gateField, partField, partValue }) {
  await upsertDependencyRule({
    rule_name: `${base}_show`,
    trigger_field: gateField,
    trigger_value: 'yes',
    action_type: 'show',
    target_field: partField,
    target_value: null,
  })
  await upsertDependencyRule({
    rule_name: `${base}_set`,
    trigger_field: gateField,
    trigger_value: 'yes',
    action_type: 'set_value',
    target_field: partField,
    target_value: partValue,
  })
}

const AVALANCHE_DESC =
  '"Avalanche", With 2 Row Rain Manifold (Specify Mounting Option & Operation), Shower Manifold Deflector Attachment J3179A  - Shower Rinse Top Manifold Assembly, SS, 90" LG. (2 rows) AA5D-2; Foam Generator, Stainless Steel SF1117AAG (Quantity of 3) (Omit...'
const MIRROR_RINSE_DESC =
  'Set-Adjustable Angle Mirror Rinse, 3/4" Pipe Manifold, (9) 1/4" Half Couplings, Mounting Plate, Brackets and Fasteners, Passenger and Driver Side'
const GUIDE_RAIL_DESC = 'Roller Correlator Guide Rail Set w/ UHMW Covers'
const RC4A_DESC = 'Roller Correlator, One Side Only, 2-1/2" Sch 10 Rollers, Frames, SS'
const DRIVER_DESC = 'Solaronic Heater-Door Jet Natural Gas, Left, 950,000 BTUH; Includes IAG, Limit Switch, and Roller Arm'
const PASSENGER_DESC = 'Solaronic Heater-Door Jet Natural Gas, Right, 950,000 BTUH; Includes IAG, Limit Switch, and Roller Arm'

// ── 1. Belt Texture: Diamond Plate only ────────────────────────────────────────────────────
await step('1. Belt Texture -> Diamond Plate', async () => {
  const item = await getItemBySku('EQ-CONV-001A')
  await replaceOptionsWithPrice(item.id, 'belt_texture', [['Diamond Plate', 'diamond_plate', 0]])
  console.log('done')
})

// ── 2. Mitters Selection: remove DM2-EL, DMM5, DMM5-EL ─────────────────────────────────────
await step('2. Mitters Selection: remove DM2-EL, DMM5, DMM5-EL', async () => {
  const item = await getItemBySku('EQ-FRIC-006A')
  const del = await supabase
    .from('equipment_options')
    .delete()
    .eq('item_id', item.id)
    .in('option_value', ['DM2-EL', 'DMM5', 'DMM5-EL'])
  if (del.error) throw del.error
  console.log('done')
})

// ── 3. Shower Rinse Manifolds: 1-5 row multi-select, quantity 1-5 each ─────────────────────
await step('3. Shower Rinse Manifolds -> multi_qty_picker, 1-5 rows', async () => {
  const item = await getItemBySku('EQ-FRIN-002A')
  const upd = await supabase
    .from('equipment_items')
    .update({ metadata: { widget: 'multi_qty_picker', field_key: 'shower_rinse_manifolds_parts', max: 5 } })
    .eq('id', item.id)
  if (upd.error) throw upd.error
  await replaceOptionsWithPrice(item.id, 'shower_rinse_manifolds_parts', [
    ['1 row, 90" LG', 'AA5D-1', 900],
    ['2 row, 90" LG', 'AA5D-2', 900],
    ['3 row, 90" LG', 'AA5D-3', 900],
    ['4 row, 90" LG', 'AA5D-4', 900],
    ['5 row, 90" LG', 'AA5D-5', 900],
  ])
  console.log('done')
})

// ── 4. Mirror Rinse: Yes/No, Yes -> AA5B-C ─────────────────────────────────────────────────
await step('4. Mirror Rinse Yes/No -> AA5B-C', async () => {
  const gate = await getItemBySku('EQ-FRIN-003')
  const gateUpd = await supabase
    .from('equipment_items')
    .update({ metadata: { ...gate.metadata, widget: 'radio' } })
    .eq('id', gate.id)
  if (gateUpd.error) throw gateUpd.error
  await replaceOptionsWithPrice(gate.id, 'mirror_rinse', [
    ['Yes', 'yes', 0],
    ['No', 'no', 0],
  ])

  const partId = await upsertItem({
    sku: 'EQ-FRIN-003A',
    name: 'Mirror Rinse Set',
    category_id: gate.category_id,
    metadata: { widget: 'radio', field_key: 'mirror_rinse_part' },
  })
  await replaceOptionsWithPrice(partId, 'mirror_rinse_part', [[MIRROR_RINSE_DESC, 'AA5B-C', 1638]])
  await autoSelectPartRules({
    base: 'eq_frin_003a_mirror_rinse_part',
    gateField: 'mirror_rinse',
    partField: 'mirror_rinse_part',
    partValue: 'AA5B-C',
  })
  console.log('done')
})

// ── 5. Avalanche: Yes -> J3179 ─────────────────────────────────────────────────────────────
await step('5. Avalanche Yes -> J3179', async () => {
  const gate = await getItemBySku('EQ-PRESOAK-002')
  await replaceOptionsWithPrice(gate.id, 'avalanche', [
    ['Yes', 'yes', 0],
    ['No', 'no', 0],
  ])

  const partId = await upsertItem({
    sku: 'EQ-PRESOAK-002A',
    name: 'Avalanche Part',
    category_id: gate.category_id,
    metadata: { widget: 'radio', field_key: 'avalanche_part' },
  })
  await replaceOptionsWithPrice(partId, 'avalanche_part', [[AVALANCHE_DESC, 'J3179', 3696]])
  await autoSelectPartRules({
    base: 'eq_presoak_002a_avalanche_part',
    gateField: 'avalanche',
    partField: 'avalanche_part',
    partValue: 'J3179',
  })
  console.log('done')
})

// ── 6. Roller Correlator: Yes -> RC4A; Guide Rollers Yes -> RC3DG-UHMW ──────────────────────
await step('6a. Retire old Roller Correlator Selection picker (hidden, options cleared)', async () => {
  const legacy = await getItemBySku('EQ-BELT-001A')
  await replaceOptionsWithPrice(legacy.id, 'roller_correlator_parts', [])
  // Never-set trigger keeps the field permanently hidden, so useClearHiddenFields wipes any
  // RC4A value a saved quote stored under this key before it can double-count.
  await upsertDependencyRule({
    rule_name: 'eq_belt_001a_roller_correlator_parts_show',
    trigger_field: 'roller_correlator_retired',
    trigger_value: 'yes',
    action_type: 'show',
    target_field: 'roller_correlator_parts',
    target_value: null,
  })
  console.log('done')
})

await step('6b. Roller Correlator -> RC4A auto-selected', async () => {
  const gate = await getItemBySku('EQ-BELT-001')
  const partId = await upsertItem({
    sku: 'EQ-BELT-001C',
    name: 'Roller Correlator Model',
    category_id: gate.category_id,
    metadata: { widget: 'radio', field_key: 'roller_correlator_rc4a' },
  })
  await replaceOptionsWithPrice(partId, 'roller_correlator_rc4a', [[RC4A_DESC, 'RC4A', 2693]])
  await autoSelectPartRules({
    base: 'eq_belt_001c_roller_correlator_rc4a',
    gateField: 'roller_correlator',
    partField: 'roller_correlator_rc4a',
    partValue: 'RC4A',
  })
  console.log('done')
})

await step('6c. Guide Rollers Yes/No (shown when Roller Correlator is Yes)', async () => {
  const gate = await getItemBySku('EQ-BELT-001')
  const guideId = await upsertItem({
    sku: 'EQ-BELT-001B',
    name: 'Guide Rollers',
    category_id: gate.category_id,
    metadata: { widget: 'radio', field_key: 'guide_rollers' },
  })
  await replaceOptionsWithPrice(guideId, 'guide_rollers', [
    ['Yes', 'yes', 0],
    ['No', 'no', 0],
  ])
  await upsertDependencyRule({
    rule_name: 'eq_belt_001b_guide_rollers_show',
    trigger_field: 'roller_correlator',
    trigger_value: 'yes',
    action_type: 'show',
    target_field: 'guide_rollers',
    target_value: null,
  })
  console.log('done')
})

await step('6d. Guide Rollers Yes -> RC3DG-UHMW auto-selected', async () => {
  const gate = await getItemBySku('EQ-BELT-001')
  const partId = await upsertItem({
    sku: 'EQ-BELT-001D',
    name: 'Guide Rail Set',
    category_id: gate.category_id,
    metadata: { widget: 'radio', field_key: 'guide_rollers_part' },
  })
  await replaceOptionsWithPrice(partId, 'guide_rollers_part', [[GUIDE_RAIL_DESC, 'RC3DG-UHMW', 1373]])
  await autoSelectPartRules({
    base: 'eq_belt_001d_guide_rollers_part',
    gateField: 'guide_rollers',
    partField: 'guide_rollers_part',
    partValue: 'RC3DG-UHMW',
  })
  console.log('done')
})

// ── 7. Heated Dryers: Yes -> Driver / Passenger multi-select, quantity 1-2 each ────────────
await step('7a. Heated Dryers: remove Description text and its set_value rules', async () => {
  for (const n of [1, 2, 3, 4]) await deleteRuleByName(`eq_blow_012b_heated_dryers_description_set_${n}`)
  await deleteItemBySku('EQ-BLOW-012B')
  console.log('done')
})

await step('7b. Heated Dryers: Driver / Passenger multi-select, quantity 1-2', async () => {
  const sides = await getItemBySku('EQ-BLOW-012A')
  const upd = await supabase
    .from('equipment_items')
    .update({
      name: 'Heated Dryer Side',
      metadata: { widget: 'multi_qty_picker', field_key: 'heated_dryers_sides', max: 2 },
    })
    .eq('id', sides.id)
  if (upd.error) throw upd.error
  await replaceOptionsWithPrice(sides.id, 'heated_dryers_sides', [
    [`Driver (left): ${DRIVER_DESC}`, 'DJTE-95L', 17474.54],
    [`Passenger (right): ${PASSENGER_DESC}`, 'DJTE-95R', 17051.13],
  ])
  await upsertDependencyRule({
    rule_name: 'eq_blow_012a_heated_dryers_count_show',
    trigger_field: 'heated_dryers',
    trigger_value: 'yes',
    action_type: 'show',
    target_field: 'heated_dryers_sides',
    target_value: null,
  })
  console.log('done')
})

console.log('\nPhase 14 applied successfully.')
