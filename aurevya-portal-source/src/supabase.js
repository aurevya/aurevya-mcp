import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wxwbfkhvkrwtmsgwdkjy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4d2Jma2h2a3J3dG1zZ3dka2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM5NDAsImV4cCI6MjA5NTg4OTk0MH0.RVFvV3Tu6vgIs3KvPsjOrfdsLaevncysHrirLjAATXM'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
