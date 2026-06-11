export default function handler(req, res) {
  res.status(200).json({
    env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV || "local",
  });
}
