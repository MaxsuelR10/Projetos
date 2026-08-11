# Controle de Finanças

Sistema web pessoal de controle financeiro, desenvolvido para uso local e sem
dependência de APIs, bancos ou serviços pagos.

## Estado atual

A Fase 1 implementa:

- PostgreSQL local com Prisma ORM;
- modelos `User`, `Account`, `Category`, `Transaction` e `Transfer`;
- cadastro, login, sessão persistente, consulta da sessão e logout;
- JWT armazenado em cookie HttpOnly;
- senhas protegidas com bcrypt;
- validação com Zod;
- categorias padrão criadas para cada novo usuário;
- frontend responsivo com cadastro, login e página protegida mínima;
- testes automatizados do fluxo de autenticação.

A Fase 2 adiciona:

- CRUD protegido de contas, incluindo ativação e exclusão segura;
- categorias padrão por usuário, categorias personalizadas e subcategorias;
- prevenção de duplicidade por nome normalizado;
- área web para configurar contas e categorias em celular ou desktop.

Receitas, despesas, transferências e o dashboard pertencem às fases posteriores.

## Fases 3 e 4

A Fase 3 adiciona receitas, despesas e transferências com atualização atômica
dos saldos. Lançamentos pendentes não afetam a conta até serem concluídos;
cancelamentos revertem o efeito financeiro.

A Fase 4 adiciona cartões de crédito e débito, limite e vencimento, compras em
até 120 parcelas, faturas por competência e pagamento de fatura vinculado a
uma conta. A compra não reduz saldo: apenas o pagamento gera a transação e
altera a conta, dentro da mesma transação do PostgreSQL.

A Fase 5 adiciona recorrências semanais, quinzenais, mensais, anuais ou por
intervalo customizado. As ocorrências são geradas localmente como lançamentos
pendentes, sem duplicidade. Também inclui assinaturas com custo mensal
equivalente calculado localmente, sem consultar APIs externas.

## Tecnologias

### Frontend

- React e Vite;
- React Router;
- Axios;
- CSS Mobile First.

### Backend

- Node.js e Express;
- Prisma ORM e PostgreSQL local;
- JWT, bcrypt e Zod;
- Vitest e Supertest.

Todas as dependências são gratuitas e executadas localmente.

## Requisitos

- Node.js 22.12 ou superior;
- npm;
- PostgreSQL local;
- banco vazio chamado `controle_financas`.

## Configuração do backend

```bash
cd backend
npm install
```

Copie `.env.example` para `.env` e preencha somente no arquivo local:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://usuario:senha@localhost:5432/controle_financas?schema=public
JWT_SECRET=um-segredo-local-forte-com-pelo-menos-32-caracteres
JWT_EXPIRES_IN=7d
JWT_COOKIE_DAYS=7
CORS_ORIGIN=http://localhost:5173
```

O `.env` é ignorado pelo Git. Nunca use dados reais no `.env.example`.

Valide e aplique o banco:

```bash
npm run prisma:validate
npm run prisma:generate
npx prisma migrate dev
```

Inicie a API:

```bash
npm run dev
```

A API ficará disponível em `http://localhost:3000`.

## Configuração do frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend usa `http://localhost:3000/api` por padrão. Para alterar, copie
`frontend/.env.example` para `frontend/.env` e ajuste `VITE_API_URL`.

## Endpoints da Fase 1

| Método | Endpoint | Protegido | Finalidade |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Não | Verifica a API |
| `POST` | `/api/auth/register` | Não | Cria usuário e categorias padrão |
| `POST` | `/api/auth/login` | Não | Autentica e cria cookie JWT |
| `GET` | `/api/auth/me` | Sim | Retorna o usuário autenticado |
| `POST` | `/api/auth/logout` | Sim | Limpa a sessão local |
| `GET`, `POST` | `/api/accounts` | Sim | Lista e cria contas |
| `GET`, `PATCH`, `DELETE` | `/api/accounts/:id` | Sim | Consulta, edita ou exclui uma conta sem movimentações |
| `GET`, `POST` | `/api/categories` | Sim | Lista e cria categorias |
| `PATCH`, `DELETE` | `/api/categories/:id` | Sim | Edita, desativa ou exclui categoria personalizada sem vínculos |
| `POST` | `/api/categories/:categoryId/subcategories` | Sim | Cria subcategoria |
| `PATCH`, `DELETE` | `/api/categories/:categoryId/subcategories/:id` | Sim | Edita, desativa ou exclui subcategoria sem vínculos |

| `GET`, `POST` | `/api/transactions` | Sim | Lista e cria receitas/despesas |
| `PATCH`, `DELETE` | `/api/transactions/:id` | Sim | Edita ou cancela lançamento |
| `GET`, `POST` | `/api/transfers` | Sim | Consulta e cria transferências idempotentes |
| `DELETE` | `/api/transfers/:id` | Sim | Estorna transferência preservando histórico |
| `GET`, `POST` | `/api/cards` | Sim | Lista e cadastra cartões |
| `GET`, `PATCH`, `DELETE` | `/api/cards/:id` | Sim | Consulta, edita ou remove cartão sem compras |
| `GET`, `POST` | `/api/cards/:id/purchases` | Sim | Consulta e cria compras parceladas no crédito |
| `GET` | `/api/cards/:id/invoices` | Sim | Lista faturas e parcelas do cartão |
| `POST` | `/api/invoices/:id/pay` | Sim | Paga fatura usando uma conta ativa |
| `PATCH`, `DELETE` | `/api/card-purchases/:id` | Sim | Edita metadados ou cancela compra futura |

O backend nunca aceita `userId` do frontend como autoridade. Rotas financeiras
futuras deverão usar exclusivamente o identificador obtido pelo middleware JWT.

## Estrutura

```text
backend/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── config/
│   ├── constants/
│   ├── controllers/
│   ├── middlewares/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── validators/
│   ├── app.js
│   └── server.js
└── tests/integration/

frontend/src/
├── components/
├── contexts/
├── hooks/
├── layouts/
├── pages/
├── routes/
├── services/
├── styles/
└── utils/
```

## Estratégia de saldo

`Account.currentBalance` é armazenado. Quando os CRUDs financeiros forem
implementados, toda movimentação confirmada atualizará o lançamento e o saldo
na mesma transação do PostgreSQL:

- receita concluída: incrementa o saldo;
- despesa concluída: decrementa o saldo;
- transferência: decrementa a origem e incrementa o destino atomicamente;
- cancelamento ou edição: aplica somente a diferença necessária.

`initialBalance` é imutável após a criação. Relatórios usam os lançamentos como
histórico, enquanto `currentBalance` oferece leitura rápida. Testes de
reconciliação deverão verificar periodicamente que o saldo armazenado coincide
com o saldo inicial mais os movimentos concluídos.

Na Fase 2, o saldo inicial só pode ser informado na criação da conta. Editar
uma conta altera apenas metadados, nunca o saldo. A alteração de saldo por
movimento será implementada na Fase 3.

## Integridade do banco

- dinheiro usa `Decimal(19,4)`, nunca `Float`;
- transferências possuem `CHECK` para valor positivo e contas diferentes;
- transações possuem `CHECK` para valor positivo;
- chaves estrangeiras compostas impedem vincular contas ou categorias de outro
  usuário;
- exclusões relacionadas usam `RESTRICT`;
- categorias são únicas por usuário, tipo e nome normalizado.
- contas são únicas por usuário e nome normalizado;
- subcategorias são únicas dentro da categoria;
- contas, categorias e subcategorias com movimentações não podem ser excluídas.

## Testes e verificações

```bash
cd backend
npm test

cd ../frontend
npm run lint
npm run build
```

Os testes de autenticação usam um usuário temporário no PostgreSQL local e o
removem ao final, sem resetar ou apagar o banco.
