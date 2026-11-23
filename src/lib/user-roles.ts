import type { Role } from "@prisma/client";

export const userRoleLabels = {
  VIEWER: "Leitura geral",
  SALES: "Vendedor / representante · própria carteira",
  OPERATOR: "Operação",
  ADMIN: "Administração",
} satisfies Record<Role, string>;
