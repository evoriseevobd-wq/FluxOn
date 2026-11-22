/* mascaras.js — máscaras dos campos (igual em todos os apps do FluxON).
   É só o campo ter data-mask:
     "moeda" → estilo banco: digita 1 → 0,01 · 10 → 0,10 · 100 → 1,00 · 1000 → 10,00
     "tel"   → (11) 99999-9999      "data" → 31/12/2000
     "cpf"   → 000.000.000-00       "cep"  → 00000-000
   Vale pra campo criado depois também. Apagar e corrigir no meio do número funciona normal.
   Quem lê um campo de moeda recebe "1234,56" (sem ponto de milhar); se o campo era type="number", recebe "1234.56". */
(() => {
  if (window.__fxMascaras) return;
  window.__fxMascaras = true;
  const NAT = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const ler = (el) => NAT.get.call(el), por = (el, v) => NAT.set.call(el, v);
  const dig = (v) => String(v ?? "").replace(/\D/g, "");
  const MOLDES = { data: "##/##/####", cpf: "###.###.###-##", cep: "#####-###" };
  const molde = (tipo, d) => tipo === "tel" ? (d.length > 10 ? "(##) #####-####" : "(##) ####-####") : MOLDES[tipo];
  const limite = { tel: 11, data: 8, cpf: 11, cep: 8 };
  function encaixa(d, m) { let s = "", i = 0; for (const c of m) { if (i >= d.length) break; s += c === "#" ? d[i++] : c; } return s; }
  function limpaTel(d) { if (d.length > 11 && d.startsWith("55")) d = d.slice(2); return d; }
  function formata(tipo, v) { let d = dig(v); if (tipo === "tel") d = limpaTel(d); d = d.slice(0, limite[tipo]); return encaixa(d, molde(tipo, d)); }

  // moeda: centavos → "1.234,56"
  function moedaTela(c) { const s = String(c).padStart(3, "0"); return s.slice(0, -2).replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s.slice(-2); }
  // o que vem do código ("5", "5.5", "12,50", "1.234,56", 12.5) → centavos
  function centavos(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? Math.round(Math.abs(v) * 100) : null;
    let s = String(v).trim().replace(/[^\d.,]/g, ""); if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s); return Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  const moedaDeDigitos = (v) => { const d = dig(v).replace(/^0+/, "").slice(0, 11); return d ? moedaTela(d) : ""; };

  function preparar(el) {
    if (el.__fx || !(el instanceof HTMLInputElement)) return;
    const tipo = el.dataset.mask;
    if (tipo !== "moeda" && !limite[tipo]) return;
    el.__fx = true;
    const eraNumero = el.type === "number";
    if (eraNumero) el.type = "text";
    el.inputMode = "numeric";
    el.autocomplete = el.autocomplete || "off";
    if (tipo === "moeda") {
      const c = centavos(ler(el)); por(el, c === null ? "" : moedaTela(c));
      if (!el.placeholder || /^\s*\d/.test(el.placeholder)) el.placeholder = "0,00";
      Object.defineProperty(el, "value", { configurable: true,
        get() { const t = ler(el); if (!t) return ""; const s = t.replace(/\./g, ""); return eraNumero ? s.replace(",", ".") : s; },
        set(v) { const c = centavos(v); por(el, c === null ? "" : moedaTela(c)); } });
    } else {
      por(el, formata(tipo, ler(el)));
      Object.defineProperty(el, "value", { configurable: true, get() { return ler(el); }, set(v) { por(el, formata(tipo, v)); } });
    }
    el.__fxAnt = dig(ler(el));
  }
  function varrer(raiz) {
    if (raiz.matches?.("input[data-mask]")) preparar(raiz);
    raiz.querySelectorAll?.("input[data-mask]").forEach(preparar);
  }

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (!el?.dataset?.mask) return;
    preparar(el);
    const tipo = el.dataset.mask, bruto = ler(el);
    if (tipo === "moeda") {
      por(el, moedaDeDigitos(bruto));
      const fim = ler(el).length; try { el.setSelectionRange(fim, fim); } catch {}
      el.__fxAnt = dig(ler(el)); return;
    }
    let d = dig(bruto), antes = dig(bruto.slice(0, el.selectionStart ?? bruto.length)).length;
    // apagou só um traço/parêntese: apaga o número do lado (senão não sai do lugar)
    if (String(e.inputType || "").startsWith("delete") && d === el.__fxAnt) {
      if (e.inputType === "deleteContentBackward" && antes > 0) { d = d.slice(0, antes - 1) + d.slice(antes); antes--; }
      else if (e.inputType === "deleteContentForward") d = d.slice(0, antes) + d.slice(antes + 1);
    }
    if (tipo === "tel") { const l = limpaTel(d); if (l !== d) { antes = Math.max(0, antes - (d.length - l.length)); d = l; } }
    d = d.slice(0, limite[tipo]);
    const s = encaixa(d, molde(tipo, d));
    por(el, s);
    let pos = 0, n = 0;
    if (antes > 0) { pos = s.length; for (let i = 0; i < s.length; i++) if (/\d/.test(s[i]) && ++n === antes) { pos = i + 1; break; } }
    try { el.setSelectionRange(pos, pos); } catch {}
    el.__fxAnt = d;
  }, true);
  // moeda: o cursor fica sempre no fim (igual app de banco)
  const proFim = (e) => { const el = e.target; if (el?.dataset?.mask === "moeda") requestAnimationFrame(() => { const f = ler(el).length; try { el.setSelectionRange(f, f); } catch {} }); };
  document.addEventListener("focusin", proFim, true);
  document.addEventListener("click", proFim, true);

  varrer(document);
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach((n) => n.nodeType === 1 && varrer(n)); })
    .observe(document.documentElement, { childList: true, subtree: true });
})();
