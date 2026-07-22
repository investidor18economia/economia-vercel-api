const html = await fetch("https://economia-ai.vercel.app/app-mia").then((r) => r.text());
const match = html.match(/\/_next\/static\/chunks\/pages\/app-mia-[^"']+\.js/);
console.log("chunk:", match?.[0] || "(not found)");
if (!match) process.exit(0);
const js = await fetch(`https://economia-ai.vercel.app${match[0]}`).then((r) => r.text());
console.log("has mia_analytics_visitor_id:", js.includes("mia_analytics_visitor_id"));
console.log("has getOrCreateAnalyticsVisitorId:", js.includes("getOrCreateAnalyticsVisitorId"));
console.log("bundle bytes:", js.length);
