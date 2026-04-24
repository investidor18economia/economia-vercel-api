export default async function handler(req, res) {
  return res.status(200).json({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    keyExists: !!process.env.SUPABASE_SERVICE_ROLE_KEY
  });
}
