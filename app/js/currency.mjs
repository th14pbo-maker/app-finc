const clean = value => {
 let text=String(value??'').trim().replace(/^(-?)\s*R\$\s*/i,'$1').replace(/\s/g,'').replace(/[;:]/g,',');
 if(/^-?\d{1,3}(,\d{3})+\.\d{1,2}$/.test(text))return text.replaceAll(',','').replace('.',',');
 if(/^-?\d+\.\d{1,2}$/.test(text))return text.replace('.',',');
 return text;
};
const syntax = /^-?(?:(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{0,2})?|,\d{1,2})$/;
const group = digits => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function parseBrlCents(value, {minCents = 1, maxCents = 1e12} = {}) {
  const text = clean(value);
  if (!syntax.test(text)) throw Error('Informe um valor como 1.234,56, com vírgula para os centavos.');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').replaceAll('.', '').split(',');
  // Parse the two parts as integers: no floating-point multiplication of reais.
  const cents = (Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'))) * (negative ? -1 : 1);
  if (!Number.isSafeInteger(cents) || cents < minCents || cents > maxCents) {
    throw Error(`Informe um valor entre R$ ${formatBrlCents(minCents)} e R$ ${formatBrlCents(maxCents)}.`);
  }
  return cents;
}

export function formatBrlCents(cents) {
  if (!Number.isSafeInteger(cents)) throw Error('Valor monetário inválido.');
  const digits = String(Math.abs(cents)).padStart(3, '0');
  return (cents < 0 ? '-' : '') + group(digits.slice(0, -2)) + ',' + digits.slice(-2);
}

export function formatBrlDraft(value) {
  const text = clean(value);
  if (text === '' || text === '-') return text;
  if (text === ',' || text === '-,') return text.replace(',', '0,');
  if (!syntax.test(text)) return text;
  const negative = text.startsWith('-');
  const [whole, fraction] = text.replace('-', '').replaceAll('.', '').split(',');
  return (negative ? '-' : '') + group((whole || '0').replace(/^0+(?=\d)/, '')) + (fraction === undefined ? '' : ',' + fraction);
}
