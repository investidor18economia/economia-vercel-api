/**
 * PATCH 11B.4 — Browser validation (Playwright desktop + mobile)
 */
import { PROD_UI, createReporter, GENERIC_ONLY } from "./test-mia-11b4-shared.mjs";

const { record, summary } = createReporter("11B.4-browser");

console.log("\nPATCH 11B.4 — Browser Validation (Desktop + Mobile)\n");

async function runViewport(label, viewport) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto(PROD_UI, { waitUntil: "networkidle", timeout: 90000 });

  async function uiTurn(text, { expectCards = false } = {}) {
    const input = page.locator(".mia-input");
    await input.waitFor({ state: "visible", timeout: 30000 });
    await input.fill(text);
    const respP = page.waitForResponse(
      (r) => r.url().includes("/api/chat-gpt4o") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".send-btn").click();
    const resp = await respP;
    const data = await resp.json().catch(() => ({}));
    const reply = (data?.reply || "").trim();
    await page.waitForFunction(
      () => !document.querySelector(".send-btn.send-btn--loading"),
      { timeout: 120000 }
    );
    await page.waitForTimeout(1500);
    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll(".mia-msg-assistant-bubble");
        if (!bubbles.length) return false;
        const last = bubbles[bubbles.length - 1];
        const t = (last?.textContent || "").replace(/\s+/g, " ").trim();
        return t.length > 15 && !t.endsWith("...");
      },
      { timeout: 120000 }
    );
    const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText();
    const displayText = (reply || bubbleText).trim();
    const cards = await page.locator(".mia-offer-card, .offer-card, [class*='offer']").count();
    const inputBox = await input.boundingBox();
    const sendBox = await page.locator(".send-btn").boundingBox();
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 2;
    });
    return {
      status: resp.status(),
      reply,
      bubbleText: bubbleText.trim(),
      displayText,
      replyGenericOnly: GENERIC_ONLY.test(displayText),
      replyLen: displayText.length,
      cards,
      inputVisible: !!inputBox && inputBox.height > 0,
      sendVisible: !!sendBox && sendBox.width > 0,
      horizontalOverflow: overflow,
      paidExternal: data?.mia_debug?.runtime_enforcement?.externalCallAccounting?.paidExternalCallExecutedCount || 0,
    };
  }

  // Social
  const social = await uiTurn("acho esse Galaxy bonito");
  record(`${label} UI social opinion`, social.status === 200 && social.replyLen > 20 && !social.replyGenericOnly && social.paidExternal === 0, {
    replySnippet: social.displayText.slice(0, 80),
    cards: social.cards,
  });

  // Commercial
  const comm = await uiTurn("qual celular você recomenda até 2500?");
  record(`${label} UI commercial`, comm.status === 200 && comm.replyLen > 40, {
    replyLen: comm.replyLen,
    cards: comm.cards,
  });

  // Mixed
  const mixed = await uiTurn("estou cansado, mas quero um celular até 2500.");
  record(`${label} UI mixed`, mixed.status === 200 && mixed.replyLen > 40 && !mixed.replyGenericOnly, {
    replySnippet: mixed.bubbleText.slice(0, 80),
  });

  // Follow-up
  const fu = await uiTurn("e quanto custa?");
  record(`${label} UI follow-up price`, fu.status === 200 && !fu.replyGenericOnly && fu.replyLen > 15, {
    replySnippet: fu.bubbleText.slice(0, 80),
  });

  // Refinement
  const ref = await uiTurn("sem iPhone");
  record(`${label} UI refinement exclude brand`, ref.status === 200 && !/iPhone 13|iPhone 11/i.test(ref.bubbleText), {
    replySnippet: ref.bubbleText.slice(0, 80),
    paidExternal: ref.paidExternal,
  });

  // Layout checks
  record(`${label} UI input accessible`, social.inputVisible && social.sendVisible, {});
  record(`${label} UI no horizontal overflow`, !social.horizontalOverflow, { horizontalOverflow: social.horizontalOverflow });

  // Multi-turn scroll
  await page.locator(".mia-chat-messages").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const scrollOk = await page.locator(".mia-msg-assistant-bubble").first().isVisible();
  record(`${label} UI scroll/messages visible`, scrollOk, { consoleErrors: errors.length });

  await browser.close();
  return errors;
}

let desktopErrors = [];
let mobileErrors = [];
try {
  desktopErrors = await runViewport("desktop", { width: 1440, height: 900 });
} catch (e) {
  record("desktop browser run", false, { error: e.message });
}

try {
  mobileErrors = await runViewport("mobile", { width: 390, height: 844 });
} catch (e) {
  record("mobile browser run", false, { error: e.message });
}

const s = summary();
console.log("\n=== PATCH 11B.4 BROWSER SUMMARY ===");
console.log(JSON.stringify({ ...s, desktopErrors: desktopErrors.length, mobileErrors: mobileErrors.length }, null, 2));
process.exit(s.failed > 0 ? 1 : 0);
