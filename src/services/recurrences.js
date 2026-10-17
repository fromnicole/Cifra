import { supabase } from "../lib/supabase.js";
import { toDateInput } from "../utils/formatters.js";

// RANGO DEL MES ACTUAL
function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  return {
    start: toDateInput(new Date(year, month, 1)),
    end: toDateInput(new Date(year, month + 1, 0)),
    year,
    month,
  };
}

// CÁLCULO DE VENCIMIENTOS
function getRecurrenceDueDate(recurrence, period) {
  const lastDay = new Date(period.year, period.month + 1, 0).getDate();

  const day = Math.min(Number(recurrence.due_day), lastDay);

  const dueDate = toDateInput(new Date(period.year, period.month, day));

  const activeSince = recurrence.active_since || recurrence.start_date;

  if (dueDate < recurrence.start_date) return null;
  if (dueDate < activeSince) return null;

  if (recurrence.end_date && dueDate > recurrence.end_date) {
    return null;
  }

  return dueDate;
}

// Construye la misma estructura para vencimientos históricos y actuales faltantes.
function createBillFromRecurrence(recurrence, userId, dueDate) {
  return {
    user_id: userId,
    recurrence_id: recurrence.id,
    name: recurrence.name,
    category: recurrence.category,
    amount: Number(recurrence.amount),
    due_date: dueDate,
    is_paid: false,
  };
}
// GENERACIÓN DE VENCIMIENTOS
export async function generateCurrentMonthBills(userId) {
  const currentPeriod = getCurrentMonthRange();

  // Obtiene las recurrencias activas que ya comenzaron
  // y que no han terminado antes del mes actual.
  const { data: recurrencesData, error: recurrenceError } = await supabase
    .from("bill_recurrences")
    .select(
      "id, user_id, name, category, due_day, start_date, active_since, end_date, amount_mode, amount, is_active",
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .lte("active_since", currentPeriod.end)
    .or(`end_date.is.null,end_date.gte.${currentPeriod.start}`);

  if (recurrenceError) {
    console.error("Error al cargar recurrencias:", recurrenceError);
    throw new Error("No se pudieron cargar las cuentas recurrentes.");
  }

  const activeRecurrences = recurrencesData || [];

  if (activeRecurrences.length === 0) return;

  const recurrenceIds = activeRecurrences.map((recurrence) => recurrence.id);

  // Obtiene los vencimientos existentes hasta el final del mes actual.
  const { data: existingBills, error: existingBillsError } = await supabase
    .from("bills")
    .select("id, recurrence_id, due_date, is_paid")
    .eq("user_id", userId)
    .in("recurrence_id", recurrenceIds)
    .lte("due_date", currentPeriod.end)
    .order("due_date", { ascending: false });

  if (existingBillsError) {
    console.error(
      "Error al consultar vencimientos existentes:",
      existingBillsError,
    );
    throw new Error("No se pudieron consultar los vencimientos existentes.");
  }

  // Registra las fechas existentes y agrupa los vencimientos por recurrencia.
  const existingDueDates = new Set();
  const existingBillsByRecurrence = new Map();

  for (const bill of existingBills || []) {
    existingDueDates.add(`${bill.recurrence_id}|${bill.due_date}`);

    const bills = existingBillsByRecurrence.get(bill.recurrence_id) || [];

    bills.push(bill);
    existingBillsByRecurrence.set(bill.recurrence_id, bills);
  }

  const newBills = [];

  for (const recurrence of activeRecurrences) {
    const activeSince = recurrence.active_since || recurrence.start_date;
    const activeDate = new Date(`${activeSince}T12:00:00`);

    const firstMonth = new Date(
      activeDate.getFullYear(),
      activeDate.getMonth(),
      1,
    );

    let periodDate = firstMonth;

    while (periodDate <= new Date(currentPeriod.year, currentPeriod.month, 1)) {
      const period = {
        year: periodDate.getFullYear(),
        month: periodDate.getMonth(),
      };

      const dueDate = getRecurrenceDueDate(recurrence, period);

      if (dueDate) {
        const key = `${recurrence.id}|${dueDate}`;
        const isCurrentMonth =
          period.year === currentPeriod.year &&
          period.month === currentPeriod.month;

        const existingForRecurrence =
          existingBillsByRecurrence.get(recurrence.id) || [];

        // Solo el mes actual puede actualizar un vencimiento existente.
        if (isCurrentMonth) {
          const existingThisMonth = existingForRecurrence.find((bill) => {
            return (
              bill.due_date >= currentPeriod.start &&
              bill.due_date <= currentPeriod.end
            );
          });

          if (existingThisMonth) {
            if (
              !existingThisMonth.is_paid &&
              existingThisMonth.due_date !== dueDate
            ) {
              // Evita chocar con otra fecha ya ocupada por esta recurrencia.
              const targetKey = `${recurrence.id}|${dueDate}`;

              if (existingDueDates.has(targetKey)) {
                throw new Error(
                  "No se pudo cambiar el vencimiento porque esa fecha ya existe para esta recurrencia.",
                );
              }

              const { error: updateError } = await supabase
                .from("bills")
                .update({ due_date: dueDate })
                .eq("id", existingThisMonth.id)
                .eq("user_id", userId)
                .eq("is_paid", false);

              if (updateError) {
                console.error(
                  "Error al actualizar el vencimiento:",
                  updateError,
                );
                throw new Error(
                  "No se pudo actualizar el vencimiento recurrente.",
                );
              }

              existingDueDates.delete(
                `${recurrence.id}|${existingThisMonth.due_date}`,
              );

              existingThisMonth.due_date = dueDate;
              existingDueDates.add(key);
            }
          } else if (!existingDueDates.has(key)) {
            newBills.push(
              createBillFromRecurrence(recurrence, userId, dueDate),
            );

            existingDueDates.add(key);
          }
        } else if (!existingDueDates.has(key)) {
          // Los meses anteriores solo generan vencimientos faltantes.
          newBills.push(createBillFromRecurrence(recurrence, userId, dueDate));

          existingDueDates.add(key);
        }
      }

      periodDate = new Date(
        periodDate.getFullYear(),
        periodDate.getMonth() + 1,
        1,
      );
    }
  }

  if (newBills.length === 0) return;

  // Inserta los vencimientos faltantes sin duplicarlos.
  const { error: insertError } = await supabase.from("bills").upsert(newBills, {
    onConflict: "recurrence_id,due_date",
    ignoreDuplicates: true,
  });

  if (insertError) {
    console.error("Error al generar vencimientos:", insertError);
    throw new Error("No se pudieron generar los vencimientos recurrentes.");
  }
}
