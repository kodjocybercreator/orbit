import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

await page.goto("http://localhost:4173/deadlines", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.body.innerText.trim().length > 40, { timeout: 6000 });
await sleep(400);

await page.evaluate(() => {
  const el = [...document.querySelectorAll("[aria-label]")].find((e) => e.getAttribute("aria-label") === "Add task");
  el?.click();
});
await sleep(400);

const fields = await page.evaluate(() => {
  const forms = [...document.querySelectorAll("form")].filter((f) => f.offsetParent !== null);
  const f = forms[0];
  if (!f) return { noForm: true };
  return {
    inputs: [...f.querySelectorAll("input")].map((i) => ({
      type: i.type,
      ph: i.placeholder,
      required: i.required,
      value: i.value,
    })),
    html: f.outerHTML.slice(0, 600),
  };
});
console.log("FIELDS:", JSON.stringify(fields, null, 1));

const title = await page.$('input[placeholder*="Essay"]');
console.log("title input found:", !!title);
if (title) await title.type("QA Essay Draft");

const dateInput = await page.$('input[type="datetime-local"]');
console.log("date input found:", !!dateInput);
if (dateInput) {
  const d = new Date(Date.now() + 48 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  await dateInput.click({ clickCount: 3 });
  await dateInput.type(val);
}
const hours = await page.$('input[placeholder*="hours"]');
if (hours) await hours.type("4");

const before = await page.evaluate(() => {
  const f = [...document.querySelectorAll("form")].find((f) => f.offsetParent !== null);
  return { values: [...f.querySelectorAll("input")].map((i) => `${i.type}=${i.value}`), valid: f.checkValidity() };
});
console.log("BEFORE SUBMIT:", JSON.stringify(before));

const submitted = await page.evaluate(() => {
  const f = [...document.querySelectorAll("form")].find((f) => f.offsetParent !== null);
  const btn = f?.querySelector('button[type="submit"]');
  if (!btn) return "no submit btn";
  btn.click();
  return "clicked";
});
console.log("SUBMIT:", submitted);
await sleep(800);

const after = await page.evaluate(() => ({
  text: document.body.innerText.slice(0, 300),
  rows: [...document.querySelectorAll("li")].map((li) => li.innerText.replace(/\n/g, " | ").slice(0, 80)),
}));
console.log("AFTER:", JSON.stringify(after, null, 1));
await browser.close();
