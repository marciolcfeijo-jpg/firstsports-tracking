/** Synthetic test data only. Never seed customer data into production. */
export const shipmentFixture = {
  numero_pedido: "TEST-001",
  numero_nf: "000123",
  serie_nf: "01",
  cnpj_remetente: "11222333000181",
  cnpj_tomador: "11222333000181",
  cpf_cnpj_destinatario: "52998224725",
  nome_cliente: "Cliente fictício",
  email_cliente: "test@example.com",
  transportadora: "BRASPRESS" as const,
  data_emissao: "2026-10-24",
  numero_cte: "",
  cidade_destino: "São Paulo",
  uf_destino: "SP" as const,
};
export const normalizedFixture = {
  carrier: "BRASPRESS",
  currentStatus: "IN_TRANSIT" as const,
  estimatedDelivery: "2026-10-28T23:59:59-03:00",
  events: [
    {
      externalCode: "TEST-02",
      occurredAt: "2026-10-25T14:00:00-03:00",
      description: "Evento fictício de transporte",
      status: "IN_TRANSIT" as const,
    },
    {
      externalCode: "TEST-01",
      occurredAt: "2026-10-24T14:00:00-03:00",
      description: "Evento fictício de coleta",
      status: "PICKED_UP" as const,
    },
  ],
};

/** Synthetic response fixtures using documented carrier field names; no real customer payloads. */
export const braspressFixture = {
  conhecimentos: [
    {
      numero: 123456,
      previsaoEntrega: "28/10/2026",
      dataEntrega: "",
      status: "EM TRANSPORTE",
      notasFiscais: [{ serie: 1, numero: 123 }],
      timeline: [
        { descricao: "Em transporte", data: "25/10/2026 14:00:00" },
        { descricao: "Coletado", data: "24/10/2026 14:00:00" },
      ],
      ocorrencias: [],
    },
  ],
};
export const alfaFixture = {
  status: 2,
  nome: "RASTREAMENTO CONCLUIDO COM SUCESSO",
  dadosCte: { numeroNota: 123, numeroCte: 123456, dataPrivista: "2026-10-28" },
  dadosEmbarque: [
    {
      cidadeOrigem: "São Paulo",
      cidadeDestino: "Campinas",
      horaSaida: "2026-10-24 -- 14:00",
      horaChegada: "2026-10-25 -- 14:00",
    },
  ],
  ocorrenciasExtras: [
    {
      codigoOcorrencia: 12,
      dataOcorrencia: "25/10/2026 15:00",
      descricaoOcorrencia: "TRANSBORDO DA UNIDADE",
    },
  ],
};
export const alfaXmlFixture = `<?xml version="1.0"?><wsRastreamento><rst versao="1.0"><rstStatus stsCd="2">SUCESSO</rstStatus><NF nro="123"><NFCtrc>123456</NFCtrc><NFDataPrevista>2026-10-28</NFDataPrevista></NF><embarque><embNF><embOrigem>São Paulo</embOrigem><embDestino>Campinas</embDestino><embSaida>2026-10-24 -- 14:00</embSaida></embNF></embarque><entrega><entS><entSaida>2026-10-25 -- 09:00</entSaida></entS><entNF><entData>2026-10-25</entData><entHora>15:30:00</entHora><entComprovante>https://areadocliente.alfatransportes.com.br/comprovante_safe.php?cte=synthetic</entComprovante></entNF></entrega></rst></wsRastreamento>`;
