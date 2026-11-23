#!/usr/bin/env python3
"""Prepara SP - Motor FreeGPT (Python, só biblioteca padrão)."""

import json
import re
import sys
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORTA = 8765
MAX_CLIENTES = 16
FREEGPT_URL = "https://freegpt-gg.vercel.app/api/chat/stream"
ORIGEM = "https://preparasp.jovensgenios.com"

limite = threading.BoundedSemaphore(MAX_CLIENTES)

PROMPT_INICIO = """
Você é um especialista em resolução de questões escolares
da plataforma Prepara SP.

Sua tarefa é analisar cuidadosamente a questão e identificar
a alternativa correta.

REGRAS OBRIGATÓRIAS:

1. Leia o enunciado inteiro antes de responder.
2. Analise todas as alternativas disponíveis.
   Não escolha a primeira alternativa que pareça correta.
3. Compare cada alternativa com o que o enunciado realmente pede.
4. Verifique conceitos, datas, cálculos, relações de causa e
   consequência, interpretação textual e contexto histórico
   quando forem relevantes.
5. Elimine alternativas incorretas antes de escolher.
6. Não invente informações que não estejam sustentadas
   pelo conhecimento necessário para resolver a questão.
7. Se houver uma pegadinha, negação ou palavra como
   "INCORRETA", "EXCETO", "NÃO" ou "FALSA", dê atenção especial.
8. Em questões de matemática, faça os cálculos antes de escolher.
9. Em questões de ordenação, identifique a relação cronológica,
   lógica ou causal entre os elementos.
10. Em questões de interpretação, priorize o que o texto
    efetivamente afirma, não o que poderia ser verdade fora dele.
11. Não confunda alternativas semelhantes. Compare os detalhes.
12. Não invente letras ou alternativas que não estejam presentes.
13. Se não houver informação suficiente para decidir com
    segurança, reduza a confiança.
14. Responda com uma única alternativa final.

FORMATO OBRIGATÓRIO:

RESPOSTA: A
CONFIANÇA: 95
JUSTIFICATIVA: explicação curta da escolha.

A letra deve corresponder a uma alternativa realmente apresentada.
A confiança deve ser um número inteiro entre 0 e 100.

Não coloque outra resposta final em nenhum lugar.

QUESTÃO PARA ANALISAR:
"""

PROMPT_FIM = """

Agora analise a questão e confira todas as alternativas
antes de produzir o formato obrigatório.
"""


def montar_prompt(questao: str) -> str:
    return f"{PROMPT_INICIO}\n\n{questao}{PROMPT_FIM}"


def interpretar_sse(fluxo: str) -> str:
    resposta = []
    for linha in fluxo.splitlines():
        if not linha.startswith("data:"):
            continue
        conteudo = linha[5:].strip()
        if not conteudo:
            continue
        if conteudo == "[DONE]":
            break
        try:
            evento = json.loads(conteudo)
        except ValueError as erro:
            print(f"[SSE] Evento ignorado: {erro}", file=sys.stderr)
            continue
        if isinstance(evento, dict) and isinstance(evento.get("content"), str):
            resposta.append(evento["content"])
    return "".join(resposta).strip()


def chamar_freegpt(pergunta: str) -> str:
    corpo = json.dumps(
        {"messages": [{"role": "user", "content": pergunta}]}
    ).encode("utf-8")

    req = urllib.request.Request(
        FREEGPT_URL,
        data=corpo,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "Origin": "https://freegpt-gg.vercel.app",
            "Referer": "https://freegpt-gg.vercel.app/",
            "User-Agent": "Mozilla/5.0",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            dados = r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"FreeGPT HTTP {erro.code}: {detalhe}")
    except urllib.error.URLError as erro:
        raise RuntimeError(f"Erro de rede: {erro.reason}")

    resposta = interpretar_sse(dados)
    if not resposta:
        raise RuntimeError("FreeGPT retornou resposta vazia.")
    return resposta


RE_RESPOSTA = re.compile(r"RESPOSTA\s*[:\-]\s*\**\s*([A-E])\b", re.IGNORECASE)
# Fallback: só letra MAIÚSCULA isolada (evita "alternativa e" / "opção a").
RE_ALTERNATIVA = re.compile(
    r"(?:[Aa]lternativa|[Oo]pção)\s+(?:correta\s*(?:é|:)?\s*)?([A-E])\b"
)
RE_CONFIANCA = re.compile(r"CONFIAN[CÇ]A\s*[:\-]\s*(\d{1,3})", re.IGNORECASE)
RE_JUSTIFICATIVA = re.compile(r"JUSTIFICATIVA\s*[:\-]\s*(.*)", re.IGNORECASE | re.DOTALL)


def processar_resposta_ia(original: str) -> dict:
    resposta = original.strip()
    letra = "X"
    confianca = 0

    m = RE_RESPOSTA.search(resposta) or RE_ALTERNATIVA.search(resposta)
    if m:
        letra = m.group(1).upper()

    m = RE_CONFIANCA.search(resposta)
    if m:
        confianca = int(m.group(1))
    confianca = max(0, min(100, confianca))
    if letra == "X":
        confianca = 0

    m = RE_JUSTIFICATIVA.search(resposta)
    justificativa = m.group(1).strip() if m else resposta

    return {
        "answer": f"RESPOSTA: {letra}\nCONFIANÇA: {confianca}\nJUSTIFICATIVA: {justificativa}",
        "letter": letra,
        "confidence": confianca,
        "success": letra != "X",
        "raw": resposta,
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def enviar_json(self, dados: dict, status: int = 200):
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", ORIGEM)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Vary", "Origin")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(corpo)
        except (BrokenPipeError, ConnectionResetError):
            pass
        self.close_connection = True

    def do_OPTIONS(self):
        self.enviar_json({"success": True})

    def do_GET(self):
        if self.path == "/health":
            self.enviar_json(
                {"success": True, "status": "online", "motor": "FreeGPT", "porta": PORTA}
            )
        else:
            self.enviar_json({"success": False, "error": "Rota desconhecida"}, 404)

    def do_POST(self):
        if self.path != "/solve":
            return self.enviar_json({"success": False, "error": "Rota desconhecida"}, 404)

        if not limite.acquire(blocking=False):
            return self.enviar_json({"success": False, "error": "Servidor ocupado"}, 503)

        try:
            try:
                tamanho = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                tamanho = 0
            if tamanho <= 0 or tamanho > 1024 * 1024:
                return self.enviar_json(
                    {"success": False, "error": "Corpo inválido ou grande demais"}, 400
                )

            try:
                entrada = json.loads(self.rfile.read(tamanho).decode("utf-8"))
            except ValueError:
                return self.enviar_json({"success": False, "error": "JSON inválido"}, 400)

            pergunta = entrada.get("question", "") if isinstance(entrada, dict) else ""
            if not isinstance(pergunta, str) or not pergunta.strip():
                return self.enviar_json({"success": False, "error": "Questão vazia"}, 400)

            print("\n[Motor] Questão recebida.")
            resultado = processar_resposta_ia(chamar_freegpt(montar_prompt(pergunta)))

            self.enviar_json(
                {
                    "success": resultado["success"],
                    "answer": resultado["answer"],
                    "letter": resultado["letter"],
                    "confidence": resultado["confidence"],
                    "motor": "FreeGPT",
                }
            )
            print(f"[Motor] Resposta: {resultado['letter']} | Confiança: {resultado['confidence']}%")

        except Exception as erro:
            print(f"[Servidor] {erro}", file=sys.stderr)
            self.enviar_json({"success": False, "error": str(erro)}, 500)
        finally:
            limite.release()


def main():
    servidor = ThreadingHTTPServer(("127.0.0.1", PORTA), Handler)
    servidor.daemon_threads = True
    print(
        "\n=================================\n"
        " PREPARA SP - MOTOR FREEGPT PY\n"
        f" Servidor: 127.0.0.1:{PORTA}\n"
        "=================================\n"
    )
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
  
