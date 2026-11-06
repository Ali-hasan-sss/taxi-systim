import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.resolve(here, "../../../.env"));
loadEnvFile(path.resolve(here, "../.env"));

const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
const secret = process.env.TELEGRAM_BOT_SECRET?.trim() ?? "";
const apiBase = (process.env.API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

const CURRENT = "📍 لموقعي هاد";
const OTHER = "📌 لموقع تاني";
const CANCEL = "❌ إلغاء";
const USE_MY_NUMBER = "📱 رقمي على تيليغرام";
const NO_NOTES = "⏭ بدون ملاحظة";
const CONFIRM = "✅ أكّد الطلب";

const drafts = new Map();

function displayName(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return name || "زبون تيليغرام";
}

function keyboard(rows, { typing = false, placeholder = "اختار زر من تحت" } = {}) {
  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: !typing,
    one_time_keyboard: false,
    input_field_placeholder: placeholder.slice(0, 64)
  };
}

function btn(text, extra = {}) {
  return { text, ...extra };
}

const menuKeyboard = keyboard([[btn(CURRENT, { request_location: true, style: "primary" })], [btn(OTHER)]]);
const otherPlaceKeyboard = keyboard(
  [[btn("🗺️ حدد من الخريطة", { request_location: true, style: "primary" })], [btn(CANCEL, { style: "danger" })]],
  { typing: true, placeholder: "أو اكتب المكان هون" }
);
const phoneKeyboard = keyboard(
  [[btn(USE_MY_NUMBER, { request_contact: true, style: "primary" })], [btn(CANCEL, { style: "danger" })]],
  { typing: true, placeholder: "اكتب الرقم كامل" }
);
const notesKeyboard = keyboard(
  [[btn(NO_NOTES)], [btn(CANCEL, { style: "danger" })]],
  { typing: true, placeholder: "اكتب ملاحظتك إذا في" }
);
const confirmKeyboard = keyboard(
  [[btn(CONFIRM, { style: "success" })], [btn(CANCEL, { style: "danger" })]],
  { placeholder: "اضغط أكّد الطلب" }
);

function typingKeyboard(placeholder) {
  return keyboard([[btn(CANCEL, { style: "danger" })]], { typing: true, placeholder });
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isCancel(text) {
  return text === CANCEL || text === "إلغاء" || text === "/cancel";
}

async function callTelegram(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.ok === false) {
    throw new Error(payload.description || `Telegram ${method} failed`);
  }
  return payload.result;
}

function say(chatId, text, replyMarkup) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup
  });
}

function showMenu(chatId, text = "🚕 <b>أهلا فيك مع تاكسي برو Taxi Bro</b>\nبدك سيارة؟ اختار من تحت:") {
  drafts.delete(chatId);
  return say(chatId, text, menuKeyboard);
}

function showPhone(chatId) {
  return say(
    chatId,
    "📱 <b>ابعت رقم التواصل</b>\nاكتب الرقم كامل برسالة وحدة، أو اضغط «رقمي على تيليغرام».",
    phoneKeyboard
  );
}

function money(value) {
  const amount = Number(value);
  const shown = Number.isFinite(amount) ? amount : 0;
  return `${new Intl.NumberFormat("ar-SY", { maximumFractionDigits: 0 }).format(shown)} ل.س`;
}

async function officeFetch(path, init) {
  return fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Secret": secret,
      ...(init?.headers ?? {})
    }
  });
}

async function fetchFareQuote() {
  const res = await officeFetch("/telegram/fare");
  if (!res.ok) throw new Error("تعذر قراءة السعر الابتدائي");
  const body = await res.json();
  return {
    minFare: typeof body.minFare === "number" && body.minFare > 0 ? body.minFare : 150,
    per100mFare: typeof body.per100mFare === "number" && body.per100mFare >= 0 ? body.per100mFare : 10
  };
}

async function resolvePlace(lat, lng) {
  const res = await officeFetch("/telegram/place", {
    method: "POST",
    body: JSON.stringify({ lat, lng })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.place !== "string" || body.place.trim().length < 2) {
    throw new Error(body.message || "تعذر تحديد أقرب معلم");
  }
  return body.place.trim();
}

function unresolvedPlace(value) {
  return !value || /أقرب معلم|موقع الخريطة|موقعك الحالي|\d+\.\d{3,}/.test(value);
}

async function captureLocation(chatId, draft, location) {
  draft.pickupLat = location.latitude;
  draft.pickupLng = location.longitude;
  drafts.set(chatId, draft);
  await say(chatId, "🔄 <b>عم دور على أقرب معلم...</b>", keyboard([[btn(CANCEL, { style: "danger" })]]));
  try {
    draft.pickup = await resolvePlace(location.latitude, location.longitude);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "ما قدرنا نلاقي معلم قريب";
    if (draft.mode === "current" && !draft.phone) {
      drafts.delete(chatId);
      await say(chatId, `⚠️ ${esc(reason)}\nاضغط «لموقعي هاد» مرة تانية.`, menuKeyboard);
      return;
    }
    draft.step = "pickup";
    drafts.set(chatId, draft);
    await say(chatId, `⚠️ ${esc(reason)}\nاكتب المكان أو حدده من الخريطة مرة تانية.`, otherPlaceKeyboard);
    return;
  }
  drafts.set(chatId, draft);
  if (!draft.phone) {
    draft.step = "phone";
    drafts.set(chatId, draft);
    await say(
      chatId,
      `📍 <b>الموقع:</b> ${esc(draft.pickup)}\n\n📱 <b>ابعت رقم التواصل</b>\nاكتب الرقم كامل برسالة وحدة، أو اضغط «رقمي على تيليغرام».`,
      phoneKeyboard
    );
    return;
  }
  draft.step = "dropoff";
  drafts.set(chatId, draft);
  await say(
    chatId,
    `📍 <b>الموقع:</b> ${esc(draft.pickup)}\n\n🏁 <b>لوين بدك تروح؟</b>\nاكتب الوجهة.`,
    typingKeyboard("اكتب الوجهة هون")
  );
}

async function submitOrder(input) {
  const res = await officeFetch("/telegram/orders", {
    method: "POST",
    body: JSON.stringify(input)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || "تعذر إنشاء الطلب");
  return {
    amount: body.amount ?? "0",
    pickupAddress: body.pickupAddress ?? input.pickupAddress ?? "",
    dropoffAddress: body.dropoffAddress ?? input.dropoffAddress
  };
}

async function showConfirm(chatId, draft) {
  const quote = draft.fareQuote ?? (await fetchFareQuote().catch(() => ({ minFare: 150, per100mFare: 10 })));
  draft.fareQuote = quote;
  draft.minFare = quote.minFare;
  draft.step = "confirm";
  drafts.set(chatId, draft);
  const notes = draft.notes?.trim() ? esc(draft.notes.trim()) : "ما في";
  await say(
    chatId,
    [
      "🚕 <b>تأكد الطلب قبل ما ينبعت</b>",
      "",
      `📍 <b>من:</b> ${esc(draft.pickup)}`,
      `🏁 <b>إلى:</b> ${esc(draft.dropoff)}`,
      `📱 <b>الرقم:</b> ${esc(draft.phone)}`,
      `📝 <b>ملاحظات:</b> ${notes}`,
      `💰 <b>أجرة أول 2 كم:</b> ${esc(money(quote.minFare))}`,
      `➕ <b>بعد الـ 2 كم:</b> ${esc(money(quote.per100mFare))} لكل 100 متر`,
      "",
      "إذا تمام، اضغط أكّد الطلب."
    ].join("\n"),
    confirmKeyboard
  );
}

function westernDigits(value) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function noteLine(draft) {
  const parts = [draft.notes?.trim(), draft.username ? `تيليغرام: @${draft.username}` : ""].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function askPickup(chatId, draft) {
  if (draft.pickup && !unresolvedPlace(draft.pickup)) {
    draft.step = "dropoff";
    drafts.set(chatId, draft);
    return say(chatId, "🏁 <b>لوين بدك تروح؟</b>\nاكتب الوجهة.", typingKeyboard("اكتب الوجهة هون"));
  }
  draft.step = "pickup";
  drafts.set(chatId, draft);
  return say(
    chatId,
    "📌 <b>من وين بدك السيارة؟</b>\nاكتب المكان، أو اضغط «حدد من الخريطة».",
    otherPlaceKeyboard
  );
}

async function botIsEnabled() {
  try {
    const res = await officeFetch("/telegram/status");
    if (!res.ok) return true;
    const body = await res.json();
    return body.enabled !== false;
  } catch {
    return true;
  }
}

async function sayMaintenance(chatId) {
  await officeFetch("/telegram/paused-chat", {
    method: "POST",
    body: JSON.stringify({ chatId: String(chatId) })
  }).catch(() => undefined);
  await say(
    chatId,
    [
      "🛠️ <b>البوت في حالة صيانة</b>",
      "سيتم اعلامك حين العودة للعمل.",
      "",
      "يمكنك طلب سيارة بالاتصال أو مراسلة واتساب للأرقام التالية:",
      '<a href="tel:+963985717666">0985717666</a> · <a href="https://wa.me/963985717666">واتساب</a>',
      '<a href="tel:+963985717999">0985717999</a> · <a href="https://wa.me/963985717999">واتساب</a>',
      '<a href="tel:+963985717333">0985717333</a> · <a href="https://wa.me/963985717333">واتساب</a>'
    ].join("\n"),
    { remove_keyboard: true }
  );
}

async function deliverResumeNotices() {
  if (!(await botIsEnabled())) return;
  const res = await officeFetch("/telegram/resume-notices");
  if (!res.ok) return;
  const body = await res.json().catch(() => ({}));
  const chatIds = Array.isArray(body.chatIds) ? body.chatIds : [];
  const sent = [];
  for (const id of chatIds) {
    try {
      await showMenu(id, "✅ <b>انتهت الصيانة</b>\nرجع البوت يشتغل، فيك تطلب سيارة.");
      sent.push(String(id));
    } catch (error) {
      console.error("[telegram] resume", error);
    }
  }
  if (sent.length > 0) {
    await officeFetch("/telegram/resume-notices/ack", {
      method: "POST",
      body: JSON.stringify({ chatIds: sent })
    }).catch(() => undefined);
  }
}

async function handle(message) {
  if (message.chat.type !== "private" || !message.from) return;
  const chatId = message.chat.id;
  const text = message.text?.trim() ?? "";

  if (!(await botIsEnabled())) {
    await sayMaintenance(chatId);
    return;
  }

  if (!drafts.has(chatId) && message.location) {
    const draft = {
      step: "start",
      mode: "current",
      customerName: displayName(message.from),
      username: message.from.username
    };
    drafts.set(chatId, draft);
    await captureLocation(chatId, draft, message.location);
    return;
  }

  if (text === "/start" || isCancel(text)) {
    await showMenu(
      chatId,
      isCancel(text) ? "❌ <b>انلغى الطلب</b>\nإذا بدك، اختار من جديد." : undefined
    );
    return;
  }

  if (text === CURRENT || text === "طلب سيارة لموقعي الحالي" || text === OTHER || text === "طلب سيارة لموقع آخر") {
    const mode = text === OTHER || text === "طلب سيارة لموقع آخر" ? "other" : "current";
    const draft = {
      step: "phone",
      mode,
      customerName: displayName(message.from),
      username: message.from.username
    };
    drafts.set(chatId, draft);
    await showPhone(chatId);
    return;
  }

  const draft = drafts.get(chatId);
  if (!draft) {
    await showMenu(chatId);
    return;
  }

  if (draft.step === "phone") {
    if (message.contact?.phone_number) {
      const digits = westernDigits(message.contact.phone_number).replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) {
        await say(chatId, "⚠️ الرقم اللي وصلني مو صالح. اكتب الرقم كامل.", phoneKeyboard);
        return;
      }
      draft.phone = digits;
      drafts.set(chatId, draft);
      await askPickup(chatId, draft);
      return;
    }
    if (text === USE_MY_NUMBER || text === "استخدام رقمي الحالي") {
      await say(chatId, "📱 اضغط الزر الأزرق ليوصلك رقمك على تيليغرام.", phoneKeyboard);
      return;
    }
    const typed = westernDigits(text).replace(/\D/g, "");
    const hasLetters = /[A-Za-z\u0621-\u064A]/.test(text);
    if (!hasLetters && typed.length >= 8 && typed.length <= 15) {
      draft.phone = typed;
      drafts.set(chatId, draft);
      await askPickup(chatId, draft);
      return;
    }
    await say(chatId, "🔢 اكتب الرقم كامل برسالة وحدة، مثل 0933123456.", phoneKeyboard);
    return;
  }

  if (draft.step === "pickup") {
    if (message.location) {
      await captureLocation(chatId, draft, message.location);
      return;
    }
    if (text.length < 2 || text.startsWith("/")) {
      await say(chatId, "✍️ اكتب مكان الانطلاق، أو اضغط «حدد من الخريطة».", otherPlaceKeyboard);
      return;
    }
    draft.pickup = text.slice(0, 300);
    draft.step = "dropoff";
    drafts.set(chatId, draft);
    await say(chatId, "🏁 <b>لوين بدك تروح؟</b>\nاكتب الوجهة.", typingKeyboard("اكتب الوجهة هون"));
    return;
  }

  if (draft.step === "dropoff") {
    if (text.length < 2 || text.startsWith("/")) {
      await say(chatId, "✍️ اكتب الوجهة بوضوح، مثلاً: الكورنيش أو المشفى.", typingKeyboard("اكتب الوجهة هون"));
      return;
    }
    draft.dropoff = text.slice(0, 300);
    draft.step = "notes";
    drafts.set(chatId, draft);
    await say(chatId, "📝 <b>في ملاحظة؟</b>\nاكتبها إذا في، أو اضغط «بدون ملاحظة».", notesKeyboard);
    return;
  }

  if (draft.step === "notes") {
    if (!text) {
      await say(chatId, "📝 اكتب الملاحظة، أو اضغط «بدون ملاحظة».", notesKeyboard);
      return;
    }
    draft.notes = text === NO_NOTES || text === "بدون ملاحظات" ? undefined : text.slice(0, 2000);
    if (unresolvedPlace(draft.pickup)) {
      draft.step = "pickup";
      drafts.set(chatId, draft);
      await say(chatId, "⚠️ مكان الانطلاق مو واضح. اكتبه أو حدده من الخريطة.", otherPlaceKeyboard);
      return;
    }
    try {
      draft.fareQuote = await fetchFareQuote();
      draft.minFare = draft.fareQuote.minFare;
    } catch {
      draft.minFare = 150;
    }
    await showConfirm(chatId, draft);
    return;
  }

  if (draft.step === "confirm") {
    if (text !== CONFIRM) {
      await say(chatId, "اضغط تأكيد الطلب للإرسال، أو إلغاء للبدء من جديد.", confirmKeyboard);
      return;
    }
    try {
      if (unresolvedPlace(draft.pickup)) {
        await say(chatId, "مكان الانطلاق غير محدد. أعد إرسال الموقع.", confirmKeyboard);
        return;
      }
      const created = await submitOrder({
        customerName: draft.customerName,
        customerPhone: draft.phone ?? "",
        pickupAddress: draft.pickup,
        pickupLat: draft.pickupLat,
        pickupLng: draft.pickupLng,
        dropoffAddress: draft.dropoff ?? "",
        notes: noteLine(draft),
        telegramChatId: String(chatId)
      });
      drafts.delete(chatId);
      await say(
        chatId,
        [
          "✅ <b>تم إرسال الطلب للسائقين</b>",
          `📍 <b>من:</b> ${esc(created.pickupAddress)}`,
          `🏁 <b>إلى:</b> ${esc(created.dropoffAddress)}`,
          `💰 <b>أجرة أول 2 كم:</b> ${esc(money(created.amount))}`,
          "المسافة الزيادة بتنحسب وقت التوصيل."
        ].join("\n"),
        menuKeyboard
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "تعذر إنشاء الطلب";
      await say(chatId, `${reason}\nيمكنك المحاولة مرة أخرى أو الإلغاء.`, confirmKeyboard);
    }
  }
}

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      await deliverResumeNotices();
      const updates = await callTelegram("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"]
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) {
          await handle(update.message).catch((error) => {
            console.error("[telegram] message", error);
          });
        }
      }
    } catch (error) {
      console.error("[telegram] poll", error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

if (!token || !secret) {
  console.log("بوت تيليغرام بانتظار TELEGRAM_BOT_TOKEN و TELEGRAM_BOT_SECRET في ملف .env");
  setInterval(() => undefined, 60_000);
} else {
  console.log("بوت تيليغرام يعمل");
  void poll();
}
