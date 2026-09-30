import { useCallback, useEffect, useState } from 'react'
import { mailCatcherUrl, supabaseBase } from '../lib/supabase'

/**
 * The local Supabase stack has no SMTP server: it hands mail to a catcher that
 * the browser cannot reach directly. This panel reads that catcher through the
 * app's own `/mb` proxy and rewrites the links inside a message to the `/sb`
 * API, so they open from the work host too.
 *
 * `onlyTo` narrows the list to one recipient. The catcher is shared by every
 * account on the stack, so without it a reset screen shows a stranger's mail
 * and it looks like the link for *your* address never arrived.
 *
 * Renders nothing when there is no catcher (offline build, hosted project).
 */

interface Message {
  ID: string
  Subject: string
  From: { Address: string }
  To: { Address: string }[]
  Created: string
  Snippet: string
}

interface Detail extends Message {
  HTML: string
  Text: string
}

const LINK_RE = /https?:\/\/[^\s<>"']+/g

export function Mailbox({
  defaultOpen = false,
  onlyTo,
}: {
  defaultOpen?: boolean
  open?: boolean
  onlyTo?: string
}) {
  const [expanded, setExpanded] = useState(defaultOpen)
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)

  const to = onlyTo?.trim().toLowerCase()

  const load = useCallback(async () => {
    if (!mailCatcherUrl) return
    try {
      const res = await fetch(`${mailCatcherUrl}/api/v1/messages`)
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { messages?: Message[] }
      const all = data.messages ?? []
      setMessages(
        to ? all.filter((m) => m.To.some((t) => t.Address.toLowerCase() === to)) : all,
      )
    } catch {
      setMessages([])
    }
  }, [to])

  useEffect(() => {
    if (!expanded) return
    void load()
    const t = setInterval(() => void load(), 4000)
    return () => clearInterval(t)
  }, [expanded, load])

  const openMessage = async (id: string) => {
    try {
      const res = await fetch(`${mailCatcherUrl}/api/v1/message/${id}`)
      const data = (await res.json()) as Detail
      setDetail(data)
    } catch {
      setDetail(null)
    }
  }

  if (!mailCatcherUrl) return null

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="tap flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-white/50 transition-colors hover:text-white/90"
      >
        <span>mailbox</span>
        {messages && messages.length > 0 && (
          <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] text-white/80">{messages.length}</span>
        )}
        <span className="ml-auto">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-white/10 p-2">
          {detail ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-white/90">{detail.Subject || '(no subject)'}</div>
                  <div className="truncate font-mono text-[10px] text-white/40">
                    to {detail.To.map((t) => t.Address).join(', ')}
                  </div>
                </div>
                <button
                  onClick={() => setDetail(null)}
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 hover:text-white/80"
                >
                  back
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {extractLinks(detail).map((href) => (
                  <a
                    key={href}
                    href={href}
                    className="rounded-lg border border-white/15 px-2 py-1 font-mono text-[10px] text-white/70 transition-colors hover:border-white/40 hover:text-white"
                  >
                    open link ↗
                  </a>
                ))}
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/55">
                {detail.Text || stripTags(detail.HTML)}
              </pre>
            </div>
          ) : (
            <>
              {messages === null && <p className="px-1 py-2 text-[11px] text-white/40">reading the mailbox…</p>}
              {messages?.length === 0 && (
                <p className="px-1 py-2 text-[11px] leading-relaxed text-white/40">
                  {to
                    ? `nothing for ${to} yet. Reset mail only goes to an address that already has a planet.`
                    : 'nothing yet. Password-reset mail from this demo lands here, never in a real inbox.'}
                </p>
              )}
              {messages?.map((m) => (
                <button
                  key={m.ID}
                  onClick={() => void openMessage(m.ID)}
                  className="block w-full rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06]"
                >
                  <div className="truncate text-[12px] text-white/85">{m.Subject || '(no subject)'}</div>
                  <div className="truncate font-mono text-[10px] text-white/40">
                    {new Date(m.Created).toLocaleTimeString()} → {m.To.map((t) => t.Address).join(', ')}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Rewrite catcher/loopback hosts to the proxied API so links work off-box. */
function extractLinks(detail: Detail): string[] {
  const found = new Set<string>()
  for (const match of `${detail.Text}\n${detail.HTML}`.match(LINK_RE) ?? []) {
    let href = match.replace(/&amp;/g, '&')
    if (supabaseBase && /^https?:\/\/(127\.0\.0\.1|localhost):54321/i.test(href)) {
      const base = supabaseBase.endsWith('/') ? supabaseBase.slice(0, -1) : supabaseBase
      href = href.replace(/^https?:\/\/(127\.0\.0\.1|localhost):54321/i, base)
    }
    if (/^https?:\/\//i.test(href) && !/\.(png|jpe?g|gif|svg|webp)$/i.test(href)) found.add(href)
  }
  return [...found].slice(0, 4)
}

const stripTags = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
