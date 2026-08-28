export type AutoCompletableAppointment = {
  date: string;
  time: string;
  status: "confirmed" | "completed" | "cancelled" | "noshow";
  paid: boolean;
  paymentMethod?: "Pix" | "Dinheiro" | "Débito" | "Crédito";
  autoCompletedAt?: string;
};

function scheduledTime(date: string, time: string) {
  const timestamp = new Date(`${date}T${time}:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function finalizeStartedAppointments<T extends AutoCompletableAppointment>(
  appointments: T[],
  now = new Date(),
): T[] {
  let changed = false;
  const currentTime = now.getTime();

  const updated = appointments.map(appointment => {
    const startsAt = scheduledTime(appointment.date, appointment.time);
    if (appointment.status !== "confirmed" || startsAt === null || startsAt > currentTime) return appointment;

    changed = true;
    return {
      ...appointment,
      status: "completed" as const,
      paid: true,
      paymentMethod: appointment.paymentMethod ?? "Pix",
      autoCompletedAt: now.toISOString(),
    };
  });

  return changed ? updated : appointments;
}
