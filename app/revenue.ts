type RevenueAppointment = {
  price: number;
  date: string;
  status: string;
};

export type RevenueSummary = {
  total: number;
  today: number;
  month: number;
};

/**
 * Soma o preço congelado em cada agendamento, não o preço atual do catálogo.
 * Um reajuste de hoje não pode mudar o faturamento de um mês que já fechou.
 */
export function calculateRevenue(
  appointments: RevenueAppointment[],
  referenceDate: string,
): RevenueSummary {
  const monthPrefix = `${referenceDate.slice(0, 7)}-`;

  return appointments.reduce<RevenueSummary>((summary, appointment) => {
    if (appointment.status !== "completed") return summary;

    summary.total += appointment.price;
    if (appointment.date === referenceDate) summary.today += appointment.price;
    if (appointment.date.startsWith(monthPrefix)) summary.month += appointment.price;
    return summary;
  }, { total: 0, today: 0, month: 0 });
}
