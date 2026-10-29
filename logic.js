/*
 * Pure logic for the logic-gate learning page (no DOM access).
 * Browser: attaches to window.LogicLab.  Node: module.exports.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LogicLab = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Switch-tree builders. NO = normally open (pressing closes it),
  // NC = normally closed (pressing opens it). Input 1 means "pressed".
  function sw(input, kind) {
    return { type: 'switch', input: input, kind: kind };
  }
  function series() {
    return { type: 'series', children: Array.prototype.slice.call(arguments) };
  }
  function parallel() {
    return { type: 'parallel', children: Array.prototype.slice.call(arguments) };
  }

  function bit(v) {
    return v ? 1 : 0;
  }

  var GATES = {
    WIRE: {
      inputs: 1,
      fn: function (a) { return bit(a); },
      network: sw('A', 'NO')
    },
    NOT: {
      inputs: 1,
      fn: function (a) { return bit(a) ? 0 : 1; },
      network: sw('A', 'NC')
    },
    AND: {
      inputs: 2,
      fn: function (a, b) { return bit(a) && bit(b) ? 1 : 0; },
      network: series(sw('A', 'NO'), sw('B', 'NO'))
    },
    OR: {
      inputs: 2,
      fn: function (a, b) { return bit(a) || bit(b) ? 1 : 0; },
      network: parallel(sw('A', 'NO'), sw('B', 'NO'))
    },
    XOR: {
      inputs: 2,
      fn: function (a, b) { return bit(a) !== bit(b) ? 1 : 0; }
      // no switch network: shown as a composition of gates instead
    },
    NAND: {
      inputs: 2,
      fn: function (a, b) { return bit(a) && bit(b) ? 0 : 1; },
      network: parallel(sw('A', 'NC'), sw('B', 'NC'))
    },
    NOR: {
      inputs: 2,
      fn: function (a, b) { return bit(a) || bit(b) ? 0 : 1; },
      network: series(sw('A', 'NC'), sw('B', 'NC'))
    }
  };

  var GATE_ORDER = ['WIRE', 'NOT', 'AND', 'OR', 'XOR', 'NAND', 'NOR'];

  // Does current flow through this switch tree? inputs = { A: 0|1, B: 0|1 }.
  function conducts(node, inputs) {
    var i;
    if (node.type === 'switch') {
      var pressed = bit(inputs[node.input]);
      return node.kind === 'NO' ? pressed : (pressed ? 0 : 1);
    }
    if (node.type === 'series') {
      for (i = 0; i < node.children.length; i++) {
        if (!conducts(node.children[i], inputs)) { return 0; }
      }
      return 1;
    }
    if (node.type === 'parallel') {
      for (i = 0; i < node.children.length; i++) {
        if (conducts(node.children[i], inputs)) { return 1; }
      }
      return 0;
    }
    throw new Error('unknown switch-tree node: ' + node.type);
  }

  // Annotated copy of the tree for drawing: `closed` = this node conducts,
  // `live` = this node is on the current path (the whole network conducts and
  // this node is closed). When the network does not conduct, nothing is live.
  function annotate(node, inputs, parentLive) {
    var up = parentLive === undefined ? 1 : parentLive;
    var closed = conducts(node, inputs);
    var live = up && closed ? 1 : 0;
    var out = { node: node, closed: closed, live: live };
    if (node.type === 'switch') {
      out.pressed = bit(inputs[node.input]);
    } else {
      out.children = node.children.map(function (c) {
        return annotate(c, inputs, live);
      });
    }
    return out;
  }

  // XOR = (A OR B) AND NOT(A AND B), built only from OR / AND / NOT.
  function XOR_COMPOSITION(a, b) {
    var or = GATES.OR.fn(a, b);
    var and = GATES.AND.fn(a, b);
    var notAnd = GATES.NOT.fn(and);
    var out = GATES.AND.fn(or, notAnd);
    return { or: or, and: and, notAnd: notAnd, out: out };
  }
  XOR_COMPOSITION.evaluate = XOR_COMPOSITION;

  // All input combinations of a gate, A as the high bit: 00, 01, 10, 11.
  function combos(name) {
    var g = GATES[name];
    if (g.inputs === 1) { return [{ A: 0 }, { A: 1 }]; }
    return [{ A: 0, B: 0 }, { A: 0, B: 1 }, { A: 1, B: 0 }, { A: 1, B: 1 }];
  }

  function evaluate(name, inputs) {
    return GATES[name].fn(bit(inputs.A), bit(inputs.B));
  }

  function truthTable(name) {
    return combos(name).map(function (c) {
      var row = { A: c.A, out: evaluate(name, c) };
      if (GATES[name].inputs === 2) { row.B = c.B; }
      return row;
    });
  }

  return {
    GATES: GATES,
    GATE_ORDER: GATE_ORDER,
    conducts: conducts,
    annotate: annotate,
    XOR_COMPOSITION: XOR_COMPOSITION,
    combos: combos,
    evaluate: evaluate,
    truthTable: truthTable
  };
});
