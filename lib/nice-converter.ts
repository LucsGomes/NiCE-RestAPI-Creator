export interface NiceRequest {
  method: string
  url: string
  query: Record<string, string>
  headers: Record<string, string>
  auth?: { type: "basic" | "bearer"; value: string }
  body?: unknown
}

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
    return normalizeBodyPlaceholders(JSON.parse(trimmed))
  } catch {
    const looseObject = tryParseLooseJsonObject(trimmed)
    if (looseObject) return looseObject

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

function normalizeRequestBody(value: unknown): unknown {
  if (value === undefined) return undefined
  if (typeof value === "string") return tryParseJson(value)
  return normalizeBodyPlaceholders(value)
}

function normalizeBodyPlaceholders(value: unknown, keyName?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeBodyPlaceholders(item))
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        normalizeBodyPlaceholders(nestedValue, key),
      ]),
    )
  }

  if (value === "" && keyName) return `{${keyName}}`
  return value
}

function tryParseLooseJsonObject(input: string): Record<string, unknown> | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null

  const body = trimmed.slice(1, -1)
  const segments = splitTopLevelArgs(body)
  if (!segments.length) return {}

  const result: Record<string, unknown> = {}

  for (const segment of segments) {
    const colonIndex = findTopLevelColon(segment)
    if (colonIndex === -1) return null

    const rawKey = segment.slice(0, colonIndex).trim()
    const rawValue = segment.slice(colonIndex + 1).trim()
    const key = rawKey.replace(/^['"]|['"]$/g, "")
    if (!key) return null

    if (!rawValue || rawValue === '""' || rawValue === "''") {
      result[key] = `{${key}}`
      continue
    }

    if (
      (rawValue.startsWith("{") && rawValue.endsWith("}")) ||
      (rawValue.startsWith("[") && rawValue.endsWith("]"))
    ) {
      result[key] = normalizeBodyPlaceholders(tryParseJson(rawValue), key)
      continue
    }

    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      result[key] = normalizeBodyPlaceholders(rawValue.slice(1, -1), key)
      continue
    }

    if (rawValue === "true" || rawValue === "false") {
      result[key] = rawValue === "true"
      continue
    }

    if (rawValue === "null") {
      result[key] = null
      continue
    }

    const numericValue = Number(rawValue)
    if (!Number.isNaN(numericValue) && rawValue !== "") {
      result[key] = numericValue
      continue
    }

    result[key] = rawValue
  }

  return result
}

function findTopLevelColon(text: string): number {
  let depth = 0
  let quote: string | null = null

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      if (char === quote && text[i - 1] !== "\\") quote = null
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char
      continue
    }

    if (char === "{" || char === "[") depth++
    else if (char === "}" || char === "]") depth--
    else if (char === ":" && depth === 0) return i
  }

  return -1
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

function tokenizeShell(input: string): string[] {
  const cleaned = input.replace(/\\\r?\n/g, " ").trim()
  const tokens: string[] = []
  let current = ""
  let quote: '"' | "'" | null = null
  let hasContent = false

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i]
    if (quote) {
      if (char === quote) quote = null
      else current += char
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
    if (token.startsWith("--") && eq !== -1) return [token.slice(eq + 1), i]
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
    } else if (
      token === "--compressed" ||
      token === "-L" ||
      token === "--location" ||
      token === "--globoff" ||
      token === "-s" ||
      token === "--silent" ||
      token === "-k" ||
      token === "--insecure"
    ) {
      // ignore flags without value
    } else if (token === "-o" || token === "-O" || token === "--output") {
      i = i + 1
    } else if (!token.startsWith("-") && !req.url) {
      req.url = token
    }
  }

  if (dataParts.length) {
    req.body = normalizeRequestBody(dataParts.join("&"))
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

function stringifyNiceValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value)
  if (value === null) return '""'
  return JSON.stringify(String(value))
}

function toNiceIdentifier(key: string): string {
  const cleaned = key.replace(/[^a-zA-Z0-9_]/g, " ")
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (!parts.length) return "value"

  return parts
    .map((part, index) => {
      const normalized = part.replace(/^[^a-zA-Z_]+/, "")
      if (!normalized) return ""
      if (index === 0) return normalized
      return normalized.charAt(0).toUpperCase() + normalized.slice(1)
    })
    .join("")
}

function buildNiceAssignments(target: string, value: unknown, lines: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      buildNiceAssignments(`${target}[${index + 1}]`, item, lines)
    })
    return
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      buildNiceAssignments(`${target}.${key}`, nestedValue, lines)
    }
    return
  }

  lines.push(`ASSIGN ${target} = ${stringifyNiceValue(value)}`)
}

function buildUrlWithQuery(req: NiceRequest): string {
  const queryEntries = Object.entries(req.query)
  if (!queryEntries.length) return req.url

  const queryString = queryEntries.map(([key, value]) => `${key}=${value}`).join("&")
  return `${req.url}?${queryString}`
}

function renderNiceScript(req: NiceRequest): string {
  const headerAssignments: string[] = []
  const headerReplacements: Array<{ from: string; to: string }> = []
  const headers = { ...req.headers }

  if (req.auth) {
    headers.Authorization =
      req.auth.type === "bearer" ? "{Authorization}" : `Basic ${req.auth.value}`
  }

  if (!("Accept" in headers) && !("accept" in headers)) {
    headers.Accept = "*/*"
  }

  if (!("Content-Type" in headers) && !("content-type" in headers)) {
    const queryContentType = req.query.contentType ?? req.query.contenttype
    if (queryContentType) {
      headers["Content-Type"] = queryContentType
    }
  }

  for (const [key, value] of Object.entries(headers)) {
    const niceKey = toNiceIdentifier(key)
    headerAssignments.push(`ASSIGN headers.${niceKey} = ${JSON.stringify(value)}`)
    if (niceKey !== key) {
      headerReplacements.push({ from: niceKey, to: key })
    }
  }

  const bodyAssignments: string[] = []
  if (req.body !== undefined) {
    buildNiceAssignments("data", req.body, bodyAssignments)
  }

  const sections: string[] = []
  sections.push(`ASSIGN global:uri = ${JSON.stringify(buildUrlWithQuery(req))}`)

  if (headerAssignments.length) {
    sections.push("")
    sections.push("DYNAMIC headers")
    sections.push("")
    sections.push(...headerAssignments.map((line) => `\t${line}`))
    sections.push('\tASSIGN headersjson = "{headers.asjson()}"')
    for (const replacement of headerReplacements) {
      sections.push(
        `\tASSIGN headersjson = headersjson.replace(${JSON.stringify(replacement.from)}, ${JSON.stringify(replacement.to)})`,
      )
    }
  }

  if (bodyAssignments.length) {
    sections.push("")
    sections.push("DYNAMIC data")
    sections.push("")
    sections.push(...bodyAssignments.map((line) => `\t${line}`))
    sections.push("")
    sections.push('\tASSIGN paramsjson = "{data.asJson()}"')
  }

  return sections.join("\n")
}

export function convertToNice(input: string): { output: string; error: string | null } {
  const trimmed = input.trim()
  if (!trimmed) return { output: "", error: null }

  try {
    const req = parseCurl(trimmed)

    if (!req.url) {
      return { output: "", error: "NÃ£o foi possÃ­vel encontrar uma URL na entrada." }
    }

    return { output: renderNiceScript(req), error: null }
  } catch {
    return {
      output: "",
      error: 'NÃ£o foi possÃ­vel converter a entrada. Verifique se o cURL estÃ¡ correto.',
    }
  }
}
