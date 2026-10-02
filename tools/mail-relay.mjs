#!/usr/bin/env node
// ORBIT mail relay.
//
// The local Supabase stack ships no SMTP server, so every auth mail (signup
// confirmation, password reset, email-change confirmation) stops at the Inbucket
// catcher and never reaches a real inbox. This process bridges that gap: it polls
// the catcher and re-sends each message over real SMTP, rewriting the loopback
// links inside it to the public origin first — otherwise the recipient would get
// a `http://127.0.0.1:54321/...` link that only resolves on this machine.
//
// Dependency-free, and configured entirely from the environment or a gitignored
// `.env.relay`, so no credentials ever enter the repository:
//
//   npm run relay:mail
//
// With no SMTP settings it still runs and reports what it *would* forward, which
// keeps it useful as a diagnostic.

import { connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SEEN_FILE = resolve(HERE, '.mail-relay-seen.json')

/** Loopback origin the auth server puts in mail; it only works on this box. */
const LOOPBACK = /https?:\/\/(?:127\.0\.0\.1|localhost):54321/gi

/** Point every auth link at the public origin, keeping the `/sb` proxy prefix. */
export function rewriteLinks(text, base) {
  if (!text) return text
  return text.replace(LOOPBACK, `${base.replace(/\/+$/, '')}/sb`)
}

/** Minimal RFC 5322 message with both a text and an HTML alternative. */
export function buildMime({ from, to, subject, text, html }) {
  const boundary = `orbit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const enc = (s) => Buffer.from(s ?? '', 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n')
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject || '(no subject)')}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
  const body = [
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    enc(text || stripTags(html)),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    enc(html || `<pre>${text ?? ''}</pre>`),
    `--${boundary}--`,
    '',
  ]
  return `${headers.join('\r\n')}\r\n${body.join('\r\n')}`
}

const stripTags = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

/** RFC 2047 encode a header only when it holds non-ASCII. */
function encodeHeader(value) {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/** Pull `user@host` out of a possibly decorated address. */
export const addr = (value) => {
  const m = String(value).match(/<([^>]+)>/)
  return (m ? m[1] : String(value)).trim()
}

/** Lines starting with a dot must be escaped inside DATA. */
const dotStuff = (data) => data.replace(/\r\n\./g, '\r\n..')

/**
 * A small SMTP client: EHLO, opportunistic STARTTLS, AUTH LOGIN, one message per
 * connection. Enough for a transactional relay, with nothing to audit but this.
 */
export class SmtpClient {
  constructor({ host, port = 587, user, pass, secure = false, timeout = 15000 }) {
    Object.assign(this, { host, port, user, pass, secure, timeout })
    this.buffer = ''
    this.reply = []
    this.pending = []
    this.socket = null
  }

  async connect() {
    this.encrypted = this.secure
    this.socket = this.secure
      ? await new Promise((ok, no) => {
          const t = tlsConnect({ host: this.host, port: this.port, servername: this.host }, () => ok(t))
          t.once('error', no)
        })
      : await new Promise((ok, no) => {
          const c = netConnect({ host: this.host, port: this.port })
          c.once('connect', () => ok(c))
          c.once('error', no)
        })
    this.#attach()
    await this.#expect(220)
  }

  /**
   * Wire the socket to the line reader. Handlers are kept by reference so they
   * can be detached individually before a TLS upgrade — removing *all* listeners
   * on the raw socket would also strip the ones the TLS layer installs on it.
   */
  #attach() {
    this.handlers = {
      data: (chunk) => this.#onData(chunk),
      error: (e) => this.#fail(e),
      close: () => this.#fail(new Error('smtp connection closed')),
      timeout: () => this.#fail(new Error('smtp timeout')),
    }
    this.socket.setEncoding('utf8')
    this.socket.setTimeout(this.timeout, this.handlers.timeout)
    this.socket.on('data', this.handlers.data)
    this.socket.on('error', this.handlers.error)
    this.socket.on('close', this.handlers.close)
  }

  #detach() {
    if (!this.socket || !this.handlers) return
    this.socket.off('data', this.handlers.data)
    this.socket.off('error', this.handlers.error)
    this.socket.off('close', this.handlers.close)
    this.socket.setTimeout(0)
    this.handlers = null
  }

  /**
   * Split incoming bytes into replies. A reply is one or more lines: every line
   * but the last is flagged with a `-` after the code, and the terminating line
   * has a space. Servers routinely send a whole reply in one chunk, so each
   * pending waiter gets the complete reply, not just its first line.
   */
  #onData(chunk) {
    this.buffer += chunk
    for (;;) {
      const idx = this.buffer.indexOf('\r\n')
      if (idx === -1) return
      const line = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 2)
      this.reply.push(line)
      if (/^\d{3}-/.test(line)) continue
      const reply = this.reply.join('\n')
      this.reply = []
      this.pending.shift()?.(reply)
    }
  }

  #fail(err) {
    while (this.pending.length) this.pending.shift()(err)
  }

  #readLine() {
    return new Promise((ok, no) =>
      this.pending.push((line) => (line instanceof Error ? no(line) : ok(line))),
    )
  }

  async #expect(code) {
    const line = await this.#readLine()
    if (line instanceof Error) throw line
    if (!line.startsWith(String(code))) throw new Error(`smtp expected ${code}, got: ${line}`)
    return line
  }

  async #send(cmd, code) {
    this.socket.write(`${cmd}\r\n`)
    return this.#expect(code)
  }

  /** Say hello and remember the server's capabilities. */
  async sendEhlo() {
    this.caps = await this.#send('EHLO orbit.local', 250)
    return this.caps
  }

  /**
   * STARTTLS is opportunistic: only attempted when the server advertises it.
   * Returns the capability reply, which is what callers assert against.
   */
  async startTlsIfOffered() {
    await this.sendEhlo()
    if (this.encrypted || !/STARTTLS/i.test(this.caps)) return this.caps
    await this.#send('STARTTLS', 220)
    // Detach only our own plaintext handlers; the TLS layer installs its own on
    // the same raw socket, and removing those would break the handshake.
    const raw = this.socket
    this.#detach()
    this.socket = await new Promise((ok, no) => {
      const t = tlsConnect({ socket: raw, servername: this.host }, () => ok(t))
      t.once('error', no)
    })
    this.encrypted = true
    this.buffer = ''
    this.reply = []
    this.#attach()
    await this.#send('EHLO orbit.local', 250)
    return this.caps
  }

  async auth() {
    if (!this.user) return
    // If the server offers STARTTLS but the connection is still plaintext, the
    // upgrade was missed — never put credentials on the wire in that state.
    if (!this.encrypted && /STARTTLS/i.test(this.caps ?? '')) {
      throw new Error('refusing to send SMTP credentials without TLS')
    }
    await this.#send('AUTH LOGIN', 334)
    await this.#send(Buffer.from(this.user, 'utf8').toString('base64'), 334)
    await this.#send(Buffer.from(this.pass ?? '', 'utf8').toString('base64'), 235)
  }

  async sendMail({ from, to, data }) {
    await this.#send(`MAIL FROM:<${addr(from)}>`, 250)
    await this.#send(`RCPT TO:<${addr(to)}>`, 250)
    await this.#send('DATA', 354)
    this.socket.write(`${dotStuff(data)}\r\n.\r\n`)
    await this.#expect(250)
  }

  async close() {
    try {
      this.socket?.write('QUIT\r\n')
    } catch {
      /* already gone */
    }
    this.socket?.destroy()
  }
}

export function loadEnv(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

/** Read the relay settings, preferring the environment over `.env.relay`. */
export function readConfig(env = process.env) {
  return {
    catcher: env.RELAY_CATCHER_URL || 'http://127.0.0.1:54324',
    publicBase: env.RELAY_PUBLIC_BASE || 'http://localhost:12000',
    smtp: {
      host: env.RELAY_SMTP_HOST || '',
      port: Number(env.RELAY_SMTP_PORT || 587),
      user: env.RELAY_SMTP_USER || '',
      pass: env.RELAY_SMTP_PASS || '',
      from: env.RELAY_SMTP_FROM || '',
      secure: String(env.RELAY_SMTP_SECURE || '') === 'true',
    },
    /** Send everything here instead of the address the mail was addressed to. */
    forwardTo: env.RELAY_FORWARD_TO || '',
    pollMs: Number(env.RELAY_POLL_MS || 3000),
  }
}

const loadSeen = () => {
  try {
    return new Set(JSON.parse(readFileSync(SEEN_FILE, 'utf8')))
  } catch {
    return new Set()
  }
}
const saveSeen = (seen) => writeFileSync(SEEN_FILE, JSON.stringify([...seen].slice(-500)))

/** Fetch one captured message, rewritten and ready to forward. */
export async function fetchMessage(cfg, id) {
  const res = await fetch(`${cfg.catcher}/api/v1/message/${id}`)
  if (!res.ok) throw new Error(`catcher ${res.status}`)
  const d = await res.json()
  return {
    to: cfg.forwardTo || addr(d.To?.[0]?.Address || ''),
    subject: d.Subject || '(no subject)',
    text: rewriteLinks(d.Text || '', cfg.publicBase),
    html: rewriteLinks(d.HTML || '', cfg.publicBase),
  }
}

/** Forward a single captured message. Returns a short outcome string. */
export async function forwardMessage(cfg, id, { attempts = 3 } = {}) {
  const msg = await fetchMessage(cfg, id)
  if (!msg.to) return 'skipped: no recipient'
  const from = cfg.smtp.from || cfg.smtp.user
  if (!cfg.smtp.host) return `dry-run: would forward "${msg.subject}" to ${msg.to}`

  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const client = new SmtpClient(cfg.smtp)
    try {
      await client.connect()
      await client.startTlsIfOffered()
      await client.auth()
      await client.sendMail({ from, to: msg.to, data: buildMime({ from, to: msg.to, ...msg }) })
      return `forwarded "${msg.subject}" to ${msg.to}`
    } catch (e) {
      lastError = e
      // A transient network fault should not lose the mail; back off and retry.
      if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 1000))
    } finally {
      await client.close()
    }
  }
  throw lastError
}

/** Poll the catcher forever, forwarding only messages we have not seen. */
export async function runRelay(cfg = readConfig()) {
  const seen = loadSeen()
  const mode = cfg.smtp.host ? `smtp ${cfg.smtp.host}:${cfg.smtp.port}` : 'no SMTP configured (dry run)'
  console.log(`orbit mail relay → ${cfg.catcher} | ${mode}`)
  console.log(`links rewritten to ${cfg.publicBase.replace(/\/+$/, '')}/sb`)
  for (;;) {
    try {
      const res = await fetch(`${cfg.catcher}/api/v1/messages`)
      const data = await res.json()
      for (const m of data.messages ?? []) {
        if (seen.has(m.ID)) continue
        seen.add(m.ID)
        try {
          console.log(`· ${await forwardMessage(cfg, m.ID)}`)
        } catch (e) {
          console.error(`! ${m.ID}: ${e.message}`)
        }
        saveSeen(seen)
      }
    } catch (e) {
      console.error(`! catcher unreachable: ${e.message}`)
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs))
  }
}

loadEnv(resolve(ROOT, '.env.relay'))
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runRelay()
}
