import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./security";

export async function verifySupabaseIdentity(
  id: string,
  expectedEmail: string,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new HttpError(
      503,
      "A verificação de UUID precisa ser configurada. Solicite ao responsável a configuração de SUPABASE_SERVICE_ROLE_KEY no servidor.",
    );

  const auth = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          redirect: "error",
          signal: AbortSignal.timeout(8000),
        }),
    },
  }).auth;
  const { data, error } = await auth.admin.getUserById(id);
  if (error && error.status !== 404)
    throw new HttpError(
      502,
      "Não foi possível verificar o usuário no Supabase Auth.",
    );
  const user = data?.user;
  if (
    !user ||
    user.id !== id ||
    user.email?.toLowerCase() !== expectedEmail.trim().toLowerCase()
  )
    throw new HttpError(
      422,
      "O novo UUID deve pertencer ao mesmo e-mail no Supabase Auth.",
    );
  if (!user.email_confirmed_at)
    throw new HttpError(
      422,
      "Confirme o e-mail da conta no Supabase Auth antes de alterar o UUID.",
    );
}
