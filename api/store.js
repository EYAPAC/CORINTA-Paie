import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';

function authorized(req) {
  const expected = process.env.APP_ADMIN_TOKEN || '';
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }
  if (!authorized(req)) return res.status(401).json({ error: 'Clé administrateur invalide.' });
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'La base PostgreSQL n’est pas connectée au projet.' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`CREATE TABLE IF NOT EXISTS atelier_paie_store (
      id text PRIMARY KEY,
      payload jsonb NOT NULL,
      revision integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT payload, revision FROM atelier_paie_store WHERE id = 'primary'`;
      return res.status(200).json(rows[0] || { payload: null, revision: 0 });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !body.payload || !Number.isInteger(Number(body.revision))) {
      return res.status(400).json({ error: 'Sauvegarde ou révision invalide.' });
    }
    const serialized = JSON.stringify(body.payload);
    if (serialized.length > 2_000_000) {
      return res.status(413).json({ error: 'La sauvegarde dépasse la taille autorisée.' });
    }

    const expectedRevision = Number(body.revision);
    const rows = await sql`
      INSERT INTO atelier_paie_store (id, payload, revision)
      VALUES ('primary', ${serialized}::jsonb, 1)
      ON CONFLICT (id) DO UPDATE
      SET payload = ${serialized}::jsonb,
          revision = atelier_paie_store.revision + 1,
          updated_at = now()
      WHERE atelier_paie_store.revision = ${expectedRevision}
      RETURNING revision
    `;
    if (!rows.length) {
      return res.status(409).json({ error: 'La base a changé depuis la dernière synchronisation. Rechargez-la avant de continuer.' });
    }
    return res.status(200).json({ revision: rows[0].revision });
  } catch (error) {
    console.error('Payroll storage error:', error);
    return res.status(500).json({ error: 'Erreur lors de l’accès à la base de données.' });
  }
}
