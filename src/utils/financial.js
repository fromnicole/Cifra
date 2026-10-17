import { toDateInput } from "./formatters.js";

// CÁLCULO DE TOTALES FINANCIEROS

export function updateFinancialTotals(movements, financial, bills = []) {
  // Saldo acumulado de todos los movimientos.
  financial.balance = movements.reduce(
    (total, movement) =>
      total +
      (movement.type === "income"
        ? movement.amount
        : -movement.amount),
    0,
  );

  // Fecha actual y mes actual.
  const today = toDateInput(new Date());
  const currentMonth = today.slice(0, 7);

  const monthlyMovements = movements.filter((movement) =>
    movement.date.startsWith(currentMonth),
  );

  // Ingresos del mes actual.
  financial.income = monthlyMovements
    .filter((movement) => movement.type === "income")
    .reduce((total, movement) => total + movement.amount, 0);

  // Gastos del mes actual.
  financial.expenses = monthlyMovements
    .filter((movement) => movement.type === "expense")
    .reduce((total, movement) => total + movement.amount, 0);

  // Solo descuenta cuentas pendientes cuya fecha de vencimiento ya llegó.
  const pendingBillsTotal = bills
    .filter(
      (bill) =>
        !bill.is_paid &&
        bill.due_date &&
        bill.due_date <= today,
    )
    .reduce((total, bill) => total + Number(bill.amount), 0);

  // Dinero disponible después de descontar cuentas vencidas.
  financial.availableAfterBills =
    financial.balance - pendingBillsTotal;
}