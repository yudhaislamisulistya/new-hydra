const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function test() {
  const { data, error } = await supabase
    .from('parent_children')
    .select('id, child_id, student_profiles:child_id(id, student_code, weight_kg, height_cm, daily_water_target_ml, profiles!student_profiles_id_fkey(full_name))')
    
  console.log('Error:', JSON.stringify(error, null, 2))
  console.log('Data:', JSON.stringify(data, null, 2))
}

test()
