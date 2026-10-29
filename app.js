/* UI for the logic-gate learning page. All logic comes from logic.js (window.LogicLab). */
(function () {
  'use strict';

  var L = window.LogicLab;
  var main = document.getElementById('main');
  if (!L) {
    main.textContent = '読み込みに失敗しました。ページを再読み込みしてください。';
    return;
  }

  // ---------- text content ----------
  var INFO = {
    WIRE: {
      read: 'そのまま',
      rule: '入力をそのまま出力します。1なら1、0なら0。',
      wiring: '「押すとつながるスイッチ」が1つだけなので、押したときだけ電気が通ります。'
    },
    NOT: {
      read: 'ノット・否定',
      rule: '入力を反対にします。1なら0、0なら1。',
      wiring: '「押すと切れるスイッチ」が1つだけなので、押していないときは電気が通り、押すと電気が止まります。'
    },
    AND: {
      read: 'アンド・論理積',
      rule: 'AとBが両方1のときだけ1になります。',
      wiring: '2つのスイッチが一列（直列）につながっているので、両方押したときだけ電気が通ります。'
    },
    OR: {
      read: 'オア・論理和',
      rule: 'AとBの少なくとも一方が1なら1になります。',
      wiring: '2つのスイッチが並んで（並列に）つながっているので、どちらか一方を押せば電気が通ります。'
    },
    XOR: {
      read: 'エックスオア・排他的論理和',
      rule: 'AとBのどちらか片方だけが1のとき1になります。両方1、または両方0なら0です。'
    },
    NAND: {
      read: 'ナンド',
      rule: 'ANDの反対です。AとBが両方1のときだけ0になります。',
      wiring: '「押すと切れるスイッチ」が2つ並んで（並列に）つながっているので、両方押したときだけ電気が止まります。どちらか一方でも押していなければ電気が通ります。'
    },
    NOR: {
      read: 'ノア',
      rule: 'ORの反対です。AとBが両方0のときだけ1になります。',
      wiring: '「押すと切れるスイッチ」が2つ一列（直列）につながっているので、どちらか一方でも押すと電気が止まります。両方押していないときだけ電気が通ります。'
    }
  };
  var KIND_TEXT = {
    NO: '押すとつながる',
    NC: '押すと切れる'
  };
  var KIND_HELP = {
    NO: '「押すとつながるスイッチ」は、押すと電気が通り、押していないと止まります。',
    NC: '「押すと切れるスイッチ」は、押していないと電気が通り、押すと止まります。'
  };
  var TRANSISTOR = '実際のコンピュータの中では、このスイッチの役目をトランジスタ（電気の信号で開け閉めできる、とても小さなスイッチ）が担っています。';
  var XOR_CAPTION = 'XORは、ORとANDとNOTを組み合わせて作れます。';
  var XOR_FORMULA = 'XOR ＝ （A OR B）AND NOT（A AND B）';

  var PAGES = [{ id: 'intro', label: 'はじめに', kind: 'intro' }]
    .concat(L.GATE_ORDER.map(function (g) { return { id: g, label: g, kind: 'gate', gate: g }; }))
    .concat([{ id: 'summary', label: 'まとめ', kind: 'summary' }]);

  // ---------- per-page state (kept in memory while the page is open) ----------
  var states = {};
  function getState(key) {
    if (!states[key]) {
      states[key] = { A: 0, B: 0, inside: false, quiz: false, answered: false, correct: false, last: null, right: 0, total: 0 };
    }
    return states[key];
  }

  // ---------- small SVG helpers ----------
  var SW_W = 116;      // switch cell width
  var SW_H = 126;      // switch cell height (room for the three label lines)

  function f(n) { return Math.round(n * 10) / 10; }
  function vcls(v) { return v === 1 ? 'on' : (v === 0 ? 'off' : 'unk'); }
  function pts(a) { return a.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' '); }

  function wire(points, v, id) {
    return '<polyline class="wire ' + vcls(v) + '"' + (id ? ' data-wire="' + id + '"' : '') +
      ' data-value="' + v + '" points="' + pts(points) + '"/>';
  }
  function dot(x, y, v) {
    return '<circle class="junction ' + vcls(v) + '" cx="' + f(x) + '" cy="' + f(y) + '" r="3.5"/>';
  }
  function badge(id, x, y, v) {
    return '<g class="badge ' + vcls(v) + '" data-badge="' + id + '" data-value="' + v + '">' +
      '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="9"/>' +
      '<text x="' + f(x) + '" y="' + f(y + 4.5) + '" text-anchor="middle">' + v + '</text></g>';
  }
  function label(x, y, str, cls, anchor) {
    return '<text class="' + cls + '" x="' + f(x) + '" y="' + f(y) + '" text-anchor="' + (anchor || 'middle') + '">' + str + '</text>';
  }

  // LED + output value (text next to it, so colour is never the only cue)
  function led(cx, cy, r, v, textY) {
    var shown = v === '?' ? '？' : String(v);
    var s = '<g class="led ' + vcls(v) + '" data-role="led" data-output="' + v + '">';
    if (v === 1) {
      s += '<circle class="led-glow g3" cx="' + cx + '" cy="' + cy + '" r="' + f(r * 2.1) + '"/>' +
        '<circle class="led-glow g2" cx="' + cx + '" cy="' + cy + '" r="' + f(r * 1.6) + '"/>' +
        '<circle class="led-glow g1" cx="' + cx + '" cy="' + cy + '" r="' + f(r * 1.25) + '"/>';
    }
    s += '<circle class="led-body" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>';
    if (v === 1) {
      s += '<circle class="led-shine" cx="' + f(cx - r * 0.3) + '" cy="' + f(cy - r * 0.3) + '" r="' + f(r * 0.28) + '"/>';
    }
    s += '<text class="led-text" x="' + cx + '" y="' + textY + '" text-anchor="middle">' +
      '<tspan class="led-label">出力</tspan><tspan class="led-value" dx="6">' + shown + '</tspan></text></g>';
    return s;
  }

  // ANSI-style gate symbol. Returns the SVG, input pin positions and output x.
  function gateShape(type, x, cy, w, h, labelText) {
    var t = cy - h / 2, b = cy + h / 2, q = h * 0.25;
    var d = '', extra = '', bubble = false, single = false, pinX = x;
    switch (type) {
      case 'AND':
      case 'NAND':
        d = 'M' + f(x) + ',' + f(t) + ' H' + f(x + w / 2) + ' A' + f(w / 2) + ',' + f(h / 2) + ' 0 0 1 ' +
          f(x + w / 2) + ',' + f(b) + ' H' + f(x) + ' Z';
        bubble = type === 'NAND';
        break;
      case 'OR':
      case 'NOR':
      case 'XOR':
        d = 'M' + f(x) + ',' + f(t) + ' C' + f(x + 0.38 * w) + ',' + f(t) + ' ' + f(x + 0.75 * w) + ',' + f(t + 0.12 * h) +
          ' ' + f(x + w) + ',' + f(cy) + ' C' + f(x + 0.75 * w) + ',' + f(b - 0.12 * h) + ' ' + f(x + 0.38 * w) + ',' + f(b) +
          ' ' + f(x) + ',' + f(b) + ' Q' + f(x + 0.28 * w) + ',' + f(cy) + ' ' + f(x) + ',' + f(t) + ' Z';
        pinX = x + 0.105 * w;
        if (type === 'XOR') {
          var xd = x - 0.12 * w;
          extra = '<path class="gate-body gate-extra" d="M' + f(xd) + ',' + f(t) + ' Q' + f(xd + 0.28 * w) + ',' + f(cy) +
            ' ' + f(xd) + ',' + f(b) + '"/>';
          pinX = xd + 0.105 * w;
        }
        bubble = type === 'NOR';
        break;
      case 'NOT':
      case 'WIRE':
        d = 'M' + f(x) + ',' + f(t) + ' L' + f(x + w) + ',' + f(cy) + ' L' + f(x) + ',' + f(b) + ' Z';
        single = true;
        bubble = type === 'NOT';
        break;
      default:
        throw new Error('unknown gate shape ' + type);
    }
    var s = '<g class="gate-shape" data-shape="' + type + '"><path class="gate-body" d="' + d + '"/>' + extra;
    if (bubble) { s += '<circle class="gate-body" cx="' + f(x + w + 5) + '" cy="' + f(cy) + '" r="5"/>'; }
    s += '</g>';
    if (labelText) { s += label(x + w / 2, b + 17, labelText, 'gate-name'); }
    return {
      svg: s,
      pins: single ? [{ x: x, y: cy }] : [{ x: pinX, y: cy - q }, { x: pinX, y: cy + q }],
      outX: x + w + (bubble ? 10 : 0)
    };
  }

  function toggleHtml(id, v, x, y, W, H, locked, compact) {
    return '<button type="button" class="toggle ' + (v ? 'is-on' : 'is-off') + (compact ? ' compact' : '') + '" data-input="' + id + '" data-key="in-' + id +
      '" data-value="' + v + '" aria-pressed="' + (v ? 'true' : 'false') + '" aria-label="入力' + id + '"' +
      (locked ? ' disabled' : '') +
      ' style="left:' + f(x / W * 100) + '%;top:' + f(y / H * 100) + '%">' +
      '<span class="t-name" aria-hidden="true">' + id + '</span>' +
      '<span class="t-row" aria-hidden="true"><span class="t-val">' + v + '</span><span class="t-state">' + (v ? 'ON' : 'OFF') + '</span></span>' +
      '</button>';
  }

  function boardHtml(W, H, content, toggles, alt) {
    return '<div class="board-inner">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + alt + '" focusable="false">' + content + '</svg>' +
      toggles + '</div>';
  }

  function altText(name, st, shown, inside) {
    var s = name + 'の図' + (inside ? '（中を開いた状態）' : '') + '。入力A=' + st.A;
    if (L.GATES[name].inputs === 2) { s += '、入力B=' + st.B; }
    return s + '、' + (shown === '?' ? '出力は非表示' : '出力=' + shown) + '。';
  }

  // ---------- gate view ----------
  function gateBoard(name, st, shown) {
    var two = L.GATES[name].inputs === 2;
    var W = 360, H = two ? 224 : 176, cy = H / 2;
    var w = two ? 84 : 68, h = two ? 84 : 68, x0 = two ? 130 : 138;
    var sh = gateShape(name, x0, cy, w, h, name);
    var ledX = 300, r = 24, bx = 106;
    var ya = two ? cy - 52 : cy, yb = cy + 52;
    var s = '';
    if (two) {
      s += wire([[46, ya], [bx, ya], [bx, sh.pins[0].y], [sh.pins[0].x, sh.pins[0].y]], st.A, 'A');
      s += wire([[46, yb], [bx, yb], [bx, sh.pins[1].y], [sh.pins[1].x, sh.pins[1].y]], st.B, 'B');
    } else {
      s += wire([[46, cy], [sh.pins[0].x, cy]], st.A, 'A');
    }
    s += sh.svg;
    s += wire([[sh.outX, cy], [ledX - r, cy]], shown, 'out');
    s += led(ledX, cy, r, shown, cy + 54);
    var tg = toggleHtml('A', st.A, 46, ya, W, H, st.quiz);
    if (two) { tg += toggleHtml('B', st.B, 46, yb, W, H, st.quiz); }
    return boardHtml(W, H, s, tg, altText(name, st, shown, false));
  }

  // ---------- inside view: XOR as a composition of gates ----------
  function xorInsideBoard(st) {
    var W = 360, H = 232;
    var x = L.XOR_COMPOSITION(st.A, st.B);
    var ya = 62;
    var orG = gateShape('OR', 122, 62, 50, 44, 'OR');
    var andG = gateShape('AND', 122, 168, 50, 44, 'AND');
    var notG = gateShape('NOT', 202, 168, 26, 30, 'NOT');
    var finG = gateShape('AND', 256, 115, 48, 44, 'AND');
    var yb = andG.pins[1].y;
    var ledX = 336, ledY = 115;
    var aTrunk = 104, bTrunk = 84;
    var orVx = 190, notVx = 248;
    var s = '';
    // input A: main line + branches to OR (pin 1) and AND (pin 1)
    s += wire([[40, ya], [aTrunk, ya]], st.A, 'A');
    s += wire([[aTrunk, ya], [aTrunk, orG.pins[0].y], [orG.pins[0].x, orG.pins[0].y]], st.A, 'A-or');
    s += wire([[aTrunk, ya], [aTrunk, andG.pins[0].y], [andG.pins[0].x, andG.pins[0].y]], st.A, 'A-and');
    // input B: main line to AND (pin 2) + branch up to OR (pin 2)
    s += wire([[40, yb], [andG.pins[1].x, andG.pins[1].y]], st.B, 'B-and');
    s += wire([[bTrunk, yb], [bTrunk, orG.pins[1].y], [orG.pins[1].x, orG.pins[1].y]], st.B, 'B-or');
    s += dot(aTrunk, ya, st.A) + dot(bTrunk, yb, st.B);
    // internal wires
    s += wire([[orG.outX, 62], [orVx, 62], [orVx, finG.pins[0].y], [finG.pins[0].x, finG.pins[0].y]], x.or, 'or');
    s += wire([[andG.outX, 168], [notG.pins[0].x, 168]], x.and, 'and');
    s += wire([[notG.outX, 168], [notVx, 168], [notVx, finG.pins[1].y], [finG.pins[1].x, finG.pins[1].y]], x.notAnd, 'notAnd');
    s += wire([[finG.outX, 115], [ledX - 12, 115]], x.out, 'out');
    s += orG.svg + andG.svg + notG.svg + finG.svg;
    s += badge('or', orVx, 84, x.or);
    s += badge('and', (andG.outX + notG.pins[0].x) / 2, 168, x.and);
    s += badge('notAnd', notVx, 148, x.notAnd);
    s += led(ledX, ledY, 12, x.out, ledY + 34);
    var tg = toggleHtml('A', st.A, 38, ya, W, H, st.quiz, true) + toggleHtml('B', st.B, 38, yb, W, H, st.quiz, true);
    return boardHtml(W, H, s, tg, altText('XOR', st, x.out, true) +
      '内部の値は、OR=' + x.or + '、AND=' + x.and + '、NOT(AND)=' + x.notAnd + '。');
  }

  // ---------- inside view: switch circuits ----------
  // Layout of one switch tree. Each node returns { w, h, draw(x, cy) }.
  function netLayout(a) {
    if (a.node.type === 'switch') {
      return { w: SW_W, h: SW_H, draw: function (x, cy) { return drawSwitch(a, x, cy); } };
    }
    var kids = a.children.map(netLayout), i;
    if (a.node.type === 'series') {
      var sw = 0, sh = 0;
      for (i = 0; i < kids.length; i++) { sw += kids[i].w; sh = Math.max(sh, kids[i].h); }
      return {
        w: sw, h: sh,
        draw: function (x, cy) {
          var out = '', cx = x;
          kids.forEach(function (k) { out += k.draw(cx, cy); cx += k.w; });
          return out;
        }
      };
    }
    var pad = 16, inner = 0, ph = 0;
    for (i = 0; i < kids.length; i++) { inner = Math.max(inner, kids[i].w); ph += kids[i].h; }
    return {
      w: inner + pad * 2, h: ph,
      draw: function (x, cy) {
        var busL = x + pad, busR = x + pad + inner, y = cy - ph / 2, out = '';
        out += wire([[x, cy], [busL, cy]], a.live, null) + wire([[busR, cy], [x + inner + pad * 2, cy]], a.live, null);
        out += dot(busL, cy, a.live) + dot(busR, cy, a.live);
        kids.forEach(function (k, idx) {
          var yc = y + k.h / 2, ch = a.children[idx];
          y += k.h;
          out += wire([[busL, cy], [busL, yc]], ch.live, null) + wire([[busR, yc], [busR, cy]], ch.live, null);
          out += k.draw(busL, yc);
        });
        return out;
      }
    };
  }

  function drawSwitch(a, x, cy) {
    var n = a.node, wc = a.live ? 'on' : 'off';
    var lx = x + 16, rx = x + 100, xc = x + SW_W / 2;
    var pressed = a.pressed, closed = a.closed;
    var s = '<g class="sw" data-switch="' + n.input + '" data-kind="' + n.kind + '" data-pressed="' + pressed +
      '" data-closed="' + closed + '" data-live="' + a.live + '">';
    s += '<polyline class="wire ' + wc + '" points="' + pts([[x, cy], [lx, cy]]) + '"/>';
    s += '<polyline class="wire ' + wc + '" points="' + pts([[rx, cy], [x + SW_W, cy]]) + '"/>';
    if (closed) {
      // lever bridges both contacts
      s += '<polyline class="wire ' + wc + ' lever" points="' + pts([[lx, cy], [rx, cy]]) + '"/>';
    } else {
      // lever lifted away: clear gap to the right contact
      s += '<polyline class="wire off lever" points="' + pts([[lx, cy], [x + 88, cy - 34]]) + '"/>';
    }
    // plunger: NO is pushed from above, NC from below
    var cap;
    if (n.kind === 'NO') {
      cap = pressed ? cy - 19 : cy - 40;
      s += '<path class="plunger" d="M' + f(xc) + ',' + f(cap) + ' V' + f(cap + 14) + ' M' + f(xc - 11) + ',' + f(cap) + ' H' + f(xc + 11) + '"/>';
    } else {
      cap = pressed ? cy - 3 : cy + 17;
      s += '<path class="plunger" d="M' + f(xc) + ',' + f(cap - 14) + ' V' + f(cap) + ' M' + f(xc - 11) + ',' + f(cap) + ' H' + f(xc + 11) + '"/>';
    }
    s += '<circle class="terminal ' + wc + '" cx="' + lx + '" cy="' + cy + '" r="5.5"/>' +
      '<circle class="terminal ' + wc + '" cx="' + rx + '" cy="' + cy + '" r="5.5"/>';
    s += '<text class="sw-label" x="' + f(xc) + '" y="' + f(cy + 40) + '" text-anchor="middle"><tspan class="sw-name">' + n.input +
      '</tspan> ' + (pressed ? '押している' : '押していない') + '</text>';
    s += label(xc, cy + 56, KIND_TEXT[n.kind], 'sw-kind');
    s += '<text class="sw-state ' + (closed ? 'closed' : 'open') + '" data-role="sw-state" x="' + f(xc) + '" y="' + f(cy + 76) +
      '" text-anchor="middle">' + (closed ? '→ つながっている' : '→ 切れている') + '</text>';
    return s + '</g>';
  }

  function terminalNode(cx, cy, sym, caption, anchor, live) {
    return '<g class="term ' + (live ? 'on' : 'off') + '"><circle cx="' + cx + '" cy="' + cy + '" r="12"/>' +
      label(cx, cy + 5, sym, 'term-sym') +
      label(anchor === 'end' ? cx + 12 : cx - 12, cy - 20, caption, 'pill-text', anchor) + '</g>';
  }

  function switchInsideBoard(name, st, out) {
    var g = L.GATES[name], two = g.inputs === 2;
    var ann = L.annotate(g.network, { A: st.A, B: st.B });
    var net = netLayout(ann);
    var parallel = g.network.type === 'parallel';
    var W = 360, H = parallel ? 326 : 206, cy = parallel ? 178 : 122;
    var area0 = 28, area1 = 276;
    var xNet = area0 + (area1 - area0 - net.w) / 2;
    var px = 14, ledX = 302, r = 14, gx = 346;
    var live = ann.live;
    var s = '';
    // power(+) -> network -> LED -> GND(-)
    s += wire([[px + 12, cy], [xNet, cy]], live, 'power');
    s += wire([[xNet + net.w, cy], [ledX - r, cy]], live, 'to-led');
    s += wire([[ledX + r, cy], [gx - 12, cy]], live, 'to-gnd');
    s += net.draw(xNet, cy);
    s += terminalNode(px, cy, '＋', '電源(＋)', 'start', live);
    s += terminalNode(gx, cy, '−', 'GND(−)', 'end', live);
    s += led(ledX, cy, r, out, cy + 44);
    // toggles sit above the switches they press
    var swX = xNet + (parallel ? 16 : 0) + SW_W / 2;
    var tg = '';
    if (two) {
      var ax = parallel ? swX - 52 : swX, bx = parallel ? swX + 52 : swX + SW_W;
      tg += toggleHtml('A', st.A, ax, 34, W, H, st.quiz) + toggleHtml('B', st.B, bx, 34, W, H, st.quiz);
    } else {
      tg += toggleHtml('A', st.A, swX, 34, W, H, st.quiz);
    }
    return boardHtml(W, H, s, tg, altText(name, st, out, true) +
      '電気は' + (live ? '通っています' : '通っていません') + '。');
  }

  function insideBoard(name, st, out) {
    return name === 'XOR' ? xorInsideBoard(st) : switchInsideBoard(name, st, out);
  }

  function noteHtml(name) {
    var info = INFO[name], g = L.GATES[name];
    if (name === 'XOR') {
      return '<p class="note-caption">' + XOR_CAPTION + '</p><p class="note-formula">' + XOR_FORMULA + '</p>' +
        '<p class="note-small">上の図では、線が明るい（流れている）ところは 1、灰色のところは 0 です。丸の中の数字は、その線の値です。</p>';
    }
    var kinds = {};
    (function walk(n) {
      if (n.type === 'switch') { kinds[n.kind] = 1; } else { n.children.forEach(walk); }
    })(g.network);
    var help = Object.keys(kinds).map(function (k) { return '<li>' + KIND_HELP[k] + '</li>'; }).join('');
    return '<p class="note-small">入力が 1 のとき、そのスイッチは押されています（0 のときは押されていません）。電気が電源(＋)からLEDを通ってGND(−)まで届くと、LEDが光ります。</p>' +
      '<ul class="note-kinds">' + help + '</ul>' +
      '<p class="note-wiring">' + info.wiring + '</p>' +
      '<p class="note-transistor">' + TRANSISTOR + '</p>';
  }

  // ---------- truth table ----------
  function tableHtml(name, st, highlight) {
    var two = L.GATES[name].inputs === 2;
    var h = '<table class="truth" data-role="truth"><caption>' + name + ' の真理値表</caption><thead><tr><th scope="col">A</th>' +
      (two ? '<th scope="col">B</th>' : '') + '<th scope="col">出力</th></tr></thead><tbody>';
    L.truthTable(name).forEach(function (r) {
      var act = highlight && r.A === st.A && (!two || r.B === st.B);
      h += '<tr data-active="' + (act ? 'true' : 'false') + '"' + (act ? ' aria-current="true"' : '') + '><td>' + r.A + '</td>' +
        (two ? '<td>' + r.B + '</td>' : '') + '<td class="out">' + r.out + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  // ---------- gate component ----------
  function mountGate(root, name, stKey, full) {
    var g = L.GATES[name], two = g.inputs === 2, st = getState(stKey);
    var pendingFocus = null;

    root.setAttribute('data-gate', name);
    root.innerHTML =
      (full
        ? '<div class="modes">' +
          '<button type="button" class="mode" data-action="inside" data-key="mode-inside" aria-pressed="false">中を開く</button>' +
          '<button type="button" class="mode" data-action="quiz" data-key="mode-quiz" aria-pressed="false">予想クイズ</button>' +
          '</div>'
        : '') +
      '<div class="board" data-role="board"></div>' +
      (full
        ? '<div class="quiz" data-role="quiz" hidden>' +
          '<h3 class="quiz-title">予想クイズ</h3>' +
          '<p class="quiz-q" data-role="prompt">この入力のとき、LEDは光る？ 出力を予想しよう。</p>' +
          '<div class="answers" data-role="answers">' +
          '<button type="button" class="answer" data-action="answer" data-value="1" data-key="ans-1">光る（1）</button>' +
          '<button type="button" class="answer" data-action="answer" data-value="0" data-key="ans-0">光らない（0）</button>' +
          '</div>' +
          '<p class="feedback" data-role="feedback" role="status"></p>' +
          '<button type="button" class="next-q" data-action="next" data-key="quiz-next" data-role="next-q" hidden>次の問題</button>' +
          '<p class="score" data-role="score"></p>' +
          '</div>' +
          '<div class="inside-note" data-role="note" hidden></div>' +
          '<div class="table-wrap" data-role="table"></div>'
        : '');

    var el = {
      board: root.querySelector('[data-role="board"]'),
      insideBtn: root.querySelector('[data-action="inside"]'),
      quizBtn: root.querySelector('[data-action="quiz"]'),
      quiz: root.querySelector('[data-role="quiz"]'),
      prompt: root.querySelector('[data-role="prompt"]'),
      answers: root.querySelector('[data-role="answers"]'),
      feedback: root.querySelector('[data-role="feedback"]'),
      next: root.querySelector('[data-role="next-q"]'),
      score: root.querySelector('[data-role="score"]'),
      note: root.querySelector('[data-role="note"]'),
      table: root.querySelector('[data-role="table"]')
    };

    function comboKey(c) { return c.A + '-' + (two ? c.B : 0); }

    function pickQuestion() {
      var pool = L.combos(name).filter(function (c) { return comboKey(c) !== st.last; });
      var c = pool[Math.floor(Math.random() * pool.length)];
      st.A = c.A;
      st.B = two ? c.B : 0;
      st.last = comboKey(c);
      st.answered = false;
    }

    function update() {
      var out = L.evaluate(name, st);
      var asking = full && st.quiz && !st.answered;
      var shown = asking ? '?' : out;
      var inside = full && st.inside && !asking;

      root.setAttribute('data-view', inside ? 'inside' : 'gate');
      root.setAttribute('data-quiz', !st.quiz ? 'off' : (asking ? 'asking' : 'answered'));
      el.board.innerHTML = inside ? insideBoard(name, st, out) : gateBoard(name, st, shown);

      if (full) {
        el.insideBtn.setAttribute('aria-pressed', inside ? 'true' : 'false');
        el.insideBtn.disabled = asking;
        el.quizBtn.setAttribute('aria-pressed', st.quiz ? 'true' : 'false');
        el.quiz.hidden = !st.quiz;
        el.prompt.hidden = st.answered;
        el.answers.hidden = !asking;
        el.next.hidden = !(st.quiz && st.answered);
        el.score.textContent = '正解数 ' + st.right + ' / 回答数 ' + st.total;
        el.score.setAttribute('data-right', st.right);
        el.score.setAttribute('data-total', st.total);
        if (st.quiz && st.answered) {
          var word = '出力は ' + out + '（' + (out ? '光る' : '光らない') + '）です。';
          el.feedback.textContent = st.correct ? '正解！ ' + word : 'ざんねん。正しい' + word;
          el.feedback.setAttribute('data-result', st.correct ? 'correct' : 'wrong');
        } else {
          el.feedback.textContent = '';
          el.feedback.removeAttribute('data-result');
        }
        el.note.hidden = !inside;
        if (inside) { el.note.innerHTML = noteHtml(name); }
        el.table.innerHTML = tableHtml(name, st, !asking);
      }

      if (pendingFocus) {
        var t = root.querySelector('[data-key="' + pendingFocus + '"]');
        if (t && !t.disabled && !t.hidden) { t.focus({ preventScroll: true }); }
        pendingFocus = null;
      }
    }

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn || btn.disabled || !root.contains(btn)) { return; }
      var action = btn.getAttribute('data-action');
      if (btn.hasAttribute('data-input')) {
        if (st.quiz && full) { return; }
        var id = btn.getAttribute('data-input');
        st[id] = st[id] ? 0 : 1;
        pendingFocus = 'in-' + id;
      } else if (action === 'inside') {
        if (st.quiz && !st.answered) { return; }
        st.inside = !st.inside;
      } else if (action === 'quiz') {
        st.quiz = !st.quiz;
        if (st.quiz) {
          st.inside = false;
          pickQuestion();
          pendingFocus = 'ans-1';
        } else {
          st.answered = false;
          pendingFocus = 'mode-quiz';
        }
      } else if (action === 'answer') {
        if (!st.quiz || st.answered) { return; }
        var picked = Number(btn.getAttribute('data-value'));
        st.correct = picked === L.evaluate(name, st);
        st.answered = true;
        st.total += 1;
        if (st.correct) { st.right += 1; }
        pendingFocus = 'quiz-next';
      } else if (action === 'next') {
        st.inside = false;
        pickQuestion();
        pendingFocus = 'ans-1';
      } else {
        return;
      }
      update();
    });

    update();
  }

  // ---------- pages ----------
  function gatePage(page) {
    var name = page.gate, info = INFO[name];
    main.innerHTML =
      '<section class="gate" data-role="gate-page">' +
      '<header class="gate-head"><h2 class="gate-title"><span class="gate-en">' + name + '</span>' +
      '<span class="gate-read">' + info.read + '</span></h2>' +
      '<p class="rule" data-role="rule">' + info.rule + '</p></header>' +
      '<div class="gate-body-root" data-role="gate-root"></div></section>';
    mountGate(main.querySelector('[data-role="gate-root"]'), name, name, true);
  }

  function introPage() {
    main.innerHTML =
      '<section class="intro">' +
      '<h2 class="page-title">はじめに</h2>' +
      '<p>コンピュータの中では、電気が「来ている」か「来ていない」かで情報を表しています。この教材では、その2つの状態を数字で書きます。</p>' +
      '<ul class="bits">' +
      '<li><span class="bit bit-1">1</span><span>電気が来ている（ON）</span></li>' +
      '<li><span class="bit bit-0">0</span><span>電気が来ていない（OFF）</span></li>' +
      '</ul>' +
      '<h3>まず触ってみよう</h3>' +
      '<p>下の「A」スイッチをタップしてみましょう。ONにすると配線が明るく流れ、LEDが光ります。</p>' +
      '<div class="demo" data-role="demo"></div>' +
      '<h3>画面の見かた</h3>' +
      '<dl class="how">' +
      '<dt>入力スイッチ（A・B）</dt><dd>タップするたびに、ON（1）とOFF（0）が切り替わります。</dd>' +
      '<dt>LED</dt><dd>出力が1のとき光ります。出力の値は、数字（1・0）でも表示されます。</dd>' +
      '<dt>配線</dt><dd>明るく流れる線は1、灰色の線は0です。</dd>' +
      '<dt>「中を開く」</dt><dd>ゲートの中のしくみを見られます。ほとんどのゲートは、スイッチをつないだ回路として見せます。</dd>' +
      '<dt>「予想クイズ」</dt><dd>入力が自動で決まります。出力が1か0かを予想して答えると、正解がわかります。</dd>' +
      '</dl>' +
      '<p>準備ができたら、下の「次へ」を押して、いちばん簡単なWIREから始めましょう。</p>' +
      '</section>';
    mountGate(main.querySelector('[data-role="demo"]'), 'WIRE', 'demo', false);
  }

  function summaryPage() {
    var names = ['AND', 'OR', 'XOR', 'NAND', 'NOR'];
    var rows = L.combos('AND');
    var h = '<section class="summary"><h2 class="page-title">まとめ</h2>' +
      '<p>2入力のゲートを、同じ入力で並べて比べます。</p>' +
      '<div class="table-wrap"><table class="truth summary-table" data-role="summary-table"><caption class="sr-only">2入力ゲートの比較表</caption><thead><tr><th scope="col">A</th><th scope="col">B</th>';
    names.forEach(function (n) { h += '<th scope="col">' + n + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function (c) {
      h += '<tr data-a="' + c.A + '" data-b="' + c.B + '"><td>' + c.A + '</td><td>' + c.B + '</td>';
      names.forEach(function (n) { h += '<td class="out" data-gate="' + n + '">' + L.evaluate(n, c) + '</td>'; });
      h += '</tr>';
    });
    h += '</tbody></table></div>' +
      '<p class="note-small">ANDとNAND、ORとNORは、出力がちょうど反対になっています。</p>' +
      '<p class="teaser" data-role="teaser">実は NAND だけで、ほかのゲートを全部作れます（第2章で）</p>' +
      '</section>';
    main.innerHTML = h;
  }

  // ---------- navigation ----------
  var tabsEl = document.getElementById('tabs');
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');
  var posEl = document.getElementById('pager-pos');
  var current = 0;

  tabsEl.innerHTML = PAGES.map(function (p, i) {
    return '<button type="button" class="tab" data-page="' + p.id + '" data-index="' + i + '">' + p.label + '</button>';
  }).join('');

  function show(i) {
    current = Math.max(0, Math.min(PAGES.length - 1, i));
    var page = PAGES[current];
    if (page.kind === 'intro') { introPage(); }
    else if (page.kind === 'gate') { gatePage(page); }
    else { summaryPage(); }
    main.setAttribute('data-page', page.id);

    Array.prototype.forEach.call(tabsEl.children, function (b, idx) {
      if (idx === current) { b.setAttribute('aria-current', 'page'); } else { b.removeAttribute('aria-current'); }
    });
    var active = tabsEl.children[current];
    if (active && active.scrollIntoView) { active.scrollIntoView({ inline: 'center', block: 'nearest' }); }
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === PAGES.length - 1;
    posEl.textContent = (current + 1) + ' / ' + PAGES.length;
    window.scrollTo(0, 0);
  }

  tabsEl.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-index]');
    if (b) { show(Number(b.getAttribute('data-index'))); }
  });
  prevBtn.addEventListener('click', function () { show(current - 1); });
  nextBtn.addEventListener('click', function () { show(current + 1); });

  show(0);
})();
