"use client"

import { useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { convertToNice } from "@/lib/nice-converter"

const CURL_PLACEHOLDER = `curl -X POST https://api.exemplo.com/users \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer TOKEN" \\
  -d '{"name":"Ana","role":"admin"}'`

export function RestApiCreator() {
  const [input, setInput] = useState("")

  const { output, error } = useMemo(() => convertToNice(input), [input])

  return (
    <div className="min-h-svh w-full overflow-x-hidden bg-background px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 xl:px-8 xl:py-10">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6 rounded-3xl border border-border bg-card/40 p-4 shadow-2xl shadow-black/40 sm:gap-8 sm:p-6 md:p-8 xl:p-10">
        <header className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <h1 className="flex flex-wrap items-end justify-center gap-x-2 gap-y-1 text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
            <span className="shrink-0 text-primary" style={{ color: "oklch(0.62 0.19 255)" }}>
              NiCE
            </span>
            <span className="text-foreground">RestAPI Creator</span>
            <span className="text-[10px] font-medium sm:mb-0.5 sm:text-xs" style={{ color: "oklch(0.62 0.19 255)" }}>
              byLGomes
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Cole seu cURL e copie o script no padrao NiCE gerado automaticamente.
          </p>
        </header>

        <div className="grid gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex min-h-10 items-center justify-between gap-2">
              <label htmlFor="input" className="text-sm font-medium text-muted-foreground">
                Cole seu cURL
              </label>
              <div className="min-h-10 w-[77px] shrink-0 opacity-0" aria-hidden="true" />
            </div>
            <textarea
              id="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={CURL_PLACEHOLDER}
              spellCheck={false}
              className="h-[360px] w-full overflow-auto resize-none rounded-2xl border border-border bg-background/60 p-3 font-mono text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring focus:ring-2 focus:ring-ring/30 sm:h-[420px] sm:p-4 xl:h-[640px]"
            />
          </section>

          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex min-h-10 items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">Script NiCE gerado</span>
              <CopyButton value={output} disabled={!output} />
            </div>
            <div className="relative h-[360px] min-w-0 overflow-hidden rounded-2xl border border-border bg-background/60 sm:h-[420px] xl:h-[640px]">
              {error ? (
                <p className="p-4 font-mono text-sm text-destructive">{error}</p>
              ) : output ? (
                <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-foreground sm:p-4 sm:text-sm">
                  {output}
                </pre>
              ) : (
                <p className="p-4 font-mono text-sm text-muted-foreground/50">
                  {"// O script NiCE aparecera aqui"}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function CopyButton({ value, disabled }: { value: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-1.5 self-start rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto",
      )}
    >
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden="true" />
          Copiado
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden="true" />
          Copy
        </>
      )}
    </button>
  )
}
