# Bart do Corte

Sistema da barbearia Bart do Corte, em Campo Grande, Rio de Janeiro.

O projeto reúne a área pública de apresentação e agendamento, a agenda do
cliente, a visão dos barbeiros e o painel do proprietário. Os dados ficam no
Cloudflare D1, então o agendamento feito no celular do cliente aparece na
agenda do barbeiro em qualquer aparelho.

## Funcionalidades

- landing page responsiva para celular e desktop;
- galeria de referências de cortes;
- fluxo de agendamento por serviço, barbeiro, data e horário;
- área do cliente com próximos horários;
- agenda individual dos barbeiros, com bloqueio de horário por período;
- aviso no WhatsApp da equipe a cada agendamento e cancelamento;
- foto do barbeiro, enviada por ele e exibida na tela de Equipe;
- painel do proprietário com faturamento, ocupação e desempenho da equipe;
- envio do horário para o calendário do celular, com lembrete 1 hora antes;
- painel de acessos: criar, redefinir e desativar contas, e derrubar aparelhos;
- horários de funcionamento, localização e Instagram.

## Acesso e segurança

- **Cliente**: informa nome e telefone, sem senha. É uma identificação, não
  uma autenticação: quem souber o telefone de outra pessoa consegue ver e
  cancelar os horários dela. Foi uma escolha da barbearia, para não colocar
  atrito antes do agendamento.
- **Barbeiro e proprietário**: usuário e senha, guardada como hash PBKDF2.
- A sessão vive num cookie `HttpOnly`, que o JavaScript da página não lê nem
  forja. O banco guarda apenas o hash do token.
- **O login não expira.** Quem entra continua conectado, inclusive depois de
  fechar o navegador. Só saem quem usar o botão Sair, quem limpar os dados do
  site no navegador, e quem tiver o acesso encerrado pelo proprietário em
  **Acessos**.
- Cada consulta é recortada no servidor: o barbeiro recebe só a própria agenda
  e o cliente só os próprios horários.

### Primeiro acesso

Não existe senha padrão no código. Na primeira visita a `/barbearia`, o
sistema pede a criação do acesso do proprietário. Depois disso essa tela nunca
mais aparece.

O proprietário cria os acessos dos barbeiros em **Acessos**. Cada um recebe uma
senha provisória exibida uma única vez, e é obrigado a trocá-la no primeiro
login.

## Portais

| Caminho | Quem usa |
| --- | --- |
| `/` | cliente |
| `/barbeiro` | barbeiros |
| `/barbearia` | proprietário |

## Desenvolvimento

Requer Node.js 22.13 ou superior.

```bash
npm install
```

Aplique as migrações no banco local antes de subir o servidor pela primeira
vez:

```bash
npm run db:migrate:local
```

```bash
npm run dev
```

## Banco de dados

O schema fica em `db/schema.ts` (Drizzle) e as migrações em `drizzle/`.

Depois de mexer no schema, gere a migração:

```bash
npm run db:generate
```

Para aplicar no banco de produção:

```bash
npm run db:migrate
```

O catálogo, a equipe e o expediente são criados sozinhos na primeira
requisição. Junto vêm cinco agendamentos de demonstração, que o proprietário
remove em **Gestão › Dados de demonstração** quando a barbearia entrar em
operação.

## Foto do barbeiro

Cada barbeiro envia a própria foto em **Perfil › Sua foto**. Ela aparece para o
cliente na tela **Equipe** e na hora de escolher com quem cortar. Quem ainda
não enviou aparece com a inicial do nome.

A imagem é recortada no quadrado central, reduzida para 400×400 e comprimida no
próprio navegador antes de subir — uma foto de 4 MB da câmera vira cerca de
40 KB. Fica guardada no D1 junto com o cadastro do barbeiro, o que evita
configurar armazenamento de arquivos para meia dúzia de imagens. Se um dia
entrarem fotos de clientes ou galeria por barbeiro, aí vale migrar para o R2.

O barbeiro só altera o próprio cadastro; ativar ou desativar alguém continua
sendo do proprietário.

## Calendário do celular

Ao confirmar o horário, o cliente recebe o botão **Adicionar ao calendário**,
que baixa um arquivo `.ics`. iPhone e Android abrem esse formato direto no app
de calendário. O evento leva o serviço, o barbeiro, o endereço da barbearia e
um alarme 1 hora antes — é o lembrete de horário sem depender de WhatsApp.

## Bloqueio de horário

Na **Agenda**, o barbeiro informa o período em que não estará na barbearia —
"das 14h às 16h" — e o sistema tira esses horários do agendamento. É para o
almoço, o compromisso da tarde ou a saída de última hora.

O período é guardado em faixas de 30 minutos, a mesma grade do agendamento.
Um serviço longo que comece livre mas invada o bloqueio também é recusado: um
combo de 1 hora às 13h30 não passa se o bloqueio começa às 14h.

Os períodos bloqueados do dia aparecem listados abaixo do formulário, e cada um
pode ser liberado com um toque.

## Avisos no WhatsApp

A cada agendamento — e a cada cancelamento — o barbeiro do horário recebe uma
mensagem no WhatsApp. O proprietário pode receber os avisos de toda a equipe
ligando a opção em **Gestão › Avisos de agendamento**.

Os números ficam no cadastro: o de cada barbeiro em **Gestão › Barbeiros ›
Editar**, o do proprietário na própria seção de avisos. O telefone da equipe
nunca sai para o cliente — o servidor limpa o campo antes de responder.

### Configuração

O envio usa a API oficial da Meta (WhatsApp Cloud API) e fica desligado
enquanto as credenciais não existirem — o sistema funciona normalmente sem
elas, apenas sem mandar aviso.

```bash
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put WHATSAPP_PHONE_ID
```

Para desenvolvimento local, os mesmos nomes vão em `.dev.vars`, que não é
versionado. A versão da Graph API pode ser trocada com `WHATSAPP_API_VERSION`.

São necessários dois modelos aprovados na Meta, categoria **Utilidade**, em
português: `novo_agendamento` (5 variáveis) e `agendamento_cancelado`
(4 variáveis).

### Quando falha

O envio é aguardado, com timeout de 5 segundos, e o erro nunca sobe: o
agendamento é salvo primeiro e a falha vira uma linha na tabela
`notifications`, com o motivo devolvido pela Meta. É o que responde
"mandou ou não mandou?" quando a barbearia disser que não recebeu.

## Build

```bash
npm run build
```

### Build estático para HostGator

A versão estática existe apenas como vitrine: sem servidor, ela não tem
agendamento nem login.

```bash
npm run build:hostgator
```

Os arquivos são gerados em `hostgator-dist/`.
