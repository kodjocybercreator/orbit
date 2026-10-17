import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4173";
const routes = ["", "chat", "deadlines", "budget", "more", "focus", "timetable", "grades", "settings"];

const results = { screenshots: [], consoleErrors: [], overflow: [], checks: [], flows: [] };

function ok(name, pass, detail = "") {
  results.flows.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function textButton(page, text) {
  const btn = await page.evaluateHandle((t) => {
    const els = [...document.querySelectorAll("button, a, [role=button]")];
    return els.find((e) => (e.textContent || "").trim().toLowerCase().includes(t.toLowerCase())) || null;
  }, text);
  return btn.asElement();
}

async function clickText(page, text) {
  const el = await textButton(page, text);
  if (!el) return false;
  await el.click();
  return true;
}

async function clickLabel(page, label) {
  const ok = await page.evaluate((l) => {
    const el = [...document.querySelectorAll("[aria-label]")].find(
      (e) => (e.getAttribute("aria-label") || "").toLowerCase() === l.toLowerCase()
    );
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, label);
  await sleep(350);
  return ok;
}

async function setDateTimeLocal(page, value) {
  return page.evaluate((v) => {
    const el = document.querySelector('input[type="datetime-local"]');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return el.value === v;
  }, value);
}

async function submitForm(page) {
  const ok = await page.evaluate(() => {
    const forms = [...document.querySelectorAll("form")];
    const visible = forms.find((f) => f.offsetParent !== null);
    const btn = visible ? visible.querySelector('button[type="submit"]') : null;
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  await sleep(700);
  return ok;
}

async function typeIn(page, placeholder, value) {
  const sel = `input[placeholder*="${placeholder}"], textarea[placeholder*="${placeholder}"]`;
  await page.waitForSelector(sel, { timeout: 3000 }).catch(() => null);
  const el = await page.$(sel);
  if (!el) return false;
  await el.click({ clickCount: 3 });
  await el.type(value, { delay: 10 });
  return true;
}

async function shot(page, name) {
  const path = `.design-checks/${name}.png`;
  await page.screenshot({ path, scale: "css" });
  results.screenshots.push(path);
}

async function checkHydrated(page) {
  await page.waitForFunction(
    () => document.body && document.body.innerText.trim().length > 40,
    { timeout: 6000 }
  );
  await sleep(400);
}

async function overflowCheck(page, route) {
  const o = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  if (o.scrollW > o.clientW + 1) {
    results.overflow.push({ route, ...o });
    console.log(`OVERFLOW ${route}: ${o.scrollW} > ${o.clientW}`);
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=390,844"],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);

page.on("console", (msg) => {
  if (msg.type() === "error") results.consoleErrors.push(msg.text().slice(0, 300));
});
page.on("pageerror", (err) => results.consoleErrors.push("PAGEERROR: " + String(err).slice(0, 300)));

await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await sleep(1200); // sw registration

// ---------- ROUTE SWEEP: dark ----------
for (const r of routes) {
  await page.goto(`${BASE}/${r}`, { waitUntil: "domcontentloaded" });
  await checkHydrated(page);
  await overflowCheck(page, `${r || "home"}(dark)`);
  await shot(page, `${r || "home"}-dark`);
}
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await checkHydrated(page);
await shot(page, "home-dark-full");
const homeText = await page.evaluate(() => document.body.innerText);
ok("home renders headline", /Today|Good (morning|afternoon|evening)|Still up|Winding down/i.test(homeText));

// ---------- LIGHT SWEEP ----------
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
for (const r of routes) {
  await page.goto(`${BASE}/${r}`, { waitUntil: "domcontentloaded" });
  await checkHydrated(page);
  await overflowCheck(page, `${r || "home"}(light)`);
  await shot(page, `${r || "home"}-light`);
}
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);

// ---------- FLOW 1: offline plan my day (home) ----------
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await checkHydrated(page);
const hadPlanBtn = await clickText(page, "Plan my day");
await sleep(900);
const afterPlan = await page.evaluate(() => document.body.innerText);
ok("home offline plan button present", hadPlanBtn);
if (hadPlanBtn) {
  const moveCount = await page.evaluate(() => document.querySelectorAll("main li, main [class*=move]").length);
  ok("offline plan produced moves", moveCount >= 1, `items=${moveCount}`);
  ok("tradeoff shown or plan rendered", /Trade|sleep|deadline|wait|deliberately|fine at this energy/i.test(afterPlan) || moveCount >= 1);
}
await shot(page, "flow-offline-plan");

// ---------- FLOW 2: energy log via chat ----------
await page.goto(BASE + "/chat", { waitUntil: "domcontentloaded" });
await checkHydrated(page);
const energyClicked = await clickText(page, "Energy 3");
await sleep(700);
const chatText = await page.evaluate(() => document.body.innerText);
ok("chat energy chip logs energy", energyClicked && /3\/5/i.test(chatText));
await shot(page, "flow-energy");

// ---------- FLOW 3: chat send without API key (offline reply) ----------
await clickText(page, "Plan my day").catch(() => {});
await sleep(1500);
const chatText2 = await page.evaluate(() => document.body.innerText);
ok("chat offline plan reply", /offline|local|no AI|3 moves|plan/i.test(chatText2));
await shot(page, "flow-chat-offline");

// ---------- FLOW 4: add + edit + delete deadline ----------
await page.goto(BASE + "/deadlines", { waitUntil: "domcontentloaded" });
await checkHydrated(page);
await clickLabel(page, "Add task");
const typedTitle = await typeIn(page, "Essay", "QA Essay Draft");
await typeIn(page, "Course", "BIO 201");
const dateInput = await page.$('input[type="datetime-local"]');
let dateOk = false;
if (dateInput) {
  const d = new Date(Date.now() + 48 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  dateOk = await setDateTimeLocal(page, val);
}
await typeIn(page, "hours", "4");
await submitForm(page);
const dlText = await page.evaluate(() => document.body.innerText);
ok("deadline added", typedTitle && dateOk && dlText.includes("QA Essay Draft"), dlText.slice(0, 80));
await shot(page, "flow-deadline-added");

// edit flow
await clickLabel(page, "Edit");
await sleep(400);
const saveVisible = await page.evaluate(() => {
  const forms = [...document.querySelectorAll("form")];
  const visible = forms.find((f) => f.offsetParent !== null);
  return !!visible && /Save changes/i.test(visible.innerText);
});
ok("edit form prefills (Save changes)", saveVisible);
await typeIn(page, "Essay", "QA Essay v2");
await submitForm(page);
const dlText2 = await page.evaluate(() => document.body.innerText);
ok("deadline edit saved", dlText2.includes("QA Essay v2"));
await shot(page, "flow-deadline-edit");

// filter flow
await clickText(page, "This week");
await sleep(400);
const weekFiltered = await page.evaluate(() => document.body.innerText);
ok("this-week filter keeps task", /QA Essay v2/.test(weekFiltered));
await shot(page, "flow-filter-week");
await clickText(page, "Overdue");
await sleep(300);
await clickText(page, "All");
await sleep(300);

// delete flow (two-tap confirm)
await page.evaluate(() => {
  const row = [...document.querySelectorAll("li")].find((li) => /QA Essay v2/.test(li.innerText));
  const del = row ? [...row.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "").toLowerCase() === "delete") : null;
  if (del) del.click();
  return !!del;
});
await sleep(400);
const confirmShown = await page.evaluate(() => /Confirm/i.test(document.body.innerText));
if (confirmShown) await clickText(page, "Confirm");
await sleep(600);
const afterDelete = await page.evaluate(() => document.body.innerText);
ok("delete with confirm removes task", !/QA Essay v2/.test(afterDelete), confirmShown ? "two-tap" : "no confirm step");
await shot(page, "flow-deadline-deleted");

// ---------- FLOW 5: budget add expense ----------
await page.goto(BASE + "/budget", { waitUntil: "domcontentloaded" });
await checkHydrated(page);
await clickLabel(page, "Add expense");
const amtSel = await page.$('input[placeholder*="Amount"]');
let amtOk = false;
if (amtSel) {
  await amtSel.click();
  await amtSel.type("12.50");
  amtOk = true;
}
await clickText(page, "Food");
await submitForm(page);
const budText = await page.evaluate(() => document.body.innerText);
ok("expense added + shown", amtOk && /12\.50/.test(budText));
ok("category breakdown visible", /Where it went|Food/i.test(budText));
await shot(page, "flow-budget");

// ---------- FLOW 6: timetable add class ----------
await page.goto(BASE + "/timetable", { waitUntil: "domcontentloaded" });
await checkHydrated(page);
await clickLabel(page, "Add class");
await typeIn(page, "Class name", "QA Physics");
await typeIn(page, "Location", "Lab 3");
const timeInputs = await page.$$('input[type="time"]');
if (timeInputs.length >= 2) {
  await timeInputs[0].click({ clickCount: 3 });
  await timeInputs[0].type("09:00");
  await timeInputs[1].click({ clickCount: 3 });
  await timeInputs[1].type("10:30");
}
await submitForm(page);
const ttText = await page.evaluate(() => document.body.innerText);
ok("class added to timetable", /QA Physics/.test(ttText), ttText.slice(0, 100));
await shot(page, "flow-timetable");

// ---------- FLOW 7: grades GPA ----------
await page.goto(BASE + "/grades", { waitUntil: "domcontentloaded" });
await checkHydrated(page);
await clickLabel(page, "Add course");
await typeIn(page, "Course name", "QA Chemistry");
await typeIn(page, "Credits", "3");
await submitForm(page);
const grText = await page.evaluate(() => document.body.innerText);
ok("course added + GPA computed", /QA Chemistry/.test(grText) && /(4\.0|3\.\d)/.test(grText), grText.slice(0, 160));
await shot(page, "flow-grades");

// ---------- FLOW 8: focus timer ----------
await page.goto(BASE + "/focus", { waitUntil: "domcontentloaded" });
await checkHydrated(page);
const started = await clickText(page, "Start");
await sleep(1600);
const focusText = await page.evaluate(() => document.body.innerText);
ok("focus timer starts + counts", started && /2[45]:/.test(focusText), focusText.match(/\d{1,2}:\d{2}/)?.[0] || "no timer text");
await shot(page, "flow-focus");
await clickText(page, "Pause").catch(() => {});
await clickText(page, "Reset").catch(() => {});

// ---------- FLOW 9: settings save + export ----------
await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
await checkHydrated(page);
const nameInput = await page.$("main input");
if (nameInput) {
  await nameInput.click({ clickCount: 3 });
  await nameInput.type("Geoffrey");
}
await clickText(page, "Save");
await sleep(600);
const setOk = await page.evaluate(() => document.body.innerText);
ok("settings save feedback", /Saved/i.test(setOk));
await shot(page, "flow-settings");

// home shows name
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await checkHydrated(page);
const homeAfterName = await page.evaluate(() => document.body.innerText);
ok("home greets saved name", /Geoffrey/.test(homeAfterName));
await shot(page, "flow-home-with-name");

// ---------- FLOW 10: PWA assets ----------
const manifest = await page.evaluate(async () => {
  const r = await fetch("/manifest.json");
  return r.ok ? (await r.json()).name : null;
});
ok("manifest served", !!manifest, String(manifest));
const swAlive = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!reg;
});
ok("service worker registered", swAlive);

// ---------- SUMMARY ----------
results.summary = {
  total: results.flows.length,
  passed: results.flows.filter((f) => f.pass).length,
  failed: results.flows.filter((f) => !f.pass).length,
  overflowCount: results.overflow.length,
  consoleErrorCount: results.consoleErrors.length,
};
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(results.summary, null, 2));
if (results.overflow.length) console.log("OVERFLOW:", JSON.stringify(results.overflow, null, 2));
if (results.consoleErrors.length) console.log("CONSOLE:", JSON.stringify([...new Set(results.consoleErrors)], null, 2));
await writeFile(".design-checks/qa-report.json", JSON.stringify(results, null, 2));
await browser.close();
process.exit(results.flows.some((f) => !f.pass) ? 1 : 0);
