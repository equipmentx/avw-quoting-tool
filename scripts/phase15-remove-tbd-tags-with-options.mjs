// AVW Quoting Tool — Phase 15: remove "TBD-compare Josh sheet and quote" warning tags from items
// that now have real priced options (Phase 13/14 supplied them). Items with no options yet, and
// tags owned by someone else ("part no. TBD by Scott", "needs to add tire equipment"), are untouched.
// Idempotent: items already without the tag are skipped.
// Run with: node scripts/phase15-remove-tbd-tags-with-options.mjs

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const TAG = 'TBD-compare Josh sheet and quote'

const { data: items, error } = await supabase.from('equipment_items').select('id,sku,name,metadata')
if (error) throw error

for (const item of items) {
  if (item.metadata?.warning_label !== TAG) continue
  const { count, error: countErr } = await supabase
    .from('equipment_options')
    .select('*', { count: 'exact', head: true })
    .eq('item_id', item.id)
  if (countErr) throw countErr
  if (!count) continue

  const { warning_label: _removed, ...metadata } = item.metadata
  const upd = await supabase.from('equipment_items').update({ metadata }).eq('id', item.id)
  if (upd.error) throw upd.error
  console.log(`removed tag: ${item.sku} ${item.name}`)
}

console.log('\nPhase 15 applied successfully.')
