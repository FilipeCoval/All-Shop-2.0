export interface CashbackLotRecord {
  cashbackStatus?: unknown;
  cashbackValue?: unknown;
  cashbackPaidDate?: unknown;
}

export interface CashbackLotSaveInput extends CashbackLotRecord {
  cashbackPlatform?: unknown;
  cashbackExpectedDate?: unknown;
  grossPurchaseTotal?: unknown;
  supplierShippingCost?: unknown;
  customsCost?: unknown;
}

export class CashbackReceiptValidationError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'CashbackReceiptValidationError';
  }
}

const validCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const currentAdminDate = () => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const nonNegativeAmount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const cleanText = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Normaliza e valida os campos financeiros de cashback antes de guardar um
 * lote. O resultado contém sempre um estado explícito e não deixa valores ou
 * datas antigas sobreviverem quando o administrador escolhe "Sem cashback".
 */
export function prepareCashbackForLotSave(input: CashbackLotSaveInput, today = currentAdminDate()) {
  const rawStatus = cleanText(input.cashbackStatus, 20).toUpperCase();
  const status = rawStatus || 'NONE';
  if (!['NONE', 'PENDING', 'RECEIVED', 'REJECTED'].includes(status)) {
    throw new CashbackReceiptValidationError(400, 'O estado do cashback não é válido.');
  }

  if (status === 'NONE') {
    return {
      cashbackStatus: 'NONE' as const,
      cashbackValue: 0,
      cashbackPlatform: '',
      cashbackExpectedDate: '',
      cashbackPaidDate: '',
    };
  }

  const value = Number(input.cashbackValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new CashbackReceiptValidationError(400, 'Indique um valor de cashback superior a zero.');
  }

  const eligibleCost = nonNegativeAmount(input.grossPurchaseTotal)
    + nonNegativeAmount(input.supplierShippingCost)
    + nonNegativeAmount(input.customsCost);
  if (value - eligibleCost > 0.005) {
    throw new CashbackReceiptValidationError(400, 'O cashback não pode ser superior ao custo total elegível do lote.');
  }

  const expectedDate = cleanText(input.cashbackExpectedDate, 30);
  if (expectedDate && !validCalendarDate(expectedDate)) {
    throw new CashbackReceiptValidationError(400, 'A previsão de pagamento do cashback não é uma data válida.');
  }

  const requestedPaidDate = cleanText(input.cashbackPaidDate, 30);
  let paidDate = '';
  if (status === 'RECEIVED') {
    if (!validCalendarDate(requestedPaidDate)) {
      throw new CashbackReceiptValidationError(400, 'Indique uma data válida para a receção do cashback.');
    }
    if (requestedPaidDate > today) {
      throw new CashbackReceiptValidationError(400, 'A data de receção do cashback não pode estar no futuro.');
    }
    paidDate = requestedPaidDate;
  }

  return {
    cashbackStatus: status as 'PENDING' | 'RECEIVED' | 'REJECTED',
    cashbackValue: value,
    cashbackPlatform: cleanText(input.cashbackPlatform, 120),
    cashbackExpectedDate: expectedDate,
    // PENDING/REJECTED não podem conservar uma data de receção antiga.
    cashbackPaidDate: paidDate,
  };
}

export function prepareCashbackReceipt(lot: CashbackLotRecord, requestedPaidDate: unknown, today = currentAdminDate()) {
  const paidDate = String(requestedPaidDate ?? '').trim();
  if (!validCalendarDate(paidDate)) {
    throw new CashbackReceiptValidationError(400, 'Indique uma data válida para a receção do cashback.');
  }
  if (paidDate > today) {
    throw new CashbackReceiptValidationError(400, 'A data de receção do cashback não pode estar no futuro.');
  }

  const value = Number(lot.cashbackValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new CashbackReceiptValidationError(409, 'O cashback pendente não tem um valor válido.');
  }
  const storedStatus = String(lot.cashbackStatus ?? '').trim().toUpperCase();
  // Os lotes antigos guardavam apenas o valor; nesses registos, um valor
  // positivo sem estado representa cashback ainda por receber.
  const status = storedStatus || 'PENDING';
  if (status === 'RECEIVED') {
    return {
      alreadyReceived: true,
      paidDate: String(lot.cashbackPaidDate ?? '').trim() || paidDate,
      value,
    };
  }
  if (status !== 'PENDING') {
    throw new CashbackReceiptValidationError(409, 'Este cashback já não está pendente.');
  }

  return { alreadyReceived: false, paidDate, value };
}

export function cashbackReceiptUpdate<TUpdatedAt>(paidDate: string, updatedAt: TUpdatedAt, updatedBy: string) {
  return {
    cashbackStatus: 'RECEIVED' as const,
    cashbackPaidDate: paidDate,
    updatedAt,
    updatedBy,
  };
}
