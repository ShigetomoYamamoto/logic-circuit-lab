/*
 * Exhaustive tests for logic.js. Run: node tests/logic.test.js
 * Expected tables are hardcoded here on purpose (not derived from logic.js).
 */
'use strict';

const path = require('path');
const L = require(path.join(__dirname, '..', 'logic.js'));

let passed = 0;
const failures = [];

function check(label, cond) {
  if (cond) {
    passed++;
  } else {
    failures.push(label);
  }
}

// One-input gates: [a, out]. Two-input gates: [a, b, out].
const EXPECTED = {
  WIRE: [[0, 0], [1, 1]],
  NOT: [[0, 1], [1, 0]],
  AND: [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]],
  OR: [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]],
  XOR: [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]],
  NAND: [[0, 0, 1], [0, 1, 1], [1, 0, 1], [1, 1, 0]],
  NOR: [[0, 0, 1], [0, 1, 0], [1, 0, 0], [1, 1, 0]]
};

// Expected switch networks (spec), written as plain strings.
const NETWORK = {
  WIRE: 'NO(A)',
  NOT: 'NC(A)',
  AND: 'series(NO(A),NO(B))',
  OR: 'parallel(NO(A),NO(B))',
  NAND: 'parallel(NC(A),NC(B))',
  NOR: 'series(NC(A),NC(B))'
};

function describeNode(n) {
  if (n.type === 'switch') { return n.kind + '(' + n.input + ')'; }
  return n.type + '(' + n.children.map(describeNode).join(',') + ')';
}

function inputsOf(row) {
  return row.length === 2 ? { A: row[0] } : { A: row[0], B: row[1] };
}

// Hardcoded XOR composition: [a, b, or, and, notAnd, out]
const XOR_INTERNAL = [
  [0, 0, 0, 0, 1, 0],
  [0, 1, 1, 0, 1, 1],
  [1, 0, 1, 0, 1, 1],
  [1, 1, 1, 1, 0, 0]
];

// --- gate set ---
check('gate names', JSON.stringify(Object.keys(L.GATES).sort()) === JSON.stringify(Object.keys(EXPECTED).sort()));
check('GATE_ORDER', JSON.stringify(L.GATE_ORDER) === JSON.stringify(['WIRE', 'NOT', 'AND', 'OR', 'XOR', 'NAND', 'NOR']));

// --- fn + network, exhaustively ---
Object.keys(EXPECTED).forEach(function (name) {
  const g = L.GATES[name];
  const rows = EXPECTED[name];
  const nIn = rows[0].length - 1;
  check(name + ' inputs count', g.inputs === nIn);
  check(name + ' combos() count', L.combos(name).length === rows.length);

  rows.forEach(function (row) {
    const out = row[row.length - 1];
    const tag = name + '(' + row.slice(0, -1).join(',') + ')';
    const res = nIn === 1 ? g.fn(row[0]) : g.fn(row[0], row[1]);
    check(tag + ' fn -> ' + out, res === out);
    check(tag + ' evaluate()', L.evaluate(name, inputsOf(row)) === out);
    if (NETWORK[name]) {
      check(tag + ' conducts -> ' + out, L.conducts(g.network, inputsOf(row)) === out);
      const ann = L.annotate(g.network, inputsOf(row));
      check(tag + ' annotate root closed', ann.closed === out);
      check(tag + ' annotate root live', ann.live === out);
    }
  });

  // truthTable() rows in order, same values
  const tt = L.truthTable(name);
  check(name + ' truthTable length', tt.length === rows.length);
  tt.forEach(function (r, i) {
    const exp = rows[i];
    const ok = r.A === exp[0] && r.out === exp[exp.length - 1] && (nIn === 1 || r.B === exp[1]);
    check(name + ' truthTable row ' + i, ok);
  });

  if (NETWORK[name]) {
    check(name + ' network structure', describeNode(g.network) === NETWORK[name]);
  } else {
    check(name + ' has no network', g.network === undefined);
  }
});

// --- annotate(): live path details ---
(function () {
  // AND with A=1,B=0: A is closed but nothing is live (no end-to-end path)
  const a = L.annotate(L.GATES.AND.network, { A: 1, B: 0 });
  check('AND 1,0 children closed', a.children[0].closed === 1 && a.children[1].closed === 0);
  check('AND 1,0 nothing live', a.live === 0 && a.children[0].live === 0 && a.children[1].live === 0);
  // OR with A=1,B=0: only the closed branch is live
  const o = L.annotate(L.GATES.OR.network, { A: 1, B: 0 });
  check('OR 1,0 only A branch live', o.live === 1 && o.children[0].live === 1 && o.children[1].live === 0);
  const o2 = L.annotate(L.GATES.OR.network, { A: 1, B: 1 });
  check('OR 1,1 both live', o2.children[0].live === 1 && o2.children[1].live === 1);
  // NAND with A=1,B=1: both NC switches open, nothing live
  const n = L.annotate(L.GATES.NAND.network, { A: 1, B: 1 });
  check('NAND 1,1 nothing live', n.live === 0 && n.children[0].closed === 0 && n.children[1].closed === 0);
  // NAND with A=1,B=0: only B (unpressed NC = closed) branch live
  const n2 = L.annotate(L.GATES.NAND.network, { A: 1, B: 0 });
  check('NAND 1,0 only B live', n2.children[0].live === 0 && n2.children[1].live === 1);
  // pressed flag
  check('pressed flag', n2.children[0].pressed === 1 && n2.children[1].pressed === 0);
})();

// --- XOR composition ---
XOR_INTERNAL.forEach(function (r) {
  const tag = 'XOR_COMPOSITION(' + r[0] + ',' + r[1] + ')';
  const x = L.XOR_COMPOSITION(r[0], r[1]);
  check(tag + ' or', x.or === r[2]);
  check(tag + ' and', x.and === r[3]);
  check(tag + ' notAnd', x.notAnd === r[4]);
  check(tag + ' out', x.out === r[5]);
  const e = L.XOR_COMPOSITION.evaluate(r[0], r[1]);
  check(tag + ' evaluate alias', e.out === r[5]);
});
EXPECTED.XOR.forEach(function (row) {
  check('XOR composition matches XOR table ' + row.slice(0, 2).join(','),
    L.XOR_COMPOSITION(row[0], row[1]).out === row[2]);
});

// --- summary ---
const total = passed + failures.length;
if (failures.length) {
  console.error('FAILED ' + failures.length + ' of ' + total + ' checks:');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('logic.test.js: ' + passed + ' / ' + total + ' checks passed');
