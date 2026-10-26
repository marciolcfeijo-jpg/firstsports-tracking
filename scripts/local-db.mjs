// Local development only. Never changes external databases or overwrites an existing .env.
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
const run = (args, quiet = false) => {
  const p = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (p.status !== 0)
    throw new Error("Docker operation failed: " + args.slice(0, 2).join(" "));
  return p.stdout?.trim();
};
if (!existsSync(".env")) {
  const password = randomBytes(24).toString("hex");
  writeFileSync(
    ".env",
    `DATABASE_URL=postgresql://postgres:${password}@127.0.0.1:5432/firstsports?schema=public\nTEST_DATABASE_URL=postgresql://postgres:${password}@127.0.0.1:5432/firstsports_test?schema=public\nE2E_DATABASE_URL=postgresql://postgres:${password}@127.0.0.1:5432/firstsports_e2e_test?schema=public\nAPP_URL=http://localhost:3000\nDOCUMENT_HMAC_KEY=${randomBytes(32).toString("hex")}\nCRON_SECRET=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
}
const values = parse(readFileSync(".env"));
const url = new URL(values.DATABASE_URL);
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "5432" ||
  url.username !== "postgres" ||
  !url.password ||
  url.pathname !== "/firstsports"
)
  throw new Error(
    "Existing .env is not the supported local database. Configure the database manually; no file was overwritten.",
  );
mkdirSync(".local", { recursive: true });
writeFileSync(
  ".local/postgres.env",
  `POSTGRES_USER=postgres\nPOSTGRES_DB=firstsports\nPOSTGRES_PASSWORD=${decodeURIComponent(url.password)}\n`,
  { mode: 0o600 },
);
chmodSync(".local/postgres.env", 0o600);
const check = spawnSync(
  "docker",
  ["inspect", "--format", "{{.Config.Image}}", "firstsports-postgres"],
  { encoding: "utf8" },
);
if (check.status === 0) {
  if (check.stdout.trim() !== "postgres:16-alpine")
    throw new Error(
      "Existing container has an unexpected image; left unchanged.",
    );
  run(["start", "firstsports-postgres"], true);
} else
  run([
    "run",
    "-d",
    "--name",
    "firstsports-postgres",
    "--env-file",
    ".local/postgres.env",
    "-p",
    "127.0.0.1:5432:5432",
    "postgres:16-alpine",
  ]);
let ready = false;
for (let i = 0; i < 30; i++) {
  if (
    spawnSync(
      "docker",
      ["exec", "firstsports-postgres", "pg_isready", "-U", "postgres"],
      { stdio: "ignore" },
    ).status === 0
  ) {
    ready = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!ready) throw new Error("PostgreSQL did not become ready.");
for (const name of ["firstsports_test", "firstsports_e2e_test"]) {
  const present = run(
    [
      "exec",
      "firstsports-postgres",
      "psql",
      "-U",
      "postgres",
      "-Atc",
      `SELECT 1 FROM pg_database WHERE datname='${name}'`,
    ],
    true,
  );
  if (present !== "1")
    run(
      ["exec", "firstsports-postgres", "createdb", "-U", "postgres", name],
      true,
    );
}
console.log(
  "Local PostgreSQL ready; separate test databases available. No customer fixtures were inserted.",
);
