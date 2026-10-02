// Tests for the ORBIT mail relay.
//
// A throwaway SMTP server stands in for a real provider, so the whole path is
// exercised for real: catcher -> rewrite -> SMTP conversation -> delivered bytes.
// Nothing is mocked except the remote provider itself.

import { createServer } from 'node:net'
import { reporter } from './harness.mjs'
import { rewriteLinks, buildMime, forwardMessage, readConfig, addr } from '../tools/mail-relay.mjs'

const { ok, finish } = reporter('relay')

/** Decode every base64 body part of a raw MIME message. */
function decodeBase64Parts(raw) {
  return raw
    .split(/\r\n--orbit-[^\r\n]+/)
    .map((part) => {
      const body = part.split('\r\n\r\n').slice(1).join('\r\n\r\n')
      try {
        return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')
      } catch {
        return ''
      }
    })
    .join('\n')
}

/** A minimal SMTP server that records what it was told. */
function fakeSmtp() {
  const received = []
  const server = createServer((socket) => {
    let inData = false
    let msg = ''
    let authStep = 0 // 0 = not authenticating, 1 = sent username, 2 = sent password
    let buf = ''
    socket.setEncoding('utf8')
    socket.write('220 fake.local ESMTP\r\n')
    socket.on('data', (chunk) => {
      // TCP splits anywhere, so keep the trailing partial line for the next chunk
      buf += chunk
      const lines = buf.split('\r\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (inData) {
          if (line === '.') {
            inData = false
            received.push(msg)
            msg = ''
            socket.write('250 2.0.0 Ok: queued\r\n')
          } else {
            msg += `${line}\r\n`
          }
          continue
        }
        if (authStep === 1) {
          authStep = 2
          socket.write('334 UGFzc3dvcmQ6\r\n')
          continue
        }
        if (authStep === 2) {
          authStep = 0
          socket.write('235 2.7.0 Authentication successful\r\n')
          continue
        }
        const cmd = line.toUpperCase()
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) socket.write('250-fake.local\r\n250 AUTH LOGIN\r\n')
        else if (cmd.startsWith('AUTH LOGIN')) {
          authStep = 1
          socket.write('334 VXNlcm5hbWU6\r\n')
        } else if (cmd.startsWith('MAIL FROM')) socket.write('250 2.1.0 Ok\r\n')
        else if (cmd.startsWith('RCPT TO')) socket.write('250 2.1.5 Ok\r\n')
        else if (cmd === 'DATA') {
          inData = true
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        } else if (cmd === 'QUIT') {
          socket.write('221 Bye\r\n')
          socket.end()
        } else socket.write('250 Ok\r\n')
      }
    })
  })
  return { server, received }
}

// --- unit: link rewriting -----------------------------------------------------
const PUBLIC = 'https://work-1-example.prod-runtime.all-hands.dev'
const link = 'http://127.0.0.1:54321/auth/v1/verify?token=abc&type=signup'
ok('rewrites loopback link to public origin', rewriteLinks(link, PUBLIC) === `${PUBLIC}/sb/auth/v1/verify?token=abc&type=signup`)
ok('rewrites localhost too', rewriteLinks('http://localhost:54321/x', PUBLIC) === `${PUBLIC}/sb/x`)
ok('leaves unrelated hosts alone', rewriteLinks('https://example.com/a', PUBLIC) === 'https://example.com/a')
ok('tolerates a trailing slash on the base', rewriteLinks(link, `${PUBLIC}/`) === `${PUBLIC}/sb/auth/v1/verify?token=abc&type=signup`)
ok('handles empty input', rewriteLinks('', PUBLIC) === '')

// --- unit: MIME ---------------------------------------------------------------
const mime = buildMime({
  from: 'orbit@orbit.space',
  to: 'someone@example.com',
  subject: 'Confirm your email',
  text: 'plain body',
  html: '<p>html body</p>',
})
ok('mime sets the recipient', mime.includes('To: someone@example.com'))
ok('mime declares an alternative boundary', /multipart\/alternative; boundary="orbit-/.test(mime))
ok('mime base64-encodes the text part', mime.includes(Buffer.from('plain body').toString('base64')))
ok('mime encodes a non-ascii subject', buildMime({ from: 'a@b', to: 'c@d', subject: 'Привет' }).includes('=?UTF-8?B?'))
ok('addr strips angle brackets', addr('ORBIT <orbit@orbit.space>') === 'orbit@orbit.space')

// --- integration: catcher -> SMTP --------------------------------------------
const cfg = readConfig({ RELAY_CATCHER_URL: 'http://127.0.0.1:54324', RELAY_PUBLIC_BASE: PUBLIC })
const listed = await fetch(`${cfg.catcher}/api/v1/messages`).then((r) => r.json()).catch(() => null)
if (!listed || !(listed.messages ?? []).length) {
  ok('catcher has a message to forward', false, 'no mail captured — sign a planet up first')
  finish()
  process.exit(0)
}
const target = listed.messages[listed.messages.length - 1]

const { server, received } = fakeSmtp()
await new Promise((r) => server.listen(2525, '127.0.0.1', r))

const live = {
  ...cfg,
  smtp: { host: '127.0.0.1', port: 2525, user: 'orbit', pass: 'secret', from: 'orbit@orbit.space', secure: false },
  forwardTo: 'inbox@example.com',
}
const outcome = await forwardMessage(live, target.ID)
ok('relay reports a forward', outcome.startsWith('forwarded'), outcome)
ok('smtp server accepted one message', received.length === 1, `got ${received.length}`)

const wire = received[0] ?? ''
ok('delivered to the configured mailbox', wire.includes('To: inbox@example.com'))
ok('no loopback link survives on the wire', !/127\.0\.0\.1:54321/.test(wire))
ok('subject is carried over', wire.includes('Subject: '))

// the body is base64, so decode it before looking for the link
const decoded = decodeBase64Parts(wire)
ok('public origin is present in the decoded body', decoded.includes(`${PUBLIC}/sb/auth/v1/verify`), decoded.slice(0, 80))
ok('decoded body has no loopback link', !/127\.0\.0\.1:54321/.test(decoded))

// a message with no SMTP host must not blow up, only report
const dry = await forwardMessage({ ...cfg, forwardTo: 'inbox@example.com' }, target.ID)
ok('dry run without smtp settings', dry.startsWith('dry-run'), dry)

server.close()
finish()
process.exit(0)
