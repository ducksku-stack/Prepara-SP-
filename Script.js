(() => {
  window.preparaSP?.parar?.();

  const CONFIG = {
    servidor: "http://localhost:8765/solve",
    timeout: 65000,
    confiancaMinima: 70,
    intervalo: 250,
    tentativasFeedback: 80, // ~20s aguardando botão de avançar/finalizar
    tentativasTransicao: 80, // ~20s aguardando nova questão
    debounce: 450,
    maxCache: 200,
    persistirLocalStorage: true,
    avancarAutomaticamente: true,
    finalizarAutomaticamente: true,
    iniciarProximaAtividade: true,
    intervaloEntreAtividades: 1600
  };

  const STORAGE_KEY = "__prepara_sp_estado_v2__";

  const log = (...a) => console.log("[Prepara SP]", ...a);
  const warn = (...a) => console.warn("[Prepara SP]", ...a);
  const err = (...a) => console.error("[Prepara SP]", ...a);

  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const norm = t => (t || "").replace(/\s+/g, " ").trim();

  function carregarEstadoPersistido() {
    if (!CONFIG.persistirLocalStorage) return { cache: [], ultimaAssinatura: "" };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { cache: [], ultimaAssinatura: "" };
      const parsed = JSON.parse(raw);
      return {
        cache: Array.isArray(parsed.cache) ? parsed.cache : [],
        ultimaAssinatura: typeof parsed.ultimaAssinatura === "string" ? parsed.ultimaAssinatura : ""
      };
    } catch {
      return { cache: [], ultimaAssinatura: "" };
    }
  }

  const persistido = carregarEstadoPersistido();

  const estado = {
    ativo: true,
    executando: false,
    avancando: false,
    navegando: false,
    ultimaAssinatura: persistido.ultimaAssinatura,
    assinaturaEmAndamento: "",
    cacheRespostas: new Map(persistido.cache),
    observer: null,
    timer: null,
    tentativasSemAtividade: 0
  };

  function salvarEstadoPersistido() {
    if (!CONFIG.persistirLocalStorage) return;
    try {
      const payload = {
        ultimaAssinatura: estado.ultimaAssinatura,
        cache: [...estado.cacheRespostas.entries()].slice(-CONFIG.maxCache)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignora caso localStorage esteja bloqueado ou cheio
    }
  }

  const ocupado = () =>
    !estado.ativo || estado.executando || estado.avancando || estado.navegando;

  const visivel = el => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  };

  const habilitado = el => {
    if (!el) return false;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    const s = getComputedStyle(el);
    return s.pointerEvents !== "none";
  };

  function dispararEventosClique(alvo) {
    if (!alvo || !visivel(alvo) || !habilitado(alvo)) return false;

    alvo.scrollIntoView({
      block: "center",
      behavior: "instant"
    });

    const rect = alvo.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    for (const tipo of ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup"]) {
      const Ctor = tipo.startsWith("pointer") ? PointerEvent : MouseEvent;
      alvo.dispatchEvent(
        new Ctor(tipo, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX,
          clientY,
          button: 0
        })
      );
    }

    alvo.click();
    return true;
  }

  const clicarReal = el => {
    if (!el || !visivel(el) || !habilitado(el)) return false;

    // Se o elemento já for interativo, clica direto; senão tenta interno clicável ou o próprio elemento
    const tag = el.tagName;
    if (tag === "BUTTON" || tag === "A" || el.getAttribute("role") === "button") {
      return dispararEventosClique(el);
    }

    const interno = el.querySelector('button:not([disabled]), [role="button"], label, input[type="radio"], input[type="checkbox"]');
    if (interno && visivel(interno) && habilitado(interno)) {
      if (dispararEventosClique(interno)) return true;
    }

    return dispararEventosClique(el);
  };

  const botoes = () =>
    [...document.querySelectorAll(
      'button[data-slot="button"], a[data-slot="button"], [role="button"], button, a'
    )].filter(el => visivel(el) && habilitado(el));

  const localizarBotao = texto => {
    const alvo = norm(texto).toLowerCase();
    return botoes().find(el => norm(el.innerText || el.textContent).toLowerCase() === alvo);
  };

  const localizarBotaoConfirmar = () => {
    const candidatos = ["responder", "confirmar", "verificar", "enviar resposta", "enviar"];
    return botoes().find(el => candidatos.includes(norm(el.innerText || el.textContent).toLowerCase()));
  };

  const obterLinhasCard = el =>
    (el.innerText || "")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

  function ehCardAlternativa(el) {
    const linhas = obterLinhasCard(el);
    const temLetraInicial = linhas.length >= 2 && /^[A-E]$/i.test(linhas[0]);
    const temCursor = String(el.className || "").includes("cursor-pointer");
    return temLetraInicial || temCursor;
  }

  function separarCards() {
    const todos = [...document.querySelectorAll('[data-slot="card"]')].filter(visivel);
    const alts = todos.filter(ehCardAlternativa).slice(0, 5);
    const outros = todos.filter(el => !alts.includes(el));
    return { alts, outros };
  }

  function limparTextoAlternativa(el) {
    const linhas = obterLinhasCard(el);
    if (!linhas.length) return "";

    let inicio = 0;
    let fim = linhas.length;

    if (/^[A-E]$/i.test(linhas[0])) inicio = 1;
    if (fim - inicio > 1 && /^[1-5]$/.test(linhas[fim - 1])) {
      fim--;
    }

    return norm(linhas.slice(inicio, fim).join(" ")) || norm(el.innerText);
  }

  function capturar() {
    const { alts, outros } = separarCards();
    if (alts.length < 2) return null;

    const textosAlts = alts.map(limparTextoAlternativa);
    if (textosAlts.some(t => !t)) return null;

    const textosCardsExtras = outros
      .map(el => norm(el.innerText))
      .filter(Boolean);

    const blocosFora = [
      ...document.body.querySelectorAll("p, h1, h2, h3, h4, li, blockquote")
    ]
      .filter(el =>
        visivel(el) &&
        !alts.some(a => a.contains(el) || el.contains(a)) &&
        !outros.some(o => o.contains(el) || el.contains(o)) &&
        !el.closest("button, a, nav, header, footer")
      )
      .map(el => norm(el.innerText))
      .filter(t =>
        t.length > 5 &&
        !/^(alternativas|continuar|finalizar|pular|anterior|próxima|responder|confirmar|verificar)$/i.test(t)
      );

    const enunciado = [...new Set([...textosCardsExtras, ...blocosFora])].join("\n");
    if (!enunciado) return null;

    const letras = ["A", "B", "C", "D", "E"];
    const opcoes = textosAlts.map((t, i) => `${letras[i]}) ${t}`);
    const pergunta = `ENUNCIADO:\n${enunciado}\n\nALTERNATIVAS:\n${opcoes.join("\n")}`;

    return {
      enunciado,
      alternativas: textosAlts,
      pergunta,
      assinatura: pergunta.toLowerCase()
    };
  }

  function salvarCache(chave, valor) {
    if (estado.cacheRespostas.has(chave)) {
      estado.cacheRespostas.delete(chave);
    } else if (estado.cacheRespostas.size >= CONFIG.maxCache) {
      const maisAntiga = estado.cacheRespostas.keys().next().value;
      estado.cacheRespostas.delete(maisAntiga);
    }
    estado.cacheRespostas.set(chave, valor);
    salvarEstadoPersistido();
  }

  async function consultarIA(q) {
    if (estado.cacheRespostas.has(q.assinatura)) {
      log("Usando resposta em cache.");
      const cached = estado.cacheRespostas.get(q.assinatura);
      salvarCache(q.assinatura, cached);
      return cached;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.timeout);

    try {
      const res = await fetch(CONFIG.servidor, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.pergunta }),
        signal: ctrl.signal
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const dados = await res.json();
      if (!dados || !dados.success) {
        throw new Error(dados?.error || "Falha na IA");
      }

      if (/^[A-E]$/i.test(String(dados.letter || "").trim())) {
        salvarCache(q.assinatura, dados);
      }

      return dados;
    } finally {
      clearTimeout(timer);
    }
  }

  function selecionarAlternativa(letra) {
    const alvo = letra.toUpperCase();
    const { alts } = separarCards();

    const porLetra = alts.find(el => {
      const linhas = obterLinhasCard(el);
      return linhas.length > 0 && linhas[0].toUpperCase() === alvo;
    });
    if (porLetra && clicarReal(porLetra)) return true;

    const idx = alvo.charCodeAt(0) - 65;
    if (idx >= 0 && idx < alts.length) {
      return clicarReal(alts[idx]);
    }

    return false;
  }

  async function aguardarFeedback() {
    let clicouConfirmar = false;

    for (let i = 0; i < CONFIG.tentativasFeedback; i++) {
      if (!estado.ativo) return false;

      const btnAvancar = localizarBotao("Continuar") || localizarBotao("Finalizar");
      if (btnAvancar && habilitado(btnAvancar)) return true;

      if (!clicouConfirmar) {
        const btnConfirmar = localizarBotaoConfirmar();
        if (btnConfirmar && habilitado(btnConfirmar)) {
          log("Confirmando resposta...");
          clicarReal(btnConfirmar);
          clicouConfirmar = true;
          await esperar(300);
          continue;
        }
      }

      await esperar(CONFIG.intervalo);
    }

    return false;
  }

  function estaNoCurso() {
    if (capturar()) return false;
    const temBotaoContinuarOuFinalizar = Boolean(localizarBotao("Continuar") || localizarBotao("Finalizar"));
    if (temBotaoContinuarOuFinalizar) return false;

    const texto = document.body.innerText || "";
    return /UNIDADE\s+\d+/i.test(texto);
  }

  function encontrarAtividadeDisponivel() {
    return [...document.querySelectorAll('button[aria-label^="Iniciar:"]')].find(
      el => visivel(el) && habilitado(el)
    );
  }

  function encontrarUnidadeFechada() {
    return [...document.querySelectorAll('button[aria-expanded="false"]')].find(
      el => visivel(el) && habilitado(el) && /UNIDADE\s+\d+/i.test(el.innerText || "")
    );
  }

  async function orquestrarCurso() {
    if (!CONFIG.iniciarProximaAtividade || ocupado()) return;

    estado.navegando = true;

    try {
      const irAtividades = localizarBotao("Ir para atividades");
      if (irAtividades) {
        log("Entrando nos exercícios...");
        clicarReal(irAtividades);
        estado.ultimaAssinatura = "";
        estado.tentativasSemAtividade = 0;
        salvarEstadoPersistido();
        await esperar(1100);
        return;
      }

      const atividade = encontrarAtividadeDisponivel();
      if (atividade) {
        const nome = atividade.getAttribute("aria-label") || "Atividade";
        log("Iniciando:", nome);
        clicarReal(atividade);
        estado.ultimaAssinatura = "";
        estado.tentativasSemAtividade = 0;
        salvarEstadoPersistido();
        await esperar(1100);
        return;
      }

      if (estaNoCurso()) {
        const unidade = encontrarUnidadeFechada();
        if (unidade) {
          log("Expandindo unidade:", norm(unidade.innerText));
          clicarReal(unidade);
          await esperar(900);
          return;
        }

        estado.tentativasSemAtividade++;
        if (estado.tentativasSemAtividade < 12) {
          log("Procurando outras atividades...");
          await esperar(1400);
        } else {
          warn("Nenhuma atividade disponível encontrada.");
          warn("A automação foi pausada para evitar cliques indevidos.");
          estado.ativo = false;
        }
      }
    } catch (e) {
      err("Erro na navegação:", e?.message || e);
    } finally {
      estado.navegando = false;
    }
  }

  async function finalizarAtividade() {
    if (!CONFIG.finalizarAutomaticamente || !estado.ativo) return false;

    const finalizar = localizarBotao("Finalizar");
    if (!finalizar) return false;

    log("Finalizando atividade...");
    clicarReal(finalizar);

    for (let i = 0; i < 80; i++) {
      if (!estado.ativo) return false;
      await esperar(450);

      const continuar = [
        ...document.querySelectorAll('a[data-slot="button"], button[data-slot="button"], a, button')
      ].find(el =>
        visivel(el) &&
        habilitado(el) &&
        norm(el.innerText || el.textContent).toLowerCase() === "continuar" &&
        (
          (el.getAttribute("href") || "").includes("/cursos/") ||
          (el.getAttribute("href") || "").includes("/courses/") ||
          el.tagName === "A"
        )
      );

      if (continuar) {
        log("Resultado concluído. Voltando ao curso...");
        clicarReal(continuar);
        estado.ultimaAssinatura = "";
        estado.tentativasSemAtividade = 0;
        salvarEstadoPersistido();
        await esperar(CONFIG.intervaloEntreAtividades);
        return true;
      }
    }

    warn("Não encontrei o botão de retorno ao curso.");
    return false;
  }

  async function avancar(assinaturaAnterior) {
    if (!CONFIG.avancarAutomaticamente || estado.avancando || !estado.ativo) return;

    estado.avancando = true;

    try {
      const continuar = localizarBotao("Continuar");

      if (continuar && continuar.tagName !== "A") {
        log("Avançando questão...");
        clicarReal(continuar);

        for (let i = 0; i < CONFIG.tentativasTransicao; i++) {
          if (!estado.ativo) return;
          await esperar(CONFIG.intervalo);

          const finAgora = localizarBotao("Finalizar");
          if (finAgora) break;

          const nova = capturar();
          if (nova && nova.assinatura !== assinaturaAnterior) {
            return;
          }
        }
      }

      await finalizarAtividade();
    } finally {
      estado.avancando = false;
    }
  }

  async function processar() {
    if (ocupado()) return;

    const q = capturar();

    if (!q) {
      await orquestrarCurso();
      if (estado.ativo && !ocupado()) agendar(250);
      return;
    }

    if (
      q.assinatura === estado.ultimaAssinatura ||
      q.assinatura === estado.assinaturaEmAndamento
    ) {
      return;
    }

    estado.executando = true;
    estado.assinaturaEmAndamento = q.assinatura;
    estado.tentativasSemAtividade = 0;

    try {
      log("Questão capturada.");
      log("Consultando IA...");

      const dados = await consultarIA(q);
      const letra = String(dados.letter || "").toUpperCase();
      const conf = Number(dados.confidence);

      if (!/^[A-E]$/.test(letra)) {
        throw new Error("Letra inválida.");
      }

      if (!Number.isFinite(conf) || conf < CONFIG.confiancaMinima) {
        warn("Confiança abaixo do mínimo:", conf);
        return;
      }

      log(`Resposta: ${letra} | Confiança informada: ${conf}%`);

      if (!selecionarAlternativa(letra)) {
        throw new Error("Falha ao clicar na alternativa.");
      }

      if (!(await aguardarFeedback())) {
        warn("Feedback não detectado.");
        return;
      }

      estado.ultimaAssinatura = q.assinatura;
      salvarEstadoPersistido();

      await esperar(400);
      await avancar(q.assinatura);
    } catch (e) {
      err("Erro:", e?.message || e);
      await esperar(2000);
    } finally {
      estado.assinaturaEmAndamento = "";
      estado.executando = false;
      if (estado.ativo) agendar(250);
    }
  }

  function agendar(atraso = CONFIG.debounce) {
    if (ocupado() || estado.timer) return;

    estado.timer = setTimeout(() => {
      estado.timer = null;
      processar();
    }, atraso);
  }

  function iniciar() {
    if (estado.observer) {
      estado.observer.disconnect();
    }

    clearTimeout(estado.timer);
    estado.timer = null;
    estado.ativo = true;
    estado.executando = false;
    estado.avancando = false;
    estado.navegando = false;
    estado.assinaturaEmAndamento = "";

    estado.observer = new MutationObserver(() => {
      if (!ocupado()) {
        agendar();
      }
    });

    estado.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    agendar(100);
    log("Automação completa iniciada.");
    log("Aguardando questões ou próxima atividade...");
  }

  window.preparaSP = {
    capturar,
    processar,
    iniciar,
    parar: () => {
      estado.ativo = false;
      clearTimeout(estado.timer);
      estado.timer = null;
      estado.observer?.disconnect();
      estado.executando = false;
      estado.avancando = false;
      estado.navegando = false;
      estado.assinaturaEmAndamento = "";
      log("Automação parada.");
    },
    continuar: () => {
      estado.ativo = true;
      iniciar();
      log("Automação retomada.");
    },
    limparCache: () => {
      estado.cacheRespostas.clear();
      estado.ultimaAssinatura = "";
      estado.assinaturaEmAndamento = "";
      salvarEstadoPersistido();
      log("Cache limpo.");
    },
    setConfig: novas => {
      Object.assign(CONFIG, novas);
      log("Configuração atualizada:", { ...CONFIG });
    },
    status: () => ({
      ativo: estado.ativo,
      executando: estado.executando,
      avancando: estado.avancando,
      navegando: estado.navegando,
      cacheTamanho: estado.cacheRespostas.size,
      ultimaAssinatura: estado.ultimaAssinatura,
      config: { ...CONFIG }
    })
  };

  iniciar();
})();
