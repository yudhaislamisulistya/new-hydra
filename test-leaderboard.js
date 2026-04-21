const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function test() {
  // Get all students with their profiles
  const { data: students, error } = await supabase
    .from('student_profiles')
    .select('id, student_code, profiles!student_profiles_id_fkey(full_name)')
  console.log('Students:', JSON.stringify(students, null, 2))
  console.log('Error:', error)

  // Count survey responses per student  
  const { data: responses } = await supabase
    .from('survey_responses')
    .select('respondent_id')
  console.log('Responses count:', responses?.length)

  // Count hydration logs per student
  const { data: logs } = await supabase
    .from('hydration_logs')
    .select('student_id')
  console.log('Hydration logs count:', logs?.length)
}
test()
