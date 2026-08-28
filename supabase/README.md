# Supabase — Bart do Corte

Estrutura preparada para uso futuro, sem login neste momento.

## Tabelas

- `shops`: dados da barbearia;
- `services`: catálogo de serviços;
- `barbers`: equipe e comissão;
- `barber_services`: serviços realizados por barbeiro;
- `weekly_availability`: expediente semanal;
- `schedule_blocks`: bloqueios da agenda;
- `customers`: clientes e telefone;
- `appointments`: agendamentos, pagamento e comissão.

Uma rotina do Supabase Cron roda a cada minuto. Quando o horário marcado chega,
ela conclui o atendimento e registra o pagamento automaticamente.

## Segurança atual

O visitante anônimo pode apenas consultar barbearia, serviços, barbeiros,
disponibilidade e bloqueios futuros. Clientes e agendamentos ficam privados.

Sem login, novos agendamentos devem passar por uma Supabase Edge Function. Ela
validará os dados, evitará abuso e usará a chave secreta somente no servidor.
Nunca coloque a chave `service_role` no site hospedado na HostGator.

## Aplicação

Quando o projeto Supabase da barbearia existir:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Depois, gere os tipos do banco e conecte o frontend com a URL e a chave
publicável do projeto. A interface ainda usa `localStorage` até essa integração.

## Login futuro

As colunas `auth_user_id` já permitem ligar barbeiros e clientes ao Supabase
Auth. As políticas privadas devem ser adicionadas somente após definir quem pode
ver e alterar cada agenda.
