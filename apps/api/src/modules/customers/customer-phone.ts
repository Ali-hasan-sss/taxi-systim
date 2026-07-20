import { Prisma } from "@prisma/client";

function extractWesternDigitRun(phone: string): string {
  const western = phone
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
  return western.replace(/[^\d]/g, "");
}

/**
 * توحيد رقم الزبون للمطابقة في جدول Customer (صيغة 963…).
 */
export function normalizeCustomerPhone(phone: string | null | undefined): string | null {
  if (phone == null) return null;
  const raw = String(phone).trim();
  if (!raw) return null;
  let d = extractWesternDigitRun(raw);
  if (d.length < 8) return null;

  if (d.startsWith("00")) d = d.slice(2);

  if (d.startsWith("963")) {
    return d.length >= 11 && d.length <= 15 ? d : null;
  }

  if (d.startsWith("0") && d.length >= 9) {
    return `963${d.slice(1)}`;
  }

  if (d.startsWith("9") && d.length === 9) {
    return `963${d}`;
  }

  if (d.length >= 8 && d.length <= 10) {
    return `963${d}`;
  }

  return d.length >= 8 ? d : null;
}

export function displayCustomerPhone(phone: string): string {
  if (phone.startsWith("963") && phone.length >= 12) return `0${phone.slice(3)}`;
  return phone;
}

type Tx = Prisma.TransactionClient;

/**
 * إن وُجد الزبون برقم الهاتف لا يُنشأ من جديد؛ يُحدَّث عدّاد الطلبات وآخر طلب فقط.
 * الاسم اختياري — يُملأ عند الإنشاء أو إن كان فارغًا لدى زبون موجود.
 */
export async function linkCustomerToNewOrder(
  tx: Tx,
  opts: { phone?: string | null; name?: string | null; at?: Date }
): Promise<string | null> {
  const phone = normalizeCustomerPhone(opts.phone);
  if (!phone) return null;
  const at = opts.at ?? new Date();
  const name = opts.name?.trim() || null;

  const existing = await tx.customer.findUnique({ where: { phone } });
  if (existing) {
    await tx.customer.update({
      where: { id: existing.id },
      data: {
        ordersCount: { increment: 1 },
        lastOrderAt: at,
        ...(existing.name || !name ? {} : { name })
      }
    });
    return existing.id;
  }

  const created = await tx.customer.create({
    data: {
      phone,
      name,
      ordersCount: 1,
      lastOrderAt: at
    }
  });
  return created.id;
}
