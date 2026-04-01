export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export const formatCurrencyInput = (value: string | number) => {
  if (value === undefined || value === null) return '';
  
  // Se for número, converte para string com 2 casas decimais
  const stringValue = typeof value === 'number' ? value.toFixed(2) : String(value);
  
  // Remove tudo que não for número
  const numbers = stringValue.replace(/\D/g, '');
  
  if (!numbers) return '';
  
  // Converte para número e divide por 100 para ter os centavos
  const amount = Number(numbers) / 100;
  
  // Formata para o padrão BRL
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
};

export const parseCurrencyInput = (value: string) => {
  if (!value) return 0;
  // Remove tudo que não for número e divide por 100
  return Number(value.replace(/\D/g, '')) / 100;
};

export const formatDate = (date: any) => {
  if (!date) return '';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};
