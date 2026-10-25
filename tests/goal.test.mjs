import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoalSpeech, matchGoalFromText, goalInsights} from '../app/js/goal-analytics.mjs';

test('parseGoalSpeech extrai valores falados para metas com precisão', () => {
  // Testes com expressões de fala cotidianas
  assert.equal(parseGoalSpeech('ganhei 10000'), 1000000);
  assert.equal(parseGoalSpeech('ganhei 10 mil'), 1000000);
  assert.equal(parseGoalSpeech('acabei de ganhar 10 mil reais'), 1000000);
  assert.equal(parseGoalSpeech('guardei 10 mil para o carro'), 1000000);
  assert.equal(parseGoalSpeech('guardei 10.000 no carro'), 1000000);
  assert.equal(parseGoalSpeech('reservei 500 reais'), 50000);
  assert.equal(parseGoalSpeech('10 mil'), 1000000);
  assert.equal(parseGoalSpeech('10000'), 1000000);
  assert.equal(parseGoalSpeech('10.000,00'), 1000000);
  assert.equal(parseGoalSpeech('dez mil reais'), 1000000);
  assert.equal(parseGoalSpeech('ganhei 10'), 1000);
});

test('matchGoalFromText identifica objetivo na fala ou usa o objetivo ativo', () => {
  const goals = [
    {id: 'g1', name: 'carro', targetCents: 7000000},
    {id: 'g2', name: 'apartamento', targetCents: 15000000}
  ];

  assert.equal(matchGoalFromText('guardei 10 mil pro carro', goals).id, 'g1');
  assert.equal(matchGoalFromText('ganhei 5 mil pro apartamento', goals).id, 'g2');
  assert.equal(matchGoalFromText('ganhei 10 mil', goals, goals[0]).id, 'g1');
});

test('aportes atualizam o saldo reservado, percentual e valor restante em tempo real', () => {
  const state = {
    goals: [
      {id: 'g1', name: 'carro', targetCents: 7000000, initialCents: 0, targetDate: '2027-10-01'}
    ],
    contributions: []
  };

  // Antes do aporte: 0 reservado de 70.000
  const before = goalInsights(state, 'g1', '2026-10-25');
  assert.equal(before.savedCents, 0);
  assert.equal(before.remainingCents, 7000000);
  assert.equal(before.percent, 0);

  // Aporte de R$ 10.000,00 adicionado
  state.contributions.push({
    id: 'c1',
    goalId: 'g1',
    date: '2026-10-25',
    amountCents: 1000000
  });

  // Depois do aporte: 10.000 reservado, restando 60.000, 14% concluído
  const after = goalInsights(state, 'g1', '2026-10-25');
  assert.equal(after.savedCents, 1000000);
  assert.equal(after.remainingCents, 6000000);
  assert.equal(after.percent, 14);
});
