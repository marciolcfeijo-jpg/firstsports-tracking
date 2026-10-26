import "dotenv/config";
process.env.DOCUMENT_HMAC_KEY =
  "isolated-fixture-test-hmac-key-at-least-32-characters";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres@127.0.0.1:5432/firstsports_test?schema=public";
process.env.APP_URL = "http://localhost:3000";
if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) {
  throw new Error("Tests require an isolated database ending in _test");
}
