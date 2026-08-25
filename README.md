# Bart do Corte

MVP mobile first da barbearia Bart do Corte, em Campo Grande, Rio de Janeiro.

O projeto reúne a área pública de apresentação e agendamento, a agenda do
cliente, a visão dos barbeiros e o painel do proprietário. Nesta versão de
demonstração, os dados são salvos somente no navegador com `localStorage`.

## Funcionalidades

- landing page responsiva para celular e desktop;
- galeria de referências de cortes;
- fluxo de agendamento por serviço, barbeiro, data e horário;
- área do cliente com próximos horários;
- agenda individual dos barbeiros;
- painel do proprietário com visão da barbearia;
- horários de funcionamento, localização e Instagram;
- identidade visual e imagens da Bart do Corte.

## Desenvolvimento

Requer Node.js 22.13 ou superior.

```bash
npm install
npm run dev
```

## Build estático para HostGator

```bash
npm run build:hostgator
```

Os arquivos prontos para envio são gerados em `hostgator-dist/`. Essa pasta não
é versionada porque pode ser recriada a qualquer momento pelo comando acima.

## Observação sobre os dados

Este é um MVP sem banco de dados. Agendamentos e configurações ficam disponíveis
apenas no navegador e no dispositivo em que foram criados.

