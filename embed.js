/**
 * Vogler Marketing — Budget-Simulator (Shadow DOM Embed)
 * Lädt sich selbst in einen Shadow DOM Container — komplett CSS-isoliert,
 * aber mit vollem Zugriff auf dataLayer, Cookies und Meta Pixel.
 *
 * Einbettung auf Webflow:
 *   <div id="vm-budget-simulator"></div>
 *   <script src="https://dustinjeff.github.io/vogler-budget-simulator/embed.js"></script>
 */
(function() {
  'use strict';

  var mount = document.getElementById('vm-budget-simulator');
  if (!mount) return;

  // --- Fonts (global, weil Shadow DOM font-face erbt) ---
  if (!document.querySelector('link[href*="Didact+Gothic"]')) {
    var fl = document.createElement('link');
    fl.rel = 'stylesheet';
    fl.href = 'https://fonts.googleapis.com/css2?family=Didact+Gothic&family=JetBrains+Mono:wght@400;600;700&display=swap';
    document.head.appendChild(fl);
  }

  // --- Shadow DOM ---
  var shadow = mount.attachShadow({mode: 'open'});

  // --- Tracking (direkt in dataLayer, kein postMessage) ---
  function trackEvent(eventName, params) {
    window.dataLayer = window.dataLayer || [];
    var d = {event: eventName, rechner_name: (params || {}).rechner || 'unknown'};
    for (var k in params) {
      if (params.hasOwnProperty(k)) d['rechner_' + k] = params[k];
    }
    window.dataLayer.push(d);
  }

  trackEvent('rechner_started', {rechner: 'budget-simulator'});

  // --- DOM Helpers ---
  function $(id) { return shadow.querySelector('#' + id); }
  function $$(sel) { return shadow.querySelectorAll(sel); }

  // ==========================================================================
  // STATE
  // ==========================================================================
  var state = {
    industry: 'it',
    acv: 15000,
    retentionFactor: 2,
    currentCAC: 0,
    system: 'growth',
    months: 6
  };

  var CONSERVATIVE = 0.72;

  var benchmarks = {
    it:         { cplLow: 80,  cplHigh: 150, qualLow: 0.30, qualHigh: 0.40, closeLow: 0.15, closeHigh: 0.25, cycleLow: 60,  cycleHigh: 120, name: 'IT-Dienstleister & SaaS' },
    consulting: { cplLow: 60,  cplHigh: 120, qualLow: 0.25, qualHigh: 0.35, closeLow: 0.20, closeHigh: 0.30, cycleLow: 30,  cycleHigh: 90,  name: 'Beratung & Professional Services' },
    industry:   { cplLow: 100, cplHigh: 200, qualLow: 0.20, qualHigh: 0.30, closeLow: 0.10, closeHigh: 0.20, cycleLow: 90,  cycleHigh: 180, name: 'Industrie & Maschinenbau' },
    finance:    { cplLow: 70,  cplHigh: 140, qualLow: 0.25, qualHigh: 0.35, closeLow: 0.15, closeHigh: 0.25, cycleLow: 60,  cycleHigh: 120, name: 'Finanzdienstleister' },
    other:      { cplLow: 80,  cplHigh: 160, qualLow: 0.25, qualHigh: 0.35, closeLow: 0.15, closeHigh: 0.25, cycleLow: 60,  cycleHigh: 120, name: 'Andere B2B' }
  };

  var systems = {
    capture: { name: 'Demand Capture', retainer: 3000, setup: 3500, ads: 2000, tools: 0,   minMonths: 3, leadMult: 1.0,  qualMult: 1.0,  closeMult: 1.0 },
    growth:  { name: 'Growth Engine',  retainer: 5500, setup: 6500, ads: 3000, tools: 25,  minMonths: 4, leadMult: 1.4,  qualMult: 1.10, closeMult: 1.0 },
    revenue: { name: 'Revenue System', retainer: 9500, setup: 12500, ads: 5000, tools: 100, minMonths: 6, leadMult: 1.4,  qualMult: 1.20, closeMult: 1.30 }
  };

  var stepNames = [
    '',
    '\u00dcber dein Unternehmen',
    'W\u00e4hle dein System',
    'Zeitraum w\u00e4hlen',
    'Ergebnis'
  ];

  // ==========================================================================
  // CSS
  // ==========================================================================
  var CSS = '\
    :host { display: block; }\
    :root {\
      --bg: #0a0a0a; --bg-card: #141414; --bg-input: #1a1a1a;\
      --border: #2a2a2a; --border-focus: #4a4a4a; --page-bg: #f5f5f0;\
      --text: #e8e8e8; --text-muted: #888; --text-dim: #666;\
      --accent: #f4e75a; --accent-hover: #f7ed7a;\
      --green: #22c55e; --green-bg: rgba(34,197,94,0.1);\
      --yellow: #eab308; --yellow-bg: rgba(234,179,8,0.1);\
      --red: #ef4444; --red-bg: rgba(239,68,68,0.1);\
      --font: "Didact Gothic",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;\
      --mono: "JetBrains Mono","SF Mono","Fira Code",monospace;\
    }\
    * { margin:0; padding:0; box-sizing:border-box; }\
    .vm-root { font-family:var(--font); color:var(--text); line-height:1.6; -webkit-font-smoothing:antialiased; }\
    .tool-box { background:var(--bg); border-radius:20px; padding:40px 32px; color:var(--text); box-shadow:0 8px 32px rgba(0,0,0,0.15); }\
    @media(max-width:600px){ .tool-box { padding:24px 18px; border-radius:12px; } }\
    .tool-header { text-align:center; padding-bottom:32px; border-bottom:1px solid var(--border); margin-bottom:32px; }\
    .tool-header h1 { font-size:28px; font-weight:600; letter-spacing:-0.5px; margin-bottom:12px; }\
    @media(max-width:600px){ .tool-header h1 { font-size:22px; } }\
    .tool-header p { color:var(--text-muted); font-size:16px; max-width:560px; margin:0 auto; }\
    .progress-bar { margin-bottom:32px; }\
    .progress-info { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:13px; color:var(--text-muted); }\
    .progress-info .step-label { color:var(--text); font-weight:500; }\
    .progress-track { height:4px; background:var(--border); border-radius:2px; overflow:hidden; }\
    .progress-fill { height:100%; background:var(--accent); border-radius:2px; transition:width 0.4s ease; }\
    .section { display:none; animation:fadeIn 0.3s ease; }\
    .section.active { display:block; }\
    @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }\
    .step-title { font-size:22px; font-weight:600; margin-bottom:8px; }\
    @media(max-width:600px){ .step-title { font-size:18px; } }\
    .step-subtitle { font-size:14px; color:var(--text-muted); margin-bottom:28px; }\
    .field-group { margin-bottom:28px; }\
    .field-group label { display:block; font-size:14px; font-weight:500; margin-bottom:4px; }\
    .field-group .hint { display:block; font-size:12px; color:var(--text-dim); margin-bottom:10px; }\
    .slider-row { display:flex; align-items:center; gap:16px; }\
    .slider-row input[type="range"] { flex:1; }\
    .slider-value { min-width:110px; text-align:right; font-family:var(--mono); font-size:16px; font-weight:600; color:var(--accent); }\
    input[type="range"] { -webkit-appearance:none; appearance:none; height:4px; background:var(--border); border-radius:2px; outline:none; cursor:pointer; }\
    input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:18px; height:18px; border-radius:50%; background:var(--accent); cursor:pointer; transition:transform 0.15s; }\
    input[type="range"]::-webkit-slider-thumb:hover { transform:scale(1.2); }\
    input[type="range"]::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:var(--accent); border:none; cursor:pointer; }\
    select.input-field { width:100%; padding:12px 16px; background:var(--bg-input); border:1px solid var(--border); border-radius:6px; color:var(--text); font-family:var(--font); font-size:15px; outline:none; cursor:pointer; -webkit-appearance:none; appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' fill=\'%23888\' viewBox=\'0 0 16 16\'%3E%3Cpath d=\'M8 11L3 6h10z\'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 14px center; padding-right:36px; transition:border-color 0.2s; }\
    select.input-field:focus { border-color:var(--border-focus); }\
    .option-cards { display:flex; flex-direction:column; gap:8px; }\
    .option-card { background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:14px 18px; cursor:pointer; transition:all 0.2s; font-size:14px; color:var(--text-muted); }\
    .option-card:hover { border-color:var(--border-focus); background:var(--bg-input); }\
    .option-card.active { border-color:var(--accent); background:rgba(244,231,90,0.04); color:var(--text); }\
    .section-label { font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:var(--text-dim); margin-bottom:20px; }\
    .system-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:28px; }\
    @media(max-width:768px){ .system-cards { grid-template-columns:1fr; } }\
    .system-card { position:relative; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:20px; cursor:pointer; transition:all 0.2s; }\
    .system-card:hover { border-color:var(--border-focus); background:var(--bg-input); }\
    .system-card.active { border-color:var(--accent); background:rgba(244,231,90,0.04); }\
    .system-card .card-badge { display:none; position:absolute; top:-8px; right:12px; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.8px; background:var(--accent); color:var(--bg); padding:3px 8px; border-radius:4px; }\
    .system-card.recommended .card-badge { display:block; }\
    .system-card .card-title { font-size:16px; font-weight:600; margin-bottom:8px; }\
    .system-card .card-desc { font-size:13px; color:var(--text-muted); line-height:1.4; margin-bottom:12px; }\
    .system-card .card-detail { display:flex; justify-content:space-between; align-items:center; padding:5px 0; font-size:13px; color:var(--text-muted); }\
    .system-card .card-detail .detail-value { font-family:var(--mono); font-size:13px; color:var(--text); }\
    .system-card .card-divider { height:1px; background:var(--border); margin:8px 0; }\
    .system-card .card-detail.total { font-weight:600; color:var(--text); }\
    .system-card .card-detail.total .detail-value { color:var(--accent); font-weight:700; }\
    .period-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:28px; }\
    @media(max-width:768px){ .period-cards { grid-template-columns:1fr; } }\
    .period-card { background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:28px 20px; cursor:pointer; transition:all 0.2s; text-align:center; }\
    .period-card:hover { border-color:var(--border-focus); background:var(--bg-input); }\
    .period-card.active { border-color:var(--accent); background:rgba(244,231,90,0.04); }\
    .period-card .period-number { font-family:var(--mono); font-size:36px; font-weight:700; color:var(--text); line-height:1; margin-bottom:4px; }\
    .period-card.active .period-number { color:var(--accent); }\
    .period-card .period-unit { font-size:14px; color:var(--text-muted); margin-bottom:8px; }\
    .period-card .period-hint { font-size:12px; color:var(--text-dim); }\
    .btn { display:inline-flex; align-items:center; justify-content:center; padding:14px 32px; font-size:15px; font-weight:600; border:none; border-radius:8px; cursor:pointer; transition:all 0.2s; font-family:var(--font); text-decoration:none; }\
    .btn:disabled { opacity:0.3; cursor:not-allowed; }\
    .btn-primary { background:var(--accent); color:var(--bg); }\
    .btn-primary:hover:not(:disabled) { background:var(--accent-hover); }\
    .btn-primary.btn-large { font-size:16px; padding:16px 40px; }\
    .btn-secondary { background:transparent; color:var(--text-muted); border:1px solid var(--border); }\
    .btn-secondary:hover:not(:disabled) { border-color:var(--border-focus); color:var(--text); }\
    .btn-outline { background:transparent; color:var(--accent); border:1px solid var(--accent); }\
    .btn-outline:hover { background:rgba(244,231,90,0.08); }\
    .btn-ghost { background:transparent; color:var(--text-muted); font-size:13px; padding:8px 16px; border:none; cursor:pointer; font-family:var(--font); transition:color 0.2s; }\
    .btn-ghost:hover { color:var(--text); }\
    .btn-row { display:flex; gap:12px; margin-top:32px; justify-content:flex-end; }\
    .btn-row.between { justify-content:space-between; }\
    .divider { height:1px; background:var(--border); margin:32px 0; }\
    .results-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:32px; }\
    @media(max-width:768px){ .results-grid { grid-template-columns:1fr; } }\
    .results-card { background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:24px; }\
    .results-card h3 { font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:var(--text-dim); margin-bottom:20px; }\
    .result-row { display:flex; justify-content:space-between; align-items:flex-start; padding:8px 0; font-size:14px; color:var(--text-muted); }\
    .result-row .result-value { font-family:var(--mono); font-size:14px; color:var(--text); font-weight:600; text-align:right; }\
    .result-row .result-sub { font-size:11px; color:var(--text-dim); font-family:var(--font); font-weight:400; display:block; margin-top:1px; }\
    .result-row.divider-row { border-top:1px solid var(--border); margin-top:4px; padding-top:12px; }\
    .result-row.total { font-weight:600; color:var(--text); font-size:15px; }\
    .result-row.total .result-value { color:var(--accent); font-size:16px; font-weight:700; }\
    .result-row.highlight .result-value { color:var(--green); }\
    .result-row.negative .result-value { color:var(--red); }\
    .kpi-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:32px; }\
    @media(max-width:600px){ .kpi-strip { grid-template-columns:repeat(2,1fr); } }\
    .kpi-item { background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:16px; text-align:center; }\
    .kpi-item .kpi-label { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--text-dim); margin-bottom:6px; }\
    .kpi-item .kpi-value { font-family:var(--mono); font-size:22px; font-weight:700; color:var(--accent); }\
    @media(max-width:600px){ .kpi-item .kpi-value { font-size:18px; } }\
    .kpi-item .kpi-sub { font-size:11px; color:var(--text-dim); margin-top:2px; }\
    .timeline-section { margin-bottom:32px; }\
    .timeline-section h3 { font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:var(--text-dim); margin-bottom:16px; }\
    .timeline-bar-container { display:flex; flex-direction:column; gap:6px; }\
    .timeline-row { display:flex; align-items:center; gap:12px; }\
    .timeline-label { min-width:70px; font-family:var(--mono); font-size:12px; color:var(--text-muted); text-align:right; }\
    .timeline-bar-track { flex:1; height:28px; background:var(--bg-input); border-radius:4px; position:relative; overflow:hidden; }\
    .timeline-bar-fill { height:100%; border-radius:4px; display:flex; align-items:center; padding-left:10px; font-size:11px; font-family:var(--mono); color:var(--bg); font-weight:600; transition:width 0.6s ease; white-space:nowrap; overflow:hidden; }\
    .timeline-bar-fill.setup { background:var(--yellow); }\
    .timeline-bar-fill.leads { background:var(--accent); }\
    .timeline-bar-fill.breakeven { background:var(--green); }\
    .timeline-bar-fill.scale { background:#22c55e; }\
    .timeline-legend { display:flex; gap:20px; margin-top:12px; flex-wrap:wrap; }\
    .timeline-legend-item { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); }\
    .timeline-legend-item .legend-dot { width:10px; height:10px; border-radius:3px; }\
    .compare-section { margin-bottom:32px; }\
    .compare-section h3 { font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:var(--text-dim); margin-bottom:16px; }\
    .compare-table { width:100%; border-collapse:collapse; }\
    .compare-table th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--text-dim); padding:10px 14px; border-bottom:1px solid var(--border); font-weight:500; }\
    .compare-table th:not(:first-child) { text-align:center; }\
    .compare-table td { padding:14px; border-bottom:1px solid var(--border); font-size:14px; }\
    .compare-table td:not(:first-child) { text-align:center; font-family:var(--mono); font-weight:600; }\
    .compare-table tr:last-child td { border-bottom:none; }\
    .compare-table .val-red { color:var(--red); }\
    .compare-table .val-green { color:var(--green); }\
    .hint-box { background:var(--bg-card); border:1px solid var(--yellow); border-radius:8px; padding:20px 24px; font-size:14px; color:var(--text-muted); line-height:1.6; margin-bottom:32px; }\
    .hint-box strong { color:var(--yellow); display:block; margin-bottom:4px; font-size:13px; text-transform:uppercase; letter-spacing:0.5px; }\
    .hint-box .hint-tip { margin-top:12px; padding-top:12px; border-top:1px solid var(--border); color:var(--text); font-size:13px; }\
    .disclaimer { background:var(--bg-card); border:1px solid var(--accent); border-radius:8px; padding:20px 24px; font-size:14px; color:var(--text-muted); line-height:1.6; margin-bottom:32px; }\
    .disclaimer strong { color:var(--text); display:block; margin-bottom:4px; font-size:13px; text-transform:uppercase; letter-spacing:0.5px; }\
    .cta-section { text-align:center; padding:40px 24px; border:1px solid var(--border); border-radius:12px; margin-bottom:32px; }\
    .cta-section h3 { font-size:20px; font-weight:600; margin-bottom:8px; }\
    .cta-section p { font-size:14px; color:var(--text-muted); margin-bottom:24px; max-width:480px; margin-left:auto; margin-right:auto; }\
    .cta-buttons { display:flex; gap:12px; justify-content:center; align-items:center; flex-wrap:wrap; }\
    .cta-section .btn-primary { font-size:16px; padding:16px 40px; }\
    .bottom-actions { display:flex; justify-content:space-between; align-items:center; }\
    @media(max-width:600px){\
      .system-cards { grid-template-columns:1fr; }\
      .period-cards { grid-template-columns:1fr; }\
      .results-grid { grid-template-columns:1fr; }\
      .kpi-strip { grid-template-columns:repeat(2,1fr); }\
      .cta-buttons { flex-direction:column; }\
      .cta-section .btn-primary { width:100%; }\
      .btn-outline { width:100%; }\
      .btn-row.between { flex-direction:row; }\
    }\
  ';

  // ==========================================================================
  // HTML
  // ==========================================================================
  var HTML = '\
  <div class="vm-root"><div class="tool-box">\
    <div class="tool-header">\
      <h1>Budget-Simulator</h1>\
      <p>Simuliere dein Marketing-Investment und sieh, welche Ergebnisse realistisch sind &ndash; basierend auf Branchendaten aus dem DACH-Raum.</p>\
    </div>\
    <div class="progress-bar">\
      <div class="progress-info">\
        <span class="step-label" id="step-label">Schritt 1 von 4: &Uuml;ber dein Unternehmen</span>\
        <span id="step-count">25%</span>\
      </div>\
      <div class="progress-track">\
        <div class="progress-fill" id="progress-fill" style="width:25%"></div>\
      </div>\
    </div>\
    <!-- STEP 1: Unternehmen -->\
    <div class="section active" id="step-1">\
      <div class="step-title">&Uuml;ber dein Unternehmen</div>\
      <div class="step-subtitle">Ein paar Angaben zu deinem Business &ndash; damit wir die richtigen Benchmarks nutzen.</div>\
      <div class="field-group">\
        <label>Branche</label>\
        <span class="hint">Beeinflusst Benchmarks wie Lead-Kosten und Abschlussraten</span>\
        <select class="input-field" id="industry">\
          <option value="it">IT-Dienstleister &amp; SaaS</option>\
          <option value="consulting">Beratung &amp; Professional Services</option>\
          <option value="industry">Industrie &amp; Maschinenbau</option>\
          <option value="finance">Finanzdienstleister</option>\
          <option value="other">Andere B2B</option>\
        </select>\
      </div>\
      <div class="field-group">\
        <label>Durchschnittlicher Auftragswert / ACV</label>\
        <span class="hint">Was bringt ein typischer Neukunde im ersten Jahr?</span>\
        <div class="slider-row">\
          <input type="range" id="acv" min="5000" max="200000" step="1000" value="15000">\
          <span class="slider-value" id="acv-display">15.000 &euro;</span>\
        </div>\
      </div>\
      <div class="field-group">\
        <label>Wie lange bleibt ein Kunde durchschnittlich?</label>\
        <span class="hint">Beeinflusst den Kundenlebenswert (LTV) und damit den echten ROI</span>\
        <div class="option-cards" id="retention-options">\
          <div class="option-card" data-action="selectRetention" data-retention="1">Einmaliger Auftrag</div>\
          <div class="option-card active" data-action="selectRetention" data-retention="2">1&ndash;2 Jahre</div>\
          <div class="option-card" data-action="selectRetention" data-retention="4">3&ndash;5 Jahre</div>\
          <div class="option-card" data-action="selectRetention" data-retention="6">&Uuml;ber 5 Jahre</div>\
        </div>\
      </div>\
      <div class="field-group">\
        <label>Was kostet dich aktuell ein Neukunde? (grobe Sch&auml;tzung)</label>\
        <span class="hint">Wird im Ergebnis als Vergleich angezeigt</span>\
        <div class="option-cards" id="cac-options">\
          <div class="option-card active" data-action="selectCurrentCAC" data-cac="0">Wei&szlig; ich nicht</div>\
          <div class="option-card" data-action="selectCurrentCAC" data-cac="750">Unter 1.000 &euro;</div>\
          <div class="option-card" data-action="selectCurrentCAC" data-cac="2000">1.000&ndash;3.000 &euro;</div>\
          <div class="option-card" data-action="selectCurrentCAC" data-cac="4000">3.000&ndash;5.000 &euro;</div>\
          <div class="option-card" data-action="selectCurrentCAC" data-cac="7500">5.000&ndash;10.000 &euro;</div>\
          <div class="option-card" data-action="selectCurrentCAC" data-cac="15000">10.000&ndash;20.000 &euro;</div>\
          <div class="option-card" data-action="selectCurrentCAC" data-cac="25000">&Uuml;ber 20.000 &euro;</div>\
        </div>\
      </div>\
      <div class="btn-row">\
        <button class="btn btn-primary" data-action="goToStep" data-step="2">Weiter &rarr;</button>\
      </div>\
    </div>\
    <!-- STEP 2: System -->\
    <div class="section" id="step-2">\
      <div class="step-title">W&auml;hle dein System</div>\
      <div class="step-subtitle">Jedes System baut auf dem vorherigen auf. W&auml;hle das, was zu deiner aktuellen Situation passt.</div>\
      <div class="system-cards">\
        <div class="system-card" data-action="selectSystem" data-system="capture">\
          <div class="card-badge">Empfohlen</div>\
          <div class="card-title">Demand Capture</div>\
          <div class="card-desc">Bestehende Nachfrage einfangen. Google Ads, Landing Pages und Conversion-Infrastruktur f&uuml;r schnelle Ergebnisse.</div>\
          <div class="card-divider"></div>\
          <div class="card-detail"><span>Retainer</span><span class="detail-value">3.000 &euro;/Mo</span></div>\
          <div class="card-detail"><span>Setup</span><span class="detail-value">3.500 &euro;</span></div>\
          <div class="card-detail"><span>Min. Ads</span><span class="detail-value">2.000 &euro;/Mo</span></div>\
          <div class="card-divider"></div>\
          <div class="card-detail total"><span>Mindestlaufzeit</span><span class="detail-value">3 Monate</span></div>\
        </div>\
        <div class="system-card recommended active" data-action="selectSystem" data-system="growth">\
          <div class="card-badge">Empfohlen</div>\
          <div class="card-title">Growth Engine</div>\
          <div class="card-desc">Capture plus Demand Creation. Paid + Content + E-Mail-Nurturing f&uuml;r nachhaltigen Pipeline-Aufbau.</div>\
          <div class="card-divider"></div>\
          <div class="card-detail"><span>Retainer</span><span class="detail-value">5.500 &euro;/Mo</span></div>\
          <div class="card-detail"><span>Setup</span><span class="detail-value">6.500 &euro;</span></div>\
          <div class="card-detail"><span>Min. Ads</span><span class="detail-value">3.000 &euro;/Mo</span></div>\
          <div class="card-detail"><span>Tools (Brevo)</span><span class="detail-value">25 &euro;/Mo</span></div>\
          <div class="card-divider"></div>\
          <div class="card-detail total"><span>Mindestlaufzeit</span><span class="detail-value">4 Monate</span></div>\
        </div>\
        <div class="system-card" data-action="selectSystem" data-system="revenue">\
          <div class="card-badge">Empfohlen</div>\
          <div class="card-title">Revenue System</div>\
          <div class="card-desc">Das komplette Acquisition-System. Ads, Content, CRM, Scoring, Automatisierung und Vertriebs&uuml;bergabe.</div>\
          <div class="card-divider"></div>\
          <div class="card-detail"><span>Retainer</span><span class="detail-value">9.500 &euro;/Mo</span></div>\
          <div class="card-detail"><span>Setup</span><span class="detail-value">12.500 &euro;</span></div>\
          <div class="card-detail"><span>Min. Ads</span><span class="detail-value">5.000 &euro;/Mo</span></div>\
          <div class="card-detail"><span>Tools</span><span class="detail-value">100 &euro;/Mo</span></div>\
          <div class="card-divider"></div>\
          <div class="card-detail total"><span>Mindestlaufzeit</span><span class="detail-value">6 Monate</span></div>\
        </div>\
      </div>\
      <div class="btn-row between">\
        <button class="btn btn-secondary" data-action="goToStep" data-step="1">&larr; Zur&uuml;ck</button>\
        <button class="btn btn-primary" data-action="goToStep" data-step="3">Weiter &rarr;</button>\
      </div>\
    </div>\
    <!-- STEP 3: Zeitraum -->\
    <div class="section" id="step-3">\
      <div class="step-title">Zeitraum w&auml;hlen</div>\
      <div class="step-subtitle">Wie weit willst du planen? L&auml;ngere Zeitr&auml;ume zeigen den Compound-Effekt deines Systems.</div>\
      <div class="period-cards">\
        <div class="period-card" data-action="selectPeriod" data-months="3">\
          <div class="period-number">3</div>\
          <div class="period-unit">Monate</div>\
          <div class="period-hint">Erste Ergebnisse sehen</div>\
        </div>\
        <div class="period-card active" data-action="selectPeriod" data-months="6">\
          <div class="period-number">6</div>\
          <div class="period-unit">Monate</div>\
          <div class="period-hint">Realistischer Planungshorizont</div>\
        </div>\
        <div class="period-card" data-action="selectPeriod" data-months="12">\
          <div class="period-number">12</div>\
          <div class="period-unit">Monate</div>\
          <div class="period-hint">Voller Compound-Effekt</div>\
        </div>\
      </div>\
      <div class="btn-row between">\
        <button class="btn btn-secondary" data-action="goToStep" data-step="2">&larr; Zur&uuml;ck</button>\
        <button class="btn btn-primary btn-large" data-action="calculate">Ergebnis berechnen &rarr;</button>\
      </div>\
    </div>\
    <!-- STEP 4: Ergebnis -->\
    <div class="section" id="step-4">\
      <div style="text-align:center;margin-bottom:32px;">\
        <h2 style="font-size:22px;font-weight:600;margin-bottom:8px;">Deine Prognose: <span id="result-system-name" style="color:var(--accent)">Growth Engine</span></h2>\
        <p style="color:var(--text-muted);font-size:14px;"><span id="result-industry-name">IT-Dienstleister &amp; SaaS</span> &middot; ACV <span id="result-acv" style="font-family:var(--mono)">15.000 &euro;</span> &middot; <span id="result-months" style="font-family:var(--mono)">6</span> Monate</p>\
      </div>\
      <div class="kpi-strip" id="kpi-strip"></div>\
      <div id="negative-roi-hint" style="display:none;"></div>\
      <div class="results-grid">\
        <div class="results-card" id="investment-card"></div>\
        <div class="results-card" id="prognose-card"></div>\
      </div>\
      <div id="sales-cycle-hint" style="display:none;"></div>\
      <div id="cac-comparison" style="display:none;"></div>\
      <div class="timeline-section" id="timeline-section"></div>\
      <div id="compound-info" style="display:none;"></div>\
      <div class="compare-section" id="compare-section"></div>\
      <div id="whatif-section" style="display:none;"></div>\
      <div class="disclaimer">\
        <strong>Hinweis zur Prognose</strong>\
        Diese Prognose basiert auf konservativen Durchschnittswerten. Dein Ergebnis kann besser ausfallen &ndash; wir rechnen im Erstgespr&auml;ch mit deinen echten Zahlen.\
      </div>\
      <div class="cta-section">\
        <h3>Bereit f&uuml;r echte Zahlen?</h3>\
        <p>Im Erstgespr&auml;ch rechnen wir mit deinen tats&auml;chlichen Werten &ndash; kein Raten, keine Benchmarks.</p>\
        <div class="cta-buttons">\
          <a href="https://vogler-marketing-26-04.webflow.io/erstgespraech" class="btn btn-primary" data-action="ctaClick" data-cta="erstgespraech">Erstgespr&auml;ch vereinbaren</a>\
          <button class="btn btn-outline" data-action="shareLink">Simulator-Link teilen</button>\
        </div>\
      </div>\
      <div class="bottom-actions">\
        <button class="btn-ghost" data-action="goToStep" data-step="1">&larr; Eingaben anpassen</button>\
        <button class="btn btn-secondary" data-action="goToStep" data-step="1">Nochmal neu rechnen</button>\
      </div>\
    </div>\
  </div></div>';

  // --- Inject ---
  shadow.innerHTML = '<style>' + CSS + '</style>' + HTML;

  // ==========================================================================
  // EVENT DELEGATION (statt inline onclick)
  // ==========================================================================
  shadow.addEventListener('click', function(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;

    switch(action) {
      case 'goToStep':
        goToStep(parseInt(el.dataset.step));
        break;
      case 'calculate':
        calculate();
        break;
      case 'selectRetention':
        selectRetention(parseInt(el.dataset.retention));
        break;
      case 'selectCurrentCAC':
        selectCurrentCAC(parseInt(el.dataset.cac));
        break;
      case 'selectSystem':
        selectSystem(el.dataset.system);
        break;
      case 'selectPeriod':
        selectPeriod(parseInt(el.dataset.months));
        break;
      case 'shareLink':
        shareLink();
        trackEvent('rechner_cta_clicked', {rechner: 'budget-simulator', cta: 'link_teilen'});
        break;
      case 'ctaClick':
        trackEvent('rechner_cta_clicked', {rechner: 'budget-simulator', cta: el.dataset.cta || 'unknown', system: state.system});
        break;
    }
  });

  // ==========================================================================
  // FORMATTING HELPERS
  // ==========================================================================
  function formatEuro(n) {
    return n.toLocaleString('de-DE') + ' \u20AC';
  }

  function formatEuroShort(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + ' Mio. \u20AC';
    if (n >= 10000) return Math.round(n).toLocaleString('de-DE') + ' \u20AC';
    return n.toLocaleString('de-DE') + ' \u20AC';
  }

  // ==========================================================================
  // SLIDER + SELECT LIVE UPDATES
  // ==========================================================================
  var acvSlider = $('acv');
  var acvDisplay = $('acv-display');

  acvSlider.addEventListener('input', function() {
    state.acv = parseInt(this.value);
    acvDisplay.innerHTML = formatEuro(state.acv);
  });

  $('industry').addEventListener('change', function() {
    state.industry = this.value;
  });

  // ==========================================================================
  // SELECTION FUNCTIONS
  // ==========================================================================
  function selectRetention(factor) {
    state.retentionFactor = factor;
    $$('#retention-options .option-card').forEach(function(c) { c.classList.remove('active'); });
    shadow.querySelector('#retention-options [data-retention="' + factor + '"]').classList.add('active');
  }

  function selectCurrentCAC(val) {
    state.currentCAC = val;
    $$('#cac-options .option-card').forEach(function(c) { c.classList.remove('active'); });
    shadow.querySelector('#cac-options [data-cac="' + val + '"]').classList.add('active');
  }

  function selectSystem(sys) {
    state.system = sys;
    $$('.system-card').forEach(function(c) { c.classList.remove('active'); });
    shadow.querySelector('[data-system="' + sys + '"]').classList.add('active');
    trackEvent('rechner_input', {rechner: 'budget-simulator', field: 'system', value: sys});
  }

  function selectPeriod(m) {
    state.months = m;
    $$('.period-card').forEach(function(c) { c.classList.remove('active'); });
    shadow.querySelector('.period-card[data-months="' + m + '"]').classList.add('active');
  }

  // ==========================================================================
  // STEP NAVIGATION
  // ==========================================================================
  function goToStep(step) {
    for (var i = 1; i <= 4; i++) {
      $('step-' + i).classList.remove('active');
    }
    $('step-' + step).classList.add('active');

    var pct = Math.round((step / 4) * 100);
    $('step-label').textContent = 'Schritt ' + step + ' von 4: ' + stepNames[step];
    $('step-count').textContent = pct + '%';
    $('progress-fill').style.width = pct + '%';

    trackEvent('rechner_step', {
      rechner: 'budget-simulator',
      step: step,
      step_name: stepNames[step]
    });

    mount.scrollIntoView({behavior: 'smooth'});
  }

  // ==========================================================================
  // ORGANIC LEADS HELPERS
  // ==========================================================================
  function getOrganicLeads(systemKey, month) {
    if (systemKey === 'capture') return { low: 0, high: 0 };
    if (month < 3) return { low: 0, high: 0 };
    if (month <= 4) return { low: 2, high: 3 };
    if (month <= 6) return { low: 4, high: 5 };
    return { low: 6, high: 8 };
  }

  function avgOrganicLeads(systemKey, months) {
    var totalLow = 0, totalHigh = 0;
    for (var m = 1; m <= months; m++) {
      var o = getOrganicLeads(systemKey, m);
      totalLow += o.low;
      totalHigh += o.high;
    }
    return { low: Math.round(totalLow / months), high: Math.round(totalHigh / months) };
  }

  function steadyOrganicLeads(systemKey, months) {
    return getOrganicLeads(systemKey, months);
  }

  // ==========================================================================
  // CORE CALCULATION
  // ==========================================================================
  function calculate() {
    var b = benchmarks[state.industry];
    var s = systems[state.system];
    var months = state.months;
    var acv = state.acv;
    var ltv = acv * state.retentionFactor;
    var sysKey = state.system;

    // Investment (exact, no discount)
    var totalRetainer = s.retainer * months;
    var totalAds = s.ads * months;
    var totalTools = s.tools * months;
    var totalInvestment = s.setup + totalRetainer + totalAds + totalTools;

    // Paid leads per month (conservative)
    var leadsLowBase = Math.floor(s.ads / b.cplHigh);
    var leadsHighBase = Math.floor(s.ads / b.cplLow);
    var paidLeadsLow = Math.max(1, Math.round(leadsLowBase * s.leadMult * CONSERVATIVE));
    var paidLeadsHigh = Math.max(2, Math.round(leadsHighBase * s.leadMult * CONSERVATIVE));

    // Organic leads (steady-state at end of period)
    var orgSteady = steadyOrganicLeads(sysKey, months);
    var orgAvg = avgOrganicLeads(sysKey, months);
    var hasOrganic = sysKey !== 'capture';

    // Total leads (paid + organic steady-state for display)
    var leadsLow = paidLeadsLow + orgSteady.low;
    var leadsHigh = paidLeadsHigh + orgSteady.high;

    // Qual-Rate boost for Revenue System scoring (+10% on top)
    var extraQualMult = sysKey === 'revenue' ? 1.10 : 1.0;

    // Qualified leads per month (conservative)
    var qualLow = Math.max(1, Math.round(leadsLow * b.qualLow * s.qualMult * extraQualMult * CONSERVATIVE));
    var qualHigh = Math.max(1, Math.round(leadsHigh * b.qualHigh * s.qualMult * extraQualMult * CONSERVATIVE));

    // Sales cycle
    var avgCycleDays = (b.cycleLow + b.cycleHigh) / 2;
    var cycleMonths = avgCycleDays / 30;
    var effectiveMonths = Math.max(0, months - cycleMonths);

    // Deals (conservative)
    var dealsLow = Math.max(0, Math.round(qualLow * b.closeLow * s.closeMult * effectiveMonths * CONSERVATIVE));
    var dealsHigh = Math.max(0, Math.round(qualHigh * b.closeHigh * s.closeMult * effectiveMonths * CONSERVATIVE));
    var dealsAvg = (dealsLow + dealsHigh) / 2;

    // Revenue (ACV-based = Erstauftrag)
    var revenueLowACV = dealsLow * acv;
    var revenueHighACV = dealsHigh * acv;
    var revenueMidACV = (revenueLowACV + revenueHighACV) / 2;

    // Revenue (LTV-based = Kundenlebenswert)
    var revenueLowLTV = dealsLow * ltv;
    var revenueHighLTV = dealsHigh * ltv;
    var revenueMidLTV = (revenueLowLTV + revenueHighLTV) / 2;

    // Pipeline (conservative, ACV-based)
    var pipelineLow = Math.round(qualLow * acv * effectiveMonths * CONSERVATIVE);
    var pipelineHigh = Math.round(qualHigh * acv * effectiveMonths * CONSERVATIVE);

    // ROI on Erstauftrag (ACV)
    var roiLowACV = totalInvestment > 0 ? Math.round(((revenueLowACV - totalInvestment) / totalInvestment) * 100) : 0;
    var roiHighACV = totalInvestment > 0 ? Math.round(((revenueHighACV - totalInvestment) / totalInvestment) * 100) : 0;
    var roiMidACV = Math.round((roiLowACV + roiHighACV) / 2);

    // ROI on LTV
    var roiLowLTV = totalInvestment > 0 ? Math.round(((revenueLowLTV - totalInvestment) / totalInvestment) * 100) : 0;
    var roiHighLTV = totalInvestment > 0 ? Math.round(((revenueHighLTV - totalInvestment) / totalInvestment) * 100) : 0;
    var roiMidLTV = Math.round((roiLowLTV + roiHighLTV) / 2);

    // Break-even on ACV
    var monthlyCost = s.retainer + s.ads + s.tools;
    var monthlyRevACV = effectiveMonths > 0 ? revenueMidACV / effectiveMonths : 0;
    var breakEvenACV = 0;
    var cumCostA = s.setup, cumRevA = 0;
    for (var m = 1; m <= 36; m++) {
      cumCostA += monthlyCost;
      if (m > cycleMonths) cumRevA += monthlyRevACV;
      if (cumRevA >= cumCostA && breakEvenACV === 0) breakEvenACV = m;
    }

    // Break-even on LTV
    var monthlyRevLTV = effectiveMonths > 0 ? revenueMidLTV / effectiveMonths : 0;
    var breakEvenLTV = 0;
    var cumCostL = s.setup, cumRevL = 0;
    for (var m = 1; m <= 36; m++) {
      cumCostL += monthlyCost;
      if (m > cycleMonths) cumRevL += monthlyRevLTV;
      if (cumRevL >= cumCostL && breakEvenLTV === 0) breakEvenLTV = m;
    }

    // CAC with system
    var cacWithSystem = dealsAvg > 0 ? Math.round(totalInvestment / dealsAvg) : 0;

    // --- Show step 4 ---
    goToStep(4);

    var isNegativeROI = roiMidACV < 0;

    // --- Tracking: Ergebnis ---
    trackEvent('rechner_result', {
      rechner: 'budget-simulator',
      system: sysKey,
      industry: state.industry,
      acv: acv,
      months: months,
      retention_factor: state.retentionFactor,
      total_investment: totalInvestment,
      leads_low: leadsLow,
      leads_high: leadsHigh,
      deals_low: dealsLow,
      deals_high: dealsHigh,
      roi_ltv: roiMidLTV,
      roi_acv: roiMidACV,
      break_even_ltv: breakEvenLTV,
      negative_roi: isNegativeROI
    });

    $('result-system-name').textContent = s.name;
    $('result-industry-name').textContent = b.name;
    $('result-acv').textContent = formatEuro(acv);
    $('result-months').textContent = months;

    var consSub = 'konservative Sch\u00e4tzung';

    // KPI Strip
    var beDisplay = breakEvenLTV > 0 ? 'Monat ' + breakEvenLTV : '> 36 Mo';
    var beSub = state.retentionFactor > 1 ? 'auf Kundenlebenswert' : consSub;
    if (breakEvenACV > 0 && (state.retentionFactor <= 1 || breakEvenACV === breakEvenLTV)) {
      beDisplay = 'Monat ' + breakEvenACV;
      beSub = consSub;
    }

    $('kpi-strip').innerHTML =
      '<div class="kpi-item">' +
        '<div class="kpi-label">Pipeline</div>' +
        '<div class="kpi-value">' + formatEuroShort(Math.round((pipelineLow + pipelineHigh) / 2)) + '</div>' +
        '<div class="kpi-sub">' + consSub + '</div>' +
      '</div>' +
      '<div class="kpi-item">' +
        '<div class="kpi-label">Summe neue Leads jeden Monat</div>' +
        '<div class="kpi-value">' + leadsLow + '\u2013' + leadsHigh + '</div>' +
        '<div class="kpi-sub">' + consSub + '</div>' +
      '</div>' +
      '<div class="kpi-item">' +
        '<div class="kpi-label">ROI (Lebenswert)</div>' +
        '<div class="kpi-value" style="color:' + (roiMidLTV >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (roiMidLTV > 0 ? '+' : '') + roiMidLTV + '%</div>' +
        '<div class="kpi-sub">' + consSub + '</div>' +
      '</div>' +
      '<div class="kpi-item">' +
        '<div class="kpi-label">Break-even</div>' +
        '<div class="kpi-value">' + beDisplay + '</div>' +
        '<div class="kpi-sub">' + beSub + '</div>' +
      '</div>';

    // --- Negative ROI hint ---
    var hintEl = $('negative-roi-hint');
    if (isNegativeROI) {
      var tipText = '';
      if (sysKey === 'capture') {
        tipText = 'Tipp: Mit einem h\u00f6heren ACV oder l\u00e4ngerer Kundenbindung wird Demand Capture profitabel. Alternativ pr\u00fcfe die Growth Engine \u2013 dort steigt die Pipeline durch organische Kan\u00e4le ohne proportional mehr Werbebudget.';
      } else if (sysKey === 'growth') {
        tipText = 'Tipp: Pr\u00fcfe ob dein ACV die Investition rechtfertigt. Als Faustregel: Marketing-Systeme rechnen sich ab einem LTV:CAC Verh\u00e4ltnis von 3:1.';
      } else {
        tipText = 'Tipp: Das Revenue System ist f\u00fcr Unternehmen mit h\u00f6heren Auftragswerten konzipiert. Pr\u00fcfe ob die Growth Engine f\u00fcr deinen ACV besser passt.';
      }

      var breakEvenText = breakEvenACV > 0
        ? 'Bei deinen Zahlen erreichst du Break-even auf Erstauftrags-Basis nach ' + breakEvenACV + ' Monaten.'
        : 'Bei deinen aktuellen Zahlen liegt der Break-even auf Erstauftrags-Basis au\u00dferhalb von 36 Monaten.';

      if (breakEvenACV === 0 && breakEvenLTV > 0 && state.retentionFactor > 1) {
        breakEvenText += ' Auf den Kundenlebenswert gerechnet erreichst du Break-even in Monat ' + breakEvenLTV + '. Das ist der Grund warum LTV:CAC die wichtigere Kennzahl ist als der Erstauftrags-ROI.';
      } else if (roiMidLTV > 0) {
        breakEvenText += ' Auf Kundenlebenswert-Basis liegt dein ROI jedoch bei +' + roiMidLTV + '% \u2013 das System zahlt sich langfristig aus.';
      }

      hintEl.style.display = 'block';
      hintEl.innerHTML =
        '<div class="hint-box">' +
          '<strong>ROI auf Erstauftrag negativ</strong>' +
          'Bei deinem ACV und diesem System ist der ROI auf den Erstauftrag in ' + months + ' Monaten negativ. Das bedeutet nicht, dass Marketing sich nicht lohnt \u2013 sondern dass dieses System nicht optimal zu deiner Ausgangslage passt.' +
          '<div class="hint-tip">' + tipText + ' ' + breakEvenText + '</div>' +
        '</div>';
    } else {
      hintEl.style.display = 'none';
    }

    // --- Sales cycle hint ---
    var cycleHintEl = $('sales-cycle-hint');
    var cycleRounded = Math.round(cycleMonths);
    if (effectiveMonths < months / 2) {
      cycleHintEl.style.display = 'block';
      cycleHintEl.innerHTML =
        '<div class="hint-box">' +
          '<strong>Sales-Zyklus beachten</strong>' +
          'Dein Sales-Zyklus liegt bei ca. ' + cycleRounded + ' Monaten. Das bedeutet: Leads die heute reinkommen, werden erst in ' + cycleRounded + ' Monaten zu Kunden. Bei einer Laufzeit von ' + months + ' Monaten siehst du die vollen Ergebnisse erst gegen Ende \u2013 oder danach. Das ist normal f\u00fcr deine Branche. Die meisten unserer Kunden sehen den echten ROI ab Monat ' + (cycleRounded + 2) + '.' +
        '</div>';
    } else {
      cycleHintEl.style.display = 'none';
    }

    // Investment card
    var investHtml = '<h3>Investition (' + months + ' Monate)</h3>' +
      '<div class="result-row">' +
        '<span>Setup (einmalig)</span>' +
        '<span class="result-value">' + formatEuro(s.setup) + '</span>' +
      '</div>' +
      '<div class="result-row">' +
        '<span>Retainer (' + months + ' \u00d7 ' + formatEuro(s.retainer) + ')</span>' +
        '<span class="result-value">' + formatEuro(totalRetainer) + '</span>' +
      '</div>' +
      '<div class="result-row">' +
        '<span>Ads (' + months + ' \u00d7 ' + formatEuro(s.ads) + ')</span>' +
        '<span class="result-value">' + formatEuro(totalAds) + '</span>' +
      '</div>';
    if (s.tools > 0) {
      investHtml += '<div class="result-row">' +
        '<span>Tools (' + months + ' \u00d7 ' + formatEuro(s.tools) + ')</span>' +
        '<span class="result-value">' + formatEuro(totalTools) + '</span>' +
      '</div>';
    }
    investHtml += '<div class="result-row divider-row total">' +
      '<span>Gesamt</span>' +
      '<span class="result-value">' + formatEuro(totalInvestment) + '</span>' +
    '</div>';
    $('investment-card').innerHTML = investHtml;

    // Prognose card
    var roiAcvClass = roiMidACV >= 0 ? 'highlight' : 'negative';
    var roiLtvClass = roiMidLTV >= 0 ? 'highlight' : 'negative';

    var organicRow = '';
    if (hasOrganic) {
      organicRow = '<div class="result-row">' +
        '<span>Davon organisch (ohne Ads)</span>' +
        '<span class="result-value">' + orgSteady.low + '\u2013' + orgSteady.high + ' Leads/Mo<span class="result-sub">LinkedIn, Content, Newsletter</span></span>' +
      '</div>';
    }

    var breakEvenRows = '<div class="result-row">' +
      '<span>Break-even (Erstauftrag)</span>' +
      '<span class="result-value">' + (breakEvenACV > 0 ? 'Monat ' + breakEvenACV : '> 36 Monate') + '<span class="result-sub">' + consSub + '</span></span>' +
    '</div>';
    if (state.retentionFactor > 1) {
      breakEvenRows += '<div class="result-row">' +
        '<span>Break-even (Kundenlebenswert)</span>' +
        '<span class="result-value">' + (breakEvenLTV > 0 ? 'Monat ' + breakEvenLTV : '> 36 Monate') + '<span class="result-sub">' + consSub + '</span></span>' +
      '</div>';
    }

    $('prognose-card').innerHTML =
      '<h3>Prognostiziertes Ergebnis</h3>' +
      '<div class="result-row">' +
        '<span>Summe neue Leads jeden Monat</span>' +
        '<span class="result-value">' + leadsLow + '\u2013' + leadsHigh + '<span class="result-sub">' + consSub + '</span></span>' +
      '</div>' +
      organicRow +
      '<div class="result-row">' +
        '<span>Leads qualifiziert pro Monat</span>' +
        '<span class="result-value">' + qualLow + '\u2013' + qualHigh + '<span class="result-sub">' + consSub + '</span></span>' +
      '</div>' +
      '<div class="result-row">' +
        '<span>Abschl\u00fcsse (' + months + ' Mo)</span>' +
        '<span class="result-value">' + dealsLow + '\u2013' + dealsHigh + '<span class="result-sub">' + consSub + '</span></span>' +
      '</div>' +
      '<div class="result-row">' +
        '<span>Pipeline</span>' +
        '<span class="result-value">' + formatEuroShort(pipelineLow) + '\u2013' + formatEuroShort(pipelineHigh) + '<span class="result-sub">' + consSub + '</span></span>' +
      '</div>' +
      '<div class="result-row divider-row highlight">' +
        '<span>Umsatz (Erstauftrag)</span>' +
        '<span class="result-value">' + formatEuroShort(revenueLowACV) + '\u2013' + formatEuroShort(revenueHighACV) + '<span class="result-sub">' + consSub + '</span></span>' +
      '</div>' +
      (state.retentionFactor > 1 ?
      '<div class="result-row highlight">' +
        '<span>Umsatz (Kundenlebenswert)</span>' +
        '<span class="result-value">' + formatEuroShort(revenueLowLTV) + '\u2013' + formatEuroShort(revenueHighLTV) + '<span class="result-sub">' + consSub + '</span></span>' +
      '</div>' : '') +
      '<div class="result-row ' + roiAcvClass + '">' +
        '<span>ROI auf Erstauftrag</span>' +
        '<span class="result-value">' + (roiLowACV > 0 ? '+' : '') + roiLowACV + '% bis ' + (roiHighACV > 0 ? '+' : '') + roiHighACV + '%<span class="result-sub">' + consSub + '</span></span>' +
      '</div>' +
      (state.retentionFactor > 1 ?
      '<div class="result-row ' + roiLtvClass + '">' +
        '<span>ROI auf Kundenlebenswert</span>' +
        '<span class="result-value">' + (roiLowLTV > 0 ? '+' : '') + roiLowLTV + '% bis ' + (roiHighLTV > 0 ? '+' : '') + roiHighLTV + '%<span class="result-sub">' + consSub + '</span></span>' +
      '</div>' : '') +
      breakEvenRows;

    // --- CAC comparison ---
    var cacEl = $('cac-comparison');
    if (state.currentCAC > 0 && cacWithSystem > 0) {
      cacEl.style.display = 'block';
      cacEl.innerHTML =
        '<div class="results-card" style="margin-bottom:32px">' +
          '<h3>Kundenakquise-Kosten im Vergleich</h3>' +
          '<div class="result-row">' +
            '<span>Aktuell (deine Sch\u00e4tzung)</span>' +
            '<span class="result-value" style="color:' + (state.currentCAC > cacWithSystem ? 'var(--red)' : 'var(--text)') + '">~' + formatEuroShort(state.currentCAC) + ' pro Kunde</span>' +
          '</div>' +
          '<div class="result-row">' +
            '<span>Mit ' + s.name + '</span>' +
            '<span class="result-value" style="color:' + (cacWithSystem < state.currentCAC ? 'var(--green)' : 'var(--text)') + '">~' + formatEuroShort(cacWithSystem) + ' pro Kunde</span>' +
          '</div>' +
          (cacWithSystem < state.currentCAC ?
          '<div class="result-row divider-row highlight">' +
            '<span>Ersparnis pro Neukunde</span>' +
            '<span class="result-value">~' + formatEuroShort(state.currentCAC - cacWithSystem) + '</span>' +
          '</div>' : '') +
        '</div>';
    } else {
      cacEl.style.display = 'none';
    }

    // Timeline
    renderTimeline(months, cycleMonths, breakEvenACV);

    // Compound effect info
    var compoundEl = $('compound-info');
    if (hasOrganic) {
      compoundEl.style.display = 'block';
      compoundEl.innerHTML =
        '<div class="hint-box" style="border-color:var(--border);">' +
          '<strong style="color:var(--text-muted);">Compound-Effekt</strong>' +
          'Hinweis: Content, SEO und LinkedIn bauen sich \u00fcber die Zeit exponentiell auf \u2013 der sogenannte Compound-Effekt. Wir haben ihn hier bewusst nicht einberechnet, weil er schwer vorherzusagen ist und wir dir eine konservative Prognose geben wollen. In der Praxis bedeutet das: Deine tats\u00e4chlichen Ergebnisse werden wahrscheinlich besser ausfallen als hier dargestellt.' +
        '</div>';
    } else {
      compoundEl.style.display = 'none';
    }

    // Compare table
    var leadsWithout = Math.round((leadsLow + leadsHigh) / 2 * 0.3);
    var cacWithout = state.currentCAC > 0 ? state.currentCAC : Math.round(acv * 0.5);

    $('compare-section').innerHTML =
      '<h3>Vergleich: Mit vs. ohne System</h3>' +
      '<table class="compare-table">' +
        '<thead><tr>' +
          '<th>Metrik</th>' +
          '<th>Ohne System</th>' +
          '<th>Mit ' + s.name + '</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr>' +
            '<td>Leads / Monat</td>' +
            '<td class="val-red">' + (leadsWithout > 0 ? leadsWithout : '1\u20132') + '</td>' +
            '<td class="val-green">' + leadsLow + '\u2013' + leadsHigh + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td>CAC</td>' +
            '<td class="val-red">' + formatEuroShort(cacWithout) + '</td>' +
            '<td class="val-green">' + (cacWithSystem > 0 ? formatEuroShort(cacWithSystem) : '\u2014') + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td>Pipeline (' + months + ' Mo)</td>' +
            '<td class="val-red">' + formatEuroShort(Math.round((pipelineLow + pipelineHigh) / 2 * 0.25)) + '</td>' +
            '<td class="val-green">' + formatEuroShort(Math.round((pipelineLow + pipelineHigh) / 2)) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td>Planbarkeit</td>' +
            '<td class="val-red">Zufall & Empfehlungen</td>' +
            '<td class="val-green">Datenbasiert & skalierbar</td>' +
          '</tr>' +
        '</tbody>' +
      '</table>';

    // --- What-if Ads slider ---
    var whatifEl = $('whatif-section');
    whatifEl.style.display = 'block';
    whatifEl.innerHTML =
      '<div class="results-card" style="margin-bottom:32px">' +
        '<h3>Was w\u00e4re wenn du mehr in Ads investierst?</h3>' +
        '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Verschiebe den Regler und sieh in Echtzeit, wie sich die Ergebnisse ver\u00e4ndern, wenn du viel mehr Menschen mit deinem neuen System erreichst.</p>' +
        '<div class="field-group" style="margin-bottom:20px;">' +
          '<label>Ads-Budget</label>' +
          '<div class="slider-row">' +
            '<input type="range" id="whatif-ads" min="' + s.ads + '" max="15000" step="500" value="' + s.ads + '">' +
            '<span class="slider-value" id="whatif-ads-display">' + formatEuro(s.ads) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="kpi-strip" id="whatif-kpis">' +
          '<div class="kpi-item"><div class="kpi-label">Leads / Monat</div><div class="kpi-value" id="wi-leads">' + leadsLow + '\u2013' + leadsHigh + '</div><div class="kpi-sub">' + consSub + '</div></div>' +
          '<div class="kpi-item"><div class="kpi-label">Pipeline</div><div class="kpi-value" id="wi-pipeline">' + formatEuroShort(Math.round((pipelineLow + pipelineHigh) / 2)) + '</div><div class="kpi-sub">' + consSub + '</div></div>' +
          '<div class="kpi-item"><div class="kpi-label">ROI (Lebenswert)</div><div class="kpi-value" id="wi-roi" style="color:' + (roiMidLTV >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (roiMidLTV > 0 ? '+' : '') + roiMidLTV + '%</div><div class="kpi-sub">' + consSub + '</div></div>' +
          '<div class="kpi-item"><div class="kpi-label">Break-even</div><div class="kpi-value" id="wi-be">' + beDisplay + '</div><div class="kpi-sub">' + consSub + '</div></div>' +
        '</div>' +
      '</div>';

    // Attach live slider handler
    $('whatif-ads').addEventListener('input', function() {
      updateWhatIf(parseInt(this.value));
    });
  }

  // ==========================================================================
  // WHAT-IF UPDATE
  // ==========================================================================
  function updateWhatIf(newAds) {
    var b = benchmarks[state.industry];
    var s = systems[state.system];
    var months = state.months;
    var acv = state.acv;
    var ltv = acv * state.retentionFactor;
    var sysKey = state.system;

    $('whatif-ads-display').textContent = formatEuro(newAds);

    // Recalculate with new ads budget
    var totalInvestment = s.setup + (s.retainer * months) + (newAds * months) + (s.tools * months);

    var paidLow = Math.max(1, Math.round(Math.floor(newAds / b.cplHigh) * s.leadMult * CONSERVATIVE));
    var paidHigh = Math.max(2, Math.round(Math.floor(newAds / b.cplLow) * s.leadMult * CONSERVATIVE));

    var orgS = steadyOrganicLeads(sysKey, months);
    var wiLeadsLow = paidLow + orgS.low;
    var wiLeadsHigh = paidHigh + orgS.high;

    var extraQ = sysKey === 'revenue' ? 1.10 : 1.0;
    var wiQualLow = Math.max(1, Math.round(wiLeadsLow * b.qualLow * s.qualMult * extraQ * CONSERVATIVE));
    var wiQualHigh = Math.max(1, Math.round(wiLeadsHigh * b.qualHigh * s.qualMult * extraQ * CONSERVATIVE));

    var avgCycleDays = (b.cycleLow + b.cycleHigh) / 2;
    var cycleMonths = avgCycleDays / 30;
    var effectiveMonths = Math.max(0, months - cycleMonths);

    var wiDealsLow = Math.max(0, Math.round(wiQualLow * b.closeLow * s.closeMult * effectiveMonths * CONSERVATIVE));
    var wiDealsHigh = Math.max(0, Math.round(wiQualHigh * b.closeHigh * s.closeMult * effectiveMonths * CONSERVATIVE));

    var wiRevLTV = ((wiDealsLow + wiDealsHigh) / 2) * ltv;
    var wiPipelineLow = Math.round(wiQualLow * acv * effectiveMonths * CONSERVATIVE);
    var wiPipelineHigh = Math.round(wiQualHigh * acv * effectiveMonths * CONSERVATIVE);

    var wiRoiLTV = totalInvestment > 0 ? Math.round(((wiRevLTV - totalInvestment) / totalInvestment) * 100) : 0;

    // Break-even on LTV
    var monthlyCost = s.retainer + newAds + s.tools;
    var monthlyRev = effectiveMonths > 0 ? wiRevLTV / effectiveMonths : 0;
    var wiBE = 0;
    var cumC = s.setup, cumR = 0;
    for (var m = 1; m <= 36; m++) {
      cumC += monthlyCost;
      if (m > cycleMonths) cumR += monthlyRev;
      if (cumR >= cumC && wiBE === 0) wiBE = m;
    }

    $('wi-leads').textContent = wiLeadsLow + '\u2013' + wiLeadsHigh;
    $('wi-pipeline').textContent = formatEuroShort(Math.round((wiPipelineLow + wiPipelineHigh) / 2));

    var roiEl = $('wi-roi');
    roiEl.textContent = (wiRoiLTV > 0 ? '+' : '') + wiRoiLTV + '%';
    roiEl.style.color = wiRoiLTV >= 0 ? 'var(--green)' : 'var(--red)';

    $('wi-be').textContent = wiBE > 0 ? 'Monat ' + wiBE : '> 36 Mo';
  }

  // ==========================================================================
  // TIMELINE RENDERER
  // ==========================================================================
  function renderTimeline(months, cycleMonths, breakEven) {
    var container = $('timeline-section');
    var breakEvenMonth = breakEven > 0 && breakEven <= months ? breakEven : months;

    var rows = '';
    for (var m = 1; m <= months; m++) {
      var phase = '';
      var cls = '';
      var width = 0;

      if (m <= 1) {
        phase = 'Setup & Onboarding';
        cls = 'setup';
        width = 100;
      } else if (m <= Math.ceil(cycleMonths)) {
        phase = 'Erste Leads & Pipeline-Aufbau';
        cls = 'leads';
        width = 40 + (m - 2) * 15;
      } else if (m <= breakEvenMonth) {
        phase = 'Abschl\u00fcsse & Optimierung';
        cls = 'breakeven';
        width = 50 + (m - Math.ceil(cycleMonths)) * 10;
      } else {
        phase = 'Skalierung';
        cls = 'scale';
        width = 70 + (m - breakEvenMonth) * 5;
      }
      width = Math.min(width, 100);

      rows += '<div class="timeline-row">' +
        '<span class="timeline-label">Monat ' + m + '</span>' +
        '<div class="timeline-bar-track">' +
          '<div class="timeline-bar-fill ' + cls + '" style="width:' + width + '%">' + phase + '</div>' +
        '</div>' +
      '</div>';
    }

    container.innerHTML =
      '<h3>Timeline</h3>' +
      '<div class="timeline-bar-container">' + rows + '</div>' +
      '<div class="timeline-legend">' +
        '<div class="timeline-legend-item"><span class="legend-dot" style="background:var(--yellow)"></span> Setup</div>' +
        '<div class="timeline-legend-item"><span class="legend-dot" style="background:var(--accent)"></span> Pipeline-Aufbau</div>' +
        '<div class="timeline-legend-item"><span class="legend-dot" style="background:var(--green)"></span> Abschl\u00fcsse</div>' +
        '<div class="timeline-legend-item"><span class="legend-dot" style="background:#22c55e"></span> Skalierung</div>' +
      '</div>';
  }

  // ==========================================================================
  // SHARE LINK
  // ==========================================================================
  function shareLink() {
    var url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function() {
        alert('Link kopiert!');
      });
    } else {
      prompt('Link kopieren:', url);
    }
  }

})();
