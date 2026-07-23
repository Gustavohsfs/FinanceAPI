const SAO_PAULO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function calendarParts(iso: string): { year: number; monthIndex: number; day: number } {
  const parts = Object.fromEntries(
    SAO_PAULO.formatToParts(new Date(iso))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  if (!parts.year || !parts.month || !parts.day) throw new RangeError('invalid ISO date');
  return { year: parts.year, monthIndex: parts.month - 1, day: parts.day };
}

function cappedDay(year: number, monthIndex: number, requestedDay: number): number {
  return Math.min(requestedDay, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}

export function calculateSettlementDate(
  occurredAt: string,
  closingDay: number,
  dueDay: number,
): string {
  if (![closingDay, dueDay].every((day) => Number.isInteger(day) && day >= 1 && day <= 31)) {
    throw new RangeError('closingDay and dueDay must be between 1 and 31');
  }
  const occurred = calendarParts(occurredAt);
  let statementMonth = occurred.monthIndex + (occurred.day > closingDay ? 1 : 0);
  let year = occurred.year + Math.floor(statementMonth / 12);
  statementMonth %= 12;

  if (dueDay <= closingDay) {
    statementMonth += 1;
    if (statementMonth === 12) {
      statementMonth = 0;
      year += 1;
    }
  }

  const day = cappedDay(year, statementMonth, dueDay);
  return new Date(Date.UTC(year, statementMonth, day, 3)).toISOString();
}

export function addMonthsIso(iso: string, count: number): string {
  const date = new Date(iso);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + count);
  date.setUTCDate(
    Math.min(
      originalDay,
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(),
    ),
  );
  return date.toISOString();
}
