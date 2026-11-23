markdown
#  Prepara SP - Automação com IA (Motor FreeGPT)

Script de automação para a área de **Estudar** da plataforma Prepara SP. Ele funciona criando um servidor local em Python no seu celular (via Termux) que se comunica com uma inteligência artificial para analisar e responder as questões automaticamente no navegador.

---

> ⚠️ **AVISO IMPORTANTE & ISENÇÃO DE RESPONSABILIDADE**
> 
> Este projeto foi desenvolvido exclusivamente para **fins educacionais e de estudo** sobre automação e integração de APIs. **Use por sua conta e risco.**
> 
> * **Riscos Acadêmicos:** O uso de ferramentas de automação viola os termos de uso da plataforma Prepara SP. O autor **não se responsabiliza** por bloqueios de conta, anulação de atividades, notas zeradas ou advertências escolares.
> * **Precisão da IA:** O motor utiliza uma API gratuita de terceiros. A IA pode errar cálculos ou interpretações — **não há garantia de 100% de acerto**.
> * **Instabilidade:** Como o código depende de servidores externos gratuitos, ele pode parar de funcionar a qualquer momento sem aviso prévio.
> * **Segurança:** Nunca cole códigos no console do seu navegador sem saber o que eles fazem.
> 
> **Ninguém é obrigado a utilizar este repositório.** Ao baixar ou executar estes arquivos, você assume total responsabilidade pelos seus próprios atos.

---

##  Passo 1: Baixar e Preparar o Termux (No Celular)

> **Atenção:** **NÃO** baixe o Termux pela Google Play Store (a versão de lá está desatualizada e dá erro).

1. Baixe e instale o Termux oficial através do site do **F-Droid**: [Clique aqui para baixar o Termux](https://f-droid.org) (ou procure por "Termux F-Droid" no Google).
2. Abra o aplicativo do **Termux**.
3. Copie e cole os comandos abaixo **um por um** (aperte `Enter` depois de cada comando). Se aparecer alguma pergunta com `[Y/n]`, digite `y` e aperte `Enter`:

**Atualizar os pacotes do Termux:**
```bash
pkg update && pkg upgrade -y
```

**Instalar o Python e o Git:**
```bash
pkg install python git -y
```

---

##  Passo 2: Baixar o Projeto e Ligar o Servidor

Ainda dentro do Termux, execute os comandos abaixo para baixar este repositório e iniciar o motor em Python:

**1. Baixar os arquivos do GitHub:**
```bash
git clone https://github.com
```

**2. Entrar na pasta do projeto:**
```bash
cd Prepara-SP-
```

**3. Iniciar o servidor da IA:**
```bash
python main.py
```
*(Nota: Se o seu arquivo Python tiver outro nome, troque `main.py` pelo nome exato do arquivo).*

 **Pronto!** Se aparecer a mensagem `PREPARASP - MOTOR FREEGPT PY | Servidor: 127.0.0.1:8765`, o servidor está rodando. **Não feche o Termux** (deixe ele aberto em segundo plano ou em tela dividida).

---

##  Passo 3: Rodar o Script no Navegador

Para colar o código no console pelo celular, você precisa de um navegador que tenha suporte a **DevTools / Console** (como o **Lemur Browser**, **Kiwi Browser** ou **Mises Browser**).

1. Abra o navegador escolhido e faça login normalmente no **[Prepara SP](https://jovensgenios.com)**.
2. Entre na aba **Estudar** e abra uma atividade/questão.
3. Abra o menu do navegador (os 3 pontinhos) e clique em **Ferramentas do Desenvolvedor (DevTools)**.
4. Vá até a aba **Console**.
5. Copie todo o código do arquivo `.js` aqui deste repositório.
6. Cole no **Console** do navegador e aperte `Enter`.

---

##  Erros Comuns (Leia antes de perguntar)

* **Erro de conexão / `Failed to fetch`:** O servidor no Termux fechou ou o Android suspendeu o app em segundo plano. Volte no Termux, veja se o Python ainda está rodando e desative a "Otimização de Bateria" para o aplicativo Termux nas configurações do seu celular.
* **Console bloqueando colar código:** Se o navegador pedir para digitar algo antes de colar (ex: *"allow pasting"*), apenas digite `allow pasting`, aperte `Enter`, e tente colar o script novamente.
* **IA demorando ou dando erro 500:** A
