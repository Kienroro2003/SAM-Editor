import { createDbPool } from "../src/config/db.js";
import { env } from "../src/config/env.js";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run seed.");
}

const pool = createDbPool(env.DATABASE_URL);

const seedFirebaseUid = process.env.SEED_FIREBASE_UID || "demo-firebase-uid";
const seedEmail = process.env.SEED_EMAIL || "demo@sameditor.dev";
const seedDisplayName = process.env.SEED_DISPLAY_NAME || "Demo User";
const seedProjectName = process.env.SEED_PROJECT_NAME || "SAM Demo Project";

const client = await pool.connect();

try {
  await client.query("BEGIN");

  const userResult = await client.query(
    `
    INSERT INTO users (firebase_uid, email, display_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (firebase_uid)
    DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      updated_at = NOW()
    RETURNING id
  `,
    [seedFirebaseUid, seedEmail, seedDisplayName]
  );

  const userId = userResult.rows[0].id;

  const projectResult = await client.query(
    `
    INSERT INTO projects (owner_user_id, name, description)
    VALUES ($1, $2, $3)
    ON CONFLICT (owner_user_id, name)
    DO UPDATE SET
      updated_at = NOW()
    RETURNING id
  `,
    [userId, seedProjectName, "Project seeded for backend integration testing"]
  );

  const projectId = projectResult.rows[0].id;

  await client.query(
    `
    INSERT INTO project_members (project_id, user_id, role)
    VALUES ($1, $2, 'owner')
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET role = EXCLUDED.role
  `,
    [projectId, userId]
  );

  await client.query("COMMIT");

  console.log("Seed completed.");
  console.log("userId:", userId);
  console.log("projectId:", projectId);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Seed failed:", error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
