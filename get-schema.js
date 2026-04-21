const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function test() {
  const { data, error } = await supabase.from('hydration_logs').select('*').limit(1)
  console.log('Hydration Logs Sample:', data)
  const { data: surveyData } = await supabase.from('survey_responses').select('*').limit(1)
  console.log('Survey Responses Sample:', surveyData)
}
test()
