// Reads a request copied from Chrome DevTools with "Copy as cURL (bash)": URL, method and headers.
// Only what Chrome writes is supported; anything unexpected throws.

// Splits a bash command line into words: '...', $'...', "...", backslash escapes and line continuations.
function words(text) {
  const out = [];
  let word = null;
  let i = 0;
  const push = (s) => (word = (word ?? "") + s);
  while (i < text.length) {
    const c = text[i];
    if (c === "\\" && text[i + 1] === "\n") {
      i += 2;
    } else if (c === "\\" && text[i + 1] === "\r" && text[i + 2] === "\n") {
      i += 3;
    } else if (/\s/.test(c)) {
      if (word !== null) out.push(word);
      word = null;
      i++;
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      if (end < 0) throw new Error("unclosed quote");
      push(text.slice(i + 1, end));
      i = end + 1;
    } else if (c === "$" && text[i + 1] === "'") {
      i += 2;
      let s = "";
      while (i < text.length && text[i] !== "'") {
        if (text[i] === "\\") {
          const n = text[i + 1];
          const map = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"' };
          if (n === "u" || n === "x") {
            const len = n === "u" ? 4 : 2;
            s += String.fromCharCode(parseInt(text.slice(i + 2, i + 2 + len), 16));
            i += 2 + len;
          } else {
            s += map[n] ?? n;
            i += 2;
          }
        } else {
          s += text[i++];
        }
      }
      if (text[i] !== "'") throw new Error("unclosed quote");
      push(s);
      i++;
    } else if (c === '"') {
      i++;
      let s = "";
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\" && /["\\$`]/.test(text[i + 1])) {
          s += text[i + 1];
          i += 2;
        } else {
          s += text[i++];
        }
      }
      if (text[i] !== '"') throw new Error("unclosed quote");
      push(s);
      i++;
    } else if (c === "\\") {
      push(text[i + 1] ?? "");
      i += 2;
    } else {
      push(c);
      i++;
    }
  }
  if (word !== null) out.push(word);
  return out;
}

const DATA_FLAGS = new Set(["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "--json", "-F", "--form"]);
const VALUE_FLAGS = new Set(["-A", "--user-agent", "-e", "--referer", "-u", "--user"]);

/** Returns { url, method, headers } with lowercase header names; cookies from -b become a cookie header. */
export function parseCurl(text) {
  const argv = words(text.trim());
  if (argv[0] !== "curl") throw new Error("not a curl command");
  let url;
  let method;
  let hasBody = false;
  const headers = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-H" || a === "--header") {
      const h = argv[++i] ?? "";
      const colon = h.indexOf(":");
      if (colon < 1) continue;
      headers[h.slice(0, colon).trim().toLowerCase()] = h.slice(colon + 1).trim();
    } else if (a === "-b" || a === "--cookie") {
      headers.cookie = argv[++i] ?? "";
    } else if (a === "-X" || a === "--request") {
      method = (argv[++i] ?? "").toUpperCase();
    } else if (DATA_FLAGS.has(a)) {
      hasBody = true;
      i++;
    } else if (a === "--url") {
      url = argv[++i];
    } else if (VALUE_FLAGS.has(a)) {
      i++;
    } else if (!a.startsWith("-") && !url) {
      url = a;
    }
  }
  if (!url) throw new Error("no URL");
  return { url: new URL(url).toString(), method: method ?? (hasBody ? "POST" : "GET"), headers };
}
