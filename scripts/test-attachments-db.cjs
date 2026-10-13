// Real isolated PostgreSQL; requires the same PGlite harness used by property tests.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require(path.resolve(process.argv[2]));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function main() {
  const db = new PGlite();
  let checks = 0;
  const reject = async (sql, args = []) => {
    await assert.rejects(db.query(sql, args));
    checks++;
  };
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE organizations(id uuid PRIMARY KEY);CREATE TABLE teams(id uuid PRIMARY KEY);CREATE TABLE users(id uuid PRIMARY KEY);
 CREATE TABLE tasks(id uuid PRIMARY KEY, organization_id uuid, team_id uuid, checklist_blocks jsonb);
 CREATE TABLE notes(id uuid PRIMARY KEY, task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,content jsonb);
 INSERT INTO organizations VALUES('${id(1)}'),('${id(2)}');INSERT INTO teams VALUES('${id(3)}'),('${id(4)}');INSERT INTO users VALUES('${id(5)}');
 INSERT INTO tasks VALUES('${id(6)}','${id(1)}','${id(3)}','{"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","attrs":{"id":"stable-child"}}]}]}'),('${id(7)}','${id(2)}','${id(4)}','{}');
 INSERT INTO notes VALUES('${id(8)}','${id(6)}','{}'),('${id(9)}','${id(7)}','{}');`);
    await db.exec(
      fs.readFileSync(
        "supabase/migrations/20261012120000_private_attachments.sql",
        "utf8",
      ),
    );
    const insert = `INSERT INTO attachments(id,task_id,organization_id,team_id,uploaded_by,filename,mime_type,size_bytes,object_key,staging_key,status)
 VALUES($1::uuid,$2,$3,$4,$5,'sample.png','image/png',$6,$1::text||'/doc',$1::text||'/pending','ready')`;
    await db.query(insert, [id(10), id(6), id(2), id(4), id(5), 100]);
    const file = (
      await db.query("SELECT * FROM attachments WHERE id=$1", [id(10)])
    ).rows[0];
    assert.equal(file.organization_id, id(1));
    assert.equal(file.team_id, id(3));
    checks++;
    await db.query(
      "INSERT INTO attachment_links(attachment_id,task_id) VALUES($1,$2)",
      [id(10), id(6)],
    );
    await reject(
      "INSERT INTO attachment_links(attachment_id,task_id) VALUES($1,$2)",
      [id(10), id(7)],
    );
    await reject(
      "INSERT INTO attachment_links(attachment_id,task_id,note_id) VALUES($1,$2,$3)",
      [id(10), id(6), id(9)],
    );
    await reject(
      "INSERT INTO attachment_links(attachment_id,task_id,checklist_item_id) VALUES($1,$2,'absent')",
      [id(10), id(6)],
    );
    await db.query(
      "INSERT INTO attachment_links(attachment_id,task_id,checklist_item_id) VALUES($1,$2,'stable-child')",
      [id(10), id(6)],
    );
    const doc = {
      type: "doc",
      content: [{ type: "attachment", attrs: { attachmentId: id(10) } }],
    };
    await db.query("UPDATE notes SET content=$1 WHERE id=$2", [
      JSON.stringify(doc),
      id(8),
    ]);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM attachment_links")).rows[0]
        .n,
      3,
    );
    checks++;
    await reject("UPDATE notes SET content=$1 WHERE id=$2", [
      JSON.stringify(doc),
      id(9),
    ]);
    await db.query("UPDATE notes SET content='{}' WHERE id=$1", [id(8)]);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM attachment_links")).rows[0]
        .n,
      2,
    );
    checks++;
    await db.query("UPDATE notes SET content=$1 WHERE id=$2", [
      JSON.stringify(doc),
      id(8),
    ]); // editor Undo
    await db.query("UPDATE tasks SET checklist_blocks='{}' WHERE id=$1", [
      id(6),
    ]);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM attachment_links")).rows[0]
        .n,
      2,
    );
    checks++;
    await reject("UPDATE tasks SET team_id=$1 WHERE id=$2", [id(4), id(6)]);
    await db.exec("SET ROLE authenticated");
    await reject("SELECT * FROM attachments");
    await reject("SELECT * FROM attachment_links");
    await reject("SELECT claim_attachment_cleanup()");
    await db.exec("RESET ROLE");
    await db.query(
      "UPDATE attachments SET updated_at=now()-interval '30 days' WHERE id=$1",
      [id(10)],
    );
    assert.equal(
      (await db.query("SELECT * FROM claim_attachment_cleanup()")).rows.length,
      0,
    );
    checks++;
    await db.query("DELETE FROM attachment_links WHERE attachment_id=$1", [
      id(10),
    ]);
    assert.equal(
      (await db.query("SELECT * FROM claim_attachment_cleanup()")).rows.length,
      0,
    );
    checks++;
    await db.query(
      "UPDATE attachments SET updated_at=now()-interval '8 days' WHERE id=$1",
      [id(10)],
    );
    assert.equal(
      (await db.query("SELECT * FROM claim_attachment_cleanup()")).rows.length,
      1,
    );
    checks++;
    await reject(
      "INSERT INTO attachment_links(attachment_id,task_id) VALUES($1,$2)",
      [id(10), id(6)],
    );
    await db.query(insert, [id(11), id(6), id(1), id(3), id(5), 100]);
    await db.query(
      "UPDATE attachments SET created_at=now()-interval '2 days' WHERE id=$1",
      [id(11)],
    );
    await db.query("DELETE FROM tasks WHERE id=$1", [id(6)]);
    assert.equal(
      (await db.query("SELECT task_id FROM attachments WHERE id=$1", [id(11)]))
        .rows[0].task_id,
      null,
    );
    checks++;
    assert.equal(
      (await db.query("SELECT * FROM claim_attachment_cleanup()")).rows.length,
      1,
    );
    checks++;
    // Atomic reservation guard also counts pending uploads (parallel requests cannot oversubscribe).
    for (let i = 100; i < 130; i++)
      await db
        .query(insert, [id(i), id(7), id(2), id(4), id(5), 1])
        .catch((error) => {
          if (!/Upload limit/.test(error.message)) throw error;
        });
    await reject(insert, [id(130), id(7), id(2), id(4), id(5), 1]);
    console.log(
      JSON.stringify({ postgresChecks: checks, productionAccess: false }),
    );
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
