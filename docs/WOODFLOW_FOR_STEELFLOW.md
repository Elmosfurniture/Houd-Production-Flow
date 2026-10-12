# Reading WoodFlow from SteelFlow

For the "pull wood information" button in SteelFlow. It lets SteelFlow show where the **wood** parts of an order
are: for example, Bennett chair ×12: front legs at CNC Sharp, rail done, seat waiting at Sanding.

It is **read-only**: SteelFlow only reads one view in WoodFlow's database and never writes to it.
WoodFlow does the same the other way round (Week plan → Steel only reads SteelFlow).

## 1. Connection

WoodFlow has its own Supabase project. Ask Roberto for its **URL** and **anon key** (WoodFlow `.env`:
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) and put them in SteelFlow's `.env`:

```
VITE_WOODFLOW_URL=https://<woodflow-project>.supabase.co
VITE_WOODFLOW_ANON_KEY=<woodflow anon key>
```

(The key is deliberately not written here: this file is on GitHub.)

## 2. What you can read: the view `wf_wood_status`

One row per **wood part** of every WoodFlow job that is on the floor or finished.

| column | meaning |
|---|---|
| `kwitasie_nr` | the Access kwitasie number: **match on this** (same as SteelFlow `orders.kwitasie_nr`) |
| `order_nr`, `product_code`, `product_description` | the order |
| `job_qty` | how many items (chairs / tables) the order is for |
| `job_stage` | `in_production` · `production_done` · `ready_for_dispatch` · `shipped` |
| `prod_date`, `due_date` | planned production start, and due (send) date |
| `part_line`, `part_name` | the wood part (1, 2, 3… in WoodFlow's order) |
| `steps_done`, `steps_total` | how many machines of that part's route are finished |
| `part_status` | `done` · `working` (a machine has started it) · `waiting` (between machines) · `not_started` |
| `current_machine`, `current_department` | where the part is now / goes next (empty when `done`) |
| `last_change` | when anything on that part last changed |

No part quantities, only the order quantity, as agreed.

## 3. Code for SteelFlow

```js
// src/lib/woodflow.js (SteelFlow)
import { createClient } from '@supabase/supabase-js'

const wood = createClient(import.meta.env.VITE_WOODFLOW_URL, import.meta.env.VITE_WOODFLOW_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'steelflow-woodflow-readonly' },
})

// Wood progress for some orders, grouped per kwitasie number:
// Map<kwitasie_nr, { stage, qty, parts: [{ name, status, machine, department, done, total }] }>
export async function loadWoodStatus(kwitasieNrs) {
  const out = new Map()
  for (let i = 0; i < kwitasieNrs.length; i += 150) {
    const { data, error } = await wood
      .from('wf_wood_status')
      .select('kwitasie_nr, job_stage, job_qty, part_line, part_name, part_status, current_machine, current_department, steps_done, steps_total')
      .in('kwitasie_nr', kwitasieNrs.slice(i, i + 150))
      .order('part_line')
    if (error) throw new Error(`Reading WoodFlow: ${error.message}`)
    for (const r of data) {
      if (!out.has(r.kwitasie_nr)) out.set(r.kwitasie_nr, { stage: r.job_stage, qty: r.job_qty, parts: [] })
      out.get(r.kwitasie_nr).parts.push({
        name: r.part_name, status: r.part_status, machine: r.current_machine,
        department: r.current_department, done: r.steps_done, total: r.steps_total,
      })
    }
  }
  return out
}
```

Show it as a short list per order, e.g. `Front legs: at CNC Sharp (3/5)` · `Rail: done ✓`.
An order with no rows is not on WoodFlow's floor yet (still a draft there, or not imported).

## 4. Needs

WoodFlow migration **005_wf_steel_link.sql** must have been run (it creates the view).
