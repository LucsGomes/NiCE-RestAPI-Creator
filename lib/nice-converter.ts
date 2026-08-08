export type ConversionType =
  | "curl"
  | "fetch"
  | "axios"
  | "wget"

export interface NiceRequest {
  method: string
  url: string
  query: Record<string, string>
  headers: Record<string, string>
  auth?: { type: "basic" | "bearer"; value: string }
  body?: unknown
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function splitUrlAndQuery(rawUrl: string): { url: string; query: Record<string, string> } {
  const query: Record<string, string> = {}
  const qIndex = rawUrl.indexOf("?")
  if (qIndex === -1) return { url: rawUrl, query }

  const base = rawUrl.slice(0, qIndex)
  const search = rawUrl.slice(qIndex + 1)
  for (const pair of search.split("&")) {
    if (!pair) continue
    const [k, ...rest] = pair.split("=")
    query[decodeURIComponent(k)] = decodeURIComponent(rest.join("=") ?? "")
  }
  return { url: base, query }
}

function tryParseJson(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    // form-urlencoded body -> object
    if (trimmed.includes("=") && !trimmed.includes(" ") && !trimmed.startsWith("{")) {
      const obj: Record<string, string> = {}
      for (const pair of trimmed.split("&")) {
        const [k, ...rest] = pair.split("=")
        obj[decodeURIComponent(k)] = decodeURIComponent(rest.join("=") ?? "")
      }
      return obj
    }
    return value
  }
}

function evalObjectLiteral(text: string): unknown {
  // Best-effort parse of a JS object/expression literal.
  // Runs on user-provided input inside their own browser session.
  // eslint-disable-next-line no-new-func
  const fn = new Function(`"use strict"; return (${text});`)
  return fn()
}

function normalizeHeaders(input: unknown): Record<string, string> {
  const headers: Record<string, string> = {}
  if (!input) return headers
  if (Array.isArray(input)) {
    for (const entry of input) {
      if (Array.isArray(entry) && entry.length >= 2) {
        headers[String(entry[0])] = String(entry[1])
      }
    }
    return headers
  }
  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      headers[k] = String(v)
    }
  }
  return headers
}

/* -------------------------------------------------------------------------- */
/*  cURL                                                                      */
/* -------------------------------------------------------------------------- */

function tokenizeShell(input: string): string[] {
  const cleaned = input.replace(/\\\r?\n/g, " ").trim()
  const tokens: string[] = []
  let current = ""
  let quote: '"' | "'" | null = null
  let hasContent = false

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i]
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      hasContent = true
      continue
    }
    if (/\s/.test(char)) {
      if (current || hasContent) {
        tokens.push(current)
        current = ""
        hasContent = false
      }
      continue
    }
    current += char
    hasContent = true
  }
  if (current || hasContent) tokens.push(current)
  return tokens
}

function parseCurl(input: string): NiceRequest {
  const tokens = tokenizeShell(input).filter((t) => t !== "curl")
  const req: NiceRequest = { method: "", url: "", query: {}, headers: {} }
  const dataParts: string[] = []

  const takeValue = (token: string, i: number): [string, number] => {
    const eq = token.indexOf("=")
    if (token.startsWith("--") && eq !== -1) {
      return [token.slice(eq + 1), i]
    }
    return [tokens[i + 1] ?? "", i + 1]
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === "-X" || token === "--request" || token.startsWith("--request=")) {
      const [value, next] = takeValue(token, i)
      req.method = value.toUpperCase()
      i = next
    } else if (token === "-H" || token === "--header" || token.startsWith("--header=")) {
      const [value, next] = takeValue(token, i)
      const idx = value.indexOf(":")
      if (idx !== -1) {
        req.headers[value.slice(0, idx).trim()] = value.slice(idx + 1).trim()
      }
      i = next
    } else if (
      token === "-d" ||
      token === "--data" ||
      token === "--data-raw" ||
      token === "--data-binary" ||
      token === "--data-urlencode" ||
      token.startsWith("--data")
    ) {
      const [value, next] = takeValue(token, i)
      dataParts.push(value)
      i = next
    } else if (token === "-u" || token === "--user" || token.startsWith("--user=")) {
      const [value, next] = takeValue(token, i)
      req.auth = { type: "basic", value }
      i = next
    } else if (token === "--url" || token.startsWith("--url=")) {
      const [value, next] = takeValue(token, i)
      req.url = value
      i = next
    } else if (token === "--compressed" || token === "-L" || token === "--location" || token === "-s" || token === "--silent" || token === "-k" || token === "--insecure") {
      // ignore flags without value
    } else if (token === "-o" || token === "-O" || token === "--output") {
      i = i + 1 // skip value
    } else if (!token.startsWith("-") && !req.url) {
      req.url = token
    }
  }

  if (dataParts.length) {
    req.body = tryParseJson(dataParts.join("&"))
  }

  const auth = req.headers["Authorization"] ?? req.headers["authorization"]
  if (auth && /^Bearer\s+/i.test(auth)) {
    req.auth = { type: "bearer", value: auth.replace(/^Bearer\s+/i, "") }
    delete req.headers["Authorization"]
    delete req.headers["authorization"]
  }

  req.method = req.method || (req.body ? "POST" : "GET")
  const { url, query } = splitUrlAndQuery(req.url)
  req.url = url
  req.query = query
  return req
}

/* -------------------------------------------------------------------------- */
/*  JS Fetch                                                                  */
/* -------------------------------------------------------------------------- */

function parseFetch(input: string): NiceRequest {
  const start = input.indexOf("fetch")
  const open = input.indexOf("(", start === -1 ? 0 : start)
  const argsText = extractBalanced(input, open, "(", ")")
  const args = splitTopLevelArgs(argsText)

  const urlRaw = args[0] ? String(evalObjectLiteral(args[0])) : ""
  let options: Record<string, unknown> = {}
  if (args[1]) {
    try {
      options = (evalObjectLiteral(args[1]) as Record<string, unknown>) ?? {}
    } catch {
      options = {}
    }
  }

  const req: NiceRequest = {
    method: String(options.method ?? "GET").toUpperCase(),
    url: "",
    query: {},
    headers: normalizeHeaders(options.headers),
    body: options.body !== undefined ? tryParseJson(String(options.body)) : undefined,
  }

  extractBearer(req)
  const { url, query } = splitUrlAndQuery(urlRaw)
  req.url = url
  req.query = query
  return req
}

/* -------------------------------------------------------------------------- */
/*  NodeJS Axios                                                              */
/* -------------------------------------------------------------------------- */

function parseAxios(input: string): NiceRequest {
  const methodMatch = input.match(/axios\.(get|post|put|patch|delete|head|options)\s*\(/i)
  const open = input.indexOf("(", input.indexOf("axios"))
  const argsText = extractBalanced(input, open, "(", ")")
  const args = splitTopLevelArgs(argsText)

  const req: NiceRequest = { method: "GET", url: "", query: {}, headers: {} }

  if (methodMatch) {
    const method = methodMatch[1].toUpperCase()
    req.method = method
    const urlRaw = args[0] ? String(evalObjectLiteral(args[0])) : ""
    const hasBody = method === "POST" || method === "PUT" || method === "PATCH"
    let config: Record<string, unknown> = {}
    if (hasBody) {
      if (args[1] && args[1].trim() !== "{}") req.body = evalObjectLiteral(args[1])
      if (args[2]) config = (evalObjectLiteral(args[2]) as Record<string, unknown>) ?? {}
    } else if (args[1]) {
      config = (evalObjectLiteral(args[1]) as Record<string, unknown>) ?? {}
    }
    req.headers = normalizeHeaders(config.headers)
    mergeParams(req, config.params)
    const { url, query } = splitUrlAndQuery(urlRaw)
    req.url = url
    Object.assign(req.query, query)
  } else {
    // axios({ ... }) config object form
    const config = (evalObjectLiteral(args[0]) as Record<string, unknown>) ?? {}
    req.method = String(config.method ?? "GET").toUpperCase()
    req.headers = normalizeHeaders(config.headers)
    if (config.data !== undefined) req.body = config.data
    mergeParams(req, config.params)
    const { url, query } = splitUrlAndQuery(String(config.url ?? ""))
    req.url = url
    Object.assign(req.query, query)
  }

  extractBearer(req)
  return req
}

function mergeParams(req: NiceRequest, params: unknown) {
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      req.query[k] = String(v)
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Shell wget                                                                */
/* -------------------------------------------------------------------------- */

function parseWget(input: string): NiceRequest {
  const tokens = tokenizeShell(input).filter((t) => t !== "wget")
  const req: NiceRequest = { method: "", url: "", query: {}, headers: {} }
  const dataParts: string[] = []

  const takeValue = (token: string, i: number): [string, number] => {
    const eq = token.indexOf("=")
    if (eq !== -1 && token.startsWith("--")) return [token.slice(eq + 1), i]
    return [tokens[i + 1] ?? "", i + 1]
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.startsWith("--method")) {
      const [value, next] = takeValue(token, i)
      req.method = value.toUpperCase()
      i = next
    } else if (token.startsWith("--header")) {
      const [value, next] = takeValue(token, i)
      const idx = value.indexOf(":")
      if (idx !== -1) req.headers[value.slice(0, idx).trim()] = value.slice(idx + 1).trim()
      i = next
    } else if (token.startsWith("--body-data") || token.startsWith("--post-data")) {
      const [value, next] = takeValue(token, i)
      dataParts.push(value)
      i = next
    } else if (token === "-O" || token === "--output-document" || token === "-o") {
      i = i + 1
    } else if (token === "-q" || token === "--quiet" || token === "--no-check-certificate") {
      // ignore
    } else if (!token.startsWith("-") && !req.url) {
      req.url = token
    }
  }

  if (dataParts.length) req.body = tryParseJson(dataParts.join("&"))
  extractBearer(req)
  req.method = req.method || (req.body ? "POST" : "GET")
  const { url, query } = splitUrlAndQuery(req.url)
  req.url = url
  req.query = query
  return req
}

/* -------------------------------------------------------------------------- */
/*  Shared string utilities                                                   */
/* -------------------------------------------------------------------------- */

function extractBalanced(input: string, openIndex: number, open: string, close: string): string {
  if (openIndex === -1) return ""
  let depth = 0
  let quote: string | null = null
  for (let i = openIndex; i < input.length; i++) {
    const char = input[i]
    if (quote) {
      if (char === quote && input[i - 1] !== "\\") quote = null
      continue
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char
      continue
    }
    if (char === open) depth++
    else if (char === close) {
      depth--
      if (depth === 0) return input.slice(openIndex + 1, i)
    }
  }
  return input.slice(openIndex + 1)
}

function splitTopLevelArgs(text: string): string[] {
  const args: string[] = []
  let depth = 0
  let quote: string | null = null
  let current = ""
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      current += char
      if (char === quote && text[i - 1] !== "\\") quote = null
      continue
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char
      current += char
      continue
    }
    if (char === "(" || char === "{" || char === "[") depth++
    else if (char === ")" || char === "}" || char === "]") depth--
    if (char === "," && depth === 0) {
      args.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  if (current.trim()) args.push(current.trim())
  return args
}

function extractBearer(req: NiceRequest) {
  for (const key of Object.keys(req.headers)) {
    if (key.toLowerCase() === "authorization") {
      const value = req.headers[key]
      if (/^Bearer\s+/i.test(value)) {
        req.auth = { type: "bearer", value: value.replace(/^Bearer\s+/i, "") }
        delete req.headers[key]
      } else if (/^Basic\s+/i.test(value)) {
        req.auth = { type: "basic", value: value.replace(/^Basic\s+/i, "") }
        delete req.headers[key]
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

export function convertToNice(
  input: string,
  type: ConversionType,
): { output: string; error: string | null } {
  const trimmed = input.trim()
  if (!trimmed) return { output: "", error: null }

  try {
    let req: NiceRequest
    switch (type) {
      case "curl":
        req = parseCurl(trimmed)
        break
      case "fetch":
        req = parseFetch(trimmed)
        break
      case "axios":
        req = parseAxios(trimmed)
        break
      case "wget":
        req = parseWget(trimmed)
        break
      default:
        req = parseCurl(trimmed)
    }

    if (!req.url) {
      return { output: "", error: "Não foi possível encontrar uma URL na entrada." }
    }

    // Build the NiCE RestAPI request object, omitting empty sections.
    const nice: Record<string, unknown> = {
      method: req.method,
      url: req.url,
    }
    if (Object.keys(req.query).length) nice.query = req.query
    if (Object.keys(req.headers).length) nice.headers = req.headers
    if (req.auth) nice.auth = req.auth
    if (req.body !== undefined) nice.body = req.body

    return { output: JSON.stringify(nice, null, 2), error: null }
  } catch (err) {
    return {
      output: "",
      error: `Não foi possível converter a entrada. Verifique se o formato "${type}" está correto.`,
    }
  }
}
