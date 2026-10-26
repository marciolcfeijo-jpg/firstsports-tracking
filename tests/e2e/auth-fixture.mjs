// Isolated Supabase HTTP fixture. Never imported by application code or used in production.
import http from "node:http";
const user = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  aud: "authenticated",
  role: "authenticated",
  email: "admin@example.test",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
};
const token = () =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        aud: "authenticated",
        role: "authenticated",
        email: user.email,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "synthetic-fixture-signature",
  ].join(".");
http
  .createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    let raw = "";
    for await (const c of req) raw += c;
    const data = raw ? JSON.parse(raw) : {};
    if (
      req.url?.startsWith("/auth/v1/token") &&
      (data.grant_type === "refresh_token" ||
        data.refresh_token === "synthetic-refresh-token" ||
        (data.email === user.email &&
          data.password === "fixture-password-only"))
    ) {
      res.end(
        JSON.stringify({
          access_token: token(),
          refresh_token: "synthetic-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          user,
        }),
      );
      return;
    }
    if (
      req.url === "/auth/v1/user" &&
      req.headers.authorization?.startsWith("Bearer ey")
    ) {
      res.end(JSON.stringify(user));
      return;
    }
    if (req.url?.startsWith("/auth/v1/logout")) {
      res.statusCode = 204;
      res.end();
      return;
    }
    res.statusCode = 401;
    res.end(
      JSON.stringify({
        message: "Invalid fixture credentials",
        error_code: "invalid_credentials",
      }),
    );
  })
  .listen(54321, "127.0.0.1");
