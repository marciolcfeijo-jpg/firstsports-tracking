import { spawnSync } from "node:child_process";

function run(script) {
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (process.env.VERCEL_ENV === "production") {
  let connection;
  try {
    connection = new URL(process.env.DATABASE_URL || "");
  } catch {
    throw new Error(
      "Configure DATABASE_URL como Secret no ambiente Production da Vercel.",
    );
  }
  if (!["postgres:", "postgresql:"].includes(connection.protocol)) {
    throw new Error(
      "DATABASE_URL deve conter a conexão PostgreSQL, não a URL HTTPS nem uma API key do Supabase.",
    );
  }
  if ((process.env.DOCUMENT_HMAC_KEY || "").length < 32) {
    throw new Error(
      "Configure DOCUMENT_HMAC_KEY como Secret estável de pelo menos 32 caracteres em Production.",
    );
  }
  console.log(
    "Preparando banco do portal: migrations versionadas e cadastro de transportadoras.",
  );
  run("db:generate");
  run("db:migrate");
  run("db:seed");
} else {
  console.log(
    "Build fora de Production: migrations automáticas não são executadas. Use um banco isolado para testes e previews.",
  );
}
run("build");
