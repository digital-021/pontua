import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus, Search, Users, Wallet, Clock, AlertTriangle, CheckCircle2,
  MessageCircle, Mail, Pencil, Trash2, Download, Upload,
  X, LayoutDashboard, FileText, Menu, CalendarClock, Banknote,
  RotateCcw, Info, Copy, BellRing, LogOut,
} from "lucide-react";
import "./index.css";
import {
  supabase, LIMITE_CLIENTES, entrarOuCadastrar, sair,
  buscarPerfil, carregarDados, inserirCliente, atualizarCliente,
  excluirCliente, inserirHistorico, salvarTemplates,
} from "./supabaseClient";

/* =========================================================================
   CONSTANTES
   ========================================================================= */

const STATUS = {
  pago: { label: "Pago", color: "#2F9E63", bg: "#E7F5EC" },
  pendente: { label: "Pendente", color: "#B8862E", bg: "#FBF2DF" },
  vence_hoje: { label: "Vence hoje", color: "#C96A2E", bg: "#FBEADF" },
  atrasado: { label: "Atrasado", color: "#C24141", bg: "#FBE4E4" },
  pausada: { label: "Pausada", color: "#7A7A73", bg: "#EFEFEA" },
  encerrado: { label: "Encerrado", color: "#54524A", bg: "#E7E6E0" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "todos", label: "Todos os status" },
  { value: "pago", label: "Pago" },
  { value: "pendente", label: "Pendente" },
  { value: "vence_hoje", label: "Vence hoje" },
  { value: "atrasado", label: "Atrasado" },
  { value: "pausada", label: "Pausada" },
  { value: "encerrado", label: "Encerrado" },
];

const FORMAS_PAGAMENTO = ["Pix", "Boleto", "Cartão de crédito", "Transferência bancária", "Outro"];

const FREQUENCIAS = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal" };

const DEFAULT_TEMPLATES = {
  antes5: "Olá, {nome}! Tudo bem? Passando para lembrar que o pagamento referente ao serviço de {servico}, no valor de {valor}, vence no dia {data}. Segue o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, desconsidere esta mensagem.",
  antes2: "Olá, {nome}! Tudo bem? Passando para lembrar que o pagamento referente ao serviço de {servico}, no valor de {valor}, vence no dia {data}. Segue o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, desconsidere esta mensagem.",
  diaVencimento: "Olá, {nome}! Tudo bem? Hoje é o vencimento do pagamento referente ao serviço de {servico}, no valor de {valor}. Segue o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, desconsidere esta mensagem.",
  atraso1: "Olá, {nome}! Tudo bem? Ainda não identificamos o pagamento referente ao serviço de {servico}, com vencimento em {data}. O valor atualizado é de {valor}. Segue novamente o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, envie o comprovante para conferirmos.",
  atraso3: "Olá, {nome}! Tudo bem? Ainda não identificamos o pagamento referente ao serviço de {servico}, com vencimento em {data}. O valor atualizado é de {valor}. Segue novamente o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, envie o comprovante para conferirmos.",
  atraso7: "Olá, {nome}! Tudo bem? Ainda não identificamos o pagamento referente ao serviço de {servico}, com vencimento em {data}. O valor atualizado é de {valor}. Segue novamente o link ou chave para pagamento: {pagamento}. Caso já tenha realizado, envie o comprovante para conferirmos.",
  confirmacao: "Olá, {nome}! Pagamento confirmado com sucesso. Muito obrigado pela confiança e pela parceria!",
};

const TEMPLATE_ORDER = ["antes5", "antes2", "diaVencimento", "atraso1", "atraso3", "atraso7", "confirmacao"];

const TEMPLATE_LABELS = {
  antes5: "5 dias antes do vencimento",
  antes2: "2 dias antes do vencimento",
  diaVencimento: "No dia do vencimento",
  atraso1: "1 dia após o vencimento",
  atraso3: "3 dias após o vencimento",
  atraso7: "7 dias após o vencimento",
  confirmacao: "Confirmação de pagamento",
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

const MONTH_NAMES_PT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

const EMPTY_CLIENT = {
  nome: "", empresa: "", whatsapp: "", email: "", servico: "",
  valorMensal: "", diaVencimento: "", proximoVencimento: "", frequencia: "mensal",
  formaPagamento: "Pix", chavePix: "", observacoes: "", statusCliente: "ativo",
};

/* =========================================================================
   HELPERS
   ========================================================================= */

const generateId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

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
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function nextDueDate(date, frequencia) {
  if (frequencia === "semanal") return addDays(date, 7);
  if (frequencia === "quinzenal") return addDays(date, 14);
  return addMonths(date, 1);
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

function computeStatus(client, today) {
  if (client.statusCliente === "encerrado") return "encerrado";
  if (client.statusCliente === "pausado") return "pausada";
  if (client.pagoNesteCiclo) return "pago";
  const due = parseISODate(client.proximoVencimento);
  if (!due) return "pendente";
  const diff = diffInDays(today, due);
  if (diff < 0) return "atrasado";
  if (diff === 0) return "vence_hoje";
  return "pendente";
}

function diasInfo(client, today) {
  const due = parseISODate(client.proximoVencimento);
  if (!due) return "—";
  if (client.pagoNesteCiclo) {
    const diff = diffInDays(today, due);
    return diff >= 0 ? `Próx. em ${diff} dia${diff === 1 ? "" : "s"}` : "Em dia";
  }
  const diff = diffInDays(today, due);
  if (diff > 0) return `Faltam ${diff} dia${diff === 1 ? "" : "s"}`;
  if (diff === 0) return "Vence hoje";
  return `${Math.abs(diff)} dia${Math.abs(diff) === 1 ? "" : "s"} em atraso`;
}

function needsReminderToday(client, today) {
  if (client.statusCliente !== "ativo" || client.pagoNesteCiclo) return false;
  const due = parseISODate(client.proximoVencimento);
  if (!due) return false;
  const diff = diffInDays(today, due);
  return [5, 2, 0, -1, -3, -7].includes(diff);
}

function motivoLembrete(diff) {
  if (diff === 5) return "5 dias antes do vencimento";
  if (diff === 2) return "2 dias antes do vencimento";
  if (diff === 0) return "Vence hoje";
  if (diff === -1) return "1 dia em atraso";
  if (diff === -3) return "3 dias em atraso";
  if (diff === -7) return "7 dias em atraso";
  return "";
}

function pickTemplateKey(client, today) {
  if (client.pagoNesteCiclo) return "confirmacao";
  const due = parseISODate(client.proximoVencimento);
  if (!due) return "antes5";
  const diff = diffInDays(today, due);
  if (diff >= 3) return "antes5";
  if (diff >= 1) return "antes2";
  if (diff === 0) return "diaVencimento";
  if (diff >= -2) return "atraso1";
  if (diff >= -6) return "atraso3";
  return "atraso7";
}

function fillTemplate(str, client) {
  return String(str || "")
    .split("{nome}").join(client.nome || "")
    .split("{servico}").join(client.servico || "")
    .split("{valor}").join(formatBRL(client.valorMensal))
    .split("{data}").join(formatDateBR(client.proximoVencimento))
    .split("{pagamento}").join(client.chavePix || "combinado");
}

function getReminderMessage(client, today, templates) {
  const key = pickTemplateKey(client, today);
  const message = fillTemplate(templates[key], client);
  const subject = SUBJECT_BY_KEY[key];
  return { key, message, subject };
}

function buildWhatsAppLink(client, message) {
  let digits = (client.whatsapp || "").replace(/\D/g, "");
  if (digits.length > 0 && digits.length <= 11) digits = "55" + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function buildGmailComposeLink(email, subject, body) {
  const params = new URLSearchParams({ view: "cm", fs: "1", to: email, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function openExternalLink(href) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadTextFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function clientsToCSV(clients) {
  const headers = ["Nome","Empresa","WhatsApp","E-mail","Serviço","Valor mensal","Frequência","Dia vencimento","Próximo vencimento","Forma de pagamento","Chave Pix ou link","Status","Observações"];
  const rows = clients.map((c) => [
    c.nome, c.empresa, c.whatsapp, c.email, c.servico,
    String(c.valorMensal || 0).replace(".", ","),
    FREQUENCIAS[c.frequencia] || FREQUENCIAS.mensal,
    c.diaVencimento, formatDateBR(c.proximoVencimento), c.formaPagamento,
    c.chavePix, c.statusCliente, (c.observacoes || "").replace(/\n/g, " "),
  ]);
  return [headers.map(csvEscape).join(";"), ...rows.map((r) => r.map(csvEscape).join(";"))].join("\n");
}

/* =========================================================================
   COMPONENTES DE APOIO
   ========================================================================= */

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pendente;
  return (
    <span className="aed-stamp" style={{ "--stamp-color": s.color, "--stamp-bg": s.bg }}>
      {s.label}
    </span>
  );
}

function StatCard({ icon, label, value, tone }) {
  return (
    <div className={`aed-stat aed-stat--${tone || "default"}`}>
      <div className="aed-stat-icon">{icon}</div>
      <div>
        <div className="aed-stat-value">{value}</div>
        <div className="aed-stat-label">{label}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }) {
  return (
    <div className="aed-overlay" role="dialog" aria-modal="true">
      <div className="aed-modal aed-modal--small">
        <h3 className="aed-modal-title">{title}</h3>
        <p className="aed-modal-text">{message}</p>
        <div className="aed-modal-actions">
          <button className="aed-btn aed-btn--ghost" onClick={onCancel}>Cancelar</button>
          <button className="aed-btn aed-btn--danger" onClick={onConfirm}>{confirmLabel || "Excluir"}</button>
        </div>
      </div>
    </div>
  );
}

function ClientFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_CLIENT, ...initial }));
  const [error, setError] = useState("");
  const isEditing = Boolean(initial && initial.id);

  const update = (field) => (e) => {
    const value = e && e.target ? e.target.value : e;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleProximoVencimento = (e) => {
    const value = e.target.value;
    setForm((prev) => {
      const d = parseISODate(value);
      return { ...prev, proximoVencimento: value, diaVencimento: d ? d.getDate() : prev.diaVencimento };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.proximoVencimento || !form.valorMensal) {
      setError("Preencha nome, valor mensal e próximo vencimento para continuar.");
      return;
    }
    if (!form.whatsapp.trim() && !form.email.trim()) {
      setError("Cadastre pelo menos um WhatsApp ou e-mail para enviar lembretes a este cliente.");
      return;
    }
    setError("");
    onSave({
      ...form,
      id: form.id || generateId(),
      valorMensal: Number(form.valorMensal) || 0,
      diaVencimento: Number(form.diaVencimento) || parseISODate(form.proximoVencimento)?.getDate() || 1,
      pagoNesteCiclo: form.pagoNesteCiclo || false,
      historico: form.historico || [],
    });
  };

  return (
    <div className="aed-overlay" role="dialog" aria-modal="true">
      <div className="aed-modal">
        <div className="aed-modal-header">
          <h3 className="aed-modal-title">{isEditing ? "Editar cliente" : "Novo cliente"}</h3>
          <button className="aed-icon-btn" onClick={onCancel} aria-label="Fechar"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="aed-form">
          <div className="aed-form-grid">
            <label className="aed-field">
              <span>Nome do cliente *</span>
              <input required value={form.nome} onChange={update("nome")} placeholder="Ex: Marina Costa" />
            </label>
            <label className="aed-field">
              <span>Nome da empresa</span>
              <input value={form.empresa} onChange={update("empresa")} placeholder="Ex: Studio Marina Costa" />
            </label>
            <label className="aed-field">
              <span>WhatsApp (com DDD)</span>
              <input value={form.whatsapp} onChange={update("whatsapp")} placeholder="21998765432" inputMode="numeric" />
            </label>
            <label className="aed-field">
              <span>E-mail</span>
              <input type="email" value={form.email} onChange={update("email")} placeholder="cliente@email.com" />
            </label>
            <label className="aed-field">
              <span>Serviço contratado</span>
              <input value={form.servico} onChange={update("servico")} placeholder="Ex: Gestão de redes sociais" />
            </label>
            <label className="aed-field">
              <span>Valor mensal (R$) *</span>
              <input required type="number" min="0" step="0.01" value={form.valorMensal} onChange={update("valorMensal")} placeholder="0,00" />
            </label>
            <label className="aed-field">
              <span>Próximo vencimento *</span>
              <input required type="date" value={form.proximoVencimento} onChange={handleProximoVencimento} />
            </label>
            <label className="aed-field">
              <span>Dia do vencimento</span>
              <input type="number" min="1" max="31" value={form.diaVencimento} onChange={update("diaVencimento")} placeholder="Ex: 10" />
            </label>
            <label className="aed-field">
              <span>Frequência de cobrança</span>
              <select value={form.frequencia} onChange={update("frequencia")}>
                {Object.entries(FREQUENCIAS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="aed-field">
              <span>Forma de pagamento</span>
              <select value={form.formaPagamento} onChange={update("formaPagamento")}>
                {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="aed-field">
              <span>Chave Pix ou link de pagamento</span>
              <input value={form.chavePix} onChange={update("chavePix")} placeholder="chave@pix.com ou link" />
            </label>
            <label className="aed-field">
              <span>Status do cliente</span>
              <select value={form.statusCliente} onChange={update("statusCliente")}>
                <option value="ativo">Ativo</option>
                <option value="pausado">Pausado</option>
                <option value="encerrado">Encerrado</option>
              </select>
            </label>
          </div>
          <label className="aed-field">
            <span>Observações</span>
            <textarea rows={3} value={form.observacoes} onChange={update("observacoes")} placeholder="Anotações internas sobre este cliente" />
          </label>
          {error && <p className="aed-form-error">{error}</p>}
          <div className="aed-modal-actions">
            <button type="button" className="aed-btn aed-btn--ghost" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="aed-btn aed-btn--primary">{isEditing ? "Salvar alterações" : "Cadastrar cliente"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HistoryModal({ client, onClose }) {
  const historico = [...(client.historico || [])].sort((a, b) => (a.data < b.data ? 1 : -1));
  return (
    <div className="aed-overlay" role="dialog" aria-modal="true">
      <div className="aed-modal">
        <div className="aed-modal-header">
          <h3 className="aed-modal-title">Histórico — {client.nome}</h3>
          <button className="aed-icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        {historico.length === 0 ? (
          <p className="aed-modal-text">Nenhum evento registrado ainda para este cliente.</p>
        ) : (
          <div className="aed-table-wrap">
            <table className="aed-table">
              <thead>
                <tr>
                  <th>Cobrança</th><th>Valor</th><th>Status</th><th>Pagamento</th><th>Lembrete</th><th>Canal</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDateBR(h.data)}</td>
                    <td className="aed-mono">{formatBRL(h.valor)}</td>
                    <td><StatusBadge status={h.status === "pago" ? "pago" : h.status === "atrasado" ? "atrasado" : "pendente"} /></td>
                    <td>{h.dataPagamento ? formatDateBR(h.dataPagamento) : "—"}</td>
                    <td>{h.dataLembrete ? formatDateBR(h.dataLembrete) : "—"}</td>
                    <td>{h.canal === "manual" ? "—" : (h.canal || "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="aed-modal-actions">
          <button className="aed-btn aed-btn--ghost" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onEntrar }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onEntrar(nome, telefone);
    } catch (err) {
      setError("Não foi possível entrar. Confira o nome e o telefone informados.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="aed-login-wrap">
      <div className="aed-login-card">
        <div className="aed-brand-mark aed-brand-mark--lg">AD</div>
        <h1>Agência em Dia</h1>
        <p className="aed-login-sub">Entre com seu nome e telefone. Se for a primeira vez, sua conta é criada automaticamente e seus clientes ficam separados dos de outras pessoas.</p>
        <form onSubmit={handleSubmit} className="aed-form">
          <label className="aed-field">
            <span>Nome</span>
            <input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
          </label>
          <label className="aed-field">
            <span>Telefone (com DDD)</span>
            <input required value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="21998765432" inputMode="numeric" />
          </label>
          {error && <p className="aed-form-error">{error}</p>}
          <button type="submit" className="aed-btn aed-btn--primary aed-btn--block" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   APP PRINCIPAL
   ========================================================================= */

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = verificando, null = deslogado
  const [perfilNome, setPerfilNome] = useState("");
  const [dataLoading, setDataLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [view, setView] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [monthFilter, setMonthFilter] = useState("todos");
  const [modalClient, setModalClient] = useState(null); // objeto vazio-ish = novo, objeto com id = editar
  const [historyClient, setHistoryClient] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [importInputKey, setImportInputKey] = useState(0);

  const today = todayDate();

  // ---- Sessão de autenticação ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => listener.subscription.unsubscribe();
  }, []);

  // ---- Carregar dados do usuário logado a partir do Supabase ----
  useEffect(() => {
    if (!session) {
      setClients([]);
      setTemplates(DEFAULT_TEMPLATES);
      setPerfilNome("");
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    (async () => {
      try {
        const [perfil, { clientes, templates: tpl }] = await Promise.all([
          buscarPerfil(session.user.id),
          carregarDados(session.user.id),
        ]);
        if (cancelled) return;
        setPerfilNome(perfil?.nome || "");
        setClients(clientes);
        setTemplates(tpl ? { ...DEFAULT_TEMPLATES, ...tpl } : DEFAULT_TEMPLATES);
      } catch (err) {
        if (!cancelled) console.warn("Não foi possível carregar seus dados:", err);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  // ---- Persistir modelos de mensagem no Supabase ----
  useEffect(() => {
    if (!session) return;
    const id = setTimeout(() => {
      salvarTemplates(templates, session.user.id).catch((err) => console.warn("Não foi possível salvar os modelos:", err));
    }, 500);
    return () => clearTimeout(id);
  }, [templates, session]);

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast((t) => (t === message ? null : t)), 2600);
  }, []);

  // ---- Derivados ----
  const clientsWithStatus = useMemo(
    () => clients.map((c) => ({ ...c, _status: computeStatus(c, today), _dias: diasInfo(c, today) })),
    [clients, today]
  );

  const monthsAvailable = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => {
      const d = parseISODate(c.proximoVencimento);
      if (d) set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(set).sort();
  }, [clients]);

  const filteredClients = useMemo(() => {
    return clientsWithStatus.filter((c) => {
      if (statusFilter !== "todos" && c._status !== statusFilter) return false;
      if (monthFilter !== "todos") {
        const d = parseISODate(c.proximoVencimento);
        const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "";
        if (key !== monthFilter) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!(c.nome.toLowerCase().includes(q) || (c.empresa || "").toLowerCase().includes(q))) return false;
      }
      return true;
    }).sort((a, b) => (a.proximoVencimento || "").localeCompare(b.proximoVencimento || ""));
  }, [clientsWithStatus, statusFilter, monthFilter, search]);

  const dashboard = useMemo(() => {
    const ativos = clientsWithStatus.filter((c) => c.statusCliente === "ativo");
    const totalPrevisto = ativos.reduce((sum, c) => sum + (Number(c.valorMensal) || 0), 0);
    const curMonth = today.getMonth();
    const curYear = today.getFullYear();
    let totalRecebido = 0;
    clients.forEach((c) => {
      (c.historico || []).forEach((h) => {
        if (h.status === "pago" && h.dataPagamento) {
          const d = parseISODate(h.dataPagamento);
          if (d && d.getMonth() === curMonth && d.getFullYear() === curYear) totalRecebido += Number(h.valor) || 0;
        }
      });
    });
    const totalPendente = ativos.filter((c) => c._status === "pendente" || c._status === "vence_hoje").reduce((s, c) => s + (Number(c.valorMensal) || 0), 0);
    const totalAtrasado = ativos.filter((c) => c._status === "atrasado").reduce((s, c) => s + (Number(c.valorMensal) || 0), 0);
    const venceHoje = clientsWithStatus.filter((c) => c._status === "vence_hoje");
    const emAtraso = clientsWithStatus.filter((c) => c._status === "atrasado").sort((a, b) => a.proximoVencimento.localeCompare(b.proximoVencimento));
    const proximos = clientsWithStatus.filter((c) => c._status === "pendente").sort((a, b) => a.proximoVencimento.localeCompare(b.proximoVencimento)).slice(0, 5);
    const cobrancasHoje = clientsWithStatus
      .filter((c) => needsReminderToday(c, today))
      .map((c) => ({ ...c, _diff: diffInDays(today, parseISODate(c.proximoVencimento)) }))
      .sort((a, b) => a._diff - b._diff);
    return { totalPrevisto, totalRecebido, totalPendente, totalAtrasado, qtdAtivos: ativos.length, venceHoje, emAtraso, proximos, cobrancasHoje };
  }, [clientsWithStatus, clients, today]);

  // ---- Handlers ----
  const saveClient = async (data) => {
    const isEdit = clients.some((c) => c.id === data.id);
    if (!isEdit && clients.length >= LIMITE_CLIENTES) {
      showToast(`Limite de ${LIMITE_CLIENTES} clientes atingido.`);
      return;
    }
    try {
      if (isEdit) {
        const updated = await atualizarCliente(data.id, data, session.user.id);
        setClients((prev) => prev.map((c) => (c.id === data.id ? { ...updated, historico: c.historico } : c)));
      } else {
        const created = await inserirCliente(data, session.user.id);
        setClients((prev) => [...prev, { ...created, historico: [] }]);
      }
      setModalClient(null);
      showToast(isEdit ? "Cliente atualizado." : "Cliente cadastrado.");
    } catch (err) {
      showToast("Não foi possível salvar o cliente.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await excluirCliente(deleteTarget.id);
      setClients((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      showToast("Cliente excluído.");
    } catch (err) {
      showToast("Não foi possível excluir o cliente.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const markAsPaid = async (client) => {
    const oldDue = client.proximoVencimento;
    const newDue = toISODate(nextDueDate(parseISODate(oldDue) || todayDate(), client.frequencia));
    try {
      const updated = await atualizarCliente(client.id, { ...client, proximoVencimento: newDue, pagoNesteCiclo: false }, session.user.id);
      const entry = await inserirHistorico(
        { data: oldDue, valor: client.valorMensal, status: "pago", dataPagamento: toISODate(todayDate()), dataLembrete: null, canal: "manual", observacoes: "" },
        client.id, session.user.id
      );
      setClients((prev) => prev.map((c) => (c.id === client.id ? { ...updated, historico: [entry, ...(c.historico || [])] } : c)));
      showToast(`Pagamento de ${client.nome} registrado. Próxima cobrança: ${formatDateBR(newDue)}.`);
    } catch (err) {
      showToast("Não foi possível registrar o pagamento.");
    }
  };

  const logReminder = async (clientId, canal, key) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    const status = key === "confirmacao" ? "pago" : (diffInDays(today, parseISODate(client.proximoVencimento) || today) < 0 ? "atrasado" : "pendente");
    try {
      const entry = await inserirHistorico(
        { data: client.proximoVencimento, valor: client.valorMensal, status, dataPagamento: null, dataLembrete: toISODate(todayDate()), canal, observacoes: "" },
        clientId, session.user.id
      );
      setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, historico: [entry, ...(c.historico || [])] } : c)));
    } catch (err) {
      console.warn("Não foi possível registrar o lembrete:", err);
    }
  };

  const handleLogout = async () => {
    await sair();
    setView("dashboard");
  };

  const sendWhatsApp = (client) => {
    if (!client.whatsapp) { showToast("Este cliente não tem WhatsApp cadastrado."); return; }
    const { key, message } = getReminderMessage(client, today, templates);
    openExternalLink(buildWhatsAppLink(client, message));
    logReminder(client.id, "WhatsApp", key);
  };

  const sendEmail = (client) => {
    if (!client.email) { showToast("Este cliente não tem e-mail cadastrado."); return; }
    const { key, message, subject } = getReminderMessage(client, today, templates);
    openExternalLink(buildGmailComposeLink(client.email, subject, message));
    logReminder(client.id, "E-mail", key);
  };

  const copyMessage = async (client) => {
    const { message } = getReminderMessage(client, today, templates);
    try {
      await navigator.clipboard.writeText(message);
      showToast("Mensagem copiada.");
    } catch (err) {
      showToast("Não foi possível copiar a mensagem neste navegador.");
    }
  };

  const exportCSV = () => {
    downloadTextFile("clientes.csv", clientsToCSV(clients), "text/csv;charset=utf-8");
    showToast("CSV exportado.");
  };

  const exportJSON = () => {
    downloadTextFile("backup-agencia-em-dia.json", JSON.stringify({ clients, templates }, null, 2), "application/json");
    showToast("Backup exportado.");
  };

  const importJSON = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.clients)) throw new Error("formato inválido");
        const excedeu = parsed.clients.length > LIMITE_CLIENTES;
        const aImportar = parsed.clients.slice(0, LIMITE_CLIENTES).map((c) => ({ ...EMPTY_CLIENT, ...c }));

        for (const c of clients) await excluirCliente(c.id);

        const novos = [];
        for (const c of aImportar) {
          const criado = await inserirCliente(c, session.user.id);
          const historico = [];
          for (const h of (c.historico || [])) {
            historico.push(await inserirHistorico(h, criado.id, session.user.id));
          }
          novos.push({ ...criado, historico });
        }
        setClients(novos);
        if (parsed.templates) setTemplates({ ...DEFAULT_TEMPLATES, ...parsed.templates });
        showToast(excedeu ? `Arquivo tinha mais de ${LIMITE_CLIENTES} clientes; apenas os primeiros ${LIMITE_CLIENTES} foram importados.` : "Backup importado com sucesso.");
      } catch (err) {
        showToast("Não foi possível importar este arquivo.");
      } finally {
        setImportInputKey((k) => k + 1);
      }
    };
    reader.readAsText(file);
  };

  const updateTemplate = (key, value) => setTemplates((prev) => ({ ...prev, [key]: value }));
  const restoreTemplates = () => { setTemplates(DEFAULT_TEMPLATES); showToast("Modelos restaurados ao padrão."); };

  const navItems = [
    { key: "dashboard", label: "Painel", icon: <LayoutDashboard size={18} /> },
    { key: "clientes", label: "Clientes", icon: <Users size={18} /> },
    { key: "modelos", label: "Modelos de mensagem", icon: <FileText size={18} /> },
    { key: "dados", label: "Backup e dados", icon: <Download size={18} /> },
  ];

  if (session === undefined) {
    return <div className="aed-loading-screen">Carregando…</div>;
  }

  if (!session) {
    return <LoginScreen onEntrar={entrarOuCadastrar} />;
  }

  if (dataLoading && clients.length === 0) {
    return <div className="aed-loading-screen">Carregando seus dados…</div>;
  }

  return (
    <div className="aed-root">
      <div className={`aed-sidebar ${menuOpen ? "aed-sidebar--open" : ""}`}>
        <div className="aed-brand">
          <div className="aed-brand-mark">AD</div>
          <div>
            <div className="aed-brand-title">Agência em Dia</div>
            <div className="aed-brand-sub">Controle de pagamentos</div>
          </div>
        </div>
        <nav className="aed-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`aed-nav-item ${view === item.key ? "aed-nav-item--active" : ""}`}
              onClick={() => { setView(item.key); setMenuOpen(false); }}
            >
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button className="aed-btn aed-btn--primary aed-btn--block" onClick={() => { setModalClient({ ...EMPTY_CLIENT }); setMenuOpen(false); }}>
          <Plus size={16} /> Novo cliente
        </button>
        <div className="aed-sidebar-user">
          <span className="aed-sidebar-user-name">{perfilNome}</span>
          <button className="aed-icon-btn" title="Sair" onClick={handleLogout}><LogOut size={16} /></button>
        </div>
      </div>

      {menuOpen && <div className="aed-scrim" onClick={() => setMenuOpen(false)} />}

      <div className="aed-main">
        <header className="aed-topbar">
          <button className="aed-icon-btn aed-only-mobile" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
          <div className="aed-topbar-title">{navItems.find((n) => n.key === view)?.label}</div>
        </header>

        <main className="aed-content">
          {view === "dashboard" && (
            <DashboardView
              dashboard={dashboard}
              onOpenClient={(c) => setModalClient(c)}
              today={today}
              onSendWhatsApp={sendWhatsApp}
              onSendEmail={sendEmail}
              onCopy={copyMessage}
            />
          )}

          {view === "clientes" && (
            <ClientesView
              clients={filteredClients}
              search={search} setSearch={setSearch}
              statusFilter={statusFilter} setStatusFilter={setStatusFilter}
              monthFilter={monthFilter} setMonthFilter={setMonthFilter}
              monthsAvailable={monthsAvailable}
              onEdit={(c) => setModalClient(c)}
              onDelete={(c) => setDeleteTarget(c)}
              onMarkPaid={markAsPaid}
              onSendWhatsApp={sendWhatsApp}
              onSendEmail={sendEmail}
              onCopy={copyMessage}
              onHistory={(c) => setHistoryClient(c)}
            />
          )}

          {view === "modelos" && (
            <ModelosView templates={templates} onChange={updateTemplate} onRestore={restoreTemplates} />
          )}

          {view === "dados" && (
            <DadosView onExportCSV={exportCSV} onExportJSON={exportJSON} onImportJSON={importJSON} importInputKey={importInputKey} totalClientes={clients.length} />
          )}
        </main>
      </div>

      {modalClient && (
        <ClientFormModal initial={modalClient} onCancel={() => setModalClient(null)} onSave={saveClient} />
      )}
      {historyClient && (
        <HistoryModal client={historyClient} onClose={() => setHistoryClient(null)} />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Excluir cliente"
          message={`Tem certeza que deseja excluir ${deleteTarget.nome}? Essa ação não pode ser desfeita.`}
          confirmLabel="Excluir cliente"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
      {toast && <div className="aed-toast">{toast}</div>}
    </div>
  );
}

/* =========================================================================
   VIEWS
   ========================================================================= */

function DashboardView({ dashboard, onSendWhatsApp, onSendEmail, onCopy }) {
  return (
    <div className="aed-view">
      <section className="aed-panel aed-today-panel">
        <div className="aed-today-header">
          <h3 className="aed-panel-title aed-today-title"><BellRing size={17} /> Cobranças de hoje</h3>
          <span className="aed-today-count">{dashboard.cobrancasHoje.length}</span>
        </div>
        {dashboard.cobrancasHoje.length === 0 ? (
          <p className="aed-empty-small">Nenhum lembrete programado para hoje. 🎉</p>
        ) : (
          <ul className="aed-today-list">
            {dashboard.cobrancasHoje.map((c) => (
              <li key={c.id} className="aed-today-item">
                <div>
                  <div className="aed-cell-title">{c.nome}</div>
                  <div className="aed-cell-sub">{motivoLembrete(c._diff)} · {formatBRL(c.valorMensal)}</div>
                </div>
                <div className="aed-row-actions">
                  <button className="aed-icon-btn" title="Enviar WhatsApp" onClick={() => onSendWhatsApp(c)}><MessageCircle size={17} /></button>
                  <button className="aed-icon-btn" title="Enviar e-mail" onClick={() => onSendEmail(c)}><Mail size={17} /></button>
                  <button className="aed-icon-btn" title="Copiar mensagem" onClick={() => onCopy(c)}><Copy size={17} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="aed-stats-grid">
        <StatCard icon={<Wallet size={18} />} label="Previsto no mês" value={formatBRL(dashboard.totalPrevisto)} tone="brand" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Já recebido" value={formatBRL(dashboard.totalRecebido)} tone="pago" />
        <StatCard icon={<Clock size={18} />} label="Pendente" value={formatBRL(dashboard.totalPendente)} tone="pendente" />
        <StatCard icon={<AlertTriangle size={18} />} label="Em atraso" value={formatBRL(dashboard.totalAtrasado)} tone="atrasado" />
        <StatCard icon={<Users size={18} />} label="Clientes ativos" value={dashboard.qtdAtivos} tone="default" />
      </div>

      <div className="aed-panels">
        <section className="aed-panel">
          <h3 className="aed-panel-title">Vence hoje</h3>
          {dashboard.venceHoje.length === 0 ? (
            <p className="aed-empty-small">Nenhum vencimento hoje.</p>
          ) : (
            <ul className="aed-mini-list">
              {dashboard.venceHoje.map((c) => (
                <li key={c.id}>
                  <span>{c.nome}</span>
                  <span className="aed-mono">{formatBRL(c.valorMensal)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="aed-panel">
          <h3 className="aed-panel-title">Próximos vencimentos</h3>
          {dashboard.proximos.length === 0 ? (
            <p className="aed-empty-small">Nada se aproximando por enquanto.</p>
          ) : (
            <ul className="aed-mini-list">
              {dashboard.proximos.map((c) => (
                <li key={c.id}>
                  <span>{c.nome}</span>
                  <span className="aed-mono">{formatDateBR(c.proximoVencimento)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="aed-panel">
          <h3 className="aed-panel-title">Em atraso</h3>
          {dashboard.emAtraso.length === 0 ? (
            <p className="aed-empty-small">Nenhum cliente em atraso. 🎉</p>
          ) : (
            <ul className="aed-mini-list">
              {dashboard.emAtraso.map((c) => (
                <li key={c.id}>
                  <span>{c.nome}</span>
                  <span className="aed-mono aed-mono--danger">{c._dias}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ClientesView({
  clients, search, setSearch, statusFilter, setStatusFilter,
  monthFilter, setMonthFilter, monthsAvailable,
  onEdit, onDelete, onMarkPaid, onSendWhatsApp, onSendEmail, onCopy, onHistory,
}) {
  return (
    <div className="aed-view">
      <div className="aed-filters">
        <label className="aed-search">
          <Search size={16} />
          <input placeholder="Buscar cliente ou empresa…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
          <option value="todos">Todos os meses</option>
          {monthsAvailable.map((m) => {
            const [y, mo] = m.split("-");
            return <option key={m} value={m}>{MONTH_NAMES_PT[Number(mo) - 1]} de {y}</option>;
          })}
        </select>
      </div>

      {clients.length === 0 ? (
        <div className="aed-empty">
          <Info size={20} />
          <p>Nenhum cliente encontrado com esses filtros.</p>
        </div>
      ) : (
        <>
          <div className="aed-table-wrap aed-only-desktop">
            <table className="aed-table">
              <thead>
                <tr>
                  <th>Cliente</th><th>Serviço</th><th>Valor</th><th>Frequência</th><th>Vencimento</th>
                  <th>Status</th><th>Prazo</th><th className="aed-th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="aed-cell-title">{c.nome}</div>
                      {c.empresa && <div className="aed-cell-sub">{c.empresa}</div>}
                    </td>
                    <td>{c.servico || "—"}</td>
                    <td className="aed-mono">{formatBRL(c.valorMensal)}</td>
                    <td>{FREQUENCIAS[c.frequencia] || FREQUENCIAS.mensal}</td>
                    <td className="aed-mono">{formatDateBR(c.proximoVencimento)}</td>
                    <td><StatusBadge status={c._status} /></td>
                    <td className="aed-mono aed-cell-prazo">{c._dias}</td>
                    <td>
                      <RowActions client={c} onEdit={onEdit} onDelete={onDelete} onMarkPaid={onMarkPaid} onSendWhatsApp={onSendWhatsApp} onSendEmail={onSendEmail} onCopy={onCopy} onHistory={onHistory} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="aed-cards aed-only-mobile">
            {clients.map((c) => (
              <div key={c.id} className="aed-client-card">
                <div className="aed-client-card-top">
                  <div>
                    <div className="aed-cell-title">{c.nome}</div>
                    {c.empresa && <div className="aed-cell-sub">{c.empresa}</div>}
                  </div>
                  <StatusBadge status={c._status} />
                </div>
                <div className="aed-client-card-info">
                  <span>{c.servico || "—"}</span>
                  <span className="aed-mono">{formatBRL(c.valorMensal)}</span>
                </div>
                <div className="aed-client-card-info">
                  <span>{FREQUENCIAS[c.frequencia] || FREQUENCIAS.mensal}</span>
                </div>
                <div className="aed-client-card-info">
                  <span className="aed-mono">Vence {formatDateBR(c.proximoVencimento)}</span>
                  <span className="aed-mono">{c._dias}</span>
                </div>
                <RowActions client={c} onEdit={onEdit} onDelete={onDelete} onMarkPaid={onMarkPaid} onSendWhatsApp={onSendWhatsApp} onSendEmail={onSendEmail} onCopy={onCopy} onHistory={onHistory} block />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RowActions({ client, onEdit, onDelete, onMarkPaid, onSendWhatsApp, onSendEmail, onCopy, onHistory, block }) {
  return (
    <div className={`aed-row-actions ${block ? "aed-row-actions--block" : ""}`}>
      {client._status !== "pago" && client.statusCliente === "ativo" && (
        <button className="aed-icon-btn" title="Marcar como pago" onClick={() => onMarkPaid(client)}><CheckCircle2 size={17} /></button>
      )}
      <button className="aed-icon-btn" title="Enviar WhatsApp" onClick={() => onSendWhatsApp(client)}><MessageCircle size={17} /></button>
      <button className="aed-icon-btn" title="Enviar e-mail" onClick={() => onSendEmail(client)}><Mail size={17} /></button>
      <button className="aed-icon-btn" title="Copiar mensagem" onClick={() => onCopy(client)}><Copy size={17} /></button>
      <button className="aed-icon-btn" title="Ver histórico" onClick={() => onHistory(client)}><Clock size={17} /></button>
      <button className="aed-icon-btn" title="Editar" onClick={() => onEdit(client)}><Pencil size={17} /></button>
      <button className="aed-icon-btn aed-icon-btn--danger" title="Excluir" onClick={() => onDelete(client)}><Trash2 size={17} /></button>
    </div>
  );
}

function ModelosView({ templates, onChange, onRestore }) {
  return (
    <div className="aed-view">
      <div className="aed-hint">
        <Info size={16} />
        <span>Use <code>{"{nome}"}</code>, <code>{"{servico}"}</code>, <code>{"{valor}"}</code>, <code>{"{data}"}</code> e <code>{"{pagamento}"}</code> — eles são substituídos automaticamente pelos dados de cada cliente.</span>
      </div>
      <div className="aed-templates">
        {TEMPLATE_ORDER.map((key) => (
          <label className="aed-field" key={key}>
            <span>{TEMPLATE_LABELS[key]}</span>
            <textarea rows={4} value={templates[key]} onChange={(e) => onChange(key, e.target.value)} />
          </label>
        ))}
      </div>
      <button className="aed-btn aed-btn--ghost" onClick={onRestore}><RotateCcw size={15} /> Restaurar modelos padrão</button>
    </div>
  );
}

function DadosView({ onExportCSV, onExportJSON, onImportJSON, importInputKey, totalClientes }) {
  return (
    <div className="aed-view">
      <div className="aed-hint">
        <Info size={16} />
        <span>Seus {totalClientes} clientes ficam salvos automaticamente e de forma privada nesta conta — não é preciso clicar em salvar. Ainda assim, vale manter backups próprios.</span>
      </div>
      <div className="aed-data-grid">
        <div className="aed-data-card">
          <Banknote size={20} />
          <h4>Exportar planilha (CSV)</h4>
          <p>Baixe a lista de clientes em formato de tabela, pronta para abrir no Excel ou Google Sheets.</p>
          <button className="aed-btn aed-btn--primary" onClick={onExportCSV}><Download size={15} /> Exportar CSV</button>
        </div>
        <div className="aed-data-card">
          <CalendarClock size={20} />
          <h4>Backup completo (JSON)</h4>
          <p>Salva todos os clientes, históricos e modelos de mensagem — ideal para restaurar tudo depois.</p>
          <button className="aed-btn aed-btn--primary" onClick={onExportJSON}><Download size={15} /> Exportar backup</button>
        </div>
        <div className="aed-data-card">
          <Upload size={20} />
          <h4>Importar backup (JSON)</h4>
          <p>Restaura clientes e modelos a partir de um arquivo de backup exportado anteriormente. Isso substitui os dados atuais.</p>
          <label className="aed-btn aed-btn--ghost aed-file-btn">
            <Upload size={15} /> Escolher arquivo
            <input key={importInputKey} type="file" accept="application/json" onChange={onImportJSON} hidden />
          </label>
        </div>
      </div>
    </div>
  );
}
