/**
 * FECHAS Y FORMATOS
 */

// Convierte una fecha a YYYY-MM-DD usando la fecha local.
export function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Convierte YYYY-MM-DD a DD/MM/AAAA.
export function formatDate(value) {
  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}

// Valida DD/MM/AAAA y devuelve YYYY-MM-DD; retorna null ante fechas inválidas.
export function parseChileanDate(value) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) return null;

  const [, day, month, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  const parsedDate = new Date(`${isoDate}T12:00:00`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== Number(year) ||
    parsedDate.getMonth() + 1 !== Number(month) ||
    parsedDate.getDate() !== Number(day)
  ) {
    return null;
  }

  return isoDate;
}

// Comprueba que una fecha ISO corresponda a una fecha real.
export function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T12:00:00`);

  return !Number.isNaN(date.getTime()) && toDateInput(date) === value;
}

/**
 * TEXTO Y PRESENTACIÓN
 */

// Escapa caracteres especiales antes de insertar texto en HTML.
export function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return String(value).replace(/[&<>"']/g, (character) => {
    return entities[character];
  });
}

// Devuelve el mes actual en español para el encabezado.
export function getCurrentMonthLabel() {
  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
  }).format(new Date());
}
