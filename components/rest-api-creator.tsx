"use client"

import { useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { convertToNice, type ConversionType } from "@/lib/nice-converter"

const CONVERSIONS: { id: ConversionType; label: string; placeholder: string }[] = [
  {
    id: "curl",
    label: "cURL to NiCE",
    placeholder: `curl -X POST https://api.exemplo.com/users \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer TOKEN" \\
  -d '{"name":"Ana","role":"admin"}'`,
  },
  {
    id: "fetch",
    label: "JS Fetch to NiCE",
    placeholder: `fetch("https://api.exemplo.com/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Ana" }),
})`,
  },
  {
    id: "axios",
    label: "NodeJS Axios to NiCE",
    placeholder: `axios.post("https://api.exemplo.com/users",
  { name: "Ana" },
  { headers: { Authorization: "Bearer TOKEN" } }
)`,
  },
  {
    id: "wget",
    label: "Shell wget to NiCE",
    placeholder: `wget --method=POST \\
  --header='Content-Type: application/json' \\
  --body-data='{"name":"Ana"}' \\
  https://api.exemplo.com/users`,
  },
]

export function RestApiCreator() {
  const [type, setType] = useState<ConversionType>("curl")
  const [input, setInput] = useState("")

  const active = CONVERSIONS.find((c) => c.id === type)!

  const { output, error } = useMemo(() => convertToNice(input, type), [input, type])

  return (
    <div className="min-h-svh w-full bg-background px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 rounded-3xl border border-border bg-card/40 p-6 shadow-2xl shadow-black/40 md:p-10">
        {/* Header */}
        <header className="text-center">
          <h1 className="inline-flex items-end justify-center gap-2 text-balance text-3xl font-bold tracking-tight md:text-4xl">
            <span className="text-primary" style={{ color: "oklch(0.62 0.19 255)" }}>
              NiCE
            </span>
            <span className="text-foreground">RestAPI Creator</span>
            <span className="mb-0.5 text-xs font-medium" style={{ color: "oklch(0.62 0.19 255)" }}>
              byLGomes
            </span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cole sua requisição, escolha o tipo de conversão e copie o resultado.
          </p>
        </header>

        {/* Body */}
        <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
          {/* Left: input */}
          <section className="flex flex-col gap-3">
            <label htmlFor="input" className="text-sm font-medium text-muted-foreground">
              Past your cURL
            </label>
            <textarea
              id="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={active.placeholder}
              spellCheck={false}
              className="min-h-[360px] flex-1 resize-none rounded-2xl border border-border bg-background/60 p-4 font-mono text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring focus:ring-2 focus:ring-ring/30 lg:min-h-[460px]"
            />
          </section>

          {/* Middle: conversion type selector */}
          <section className="flex flex-row flex-wrap items-center justify-center gap-3 lg:flex-col lg:justify-center">
            {CONVERSIONS.map((c) => {
              const selected = c.id === type
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setType(c.id)}
                  aria-pressed={selected}
                  className={cn(
                    "w-full min-w-[160px] rounded-xl border px-4 py-2.5 text-sm font-medium transition-all lg:w-44",
                    selected
                      ? "border-transparent bg-primary text-primary-foreground shadow-lg"
                      : "border-border bg-background/60 text-muted-foreground hover:border-ring hover:text-foreground",
                  )}
                  style={
                    selected
                      ? { backgroundColor: "oklch(0.62 0.19 255)", color: "oklch(0.98 0 0)" }
                      : undefined
                  }
                >
                  {c.label}
                </button>
              )
            })}
          </section>

          {/* Right: output with copy button */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">Copy your restAPI request</span>
              <CopyButton value={output} disabled={!output} />
            </div>
            <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-2xl border border-border bg-background/60 lg:min-h-[460px]">
              {error ? (
                <p className="p-4 font-mono text-sm text-destructive">{error}</p>
              ) : output ? (
                <pre className="h-full overflow-auto p-4 font-mono text-sm leading-relaxed text-foreground">
                  {output}
                </pre>
              ) : (
                <p className="p-4 font-mono text-sm text-muted-foreground/50">
                  {"// O resultado NiCE aparecerá aqui"}
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
        "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
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
