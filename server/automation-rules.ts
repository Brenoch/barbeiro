/**
 * Regra de conclusão automática, isolada do banco.
 *
 * Fica em arquivo próprio porque `automation.ts` importa `@/db`, e esse alias
 * só existe no build — o runner de testes do Node não resolve. Separando, a
 * regra que a barbearia pediu continua coberta por teste.
 */

export type StartedAppointment = {
  date: string;
  time: string;
  status: string;
};

/**
 * Passou do horário, considera atendido. Errar aqui dá baixa em horário que
 * ainda não aconteceu, então cancelado e concluído nunca são tocados.
 */
export function shouldFinalize(appointment: StartedAppointment, now: Date) {
  if (appointment.status !== "confirmed") return false;

  const startsAt = new Date(`${appointment.date}T${appointment.time}:00`).getTime();
  if (!Number.isFinite(startsAt)) return false;

  return startsAt <= now.getTime();
}
