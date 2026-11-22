/* =====================================================================
   FluxON Operacional · FRETE
   - Tela "Frete e entregadores": como cobrar o frete do cliente (taxa fixa ou por distância),
     valor por km rodado (ida e volta), frete mínimo e zona rural
   - Novo pedido: "Retirada" (sem frete) ou entrega com o frete calculado sozinho pelo endereço
     (o caixa pode ajustar) e o botão "Zona rural"
   Quem calcula é o servidor (TomTom, mesmo cálculo do cardápio). Aqui só mostra e deixa ajustar.
===================================================================== */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => escapeHtml(s);
  const moeda = (v) => formatCurrency(v);
  const num = (v) => Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  const virgula = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");

  async function api(caminho, opts = {}) {
    const r = await fetch(`${API_BASE}/api/v1/restaurante/${getRestaurantId()}${caminho}`, { ...opts, headers: buildHeaders(), body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error(j?.error || "Não deu certo. Tente de novo.");
    return j;
  }
  function aviso(msg, ruim) {
    let t = $("ent-toast");
    if (!t) { t = document.createElement("div"); t.id = "ent-toast"; document.body.appendChild(t); }
    t.textContent = msg; t.className = ruim ? "on ruim" : "on";
    clearTimeout(t._t); t._t = setTimeout(() => (t.className = ""), 3500);
  }

  /* =================== TELA "FRETE E ENTREGADORES" =================== */
  let cfg = null, equipe = [];
  function montarBloco() {
    const view = $("entregadores-view");
    if (!view) return false;
    if ($("fr-bloco")) return true;
    const titulo = view.querySelector(".crm-title");
    if (titulo) titulo.textContent = "🛵 Frete e entregadores";
    const menu = $("drawer-entregadores");
    const txt = menu && [...menu.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (txt) txt.textContent = " Frete e entregadores ";
    const s = document.createElement("section");
    s.className = "ent-bloco fr-bloco"; s.id = "fr-bloco";
    const grade = view.querySelector(".ent-grade");
    if (grade) grade.insertAdjacentElement("beforebegin", s); else view.appendChild(s);
    return true;
  }
  function desenharBloco() {
    const s = $("fr-bloco");
    if (!s || !cfg) return;
    const km = cfg.modo === "km";
    s.innerHTML = `
      <div class="ent-bloco-topo"><h3>Frete</h3><span class="ent-muted">o que o cliente paga de entrega</span></div>
      <div class="fr-modos" role="radiogroup" aria-label="Como cobrar o frete">
        <button type="button" class="fr-modo${km ? "" : " on"}" data-fr-modo="fixo" role="radio" aria-checked="${!km}"><b>Taxa fixa</b><small>O mesmo valor pra qualquer endereço</small></button>
        <button type="button" class="fr-modo${km ? " on" : ""}" data-fr-modo="km" role="radio" aria-checked="${km}"><b>Por distância</b><small>Calculado pelo endereço, ida e volta</small></button>
      </div>
      <div class="fr-campos">
        ${km ? `
        <label class="fr-campo"><span>Valor por km rodado</span><input id="fr-km" data-mask="moeda" value="${virgula(cfg.por_km)}"><small>Conta a ida e a volta do entregador</small></label>
        <label class="fr-campo"><span>Frete mínimo</span><input id="fr-minimo" data-mask="moeda" value="${virgula(cfg.minimo)}"><small>Entrega pertinho nunca sai por menos</small></label>`
        : `<label class="fr-campo"><span>Taxa de entrega</span><input id="fr-fixo" data-mask="moeda" value="${virgula(cfg.fixo)}"><small>Vale pra qualquer endereço</small></label>`}
        <label class="fr-campo"><span>Zona rural</span><input id="fr-rural" data-mask="moeda" value="${virgula(cfg.rural_valor)}"><small>Valor fixo · deixe 0,00 se não atende</small></label>
      </div>
      <p class="fr-exemplo" id="fr-exemplo"></p>
      <label class="fr-campo fr-lista"><span>Bairros e estradas da zona rural</span>
        <textarea id="fr-rural-lista" rows="3" placeholder="Um por linha. Ex.: Estrada do Sítio Novo">${esc((cfg.rural_lista || []).join("\n"))}</textarea>
        <small>Endereço com um desses nomes paga o valor da zona rural. No Novo pedido o caixa também pode marcar na mão.</small></label>
      <div id="fr-aviso"></div>
      <div class="fr-rodape"><button class="primary-button" type="button" id="fr-salvar">Salvar frete</button></div>`;
    s.querySelectorAll("[data-fr-modo]").forEach((b) => b.onclick = () => { lerCampos(); cfg.modo = b.dataset.frModo; desenharBloco(); });
    s.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => { lerCampos(); exemplo(); }));
    $("fr-salvar").onclick = salvar;
    exemplo();
  }
  function lerCampos() {
    if (!cfg || !$("fr-bloco")) return;
    if ($("fr-km")) cfg.por_km = num($("fr-km").value);
    if ($("fr-minimo")) cfg.minimo = num($("fr-minimo").value);
    if ($("fr-fixo")) cfg.fixo = num($("fr-fixo").value);
    if ($("fr-rural")) cfg.rural_valor = num($("fr-rural").value);
    if ($("fr-rural-lista")) cfg.rural_lista = $("fr-rural-lista").value.split("\n").map((x) => x.trim()).filter(Boolean);
  }
  // exemplo na hora + aviso quando o restaurante vai completar o que paga ao entregador
  function exemplo() {
    const ex = $("fr-exemplo"), av = $("fr-aviso");
    if (!ex || !cfg) return;
    const piso = cfg.modo === "km" ? cfg.minimo : cfg.fixo;
    if (cfg.modo === "km") {
      const v = Math.max(Math.ceil(3 * 2 * cfg.por_km * 2) / 2, cfg.minimo);
      ex.textContent = cfg.por_km > 0 ? `Exemplo: cliente a 3 km → 6 km rodados × ${moeda(cfg.por_km)} = frete de ${moeda(v)}` : "Coloque o valor por km rodado.";
    } else ex.textContent = "";
    const caros = equipe.filter((e) => e.ativo && e.tipo_pagamento !== "diaria" && !e.entrega_por_km && Number(e.valor_entrega) > piso + 0.009);
    av.innerHTML = caros.length && piso > 0 ? `<p class="fr-alerta">⚠️ ${caros.map((e) => `Você paga ${moeda(e.valor_entrega)} por entrega ao ${esc(String(e.nome).split(" ")[0])}`).join("; ")}, e o frete ${cfg.modo === "km" ? "mínimo " : ""}é ${moeda(piso)}. Nas entregas${cfg.modo === "km" ? " perto" : ""}, o restaurante completa a diferença.</p>` : "";
  }
  async function salvar() {
    lerCampos();
    const b = $("fr-salvar"); b.disabled = true;
    try {
      await api("/frete-config", { method: "PUT", body: { modo: cfg.modo, fixo: cfg.fixo, por_km: cfg.por_km, minimo: cfg.minimo, rural_valor: cfg.rural_valor, rural_lista: cfg.rural_lista } });
      aviso("Frete salvo ✓");
    } catch (e) { aviso(e.message, true); }
    b.disabled = false;
  }
  async function carregar() {
    if (!montarBloco()) return;
    try {
      const [c, lista] = await Promise.all([api("/frete-config"),
        fetch(`${API_BASE}/api/v1/entregadores/${getRestaurantId()}`, { headers: buildHeaders() }).then((r) => (r.ok ? r.json() : [])).catch(() => [])]);
      cfg = c; equipe = Array.isArray(lista) ? lista : [];
      desenharBloco();
    } catch (e) { const s = $("fr-bloco"); if (s) s.innerHTML = `<p class="ent-muted">Não deu pra carregar o frete: ${esc(e.message)}</p>`; }
  }
  // abre junto com a tela de Entregadores
  document.addEventListener("click", (e) => { if (e.target.closest("#drawer-entregadores")) setTimeout(carregar, 0); });
  const tentar = setInterval(() => { if (montarBloco()) clearInterval(tentar); }, 500);
  setTimeout(() => clearInterval(tentar), 15000);

  /* =================== NOVO PEDIDO: RETIRADA E FRETE =================== */
  const F = { retirada: false, valor: 0, rural: false, manual: false, carregado: null, seq: 0, t: null };
  function montarNovoPedido() {
    const topo = document.querySelector("#create-modal .np-end-topo"), escolhido = $("np-end-escolhido");
    if (!topo || !escolhido) return false;
    if ($("np-retirada")) return true;
    const b = document.createElement("button");
    b.type = "button"; b.className = "np-limpar"; b.id = "np-retirada"; b.textContent = "🏪 Retirada";
    topo.appendChild(b);
    const box = document.createElement("div");
    box.id = "np-retirada-box"; box.className = "np-retirada"; box.hidden = true;
    box.innerHTML = `<b>🏪 Retirada no balcão</b><small>O cliente busca no restaurante · sem frete</small>`;
    $("np-end-busca").insertAdjacentElement("afterend", box);
    const linha = document.createElement("div");
    linha.id = "np-frete"; linha.className = "np-frete"; linha.hidden = true;
    linha.innerHTML = `<span class="np-rotulo">Frete</span><small id="np-frete-info"></small>
      <button type="button" class="np-mini" id="np-rural" aria-pressed="false">Zona rural</button>
      <span class="np-frete-rs">R$</span><input id="np-frete-valor" class="np-input" data-mask="moeda" aria-label="Valor do frete">`;
    escolhido.insertAdjacentElement("afterend", linha);
    b.onclick = () => (F.retirada ? sairRetirada() : entrarRetirada());
    $("np-rural").onclick = () => { F.rural = !F.rural; F.manual = false; F.carregado = null; pintar(); calcular(true); };
    $("np-frete-valor").addEventListener("input", () => { F.manual = true; F.valor = num($("np-frete-valor").value); $("np-frete-info").textContent = "ajustado pelo caixa"; totais(); });
    pintar();
    return true;
  }
  const endereco = () => String($("new-address")?.value || "").trim();
  const escolheuEndereco = () => $("np-end-escolhido")?.style.display !== "none";
  function pintar() {
    if (!$("np-retirada")) return;
    if (F.retirada) $("np-end-busca").style.display = "none";
    else if (!escolheuEndereco()) $("np-end-busca").style.display = "";
    $("np-retirada-box").hidden = !F.retirada;
    $("np-retirada").hidden = escolheuEndereco() && !F.retirada;
    $("np-retirada").textContent = F.retirada ? "Trocar pra entrega" : "🏪 Retirada";
    const rot = document.querySelector("#create-modal .np-end-topo .np-rotulo");
    if (rot) rot.textContent = F.retirada ? "Retirada" : "Endereço para entrega";
    $("np-frete").hidden = F.retirada || !endereco();
    $("np-rural").classList.toggle("on", F.rural);
    $("np-rural").setAttribute("aria-pressed", F.rural);
  }
  function totais() { if (typeof window.npRecalcTotal === "function") window.npRecalcTotal(); }
  function entrarRetirada() {
    F.retirada = true; F.valor = 0; F.rural = false; F.manual = false; F.carregado = null;
    $("new-address").value = "";            // limpa o endereço (a tela do endereço volta pra busca)
    pintar(); totais();
  }
  function sairRetirada() {
    F.retirada = false;
    pintar(); totais();
    setTimeout(() => $("np-end-termo")?.focus(), 30);
  }
  // pergunta ao servidor quanto fica o frete desse endereço
  function calcular(agora) {
    clearTimeout(F.t);
    const end = endereco();
    if (!end || F.retirada) return;
    const minha = ++F.seq;
    $("np-frete-info").textContent = "calculando…";
    F.t = setTimeout(async () => {
      try {
        const r = await api(`/frete?endereco=${encodeURIComponent(end)}${F.rural ? "&rural=1" : ""}`);
        if (minha !== F.seq || F.manual) return;
        F.valor = Number(r.valor) || 0;
        $("np-frete-valor").value = F.valor;
        $("np-frete-info").textContent = r.rural ? "zona rural" : r.km != null ? `${String(r.km).replace(".", ",")} km` : r.modo === "km" ? "endereço não achado · confira o valor" : "taxa fixa";
        totais();
      } catch (e) { if (minha === F.seq) $("np-frete-info").textContent = "não deu pra calcular · digite o valor"; }
    }, agora ? 0 : 500);
  }
  // o endereço mudou (o script.js avisa quando grava o endereço)
  document.addEventListener("np-endereco", (e) => {
    if (!montarNovoPedido()) return;
    const end = String(e.detail || "").trim();
    if (!end) { if (!F.retirada) { F.valor = 0; F.rural = false; F.manual = false; F.carregado = null; F.seq++; } pintar(); totais(); return; }
    F.retirada = false;
    if (F.carregado && end === F.carregado) { pintar(); return; } // abrindo um pedido pra editar: mantém o frete dele
    F.carregado = null; F.manual = false;
    pintar();
    calcular();
  });

  // pro script.js
  window.npFrete = () => (F.retirada || !endereco() ? 0 : F.valor);
  window.npRetirada = () => F.retirada;
  window.npResetFrete = () => { Object.assign(F, { retirada: false, valor: 0, rural: false, manual: false, carregado: null }); F.seq++; if (montarNovoPedido()) pintar(); };
  window.npCarregarPedido = (order) => {
    montarNovoPedido();
    const tipo = String(order?.service_type || "").toLowerCase();
    Object.assign(F, { retirada: tipo === "retirada", rural: false, manual: true, carregado: tipo === "delivery" ? String(order.address || "").trim() : null, valor: Number(order?.taxa_entrega) || 0 });
    if ($("np-frete-valor")) $("np-frete-valor").value = F.valor;
    if ($("np-frete-info")) $("np-frete-info").textContent = F.valor ? "do pedido" : "";
    pintar();
  };
  const tentarNp = setInterval(() => { if (montarNovoPedido()) clearInterval(tentarNp); }, 500);
  setTimeout(() => clearInterval(tentarNp), 15000);

  /* =================== ESTILO =================== */
  const css = document.createElement("style");
  css.textContent = `
  .fr-bloco{margin-bottom:16px}
  .fr-modos{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:4px 0 14px}
  .fr-modo{display:grid;gap:3px;text-align:left;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:transparent;color:rgba(252,228,228,.85);font:inherit;cursor:pointer}
  .fr-modo b{font-size:14px;color:#fff}.fr-modo small{font-size:12px;color:rgba(252,228,228,.55)}
  .fr-modo.on{border-color:#ef4444;background:rgba(239,68,68,.12)}
  .fr-modo:focus-visible,#create-modal .np-mini:focus-visible{outline:2px solid #fca5a5;outline-offset:2px}
  .fr-campos{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
  .fr-campo{display:grid;gap:5px}
  .fr-campo span{font-size:12px;font-weight:700;color:rgba(252,228,228,.7)}
  .fr-campo small{font-size:11.5px;color:rgba(252,228,228,.45)}
  .fr-campo input,.fr-campo textarea{padding:9px 11px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.04);color:#fff;font:600 14px Manrope,sans-serif;outline:none}
  .fr-campo input{text-align:right}
  .fr-campo input:focus,.fr-campo textarea:focus{border-color:#ef4444}
  .fr-lista{margin-top:12px}.fr-lista textarea{resize:vertical;font-weight:500}
  .fr-exemplo{margin:10px 0 0;font-size:12.5px;color:rgba(252,228,228,.6)}
  .fr-exemplo:empty{display:none}
  .fr-alerta{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);color:#fcd34d;font-size:12.5px;line-height:1.45}
  .fr-rodape{display:flex;justify-content:flex-end;margin-top:14px}
  .ent-mapa.ent-mapa-trava{height:auto;display:flex;align-items:center;padding:14px 16px;font-size:13px;color:rgba(252,228,228,.75);background:rgba(255,255,255,.03)}
  .ent-mapa.ent-mapa-trava[hidden]{display:none}
  #create-modal .np-retirada{display:grid;gap:2px;padding:8px 0 10px;border-bottom:1px solid rgba(249,115,115,.4)}
  #create-modal .np-retirada[hidden]{display:none}
  #create-modal .np-retirada b{font-size:15px;color:#fff}
  #create-modal .np-retirada small{font-size:12.5px;color:rgba(252,228,228,.6)}
  #create-modal .np-frete{display:flex;align-items:center;gap:10px;padding:8px 0 4px}
  #create-modal .np-frete[hidden],#create-modal .np-limpar[hidden]{display:none}
  #create-modal .np-frete small{flex:1;font-size:12.5px;color:rgba(252,228,228,.6)}
  #create-modal .np-mini{padding:5px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:transparent;color:rgba(252,228,228,.75);font:inherit;font-size:12px;font-weight:700;cursor:pointer}
  #create-modal .np-mini.on{border-color:rgba(249,115,115,.9);background:rgba(239,68,68,.16);color:#fca5a5}
  #create-modal .np-frete-rs{font-size:13px;font-weight:700;color:rgba(252,228,228,.7)}
  #create-modal .np-frete .np-input{width:90px;text-align:right;font-weight:700}
  @media (max-width:560px){.fr-modos{grid-template-columns:1fr}}`;
  document.head.appendChild(css);
})();
