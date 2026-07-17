import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL;
const BREVO_FROM_NAME = process.env.BREVO_FROM_NAME || "Pontua";
const CANAL_AUTOMATICO = "E-mail (automático)";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !BREVO_API_KEY || !BREVO_FROM_EMAIL) {
  console.error("Faltam variáveis de ambiente obrigatórias.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DEFAULT_TEMPLATES = {
  antes5: "Olá, {nome}! Tudo bem? Passando para lembrar que o pagamento referente ao serviço de {servico}, no valor de {valor}, vence no dia {data}. Segue o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, desconsidere esta mensagem.",
  antes2: "Olá, {nome}! Tudo bem? Passando para lembrar que o pagamento referente ao serviço de {servico}, no valor de {valor}, vence no dia {data}. Segue o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, desconsidere esta mensagem.",
  diaVencimento: "Olá, {nome}! Tudo bem? Hoje é o vencimento do pagamento referente ao serviço de {servico}, no valor de {valor}. Segue o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, desconsidere esta mensagem.",
  atraso1: "Olá, {nome}! Tudo bem? Ainda não identificamos o pagamento referente ao serviço de {servico}, com vencimento em {data}. O valor atualizado é de {valor}. Segue novamente o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, envie o comprovante para conferirmos.",
  atraso3: "Olá, {nome}! Tudo bem? Ainda não identificamos o pagamento referente ao serviço de {servico}, com vencimento em {data}. O valor atualizado é de {valor}. Segue novamente o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, envie o comprovante para conferirmos.",
  atraso7: "Olá, {nome}! Tudo bem? Ainda não identificamos o pagamento referente ao serviço de {servico}, com vencimento em {data}. O valor atualizado é de {valor}. Segue novamente o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, envie o comprovante para conferirmos.",
  confirmacao: "Olá, {nome}! Pagamento confirmado com sucesso. Muito obrigado pela confiança e pela parceria!",
};

const SUBJECT_BY_KEY = {
  antes5: "Lembrete de vencimento",
  antes2: "Lembrete de vencimento",
  diaVencimento: "Pagamento com vencimento hoje",
  atraso1: "Pagamento pendente",
  atraso3: "Pagamento pendente",
  atraso7: "Pagamento pendente",
  confirmacao: "Confirmação de pagamento",
};

function parseISODate(iso) {
  if (!iso) return null;
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

function diffInDays(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function formatDateBR(iso) {
  const d = parseISODate(iso);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatBRL(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function needsReminderToday(cliente, today) {
  if (cliente.status_cliente !== "ativo" || cliente.pago_neste_ciclo) return false;
  const due = parseISODate(cliente.proximo_vencimento);
  if (!due) return false;
  const diff = diffInDays(today, due);
  return [5, 2, 0, -1, -3, -7].includes(diff);
}

function pickTemplateKey(cliente, today) {
  if (cliente.pago_neste_ciclo) return "confirmacao";
  const due = parseISODate(cliente.proximo_vencimento);
  if (!due) return "antes5";
  const diff = diffInDays(today, due);
  if (diff >= 3) return "antes5";
  if (diff >= 1) return "antes2";
  if (diff === 0) return "diaVencimento";
  if (diff >= -2) return "atraso1";
  if (diff >= -6) return "atraso3";
  return "atraso7";
}

function fillTemplate(str, cliente) {
  return String(str || "")
    .split("{nome}").join(cliente.nome || "")
    .split("{servico}").join(cliente.servico || "")
    .split("{valor}").join(formatBRL(cliente.valor_mensal))
    .split("{data}").join(formatDateBR(cliente.proximo_vencimento))
    .split("{pagamento}").join(cliente.chave_pix || "combinado");
}

function templatesFromRow(row) {
  if (!row) return DEFAULT_TEMPLATES;
  return {
    antes5: row.antes5 || DEFAULT_TEMPLATES.antes5,
    antes2: row.antes2 || DEFAULT_TEMPLATES.antes2,
    diaVencimento: row.dia_vencimento || DEFAULT_TEMPLATES.diaVencimento,
    atraso1: row.atraso1 || DEFAULT_TEMPLATES.atraso1,
    atraso3: row.atraso3 || DEFAULT_TEMPLATES.atraso3,
    atraso7: row.atraso7 || DEFAULT_TEMPLATES.atraso7,
    confirmacao: row.confirmacao || DEFAULT_TEMPLATES.confirmacao,
  };
}

async function enviarEmail(cliente, subject, message) {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
      to: [{ email: cliente.email, name: cliente.nome }],
      subject,
      htmlContent: `<p>${message.replace(/\n/g, "<br>")}</p>`,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Brevo respondeu ${resp.status}: ${body}`);
  }
}

async function main() {
  const today = todayDate();
  const todayISO = toISODate(today);
  console.log(`Verificando lembretes para ${todayISO} (America/Sao_Paulo)...`);

  const { data: clientes, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("status_cliente", "ativo")
    .not("email", "is", null);
  if (error) throw error;

  const devidos = (clientes || []).filter((c) => c.email && needsReminderToday(c, today));
  console.log(`${devidos.length} cliente(s) com lembrete previsto hoje.`);

  const templatesPorUsuario = new Map();
  let enviados = 0;
  let pulados = 0;
  let falhas = 0;

  for (const cliente of devidos) {
    const { data: existente, error: erroExistente } = await supabase
      .from("historico")
      .select("id")
      .eq("cliente_id", cliente.id)
      .eq("data_lembrete", todayISO)
      .eq("canal", CANAL_AUTOMATICO)
      .maybeSingle();
    if (erroExistente) { console.error(`Erro ao checar duplicidade para ${cliente.nome}:`, erroExistente.message); falhas++; continue; }
    if (existente) { console.log(`Já enviado hoje para ${cliente.nome}, pulando.`); pulados++; continue; }

    if (!templatesPorUsuario.has(cliente.user_id)) {
      const { data: tplRow } = await supabase.from("templates").select("*").eq("user_id", cliente.user_id).maybeSingle();
      templatesPorUsuario.set(cliente.user_id, templatesFromRow(tplRow));
    }
    const templates = templatesPorUsuario.get(cliente.user_id);
    const key = pickTemplateKey(cliente, today);
    const message = fillTemplate(templates[key], cliente);
    const subject = SUBJECT_BY_KEY[key];

    try {
      await enviarEmail(cliente, subject, message);
      console.log(`Enviado para ${cliente.nome} <${cliente.email}> — modelo: ${key}`);
      enviados++;

      const status = key === "confirmacao" ? "pago" : (diffInDays(today, parseISODate(cliente.proximo_vencimento) || today) < 0 ? "atrasado" : "pendente");
      const { error: erroHistorico } = await supabase.from("historico").insert({
        cliente_id: cliente.id,
        user_id: cliente.user_id,
        data: cliente.proximo_vencimento,
        valor: cliente.valor_mensal,
        status,
        data_pagamento: null,
        data_lembrete: todayISO,
        canal: CANAL_AUTOMATICO,
        observacoes: "",
      });
      if (erroHistorico) console.error(`Aviso: e-mail enviado mas falhou ao registrar histórico de ${cliente.nome}:`, erroHistorico.message);
    } catch (err) {
      console.error(`Falha ao enviar para ${cliente.nome} <${cliente.email}>:`, err.message);
      falhas++;
    }
  }

  console.log(`Concluído. Enviados: ${enviados}. Pulados (já enviados hoje): ${pulados}. Falhas: ${falhas}.`);
  if (falhas > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
