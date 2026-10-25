import {el,field,openDialog} from '../ui.mjs';
import {parseBrlCents} from '../currency.mjs';

export function accountForm(c, a = null) {
 openDialog({
  title: a ? 'Editar conta' : 'Nova conta',
  content: el('div', {}, [
   field('Nome da conta', 'name', 'text', a?.name || ''),
   field('Saldo inicial (R$)', 'initial', 'money', ((a?.initialCents || 0) / 100).toFixed(2), null, {minCents: -1e12}),
   field('Cor', 'color', 'color', a?.color || '#38bdf8'),
   el('p', {class: 'small muted'}, 'Conta manual. Não há conexão com o banco.')
  ]),
  onSubmit: d => {
   if (!d.name.trim()) throw Error('Informe um nome.');
   const n = parseBrlCents(d.initial, {minCents: -1e12});
   if (!Number.isSafeInteger(n) || Math.abs(n) > 1e12) throw Error('Saldo inválido.');
   c.dispatch('saveAccount', {
    id: a?.id,
    name: d.name.trim().slice(0, 80),
    initialCents: n,
    color: d.color
   });
  }
 });
}
