// AVW Quoting Tool — Phase 16: UI/UX cleanup of the Phase 14 fields (2026-10-07 feedback)
// Idempotent: every block updates/upserts by stable key, safe to re-run.
// Run with: node scripts/phase16-ui-ux-cleanup-2026-10-07.mjs
//
// 1. Shower Rinse Manifolds / Heated Dryers pickers: short UI labels ("Driver", "1 Row") instead
//    of the full Items.xlsx description — the full description still appears in the Quote
//    Summary via MultiQtyPicker's new `parts`-table lookup (lib/catalog/usePartsByNumbers), so
//    AA5D-2/3/4 (previously missing) are backfilled into `parts` here.
// 2. Avalanche/Mirror Rinse/Roller Correlator/Guide Rollers auto-selected part fields -> widget
//    'hidden'. They were a visible single-option radio showing the full part description for
//    something the user never actually chooses; CatalogField now renders nothing for them, but
//    they still drive the Quote Summary row via their existing set_value rule.

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

async function setWidgetHidden(sku) {
  const item = await getItemBySku(sku)
  const upd = await supabase
    .from('equipment_items')
    .update({ metadata: { ...item.metadata, widget: 'hidden' } })
    .eq('id', item.id)
  if (upd.error) throw upd.error
}

// ── 1a. Shower Rinse Manifolds: short UI labels ────────────────────────────────────────────
await step('1a. Shower Rinse Manifolds -> short labels', async () => {
  const item = await getItemBySku('EQ-FRIN-002A')
  await replaceOptionsWithPrice(item.id, 'shower_rinse_manifolds_parts', [
    ['1 Row', 'AA5D-1', 900],
    ['2 Row', 'AA5D-2', 900],
    ['3 Row', 'AA5D-3', 900],
    ['4 Row', 'AA5D-4', 900],
    ['5 Row', 'AA5D-5', 900],
  ])
  console.log('done')
})

// ── 1b. Backfill AA5D-2/3/4 into `parts` so the Quote Summary still gets the full description ──
await step('1b. Backfill AA5D-2/3/4 into parts table', async () => {
  const rows = [
    ['AA5D-2', 'Shower Rinse Top Manifold Assembly, 2 row, 90" LG., w/Mounting Arms and Brackets, SS', 900],
    ['AA5D-3', 'Shower Rinse Top Manifold Assembly, 3 row, 90" LG. w/Mounting Arms and Brackets, SS', 900],
    ['AA5D-4', 'Shower Rinse Top Manifold Assembly, 4 rows, 90" LG., w/Mounting Arms and Brackets, SS', 900],
  ]
  const ups = await supabase
    .from('parts')
    .upsert(
      rows.map(([part_number, description, unit_price]) => ({ part_number, description, unit_price, is_active: true })),
      { onConflict: 'part_number' }
    )
  if (ups.error) throw ups.error
  console.log('done')
})

// ── 1c. Heated Dryer Side: short UI labels ─────────────────────────────────────────────────
await step('1c. Heated Dryer Side -> short labels', async () => {
  const item = await getItemBySku('EQ-BLOW-012A')
  await replaceOptionsWithPrice(item.id, 'heated_dryers_sides', [
    ['Driver (Left)', 'DJTE-95L', 17474.54],
    ['Passenger (Right)', 'DJTE-95R', 17051.13],
  ])
  console.log('done')
})

// ── 2. Auto-selected part fields -> hidden (nothing to pick, Quote Summary unaffected) ─────
await step('2. Avalanche/Mirror Rinse/Roller Correlator/Guide Rollers part fields -> hidden', async () => {
  await setWidgetHidden('EQ-PRESOAK-002A') // avalanche_part (J3179)
  await setWidgetHidden('EQ-FRIN-003A') // mirror_rinse_part (AA5B-C)
  await setWidgetHidden('EQ-BELT-001C') // roller_correlator_rc4a (RC4A)
  await setWidgetHidden('EQ-BELT-001D') // guide_rollers_part (RC3DG-UHMW)
  console.log('done')
})

console.log('\nPhase 16 applied successfully.')
