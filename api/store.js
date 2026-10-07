import { neon } from '@neondatabase/serverless';
import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_PAYLOAD_CHARS = 2_000_000;
const ALLOWED_KEYS = ['paieSettings', 'paieCompanies', 'paieHistory'];

// Comparer des empreintes SHA-256 (longueur fixe) évite de révéler la longueur de la clé attendue.
function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

function authorized(req) {
  const expected = process.env.APP_ADMIN_TOKEN || '';
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || !supplied) return false;
  return timingSafeEqual(digest(expected), digest(supplied));
}

// Le client réécrit ces valeurs telles quelles dans localStorage : on n'accepte donc que
// les trois clés connues, chacune étant soit absente/nulle, soit une chaîne JSON valide.
function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Sauvegarde invalide.';
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_KEYS.includes(key)) return `Clé de sauvegarde inconnue : ${key}.`;
    const value = payload[key];
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string') return `La valeur de ${key} doit être une chaîne JSON.`;
    try {
      JSON.parse(value);
    } catch {
      return `La valeur de ${key} n’est pas un JSON valide.`;
    }
  }
  return null;
}

let tableReady;
async function ensureTable(sql) {
  // Une seule création par instance de fonction au lieu d'un CREATE TABLE à chaque requête.
  tableReady ??= sql`CREATE TABLE IF NOT EXISTS atelier_paie_store (
    id text PRIMARY KEY,
    payload jsonb NOT NULL,
    revision integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`.catch((error) => {
    tableReady = undefined;
    throw error;
  });
  return tableReady;
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

  let body;
  if (req.method === 'POST') {
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Corps de requête JSON invalide.' });
    }
    const revision = Number(body?.revision);
    if (!body || !Number.isInteger(revision) || revision < 0) {
      return res.status(400).json({ error: 'Sauvegarde ou révision invalide.' });
    }
    const invalid = validatePayload(body.payload);
    if (invalid) return res.status(400).json({ error: invalid });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    await ensureTable(sql);

    if (req.method === 'GET') {
      const rows = await sql`SELECT payload, revision FROM atelier_paie_store WHERE id = 'primary'`;
      return res.status(200).json(rows[0] || { payload: null, revision: 0 });
    }

    const serialized = JSON.stringify(body.payload);
    if (serialized.length > MAX_PAYLOAD_CHARS) {
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
    console.error('Payroll storage error:', error?.message || 'unknown');
    return res.status(500).json({ error: 'Erreur lors de l’accès à la base de données.' });
  }
}
