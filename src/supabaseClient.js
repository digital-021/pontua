import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const LIMITE_CLIENTES = 50;

function normalizarTelefone(telefone) {
  return String(telefone || "").replace(/\D/g, "");
}

function credenciaisPorTelefone(telefone) {
  const digits = normalizarTelefone(telefone);
  return {
    email: `tel${digits}@agenciaemdia.app`,
    password: `aed-${digits}`,
  };
}

export async function entrarOuCadastrar(nome, telefone) {
  const digits = normalizarTelefone(telefone);
  if (!nome.trim() || digits.length < 8) {
    throw new Error("Informe nome e telefone válidos.");
  }
  const { email, password } = credenciaisPorTelefone(digits);

  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signIn.error) return signIn.data;

  const signUp = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nome: nome.trim(), telefone: digits } },
  });
  if (signUp.error) throw signUp.error;
  return signUp.data;
}

export async function sair() {
  await supabase.auth.signOut();
}

export async function buscarPerfil(userId) {
  const { data, error } = await supabase.from("perfis").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

function rowParaCliente(row) {
  return {
    id: row.id,
    nome: row.nome,
    empresa: row.empresa || "",
    whatsapp: row.whatsapp || "",
    email: row.email || "",
    servico: row.servico || "",
    valorMensal: row.valor_mensal,
    diaVencimento: row.dia_vencimento,
    proximoVencimento: row.proximo_vencimento,
    frequencia: row.frequencia || "mensal",
    formaPagamento: row.forma_pagamento || "Pix",
    chavePix: row.chave_pix || "",
    observacoes: row.observacoes || "",
    statusCliente: row.status_cliente || "ativo",
    pagoNesteCiclo: row.pago_neste_ciclo || false,
    historico: [],
  };
}

function clienteParaRow(cliente, userId) {
  return {
    user_id: userId,
    nome: cliente.nome,
    empresa: cliente.empresa || null,
    whatsapp: cliente.whatsapp || null,
    email: cliente.email || null,
    servico: cliente.servico || null,
    valor_mensal: Number(cliente.valorMensal) || 0,
    dia_vencimento: cliente.diaVencimento || null,
    proximo_vencimento: cliente.proximoVencimento || null,
    frequencia: cliente.frequencia || "mensal",
    forma_pagamento: cliente.formaPagamento || null,
    chave_pix: cliente.chavePix || null,
    observacoes: cliente.observacoes || null,
    status_cliente: cliente.statusCliente || "ativo",
    pago_neste_ciclo: !!cliente.pagoNesteCiclo,
  };
}

function rowParaHistorico(row) {
  return {
    id: row.id,
    data: row.data,
    valor: row.valor,
    status: row.status,
    dataPagamento: row.data_pagamento,
    dataLembrete: row.data_lembrete,
    canal: row.canal,
    observacoes: row.observacoes || "",
  };
}

function historicoParaRow(entry, clienteId, userId) {
  return {
    cliente_id: clienteId,
    user_id: userId,
    data: entry.data,
    valor: entry.valor,
    status: entry.status,
    data_pagamento: entry.dataPagamento || null,
    data_lembrete: entry.dataLembrete || null,
    canal: entry.canal || null,
    observacoes: entry.observacoes || null,
  };
}

function rowParaTemplates(row) {
  if (!row) return null;
  return {
    antes5: row.antes5,
    antes2: row.antes2,
    diaVencimento: row.dia_vencimento,
    atraso1: row.atraso1,
    atraso3: row.atraso3,
    atraso7: row.atraso7,
    confirmacao: row.confirmacao,
  };
}

function templatesParaRow(templates, userId) {
  return {
    user_id: userId,
    antes5: templates.antes5,
    antes2: templates.antes2,
    dia_vencimento: templates.diaVencimento,
    atraso1: templates.atraso1,
    atraso3: templates.atraso3,
    atraso7: templates.atraso7,
    confirmacao: templates.confirmacao,
  };
}

export async function carregarDados(userId) {
  const [clientesRes, historicoRes, templatesRes] = await Promise.all([
    supabase.from("clientes").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("historico").select("*").eq("user_id", userId).order("data", { ascending: false }),
    supabase.from("templates").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  if (clientesRes.error) throw clientesRes.error;
  if (historicoRes.error) throw historicoRes.error;
  if (templatesRes.error) throw templatesRes.error;

  const clientes = (clientesRes.data || []).map(rowParaCliente);
  const porCliente = {};
  (historicoRes.data || []).forEach((h) => {
    if (!porCliente[h.cliente_id]) porCliente[h.cliente_id] = [];
    porCliente[h.cliente_id].push(rowParaHistorico(h));
  });
  clientes.forEach((c) => { c.historico = porCliente[c.id] || []; });

  return { clientes, templates: rowParaTemplates(templatesRes.data) };
}

export async function inserirCliente(cliente, userId) {
  const { data, error } = await supabase.from("clientes").insert(clienteParaRow(cliente, userId)).select().single();
  if (error) throw error;
  return rowParaCliente(data);
}

export async function atualizarCliente(id, cliente, userId) {
  const { data, error } = await supabase.from("clientes").update(clienteParaRow(cliente, userId)).eq("id", id).select().single();
  if (error) throw error;
  return rowParaCliente(data);
}

export async function excluirCliente(id) {
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) throw error;
}

export async function inserirHistorico(entry, clienteId, userId) {
  const { data, error } = await supabase.from("historico").insert(historicoParaRow(entry, clienteId, userId)).select().single();
  if (error) throw error;
  return rowParaHistorico(data);
}

export async function salvarTemplates(templates, userId) {
  const { error } = await supabase.from("templates").upsert(templatesParaRow(templates, userId));
  if (error) throw error;
}
