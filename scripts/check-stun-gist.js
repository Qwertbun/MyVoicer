const https = require("https");
const dns = require("dns").promises;

const GIST_RAW_URL = "https://gist.githubusercontent.com/mondain/b0ec1cf5f60ae726202e/raw";
const CONCURRENCY = 40;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to fetch ${url}: HTTP ${res.statusCode}`));
          res.resume();
          return;
        }

        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

function parseHostPort(line) {
  const text = String(line || "").trim();
  if (!text) {
    return null;
  }

  const [hostRaw, portRaw] = text.split(":");
  if (!hostRaw) {
    return null;
  }

  const port = Number(portRaw || 3478);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return null;
  }

  return { host: hostRaw, port };
}

function uniqueByAddress(items) {
  const map = new Map();
  for (const item of items) {
    map.set(`${item.host}:${item.port}`, item);
  }
  return Array.from(map.values());
}

async function resolveAll(items) {
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      try {
        const records = await dns.lookup(item.host, { all: true });
        results.push({
          ...item,
          ok: records.length > 0,
          records: records.length,
        });
      } catch {
        results.push({
          ...item,
          ok: false,
          records: 0,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

function toStunUrl(item) {
  return `stun:${item.host}:${item.port}`;
}

async function main() {
  const text = await fetchText(GIST_RAW_URL);
  const parsed = text.split(/\r?\n/).map(parseHostPort).filter(Boolean);
  const items = uniqueByAddress(parsed);
  const results = await resolveAll(items);

  const alive = results.filter((x) => x.ok);
  const dead = results.filter((x) => !x.ok);

  console.log(`Checked: ${results.length}`);
  console.log(`Resolvable: ${alive.length}`);
  console.log(`Unresolvable: ${dead.length}`);
  console.log("");
  console.log("Top resolvable STUN URLs:");
  for (const url of alive.slice(0, 25).map(toStunUrl)) {
    console.log(url);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
