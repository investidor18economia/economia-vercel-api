import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log(
  "🔑 SUPABASE KEY:",
  supabaseKey ? supabaseKey.substring(0, 20) + "..." : "UNDEFINED"
);

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});
