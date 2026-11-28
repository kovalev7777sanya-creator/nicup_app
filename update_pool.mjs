import fs from "node:fs";

const ROOTS = [
  "cyber", "neon", "void", "flux", "nova", "drift", "zen", "apex",
  "kuro", "lux", "vibe", "echo", "orbit", "pixel", "storm", "frost",
  "shadow", "pulse", "atlas", "hyper", "lunar", "solar", "rift", "byte",
  "stark", "omega", "alpha", "delta", "titan", "ghost", "spark", "onyx"
];

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const POOL_FILE = "pool.json";

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAllowedUsername(raw) {
  const u = String(raw || "").trim().replace(/^@/, "").toLowerCase();
  if (u.length < 5 || u.length > 32) return false;
  if (!/^[a-z][a-z0-9_]{4,31}$/.test(u)) return false;
  if (u.endsWith("_") || u.includes("__")) return false;
  const underscores = (u.match(/_/g) || []).length;
  if (underscores > 1) return false;
  return true;
}

function makeCandidate(length) {
  const len = Math.max(5, Math.min(32, length));
  const w1 = pick(ROOTS);
  const pool2 = ROOTS.filter((w) => w !== w1);
  const w2 = pick(pool2.length ? pool2 : ROOTS);

  let base = len >= 8 && Math.random() < 0.3 ? `${w1}_${w2}` : `${w1}${w2}`;
  if (base.length < len && Math.random() < 0.6) {
    const digCount = randInt(1, 2);
    for (let i = 0; i < digCount; i++) {
      base += pick(DIGITS);
    }
  }
  while (base.length < len) {
    base += pick(LETTERS);
  }

  let cand = base.slice(0, len).replace(/_+$/g, "");
  if (cand.length < 5) {
    cand = (cand + "x9k2m").slice(0, 5);
  }
  return cand;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    const text = await res.text();
    return { status: res.status, html: text };
  } catch {
    return { status: 0, html: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function checkTmeOccupied(username) {
  const { status, html } = await fetchHtml(`https://t.me/${username}`);
  if (status !== 200 || !html) return true;
  return /class="tgme_page_title"/i.test(html);
}

async function checkFragmentStatus(username) {
  const { status, html } = await fetchHtml(`https://fragment.com/username/${username}`);
  if (status === 404) return "not_on_fragment";
  if (status !== 200 || !html) return "unknown";
  const low = html.toLowerCase();
  if (low.includes("available") || low.includes("place a bid") || low.includes("buy username")) {
    return "fragment";
  }
  if (low.includes("sold") || low.includes("taken")) {
    return "fragment_taken";
  }
  return "unknown";
}

async function main() {
  let existing = [];
  if (fs.existsSync(POOL_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(POOL_FILE, "utf8"));
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      existing = [];
    }
  }

  const known = new Set(
    existing
      .map((item) => {
        const raw = typeof item === "string" ? item : (item && item.username ? item.username : "");
        return String(raw).replace(/^@/, "").toLowerCase();
      })
      .filter(Boolean)
  );

  const pool = [...existing];
  let checks = 0;
  const maxChecks = 35;
  const targetTotal = 150;

  while (pool.length < targetTotal && checks < maxChecks) {
    const cand = makeCandidate(randInt(6, 12));
    if (!isAllowedUsername(cand) || known.has(cand)) continue;
    known.add(cand);
    checks += 1;

    const occupied = await checkTmeOccupied(cand);
    if (occupied) {
      await sleep(700);
      continue;
    }

    const frag = await checkFragmentStatus(cand);
    if (frag === "fragment_taken") {
      await sleep(700);
      continue;
    }

    const statusLabel = frag === "fragment" ? "fragment" : "free";
    pool.push({ username: `@${cand}`, status: statusLabel });
    await sleep(900);
  }

  const trimmed = pool.slice(-targetTotal);
  fs.writeFileSync(POOL_FILE, JSON.stringify(trimmed, null, 2) + "\n", "utf8");
  console.log(`Проверено кандидатов: ${checks}, в пуле: ${trimmed.length}`);
}

main();
