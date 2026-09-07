import type { DB } from '../db.ts';
import type { ServerConfig } from '../config.ts';
import { newId } from '../db.ts';

/* Durable outbox first, delivery second. MAIL_MODE=webhook posts each message
   to a transactional provider's inbound hook; outbox mode leaves it queued and
   logs the fact (development). Nothing here fakes a delivery. */
export async function sendMail(db: DB, cfg: ServerConfig, to: string, subject: string, body: string): Promise<void> {
  const id = newId();
  db.prepare('INSERT INTO mail_outbox (id, to_addr, subject, body, created_at) VALUES (?, ?, ?, ?, ?)').run(id, to, subject, body, Date.now());
  if (cfg.mail.mode === 'webhook' && cfg.mail.webhookUrl) {
    const r = await fetch(cfg.mail.webhookUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: cfg.mail.from, to, subject, text: body }),
    });
    if (r.ok) db.prepare('UPDATE mail_outbox SET sent_at = ? WHERE id = ?').run(Date.now(), id);
    else console.error(`[mail] webhook ${r.status} for ${id}; left in outbox`);
  } else if (!cfg.production) {
    console.log(`[mail:outbox] to=${to} subject="${subject}"\n${body}`);
  }
}
