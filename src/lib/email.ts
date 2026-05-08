import net from 'net';
import tls from 'tls';

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '0');
  const from = process.env.SMTP_FROM;
  if (!host || !port || !from) return null;
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from
  };
}

function encodeBase64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function formatMessage({ from, to, subject, text, html }: { from: string; to: string; subject: string; text: string; html?: string }) {
  const boundary = `boundary_${Math.random().toString(16).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0'
  ];
  if (html) {
    headers.push(`Content-Type: multipart/alternative; boundary=${boundary}`);
    return [
      ...headers,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      text,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      html,
      `--${boundary}--`,
      ''
    ].join('\r\n');
  }
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  return [...headers, '', text, ''].join('\r\n');
}

async function sendSmtp(config: SmtpConfig, payload: EmailPayload) {
  const socket = config.secure
    ? tls.connect({ host: config.host, port: config.port })
    : net.connect({ host: config.host, port: config.port });

  const responses: string[] = [];
  let buffer = '';

  const waitFor = (accepted: number[]) =>
    new Promise<void>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line) continue;
          responses.push(line);
          const code = Number(line.slice(0, 3));
          const done = line[3] === ' ';
          if (done) {
            socket.off('data', onData);
            if (accepted.includes(code)) resolve();
            else reject(new Error(`SMTP error: ${line}`));
          }
        }
      };
      socket.on('data', onData);
    });

  const sendLine = (line: string) =>
    new Promise<void>((resolve, reject) => {
      socket.write(`${line}\r\n`, (err) => (err ? reject(err) : resolve()));
    });

  await waitFor([220]);
  await sendLine(`EHLO ${config.host}`);
  await waitFor([250]);

  if (config.user && config.pass) {
    await sendLine('AUTH LOGIN');
    await waitFor([334]);
    await sendLine(encodeBase64(config.user));
    await waitFor([334]);
    await sendLine(encodeBase64(config.pass));
    await waitFor([235]);
  }

  await sendLine(`MAIL FROM:<${config.from}>`);
  await waitFor([250]);
  await sendLine(`RCPT TO:<${payload.to}>`);
  await waitFor([250, 251]);
  await sendLine('DATA');
  await waitFor([354]);
  const message = formatMessage({ from: config.from, to: payload.to, subject: payload.subject, text: payload.text, html: payload.html });
  await sendLine(message + '\r\n.');
  await waitFor([250]);
  await sendLine('QUIT');
  socket.end();

  return { ok: true, responses };
}

export async function sendEmail(payload: EmailPayload) {
  const config = getSmtpConfig();
  if (!config) {
    return { ok: false, error: 'SMTP config missing' };
  }
  return sendSmtp(config, payload);
}
