// Isolated PostgreSQL/PGlite test. Usage:
// node scripts/test-ai-foundation-db.cjs <path-to-@electric-sql/pglite>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(path.resolve(process.argv[2]));

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE organizations(id uuid PRIMARY KEY);
      CREATE TABLE users(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id));
      INSERT INTO organizations VALUES ('${id(1)}');
      INSERT INTO users VALUES ('${id(2)}','${id(1)}'),('${id(3)}','${id(1)}');
      CREATE TABLE ai_requests(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
        user_id uuid NOT NULL REFERENCES users(id), feature varchar(50) NOT NULL, model varchar(50) NOT NULL,
        input_tokens integer NOT NULL DEFAULT 0, output_tokens integer NOT NULL DEFAULT 0,
        cost_usd numeric(10,6) NOT NULL DEFAULT 0, latency_ms integer, success boolean NOT NULL DEFAULT true,
        error_message text, request_metadata jsonb, created_at timestamptz DEFAULT now()
      );
      CREATE TABLE ai_cache(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cache_key varchar(255) UNIQUE NOT NULL,
        input_hash varchar(64) NOT NULL, feature varchar(50) NOT NULL, response jsonb NOT NULL,
        hit_count integer DEFAULT 0, created_at timestamptz DEFAULT now(), expires_at timestamptz NOT NULL,
        last_accessed_at timestamptz DEFAULT now()
      );
      ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Users can view AI cache" ON ai_cache FOR SELECT USING (true);
      CREATE FUNCTION increment_cache_hit(p_cache_key varchar) RETURNS void LANGUAGE sql
        AS 'UPDATE ai_cache SET hit_count=hit_count+1 WHERE cache_key=p_cache_key';
      CREATE FUNCTION clean_expired_ai_cache() RETURNS integer LANGUAGE plpgsql AS $$
        DECLARE n integer; BEGIN DELETE FROM ai_cache WHERE expires_at < now(); GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20261017140000_ai_foundation_hardening.sql', 'utf8'));

    const reserve = (requestKey, userId, daily = 5, monthly = 7) => db.query(
      `SELECT * FROM reserve_ai_quota($1,$2,$3,'test',$4,$5)`,
      [requestKey, userId, id(1), daily, monthly],
    );
    const attempts = await Promise.all(
      Array.from({ length: 12 }, (_, index) => reserve(id(100 + index), id(2))),
    );
    assert.equal(attempts.filter((result) => result.rows[0].allowed).length, 5);

    const secondUser = await Promise.all([
      reserve(id(200), id(3)),
      reserve(id(201), id(3)),
      reserve(id(202), id(3)),
    ]);
    assert.equal(secondUser.filter((result) => result.rows[0].allowed).length, 2);

    const first = await reserve(id(300), id(3), 10, 20);
    const replay = await reserve(id(300), id(3), 10, 20);
    assert.equal(first.rows[0].reservation_id, replay.rows[0].reservation_id);
    const count = await db.query(
      `SELECT request_count FROM ai_quota_counters
       WHERE scope_type='user_day' AND scope_id=$1`,
      [id(3)],
    );
    assert.equal(count.rows[0].request_count, 3, 'idempotent replay must not consume quota twice');

    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT * FROM ai_cache'));
    await assert.rejects(db.query(`SELECT * FROM reserve_ai_quota('${id(400)}','${id(2)}','${id(1)}','test',5,7)`));
    await db.exec('RESET ROLE');

    console.log(JSON.stringify({ aiFoundationPostgresChecks: 5, productionAccess: false }));
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
