// The match: phases, timers, score and money. Ember attacks, the Wardens
// defend. A round is a buy phase, a live phase, then a result; the match is
// first to five round wins, at most nine rounds. Money follows the familiar
// table — a kill pays, a win pays more than a loss, planting the charge pays
// the planter. This module keeps the numbers; main.js decides why a round ended.
export const MATCH = {
  firstTo: 5, maxRounds: 9,
  buySeconds: 15, roundSeconds: 100,
  fuseSeconds: 35, plantSeconds: 3, defuseSeconds: 5,
  startMoney: 800, killMoney: 300,
  winMoney: 3250, lossMoney: 1900, plantMoney: 300,
};

export function makeMatch() {
  const record = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    phaseTime: 0,
    round: 0,
    score: {
      ember: 0,
      warden: 0,
    },
    site: 'A',
    bombPlanted: false,
    bombSite: null,
    fuseLeft: 0,
    lastReason: '',
    winner: null,
  };

  const startMatch = () => {
    record.phase = 'buy';
    record.phaseTime = MATCH.buySeconds;
    record.round = 1;
    record.score = { ember: 0, warden: 0 };
    record.site = 'A';
    record.bombPlanted = false;
    record.bombSite = null;
    record.fuseLeft = 0;
    record.winner = null;
    record.lastReason = '';
  };

  const startRound = (number, pin) => {
    record.phase = 'buy';
    record.phaseTime = MATCH.buySeconds;
    record.round = number;
    record.site = pin;
    record.bombPlanted = false;
    record.bombSite = null;
    record.fuseLeft = 0;
  };

  const startLive = () => {
    record.phase = 'live';
    record.phaseTime = MATCH.roundSeconds;
  };

  const plant = (pin) => {
    record.bombPlanted = true;
    record.bombSite = pin;
    record.fuseLeft = MATCH.fuseSeconds;
  };

  const endRound = (side, why) => {
    record.phase = 'roundEnd';
    record.phaseTime = 4;
    record.winner = side;
    record.lastReason = why;
    record.score[side] += 1;
  };

  const matchOver = () => (
    record.score.ember >= MATCH.firstTo
    || record.score.warden >= MATCH.firstTo
    || record.round >= MATCH.maxRounds
  );

  // Ticks the phase clock. Returns 'buyDone' when the buy phase ends so the
  // live round can start, 'timeUp' when the round clock runs out, 'detonated'
  // when the planted fuse burns down, 'roundEndDone' when the result has been
  // shown long enough — or null when nothing changed.
  const tick = (span) => {
    if (record.phase !== 'buy' && record.phase !== 'live' && record.phase !== 'roundEnd') return null;
    record.phaseTime = record.phaseTime - span;
    if (record.bombPlanted && record.phase === 'live') {
      record.fuseLeft = record.fuseLeft - span;
      if (record.fuseLeft <= 0) return 'detonated';
    }
    if (record.phaseTime > 0) return null;
    const done = { buy: 'buyDone', live: 'timeUp', roundEnd: 'roundEndDone' };
    return done[record.phase];
  };

  return { state: record, startMatch, startRound, startLive, plant, endRound, matchOver, tick };
}
