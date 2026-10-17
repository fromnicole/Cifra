// Centraliza los iconos de las categorías

const iconByCategory = {
  Alimentación: "shopping-cart",
  Transporte: "bus",
  Hogar: "house",
  Salud: "pill",
  Servicios: "receipt-text",
  Sueldo: "wallet",
  Otros: "circle-ellipsis",
};

export function getCategoryIcon(category) {
  return iconByCategory[category] || "circle-ellipsis";
}
