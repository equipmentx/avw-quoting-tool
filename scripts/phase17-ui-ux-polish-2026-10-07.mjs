// AVW Quoting Tool — Phase 17: further UI/UX polish (2026-10-07 follow-up feedback)
// Idempotent: every block updates by stable key, safe to re-run.
// Run with: node scripts/phase17-ui-ux-polish-2026-10-07.mjs
//
// 1. CTA Type -> renamed to just "CTA" (both the question label and the Quote Summary row use
//    item.name, so this one rename covers both).
// 2. Shower Rinse Manifolds Selection: option labels -> "1 Row 90" LG" format (was "1 Row").
// (The inline "Quantity (1-5)" stepper and the page-wide layout stretch are code fixes, not
// data — see components/configurator/fields/MultiQtyPicker.tsx and ConfiguratorShell.tsx.)

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

await step('1. CTA Type -> "CTA"', async () => {
  const item = await getItemBySku('EQ-PRESOAK-004')
  const upd = await supabase.from('equipment_items').update({ name: 'CTA' }).eq('id', item.id)
  if (upd.error) throw upd.error
  console.log('done')
})

await step('2. Shower Rinse Manifolds: "1 Row 90\\" LG" format', async () => {
  const item = await getItemBySku('EQ-FRIN-002A')
  for (const n of [1, 2, 3, 4, 5]) {
    const upd = await supabase
      .from('equipment_options')
      .update({ option_label: `${n} Row 90" LG` })
      .eq('item_id', item.id)
      .eq('option_value', `AA5D-${n}`)
    if (upd.error) throw upd.error
  }
  console.log('done')
})

console.log('\nPhase 17 applied successfully.')
