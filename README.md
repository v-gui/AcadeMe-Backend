# AcadeMe Backend

## Papel Do Backend

O backend concentra a regra de negocio da plataforma. Ele define quem pode ver, editar, validar, aceitar convites e sair de um projeto.

O ponto principal da API esta em [server.ts](/abs/path/c:/Users/Guilherme%20Vieira/Desktop/AcadeMe%20-%20TCC/AcadeMe-Backend%20-%20GV/server.ts:1), enquanto os schemas do banco ficam em `models/`.

## Stack

- Node.js
- Express
- Mongoose
- MongoDB
- bcryptjs

## Estrutura

```text
AcadeMe-Backend - GV/
|-- models/
|   |-- Student.ts
|   |-- Professor.ts
|   |-- Project.ts
|-- server.ts
|-- package.json
```

## Modelos

### Student

Campos principais:

- `name`
- `email`
- `course`
- `bio`
- `profileImage`
- `contactLink`
- `password`
- `interests`

Regras importantes:

- email unico
- senha armazenada com hash
- limite de ate 5 interesses

### Professor

Campos principais:

- `name`
- `email`
- `password`
- `department`
- `academicTitle`
- `bio`
- `profileImage`
- `areasOfExpertise`

Regras importantes:

- email unico
- senha armazenada com hash

### Project

Campos principais:

- `title`
- `description`
- `tags`
- `imageUrl`
- `projectLink`
- `adminStudent`
- `students`
- `invitedProfessors`
- `posters`
- `files`
- `references`
- `endorsements`

Subestruturas mais importantes:

- `students`: controla quem esta na equipe e o status de cada aluno
- `invitedProfessors`: controla os docentes convidados e o status do convite
- `endorsements`: armazena validacao docente e comentario

## Fluxo Das Rotas

### Autenticacao

- `POST /login`

Passo a passo:

1. recebe email e senha
2. procura primeiro em alunos
3. se nao encontrar, procura em professores
4. compara a senha com o hash
5. retorna usuario sem senha e com `role`

### Busca Global

- `GET /search`

Passo a passo:

1. recebe o termo digitado
2. busca alunos, professores e projetos
3. aplica visibilidade aos projetos
4. retorna tudo agrupado para o frontend

### Alunos

- `POST /students`
- `PUT /students/:id`
- `GET /students`
- `GET /students/:id`
- `GET /students/:id/projects`
- `GET /students/:id/invites`
- `GET /students-active`

Objetivo do grupo:

- cadastro e atualizacao do perfil
- listagem de portfolio
- convites pendentes
- vitrine de talentos

### Professores

- `POST /professors`
- `GET /professors`
- `GET /professors/:id`
- `GET /professors/:id/invites`
- `PUT /professors/:id`
- `GET /professors/:id/projects`

Objetivo do grupo:

- cadastro e atualizacao do perfil docente
- listagem de convites
- historico de projetos validados

### Projetos

- `POST /projects`
- `GET /projects/:id`
- `PUT /projects/:id`
- `DELETE /projects/:id`
- `PUT /projects/:projectId/respond-invite`
- `PUT /projects/:projectId/respond-professor-invite`
- `PUT /projects/:projectId/leave`
- `PUT /projects/:projectId/professor-leave`
- `POST /projects/:projectId/endorse`
- `PUT /projects/:projectId/endorse/:professorId`
- `DELETE /projects/:projectId/endorse/:professorId`
- `GET /projects-endorsed`

## Regras De Negocio Mais Importantes

### Visibilidade De Projeto

Um projeto pode ser visto quando:

- ja possui validacao
- o visitante e aluno vinculado e nao foi recusado
- o visitante e professor vinculado e nao foi recusado

### Administracao De Projeto

- o administrador fica em `adminStudent`
- se nao houver administrador explicito, o backend usa o primeiro aluno aceito
- apenas membros aceitos podem editar
- remocao de membros e docentes convidados depende da permissao do administrador

### Convite De Professor

Ao aceitar um convite docente:

1. o status do convite vira `accepted`
2. o backend cria a validacao em `endorsements`
3. o comentario pode ser vazio no aceite inicial
4. o professor pode editar ou excluir a validacao depois

Ao recusar:

1. o status vira `declined`
2. uma validacao existente do mesmo professor e removida

### Saida Do Professor

Ao sair do projeto, o professor pode:

- manter a validacao
- remover a validacao

### Exclusao De Projeto

O projeto so pode ser excluido quando:

- o usuario e o administrador
- resta apenas um membro aceito na equipe

## Funcoes Utilitarias Em `server.ts`

As utilidades no topo do arquivo existem para evitar repeticao nas rotas:

- `normalizeStudentId`
- `normalizeProfessorId`
- `getProjectAdminId`
- `isProjectAdmin`
- `countAcceptedMembers`
- `populateProjectById`
- `getViewerFromQuery`
- `getProjectVisibilityFilter`
- `canViewerAccessProject`

## Variaveis De Ambiente

Obrigatoria:

```env
MONGO_URI=<string de conexao do MongoDB>
```

Opcional:

```env
PORT=3001
```

## Scripts

```bash
npm run dev
npm start
```

## Como Dar Manutencao Com Seguranca

1. Antes de mudar uma rota, localize quais paginas do frontend consomem esse endpoint.
2. Se alterar payload de projeto, revise o frontend em `src/types/models.ts`.
3. Se a mudanca afetar convite ou validacao, revise `respond-professor-invite`, `endorse` e `projects-endorsed` juntos.
4. Se alterar visibilidade, revise `getProjectVisibilityFilter` e `canViewerAccessProject` juntos.
