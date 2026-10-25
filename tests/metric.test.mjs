import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM simulation for Node.js test environment
class MockElement {
 constructor(tag) {
  this.tagName = tag.toUpperCase();
  this.attributes = {};
  this.children = [];
  this.listeners = {};
  this.className = '';
 }
 setAttribute(k, v) { this.attributes[k.toLowerCase()] = String(v); }
 getAttribute(k) { return this.attributes[k.toLowerCase()]; }
 addEventListener(event, fn) {
  this.listeners[event] = this.listeners[event] || [];
  this.listeners[event].push(fn);
 }
 dispatchEvent(event) {
  const fns = this.listeners[event.type] || [];
  for (const fn of fns) fn(event);
 }
 click() {
  let stopped = false;
  this.dispatchEvent({
   type: 'click',
   target: this,
   stopPropagation: () => { stopped = true; },
   preventDefault: () => {}
  });
  return !stopped;
 }
 append(...nodes) {
  for (const n of nodes) {
   if (n != null) this.children.push(n);
  }
 }
 querySelector(selector) {
  if (selector === '.metric-hint-btn') {
   return this.children.flatMap(c => c instanceof MockElement ? [c, ...c.querySelectorAll(selector)] : []).find(c => c.className.includes('metric-hint-btn'));
  }
  return null;
 }
 querySelectorAll(selector) {
  const result = [];
  for (const c of this.children) {
   if (c instanceof MockElement) {
    if (selector.startsWith('.') && c.className.includes(selector.slice(1))) result.push(c);
    result.push(...c.querySelectorAll(selector));
   }
  }
  return result;
 }
}

globalThis.Node = MockElement;
globalThis.document = {
 createElement(tag) { return new MockElement(tag); },
 createElementNS(ns, tag) { return new MockElement(tag); },
 createTextNode(text) { return text; }
};

const {metric, panel} = await import('../app/js/ui.mjs');

test('panel aceita tanto string de classe quanto objeto de atributos', () => {
 const p1 = panel(['Texto'], 'minha-classe');
 assert.equal(p1.className, 'panel minha-classe');

 let clicked = false;
 const p2 = panel(['Conteúdo'], {
  class: 'metric-custom',
  role: 'button',
  tabIndex: 0,
  onClick: () => { clicked = true; }
 });
 assert.equal(p2.className, 'panel metric-custom');
 assert.equal(p2.attributes.role, 'button');
 assert.equal(p2.attributes.tabindex, '0');
 p2.click();
 assert.equal(clicked, true);
});

test('metric card interativo responde a clique, teclado e expõe botão de ditar/editar', () => {
 let cardClicked = 0;
 const card = metric('Saldo disponível', 'R$ 1.500,00', 'Somatório', 'wallet', 'featured', '', () => {
  cardClicked++;
 });

 // Verifica classes do card
 assert.match(card.className, /panel/);
 assert.match(card.className, /metric/);
 assert.match(card.className, /metric-interactive/);
 assert.match(card.className, /featured/);
 assert.equal(card.attributes.role, 'button');
 assert.equal(card.attributes.tabindex, '0');
 assert.equal(card.attributes['aria-label'], 'Editar ou ditar Saldo disponível');

 // Clique no card diretamente
 card.click();
 assert.equal(cardClicked, 1);

 // Teclado Enter no card
 card.dispatchEvent({
  type: 'keydown',
  key: 'Enter',
  preventDefault: () => {}
 });
 assert.equal(cardClicked, 2);

 // Teclado Space no card
 card.dispatchEvent({
  type: 'keydown',
  key: ' ',
  preventDefault: () => {}
 });
 assert.equal(cardClicked, 3);

 // Botão Ditar / Editar
 const hintBtn = card.querySelector('.metric-hint-btn');
 assert.ok(hintBtn, 'Botão .metric-hint-btn deve existir dentro da métrica');
 assert.equal(hintBtn.tagName, 'BUTTON');
 assert.equal(hintBtn.attributes.type, 'button');
 assert.equal(hintBtn.attributes['aria-label'], 'Ditar ou editar Saldo disponível');

 // Clique no botão Ditar / Editar
 const propagated = hintBtn.click();
 assert.equal(cardClicked, 4);
 assert.equal(propagated, false, 'Deve chamar stopPropagation para não duplicar o clique');
});
