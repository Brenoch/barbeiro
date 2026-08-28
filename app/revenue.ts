type RevenueAppointment = {
  serviceId: string;
  date: string;
  status: string;
};

type PricedService = {
  price: number;
};

export type RevenueSummary = {
  total: number;
  today: number;
  month: number;
};

export function calculateRevenue(
  appointments: RevenueAppointment[],
  services: Map<string, PricedService>,
  referenceDate: string,
): RevenueSummary {
  const monthPrefix = `${referenceDate.slice(0, 7)}-`;

  return appointments.reduce<RevenueSummary>((summary, appointment) => {
    if (appointment.status !== "completed") return summary;

    const price = services.get(appointment.serviceId)?.price ?? 0;
    summary.total += price;
    if (appointment.date === referenceDate) summary.today += price;
    if (appointment.date.startsWith(monthPrefix)) summary.month += price;
    return summary;
  }, { total: 0, today: 0, month: 0 });
}
