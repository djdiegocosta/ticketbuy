import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase configuration
 * Provided project URL and anon key are used to connect directly.
 */
const SUPABASE_URL = "https://jrhgzviaebkhhaculpio.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyaGd6dmlhZWJraGhhY3VscGlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMTA2MjUsImV4cCI6MjA2ODc4NjYyNX0.GXPwSCDLR4Ev4kag36wQD-TyvTaZ8qaXHCekWd8u-tI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

let currentSale = null;
let currentEvent = null;
let buyerData = {
  name: "",
  whatsapp: ""
};
let participantsData = [];
const MAX_QTY = 10;

const selectors = {
  buyerName: document.getElementById("buyer-name"),
  buyerWhatsapp: document.getElementById("buyer-whatsapp"),
  eventBanner: document.querySelector(".event-banner"),
  eventTitle: document.getElementById("event-title"),
  eventDatetime: document.getElementById("event-datetime"),
  eventLocation: document.getElementById("event-location"),
  eventDescription: document.getElementById("event-description"),
  qtyInput: document.getElementById("ticket-quantity"),
  qtyDecrease: document.getElementById("qty-decrease"),
  qtyIncrease: document.getElementById("qty-increase"),
  qtyText: document.getElementById("ticket-quantity-text"),
  participantsContainer: document.getElementById("participants-container"),
  unitPriceEl: document.getElementById("ticket-unit-price"),
  summaryQty: document.getElementById("summary-qty"),

  summaryTotal: document.getElementById("summary-total"),
  summaryEventName: document.getElementById("summary-event-name"),
  payPixBtn: document.getElementById("pay-pix-btn"),
  pixSection: document.getElementById("pix-section"),
  pixCopyCode: document.getElementById("pix-copy-code"),
  copyPixCodeBtn: document.getElementById("copy-pix-code-btn"),

  paymentStatus: document.getElementById("payment-status"),
  paymentStatusLabel: document.getElementById("payment-status-label"),
  successSection: document.getElementById("success-section"),
  ticketsList: document.getElementById("tickets-list")
};

const stepCards = Array.from(document.querySelectorAll(".step-card"));
const stepIndicators = Array.from(document.querySelectorAll(".step-indicator"));

/* Utils */

function getEventIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("event_id");
}

function formatCurrency(brlNumber) {
  return brlNumber.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function parseUnitPrice() {
  const raw = selectors.unitPriceEl.dataset.price || "0";
  return Number(raw);
}

function setUnitPrice(value) {
  selectors.unitPriceEl.dataset.price = String(value.toFixed(2));
  selectors.unitPriceEl.textContent = formatCurrency(value);
}

/**
 * Converte uma data ISO (YYYY-MM-DD ou variantes) para o formato brasileiro DD/MM/YYYY.
 * Se a entrada não parecer uma data válida, retorna a string original.
 */
function formatDateBR(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return isoDate || "";
  // aceita YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SSZ etc.
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function setFieldError(fieldName, message) {
  const el = document.querySelector(`[data-error-for="${fieldName}"]`);
  if (!el) return;
  el.textContent = message || "";
}

function clearErrors() {
  ["buyer-name", "buyer-whatsapp", "buyer-email", "participants"].forEach(
    (k) => setFieldError(k, "")
  );
}

/* Máscara de WhatsApp: (XX) XXXXX-XXXX */

function onlyDigits(value) {
  return value.replace(/\D/g, "");
}

function formatWhatsapp(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (!digits) return "";

  const ddd = digits.slice(0, 2);
  const firstPart = digits.slice(2, 7);
  const lastPart = digits.slice(7, 11);

  if (digits.length <= 2) return `(${ddd}`;
  if (digits.length <= 7) return `(${ddd}) ${firstPart}`;
  return `(${ddd}) ${firstPart}-${lastPart}`;
}

/**
 * Capitalize each word in the full name:
 * - Trims extra spaces
 * - Ensures each word starts with uppercase followed by lowercase
 * - Preserves multi-word names and simple punctuation
 */
function capitalizeNameWords(value) {
  if (!value) return "";
  return value
    .trim()
    .split(/\s+/)
    .map((w) => {
      if (!w) return "";
      return w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/* Passos / Progresso */

function setStepState(step, enabled) {
  const card = stepCards.find((c) => Number(c.dataset.step) === step);
  if (!card) return;
  if (enabled) {
    card.classList.remove("disabled");
  } else {
    card.classList.add("disabled");
  }
}

function updateProgress(currentStep) {
  stepIndicators.forEach((ind) => {
    const s = Number(ind.dataset.step);
    ind.classList.remove("active", "completed");
    if (s < currentStep) ind.classList.add("completed");
    if (s === currentStep) ind.classList.add("active");
  });
}

/* Passo 1: validação */

function validateStep1() {
  clearErrors();
  let ok = true;

  const name = selectors.buyerName.value.trim();
  const whatsappDigits = onlyDigits(selectors.buyerWhatsapp.value);

  if (!name) {
    setFieldError("buyer-name", "Informe seu nome completo.");
    ok = false;
  }

  // WhatsApp is mandatory
  if (whatsappDigits.length < 10) {
    setFieldError("buyer-whatsapp", "Informe um WhatsApp válido.");
    ok = false;
  }

  if (ok) {
    buyerData = {
      name,
      whatsapp: selectors.buyerWhatsapp.value.trim()
    };
  }

  return ok;
}

/* Passo 2: participantes */

function renderParticipants() {
  const qty = Number(selectors.qtyInput.value) || 1;
  selectors.participantsContainer.innerHTML = "";
  participantsData = [];

  for (let i = 1; i <= qty; i++) {
    const wrapper = document.createElement("div");
    wrapper.className = "participant-item";

    const label = document.createElement("div");
    label.className = "participant-label";
    label.textContent = `Ingresso ${i} – Nome do participante`;

    const input = document.createElement("input");
    input.type = "text";
    input.required = true;
    input.dataset.participantIndex = String(i);
    input.placeholder = "Nome completo";

    // Auto-capitalize each word gently while typing and normalize on blur
    input.addEventListener("input", (e) => {
      const raw = e.target.value;
      // collapse multiple spaces and preserve typing flow
      const transformed = raw
        .replace(/\s{2,}/g, " ")
        .split(" ")
        .map((part) => {
          if (!part) return "";
          return part[0].toUpperCase() + part.slice(1).toLowerCase();
        })
        .join(" ");

      if (transformed !== raw) {
        const pos = typeof e.target.selectionStart === "number" ? e.target.selectionStart : null;
        e.target.value = transformed;
        // best-effort caret restore
        if (pos !== null && typeof e.target.setSelectionRange === "function") {
          try {
            e.target.setSelectionRange(pos, pos);
          } catch {
            // ignore
          }
        }
      }
    });

    input.addEventListener("blur", (e) => {
      e.target.value = capitalizeNameWords(e.target.value);
      // update participantsData entry if present
      const idx = Number(e.target.dataset.participantIndex) || i;
      const existing = participantsData.find((p) => p.index === idx);
      if (existing) existing.name = e.target.value.trim();
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    selectors.participantsContainer.appendChild(wrapper);

    participantsData.push({
      index: i,
      name: ""
    });
  }
}

function validateStep2() {
  setFieldError("participants", "");
  const inputs = selectors.participantsContainer.querySelectorAll("input");
  let ok = true;
  participantsData = [];

  // Require each participant name to include at least two words (nome e sobrenome)
  let idx = 1;
  for (const input of inputs) {
    const raw = input.value.trim();
    // Split by whitespace and filter out empty segments
    const parts = raw.split(/\s+/).filter(Boolean);
    const hasFullName = parts.length >= 2 && parts[0].length > 0 && parts[parts.length - 1].length > 0;

    if (!raw || !hasFullName) {
      ok = false;
    }

    participantsData.push({
      index: idx,
      name: raw
    });
    idx += 1;
  }

  if (!ok) {
    setFieldError("participants", "Informe nome e sobrenome para todos os participantes.");
  }
  return ok;
}

/* Resumo (Passo 3) */

function updateSummary() {
  const qty = Number(selectors.qtyInput.value) || 1;
  const unit = parseUnitPrice();
  const total = qty * unit;

  // Event name in the top card -> show in summary (step 3)
  if (selectors.summaryEventName) {
    selectors.summaryEventName.textContent = currentEvent && currentEvent.name ? currentEvent.name : selectors.summaryEventName.textContent;
  }

  selectors.summaryQty.textContent = String(qty);
  selectors.summaryTotal.textContent = formatCurrency(total);
}

/* Supabase-backed helpers */

async function fetchEvent(eventId) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("Falha ao buscar evento");
  }
  if (data.status !== "published") {
    throw new Error("Evento não publicado");
  }
  return data;
}

async function createSaleInDB(payload) {
  // Insert sale and return the created row; if Supabase returns an error,
  // propagate the original error object so callers can inspect message/details
  const { data, error } = await supabase.from("sales").insert(payload).select().single();
  if (error) {
    console.error("Erro ao criar venda no Supabase:", error);
    // throw the original error so upstream can show the real message
    throw error;
  }
  return data;
}

async function createTicketsInDB(ticketsPayload) {
  // Insert multiple ticket records in a single operation.
  // ticketsPayload must be an array of ticket objects prepared by the caller.
  if (!Array.isArray(ticketsPayload) || ticketsPayload.length === 0) {
    throw new Error("Nenhum ingresso para criar.");
  }

  // Ensure no ticket has missing required participant name
  for (const t of ticketsPayload) {
    if (!t.participant_name || !String(t.participant_name).trim()) {
      throw new Error("Cada ingresso precisa do nome do participante.");
    }
  }

  const { data, error } = await supabase.from("tickets").insert(ticketsPayload).select();
  if (error) {
    console.error("Erro ao criar tickets no Supabase:", error);
    throw error;
  }
  return data;
}



/* Criação de venda e fluxo de pagamento */

/**
 * Centralized ID generator used across the app.
 * Produces IDs like:
 * - BUY-YYYYMMDD-HHMMSS-RND  (for sales)
 * - TICKET-YYYYMMDD-HHMMSS-RND (for tickets)
 *
 * RND = 3 uppercase alphanumeric chars.
 */
function generateId(prefix) {
  const now = new Date();
  const pad = (v, len = 2) => String(v).padStart(len, "0");
  const YYYY = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const DD = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const datePart = `${YYYY}${MM}${DD}`;
  const timePart = `${HH}${mm}${ss}`;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rnd = Array.from({ length: 3 })
    .map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
    .join("");
  return `${prefix}-${datePart}-${timePart}-${rnd}`;
}

/* Backwards-compatible wrappers */
function generateSaleId() {
  return generateId("BUY");
}

/* Ticket code generator using the same centralized format */
function generateTicketCode() {
  return generateId("TICKET");
}

/* Renderização de QRCode genérico no canvas (usado para ingressos) */

async function renderQRCodeToCanvas(canvas, data) {
  await QRCode.toCanvas(canvas, data, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: "M"
  });
}

/**
 * Desenha uma imagem remota (QR Code) em um canvas existente.
 */
async function drawImageOnCanvas(canvas, imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas sem contexto 2D"));
          return;
        }
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Falha ao carregar imagem do QR Code"));
    img.src = imageUrl;
  });
}

/**
 * Internal mock generator for PIX (no network calls).
 * Receives the same fields the previous mock endpoint expected and returns a simulated response.
 */
function gerarPixMock({
  valor_total,
  descricao,
  nome_comprador,
  event_id,
  quantidade
}) {
  // You can slightly vary values if necessary; kept static per requirements.
  return {
    status: "pending",
    payment_id: "pix_test_123456",
    qr_code_base64:
      "SIMULATED_QR_CODE_IMAGE_BASE64",
    pix_copia_e_cola:
      "00020126330014br.gov.bcb.pix0114+55999999999952040000530398654044.205802BR5920Ingresso Evento6009SAO PAULO62070503***6304ABCD"
  };
}

/**
 * Cria pedido PIX utilizando o mock interno (sem fetch).
 * Retorna um objeto com { paymentId, qrText, qrImageUrl } compatível com o restante do fluxo.
 */
async function createPagBankOrder({ referenceId, eventName, quantity, unitAmountBRL, totalAmountBRL, buyerName }) {
  const payload = {
    valor_total: Math.round(totalAmountBRL * 100) / 100,
    descricao: `${eventName} — ${quantity} ingresso(s)`,
    nome_comprador: buyerName,
    event_id: referenceId,
    quantidade: quantity
  };

  // Use internal mock generator instead of network call
  const data = gerarPixMock(payload);

  if (!data || !data.payment_id) {
    const err = (data && data.error) || "Resposta inválida do serviço de pagamento (mock interno)";
    console.error("PagBank internal mock error:", err);
    throw new Error(err);
  }

  // Map mock fields into the shape expected by the flow:
  // - paymentId -> payment_id
  // - qrText -> pix_copia_e_cola
  // - qrImageUrl -> data URL built from qr_code_base64 (if present)
  let qrImageUrl = null;
  if (data.qr_code_base64) {
    // build a data URL so drawImageOnCanvas can consume it
    qrImageUrl = `data:image/png;base64,${data.qr_code_base64}`;
  }

  return {
    paymentId: data.payment_id,
    qrText: data.pix_copia_e_cola || null,
    qrImageUrl
  };
}

async function handlePayPix() {
  if (selectors.payPixBtn.disabled) return;

  // Ensure we read the latest buyer fields from the form right before validation
  // so buyer_name is always present for sales and tickets.
  buyerData = {
    name: capitalizeNameWords((selectors.buyerName && selectors.buyerName.value) || "").trim(),
    whatsapp: (selectors.buyerWhatsapp && selectors.buyerWhatsapp.value) || ""
  };

  // Run validations after populating buyerData
  const step1OK = validateStep1();
  const step2OK = validateStep2();

  if (!step1OK) {
    updateProgress(1);
    return;
  }
  if (!step2OK) {
    updateProgress(2);
    return;
  }

  const qty = Number(selectors.qtyInput.value) || 0;
  const unit = parseUnitPrice();
  const total = qty * unit;

  // Ensure buyer_name is present before allowing payment flow to proceed.
  // This prevents creating tickets with null buyer_name.
  if (!buyerData || !buyerData.name || !buyerData.name.trim()) {
    selectors.paymentStatus.hidden = false;
    selectors.paymentStatusLabel.textContent =
      "Informe o nome do comprador antes de prosseguir com o pagamento.";
    return;
  }

  // Validações de negócio antes de qualquer ação
  if (qty <= 0) {
    selectors.paymentStatus.hidden = false;
    selectors.paymentStatusLabel.textContent =
      "Quantidade de ingressos inválida. Selecione pelo menos 1 ingresso.";
    return;
  }

  if (!currentEvent || !currentEvent.id) {
    selectors.paymentStatus.hidden = false;
    selectors.paymentStatusLabel.textContent =
      "Status: Este evento não está ativo para vendas no momento.";
    return;
  }

  // Re-fetch event from DB to ensure up-to-date status
  try {
    const { data: freshEvent, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", currentEvent.id)
      .limit(1)
      .single();

    if (error || !freshEvent) {
      selectors.paymentStatus.hidden = false;
      selectors.paymentStatusLabel.textContent =
        "Status: Este evento não está ativo para vendas no momento.";
      return;
    }

    if (String(freshEvent.status) !== "published") {
      selectors.paymentStatus.hidden = false;
      selectors.paymentStatusLabel.textContent =
        "Status: Este evento não está ativo para vendas no momento.";
      return;
    }

    // keep currentEvent fresh
    currentEvent = freshEvent;
  } catch (err) {
    console.error("Erro ao verificar status do evento:", err);
    selectors.paymentStatus.hidden = false;
    selectors.paymentStatusLabel.textContent =
      "Não foi possível verificar o status do evento. Tente novamente.";
    return;
  }

  if (!unit || unit <= 0) {
    selectors.paymentStatus.hidden = false;
    selectors.paymentStatusLabel.textContent =
      "Preço do ingresso inválido. Tente novamente mais tarde.";
    return;
  }

  const saleCode = generateSaleId();

  // Show loading state
  selectors.payPixBtn.disabled = true;
  selectors.payPixBtn.textContent = "Gerando PIX...";
  selectors.paymentStatus.hidden = false;
  selectors.paymentStatusLabel.textContent = "Gerando pedido de pagamento...";

  // track whether the sale flow completed successfully so we don't re-enable the pay button
  let saleCompleted = false;

  try {
    // Call backend endpoint to create PagBank PIX order
    const pagbankOrder = await createPagBankOrder({
      referenceId: saleCode,
      eventName: currentEvent.name || "Evento",
      quantity: qty,
      unitAmountBRL: unit,
      totalAmountBRL: total,
      buyerName: buyerData.name || ""
    });

    // After successful PagBank response, persist sale in DB following TicketBuy contract
    const salePayload = {
      event_id: currentEvent.id,
      sale_code: saleCode,
      total_amount: total,
      number_of_tickets: qty,
      buyer_name: buyerData.name,
      buyer_whatsapp: buyerData.whatsapp || null,
      buyer_email: buyerData.email || null,
      created_by_user_id: null, // set by caller/backend when available; left null here
      payment_provider: "PIX",
      ...(pagbankOrder && pagbankOrder.paymentId ? { payment_id: pagbankOrder.paymentId } : {}),
      payment_status: "pending",
      origin: "TicketBuy"
    };

    const saleFromDB = await createSaleInDB(salePayload);

    // Send a non-blocking notification to Pipedream so downstream workflows (eg. Telegram) are triggered.
    // This must never block or fail the sale creation flow.
    if (saleFromDB && saleFromDB.sale_code) {
      fetch("https://eobxw8ynswuvnem.m.pipedream.net", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          event: "new_sale",
          sale_code: saleFromDB.sale_code,
          total_amount: saleFromDB.total_amount,
          buyer_name: saleFromDB.buyer_name || "Não informado",
          buyer_whatsapp: saleFromDB.buyer_whatsapp || "",
          number_of_tickets: saleFromDB.number_of_tickets,
          origin: "ticketbuy"
        })
      }).catch((err) => {
        console.error("Erro ao enviar notificação para o Pipedream:", err);
      });
    }

    // Ensure Supabase returned a valid sale record with its generated id
    const saleId = saleFromDB && saleFromDB.id;
    if (!saleId) {
      console.error("Venda criada, mas não retornou sale_id válido:", saleFromDB);
      throw new Error("Falha ao obter ID da venda após criação. Tickets não serão gerados.");
    }

    // Keep currentSale metadata (use the DB-generated id)
    currentSale = {
      id: saleId,
      saleCode,
      status: "pending",
      number_of_tickets: qty,
      unitAmount: unit,
      totalAmount: total,
      buyer: { ...buyerData },
      participants: [...participantsData],
      eventId: currentEvent.id,
      paymentProvider: "pagbank",
      paymentId: pagbankOrder.paymentId
    };

    // Validate essential values before creating tickets
    if (!saleId) {
      throw new Error("ID da venda não retornado pelo banco (sale_id ausente). Tickets não serão criados.");
    }
    if (!currentEvent || !currentEvent.id) {
      throw new Error("ID do evento inválido. Tickets não serão criados.");
    }
    if (!buyerData || !buyerData.name || !buyerData.whatsapp) {
      throw new Error("Dados do comprador incompletos. Informe nome e WhatsApp do comprador.");
    }

    // Create tickets in the DB for each participant and persist participant/buyer info
    try {
      // Build tickets payload from participantsData (unique ticket_code based on sale_code)
      // Generate unique ticket_code values for each participant using centralized generator.
      // Verify against DB to avoid collisions and regenerate any duplicated suffixes (up to attempts limit).
      const MAX_TICKET_CODE_ATTEMPTS = 5;
      let ticketCodes = participantsData.map(() => generateTicketCode());
      let attempts = 0;

      while (attempts < MAX_TICKET_CODE_ATTEMPTS) {
        // Check for any existing ticket codes in DB
        try {
          const { data: existing = [], error: checkError } = await supabase
            .from("tickets")
            .select("ticket_code")
            .in("ticket_code", ticketCodes);

          if (checkError) {
            // On error, we break and proceed with the currently generated codes (rare environment failure)
            console.warn("Falha ao verificar colisões de ticket_code, prosseguindo:", checkError);
            break;
          }

          // If no existing conflicts, break loop
          if (!existing || existing.length === 0) break;

          // There are collisions: regenerate codes for collided values and try again
          const existingSet = new Set(existing.map((r) => r.ticket_code));
          ticketCodes = ticketCodes.map((code) =>
            existingSet.has(code) ? generateTicketCode() : code
          );
        } catch (e) {
          console.warn("Exceção ao verificar ticket_code:", e);
          break;
        }

        attempts += 1;
      }

      // Build payload using the ensured-unique ticket codes
      const ticketsPayload = participantsData.map((p, i) => {
        return {
          sale_id: saleId,
          event_id: currentEvent.id,
          participant_name: p.name || `Participante ${p.index}`,
          ticket_code: ticketCodes[i] || generateTicketCode(),
          ticket_type: "sell",
          status: "active",
          buyer_name: buyerData.name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      // Insert tickets into DB; if this fails we must rollback the sale for consistency
      let createdTickets;
      try {
        createdTickets = await createTicketsInDB(ticketsPayload);
      } catch (ticketErr) {
        console.error("Erro ao criar tickets no banco, revertendo venda:", ticketErr);
        // Attempt to delete the sale record to keep atomic behavior
        try {
          await supabase.from("sales").delete().eq("id", saleId);
        } catch (delErr) {
          console.error("Falha ao remover venda após erro na criação de tickets:", delErr);
        }
        throw ticketErr;
      }

      // Attach created tickets info to currentSale.participants for local usage
      currentSale.participants = createdTickets.map((t, idx) => {
        return {
          index: participantsData[idx] ? participantsData[idx].index : idx + 1,
          name: t.participant_name || (participantsData[idx] && participantsData[idx].name) || `Participante ${idx + 1}`,
          ticketId: t.id,
          ticketCode: t.ticket_code || t.ticketCode || null
        };
      });
    } catch (ticketErr) {
      console.error("Erro ao criar tickets no banco:", ticketErr);
      // inform user and abort flow
      selectors.paymentStatus.hidden = false;
      selectors.paymentStatusLabel.textContent =
        "Erro ao registrar ingressos. Operação revertida. Tente novamente.";
      // re-enable button so user can retry
      selectors.payPixBtn.disabled = false;
      selectors.payPixBtn.textContent = "Pagar via PIX";
      return;
    }
    // The sale remains recorded in `sales` and downstream systems (ADM/webhooks)
    // should handle ticket generation. This avoids creating tickets here and
    // prevents sending any ticket records from the client.

    // Update UI with payment details (friendly messages and enable check flow)
    // Reservation message per UX spec
    selectors.paymentStatusLabel.textContent =
      "Seu ingresso foi reservado. Complete o pagamento em até 20 minutos.";
    selectors.pixSection.hidden = false;

    // Show copy code
    selectors.pixCopyCode.value = pagbankOrder.qrText || "";

    // Do not display any QR code in the frontend per requirement; hide any QR wrapper if present.
    try {
      // pixCanvas may not exist in DOM; safely attempt to find wrapper if present
      const qrWrapper = document.querySelector(".pix-qrcode");
      if (qrWrapper) qrWrapper.style.display = "none";
    } catch (e) {
      // non-fatal
    }

    // Ensure the copy code area is visible and emphasized
    try {
      if (selectors.pixCopyCode) selectors.pixCopyCode.style.display = "block";
    } catch (e) {
      // ignore
    }

    // Hard-coded PIX copia e cola per requirement
    const fixedPixCode =
      "00020126740014BR.GOV.BCB.PIX0129djdiegocostaoficial@gmail.com0219Ingresso DC Eventos5204000053039865802BR5917DIEGO COSTA BESSA6013NOVA FRIBURGO622605221SeZvQwqvedLKqjVDwiH166304DF49";

    // Put the fixed code into the textarea (centered via existing CSS)
    selectors.pixCopyCode.value = fixedPixCode || "";

    // Ensure copy button is enabled and will copy the fixed code
    try {
      if (selectors.copyPixCodeBtn) selectors.copyPixCodeBtn.disabled = false;
    } catch (e) {}

    // Large countdown element (20 minutes) — create or reuse an element inside pix-section
    let countdownEl = document.getElementById("pix-countdown-large");
    if (!countdownEl) {
      countdownEl = document.createElement("div");
      countdownEl.id = "pix-countdown-large";
      countdownEl.style.fontSize = "34px";
      countdownEl.style.fontWeight = "800";
      countdownEl.style.textAlign = "center";
      countdownEl.style.margin = "8px 0";
      countdownEl.style.color = "var(--accent-strong)";
      // insert at top of pix-section for prominence
      const pixSection = selectors.pixSection;
      if (pixSection) pixSection.insertBefore(countdownEl, pixSection.firstChild);
    }

    // Start 20:00 countdown (in seconds)
    let remaining = 20 * 60;
    function formatMMSS(sec) {
      const mm = String(Math.floor(sec / 60)).padStart(2, "0");
      const ss = String(sec % 60).padStart(2, "0");
      return `${mm}:${ss}`;
    }
    // initialize display immediately
    countdownEl.textContent = formatMMSS(remaining);

    // clear any existing interval stored on element
    if (countdownEl._interval) {
      clearInterval(countdownEl._interval);
    }
    countdownEl._interval = setInterval(async () => {
      remaining -= 1;
      if (remaining < 0) {
        clearInterval(countdownEl._interval);
        countdownEl.textContent = "00:00";

        // Update sale and tickets status in Supabase: payment_status = "expired", tickets -> "cancelled"
        try {
          if (currentSale && currentSale.id) {
            await supabase.from("sales").update({ payment_status: "expired" }).eq("id", currentSale.id);
            await supabase.from("tickets").update({ status: "cancelled" }).eq("sale_id", currentSale.id);
          }
        } catch (dbErr) {
          console.error("Falha ao atualizar status após expiração:", dbErr);
        }

        // Update UI to reflect expiration
        selectors.paymentStatus.hidden = false;
        selectors.paymentStatusLabel.textContent = "Tempo esgotado — a reserva expirou.";
        // Hide pix area
        if (selectors.pixSection) selectors.pixSection.hidden = true;
        return;
      }
      countdownEl.textContent = formatMMSS(remaining);
    }, 1000);

    // Instruction text (explicit) — include the displayed total and a WhatsApp confirmation note
    let instr = document.getElementById("pix-instruction-text");
    // take the total displayed in the summary (fallback to a generic phrase if missing)
    const displayedTotal = selectors.summaryTotal ? selectors.summaryTotal.textContent : "o valor";
    const instrText = `Realize o Pix no valor de ${displayedTotal} para validar sua compra. Aguarde confirmação pelo Whatsapp.`;
    if (!instr) {
      instr = document.createElement("div");
      instr.id = "pix-instruction-text";
      instr.style.fontSize = "13px";
      instr.style.color = "var(--text-muted)";
      instr.style.textAlign = "center";
      instr.style.marginTop = "8px";
      instr.style.fontWeight = "600";
      instr.textContent = instrText;
      // place instruction right below the copy area
      const pixInfo = selectors.pixCopyCode && selectors.pixCopyCode.parentNode;
      if (pixInfo && pixInfo.parentNode) {
        pixInfo.parentNode.appendChild(instr);
      } else if (selectors.pixSection) {
        selectors.pixSection.appendChild(instr);
      }
    } else {
      instr.textContent = instrText;
    }

    // Ensure verify button available
    if (selectors.verifyPayBtn) {
      selectors.verifyPayBtn.disabled = false;
    }

    // A one-time informational warning near pay controls (kept minimal)
    try {
      if (!document.getElementById("pay-warning")) {
        const warn = document.createElement("div");
        warn.id = "pay-warning";
        warn.style.fontSize = "12px";
        warn.style.color = "var(--text-muted)";
        warn.style.marginTop = "8px";
        warn.style.fontWeight = "600";
        warn.textContent = "Só clique em pagar se for efetuar o pagamento agora — após 20 minutos, a reserva pode expirar.";
        selectors.payPixBtn.parentNode.insertBefore(warn, selectors.payPixBtn.nextSibling);
      }
    } catch (e) {
      // non-fatal
    }

    // mark successful completion and set final button state
    saleCompleted = true;
    selectors.payPixBtn.disabled = true;
    selectors.payPixBtn.textContent = "Solicitação de Compra Efetuada";

    updateSummary();
    updateProgress(3);
  } catch (err) {
    console.error("Erro durante geração do PIX:", err);
    selectors.paymentStatus.hidden = false;
    selectors.paymentStatusLabel.textContent =
      err && err.message
        ? `Erro: ${err.message}`
        : "Não foi possível gerar o PIX. Tente novamente em instantes.";
  } finally {
    // only re-enable the pay button when the flow did NOT complete successfully
    if (!saleCompleted) {
      selectors.payPixBtn.disabled = false;
      selectors.payPixBtn.textContent = "Pagar via PIX";
    }
  }
}

/**
 * Process payment update (webhook-compatible).
 * Recebe payment_id e status; quando status === "paid":
 *  - atualiza sales.payment_status para "paid"
 *  - atualiza tickets.status para "paid" para todos os tickets relacionados à sale retornada
 *  - atualiza o estado local e a UI (gera ingressos e marca sucesso)
 *
 * Função resiliente para uso por webhooks/backend; comentários longos removidos para clareza.
 */
async function processPaymentWebhook(payment_id, status) {
  if (!payment_id || !status) {
    console.warn("processPaymentWebhook chamado com parâmetros inválidos", payment_id, status);
    return { ok: false, message: "Parâmetros inválidos" };
  }

  try {
    // Update sale payment_status and retrieve the updated sale (single expected)
    const { data: updatedSale, error: saleError } = await supabase
      .from("sales")
      .update({ payment_status: status })
      .eq("payment_id", payment_id)
      .select()
      .single();

    if (saleError) {
      console.error("Erro ao atualizar sale via webhook:", saleError);
      return { ok: false, message: saleError.message || "Erro ao atualizar sale" };
    }

    if (!updatedSale || !updatedSale.id) {
      console.warn("Nenhuma venda encontrada para payment_id:", payment_id);
      return { ok: false, message: "Venda não encontrada" };
    }

    // If payment is paid, update tickets linked to this sale
    if (String(status) === "paid") {
      try {
        const { error: ticketsUpdateError } = await supabase
          .from("tickets")
          .update({ status: "paid" })
          .eq("sale_id", updatedSale.id);

        if (ticketsUpdateError) {
          console.error("Erro ao atualizar tickets via webhook:", ticketsUpdateError);
          // we continue despite ticket update failure so UI can still reflect sale change
        }
      } catch (e) {
        console.error("Exceção ao atualizar tickets:", e);
      }
    }

    // Update local state if currentSale matches this sale
    if (currentSale && (String(currentSale.id) === String(updatedSale.id) || String(currentSale.paymentId) === String(payment_id))) {
      currentSale.status = status;
      // If payment moved to paid, ensure UI flows to approved state
      if (String(status) === "paid") {
        try {
          await handlePaymentApproved();
        } catch (e) {
          console.error("Erro ao finalizar UI após webhook de pagamento:", e);
        }
      } else {
        // For non-paid states, reflect status label
        selectors.paymentStatus.hidden = false;
        selectors.paymentStatusLabel.textContent = `Status do pagamento: ${status}`;
      }
    }

    return { ok: true, sale: updatedSale };
  } catch (err) {
    console.error("Erro inesperado em processPaymentWebhook:", err);
    return { ok: false, message: err && err.message ? err.message : "Erro inesperado" };
  }
}



async function handlePaymentApproved() {
  selectors.paymentStatusLabel.textContent = "Pagamento aprovado";
  selectors.pixSection.hidden = false;
  selectors.successSection.hidden = false;

  // Gera ingressos com QR Code único por participante
  selectors.ticketsList.innerHTML = "";

  for (const participant of currentSale.participants) {
    const item = document.createElement("div");
    item.className = "ticket-item";

    const info = document.createElement("div");
    info.className = "ticket-info";
    const title = document.createElement("strong");
    title.textContent = participant.name;
    const line1 = document.createElement("div");
    line1.textContent = "Ingresso " + participant.index;
    const line2 = document.createElement("div");
    line2.textContent = "ID da venda: " + currentSale.id;
    info.appendChild(title);
    info.appendChild(line1);
    info.appendChild(line2);

    const qrWrapper = document.createElement("div");
    qrWrapper.className = "ticket-qrcode";
    const canvas = document.createElement("canvas");
    qrWrapper.appendChild(canvas);

    item.appendChild(info);
    item.appendChild(qrWrapper);
    selectors.ticketsList.appendChild(item);

    // Conteúdo único por ingresso
    const ticketPayload = `TICKETBUY|EVENT=${currentSale.eventId}|SALE=${currentSale.id}|TICKET=${participant.index}|NAME=${participant.name}`;
    await renderQRCodeToCanvas(canvas, ticketPayload);
  }

  // Aqui você prepararia e dispararia o envio de mensagens
  // (WhatsApp e e-mail) a partir do seu backend.
}

/* Clipboard */

async function copyPixCode() {
  const text = selectors.pixCopyCode.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    // friendly feedback to user (minimal: update status label)
    selectors.paymentStatus.hidden = false;
    selectors.paymentStatusLabel.textContent = "Código copiado para a área de transferência.";
  } catch {
    selectors.paymentStatus.hidden = false;
    selectors.paymentStatusLabel.textContent = "Não foi possível copiar automaticamente. Selecione e copie manualmente.";
  }
}



/* LISTENERS */

function bindEvents() {
  // Máscara WhatsApp
  selectors.buyerWhatsapp.addEventListener("input", (e) => {
    const value = e.target.value;
    const formatted = formatWhatsapp(value);
    e.target.value = formatted;

    // If WhatsApp is filled with a valid length, enable step 2.
    const digits = onlyDigits(formatted);
    if (digits.length >= 10) {
      // Ensure name is present before fully advancing UI; if name ok, advance to step 2
      const namePresent = selectors.buyerName && selectors.buyerName.value.trim().length > 0;
      // If name is present and overall Step1 validation passes, enable step 2 and show progress.
      if (namePresent && validateStep1()) {
        setStepState(2, true);
        updateProgress(2);
      } else {
        // If name not present but whatsapp is valid, still enable step 2 (per requirement)
        setStepState(2, true);
      }
    } else {
      // If whatsapp cleared / invalid, disable step 2 and return progress to step 1
      setStepState(2, false);
      updateProgress(1);
    }
  });



  // Validação simples em blur para desbloquear próximo passo
  [selectors.buyerName, selectors.buyerWhatsapp].forEach(
    (input) => {
      // For name field, ensure proper capitalization on input and blur
      if (input === selectors.buyerName) {
        input.addEventListener("input", (e) => {
          // preserve caret behavior by only transforming when input supports selection
          // we apply a gentle transformation on each input: keep successive spaces collapsed visually
          const raw = e.target.value;
          const transformed = raw
            .replace(/\s{2,}/g, " ")
            .split(" ")
            .map((part) => {
              // avoid forcing capitalization for single-letter typing flow
              if (!part) return "";
              return part[0].toUpperCase() + part.slice(1);
            })
            .join(" ");

          if (transformed !== raw) {
            const pos = typeof e.target.selectionStart === "number" ? e.target.selectionStart : null;
            e.target.value = transformed;
            // try to restore caret (best-effort)
            if (pos !== null && typeof e.target.setSelectionRange === "function") {
              try {
                e.target.setSelectionRange(pos, pos);
              } catch {
                // ignore if selection not supported
              }
            }
          }
        });

        input.addEventListener("blur", () => {
          // On blur, apply full capitalization normalization
          input.value = capitalizeNameWords(input.value);
          const ok = validateStep1();
          if (ok) {
            setStepState(2, true);
            updateProgress(2);
          }
        });
      } else {
        input.addEventListener("blur", () => {
          const ok = validateStep1();
          if (ok) {
            setStepState(2, true);
            updateProgress(2);
          }
        });
      }
    }
  );

  // Quantidade
  selectors.qtyDecrease.addEventListener("click", () => {
    let value = Number(selectors.qtyInput.value) || 1;
    value = Math.max(1, value - 1);
    selectors.qtyInput.value = String(value);
    onQuantityChange();
  });

  selectors.qtyIncrease.addEventListener("click", () => {
    let value = Number(selectors.qtyInput.value) || 1;
    value = Math.min(MAX_QTY, value + 1);
    selectors.qtyInput.value = String(value);
    onQuantityChange();
  });

  selectors.qtyInput.addEventListener("input", () => {
    let value = Number(selectors.qtyInput.value) || 1;
    if (value < 1) value = 1;
    if (value > MAX_QTY) value = MAX_QTY;
    selectors.qtyInput.value = String(value);
    onQuantityChange();
  });

  // Desbloqueia passo 3 quando todos os nomes estiverem preenchidos
  selectors.participantsContainer.addEventListener("input", () => {
    if (validateStep2() && validateStep1()) {
      setStepState(3, true);
      updateProgress(3);
    }
  });

  selectors.payPixBtn.addEventListener("click", handlePayPix);
  selectors.copyPixCodeBtn.addEventListener("click", copyPixCode);

}

/* HANDLERS */

function onQuantityChange() {
  const qty = Number(selectors.qtyInput.value) || 1;
  selectors.qtyText.textContent =
    qty === 1
      ? "Você está comprando 1 ingresso"
      : `Você está comprando ${qty} ingressos`;

  renderParticipants();
  updateSummary();
}

/* INIT */

async function loadEventAndPopulate() {
  /**
   * Behavior:
   * - If event_id is present in URL, try to fetch that specific event (and ensure it's published).
   * - Otherwise, query the events table for the first published event and use it as the active event.
   * - If no published event is found, disable the purchase flow and show a clear message to the user.
   */

  const eventIdFromURL = getEventIdFromURL();

  try {
    let event = null;

    if (eventIdFromURL) {
      // Try to fetch specific event by id (ensures status published inside fetchEvent)
      try {
        event = await fetchEvent(eventIdFromURL);
      } catch (err) {
        // fallback to searching published events below
        event = null;
      }
    }

    if (!event) {
      // Query for any published event
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("status", "published")
        .order("id", { ascending: true })
        .limit(1)
        .single();

      if (error || !data) {
        // No published event found -> disable flow and inform user
        handleNoPublishedEvent();
        return;
      }

      event = data;
    }

    // If we have an event, populate the UI
    currentEvent = event;

    if (selectors.eventTitle) {
      selectors.eventTitle.textContent = event.name || selectors.eventTitle.textContent;
    }

    // Build a friendly date/time label from event_date and event_time (format BR)
    if (selectors.eventDatetime) {
      const rawDate = event.event_date ? String(event.event_date) : "";
      const dateLabel = rawDate ? formatDateBR(rawDate) : "";
      const timeLabel = event.event_time ? String(event.event_time) : "";
      const combined = [dateLabel, timeLabel].filter(Boolean).join(" • ");
      if (combined) selectors.eventDatetime.textContent = combined;
    }

    if (selectors.eventLocation) {
      selectors.eventLocation.textContent = event.location || selectors.eventLocation.textContent;
    }

    // Avoid showing the blocked description string explicitly
    if (selectors.eventDescription) {
      const blocked =
        "Uma noite imersiva com música, conteúdo e experiências ao vivo para quem quer transformar eventos em resultados.";
      if (event.description && event.description.trim() !== blocked) {
        selectors.eventDescription.textContent = event.description;
      } else {
        selectors.eventDescription.textContent = "";
      }
    }

    // Ticket price may come as number or string; normalize
    if (event.ticket_price !== undefined && event.ticket_price !== null) {
      const priceNum = Number(event.ticket_price);
      if (!Number.isNaN(priceNum)) {
        setUnitPrice(priceNum);
      }
    }

    // Set flyer image as banner background if provided
    if (selectors.eventBanner && event.flyer_image_url) {
      selectors.eventBanner.style.backgroundImage = `url("${event.flyer_image_url}")`;
      selectors.eventBanner.style.backgroundSize = "cover";
      selectors.eventBanner.style.backgroundPosition = "center";
    }

    updateSummary();
  } catch (err) {
    // unexpected error while loading event -> disable flow for safety
    console.error("Erro ao carregar evento:", err);
    handleNoPublishedEvent();
  }
}

/* Handle no published event available */
function handleNoPublishedEvent() {
  // Disable all steps and inputs
  stepCards.forEach((c) => c.classList.add("disabled"));
  stepIndicators.forEach((i) => i.classList.remove("active", "completed"));
  // Disable actions
  if (selectors.payPixBtn) {
    selectors.payPixBtn.disabled = true;
  }
  // Disable form fields
  [
    selectors.buyerName,
    selectors.buyerWhatsapp,
    selectors.qtyInput,
    selectors.qtyDecrease,
    selectors.qtyIncrease
  ].forEach((el) => {
    if (el) el.disabled = true;
  });

  // Show a clear message below the header
  const header = document.querySelector(".event-header");
  if (header && !document.getElementById("no-events-message")) {
    const msg = document.createElement("div");
    msg.id = "no-events-message";
    msg.style.margin = "10px 12px 0";
    msg.style.padding = "10px";
    msg.style.borderRadius = "12px";
    msg.style.background = "#FFF4F4";
    msg.style.border = "1px solid #FFD2D2";
    msg.style.color = "#7a1f1f";
    msg.style.fontSize = "13px";
    msg.style.fontWeight = "600";
    msg.textContent = "No momento não há eventos disponíveis para venda.";
    header.parentNode.insertBefore(msg, header.nextSibling);
  }
}

async function init() {
  updateProgress(1);
  setStepState(1, true);
  setStepState(2, false);
  setStepState(3, false);
  await loadEventAndPopulate();
  renderParticipants();
  updateSummary();
  bindEvents();

  // Apply cyan primary-like styling to the "Copiar código" button for better visual weight
  if (selectors.copyPixCodeBtn) {
    // Keep it as a prominent pill button similar to "Pagar via PIX" but in cyan
    selectors.copyPixCodeBtn.className = "primary-btn cyan-btn";
    // Ensure minimum width similar to previous secondary styling for comfortable touch target
    selectors.copyPixCodeBtn.style.minWidth = "140px";
  }
}

/* Register a simple service worker to improve PWA behavior and enable standalone install */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // optional: console.info("ServiceWorker registered", reg);
      })
      .catch(() => {
        // ignore registration errors silently in this environment
      });
  });
}

init();

// Support WhatsApp button behavior
(function bindSupportWhatsApp() {
  function openWhatsAppHelp() {
    const phone = "5522997851781"; // formatted international without plus
    const text = "Tenho uma dúvida! Você pode me ajudar?";
    // Prefer whatsapp:// scheme for native app, fallback to web URL
    const appUrl = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`;
    const webUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;

    // Try to open native app; if blocked, open web fallback
    const win = window.open(appUrl, "_blank");
    // If popup was blocked or scheme failed, fallback after short timeout
    setTimeout(() => {
      try {
        // If window couldn't be opened or remains about:blank, open web URL
        if (!win || win.closed || win.location.href === "about:blank") {
          window.open(webUrl, "_blank");
        }
      } catch {
        // opening app scheme may throw; ensure web fallback
        window.open(webUrl, "_blank");
      }
    }, 500);
  }

  // Attach listener when DOM is ready
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!target) return;
    if (target.id === "support-whatsapp-btn" || target.closest?.("#support-whatsapp-btn")) {
      e.preventDefault();
      openWhatsAppHelp();
    }
  });
})();