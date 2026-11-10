# Compass+

Planejador de formatura para estudantes da UTFPR. Você envia os três PDFs do Portal do Aluno e o Compass+ monta um plano, semestre a semestre, com o **menor número de semestres até a formatura**, respeitando seus turnos, seu horário de trabalho e a carga que você aceita cursar.

Ferramenta independente, sem vínculo oficial com a UTFPR.

## Como usar

1. Exporte os três PDFs pelo Portal do Aluno (instruções abaixo).
2. Abra o Compass+ e solte os três de uma vez, em qualquer ordem. O app reconhece cada um pelo conteúdo.
3. Confira o que foi lido: horas cursadas e faltantes de cada requisito, comparadas com os resumos do seu histórico.
4. Responda às perguntas iniciais: quando você conclui os estágios e outros itens sem turma, e as horas de extensão ou de eletivas feitas por fora.
5. Informe suas preferências (turnos, janela de horário, carga máxima, ordem das trilhas) e se você trabalha.
6. Receba o plano: a previsão de formatura no topo e, em cada semestre, a grade recomendada, até três alternativas que mantêm a mesma formatura, o cronograma semanal e o motivo de cada matéria.

### Como exportar os PDFs

Em todos os casos, o botão de imprimir abre a janela de impressão do navegador. Em **Destino**, escolha **Salvar como PDF**. Todos os arquivos saem com o mesmo nome, então renomeie cada um.

| PDF | Caminho no Portal do Aluno | O que fazer |
|---|---|---|
| Turmas Abertas | Página Inicial → Turmas Abertas | Escolha o campus e o curso, clique em **Confirmar** e imprima a lista. |
| Histórico Escolar | Página Inicial → Histórico Completo | Clique em **Imprimir Histórico Escolar**. |
| Matriz Curricular | Página Inicial → Matrizes Curriculares | Clique em **Imprimir Matriz Curricular**. |

O app também tem esse passo a passo, com capturas de tela, no link "Como exportar" da tela inicial.

## O que o app faz

- Lê a matriz curricular, o histórico e as turmas abertas direto dos PDFs, sem digitação.
- Calcula o que falta em cada requisito: obrigatórias, conjuntos optativos, trilhas (só contam as subáreas validadas), eletivas e extensão. Também avisa quando o cálculo não bate com os resumos do histórico.
- Monta o plano de todos os semestres de uma vez, com um modelo de programação inteira resolvido no navegador. Ele nunca coloca uma matéria que não reduz nenhum requisito só para encher o semestre.
- Pergunta quando os códigos das Turmas Abertas não estão na sua matriz mas têm nome parecido com uma disciplina dela, em vez de assumir que são a mesma disciplina.
- Respeita horários travados: trabalho com horário fixo ou flexível e bloqueios manuais na grade.
- Permite confirmar a grade de um semestre, editar uma grade ou montar uma do zero. Os semestres seguintes são recalculados em volta do que você escolheu.
- Mostra o grafo de pré-requisitos e exporta a grade de um semestre como calendário (`.ics`).
- Tem tema claro e escuro.

## O que o app não faz

- Não faz matrícula nem garante vaga em turma.
- Não substitui a análise oficial da coordenação do curso nem o seu histórico.
- Não lê PDF escaneado: o PDF precisa ter texto selecionável, como os que o Portal do Aluno gera.
- Não envia seus dados para lugar nenhum.

## Privacidade

Tudo roda no seu navegador. Os PDFs não saem da sua máquina e não há servidor que receba seus dados. As fontes são servidas pelo próprio app (sem Google Fonts nem outra CDN).

O que foi lido dos PDFs, suas respostas e suas escolhas ficam salvos no `localStorage` do navegador, para você retomar depois. O botão **Reiniciar**, no cabeçalho, apaga essa sessão. As configurações de trabalho que você salvou com nome ficam guardadas à parte e continuam depois de reiniciar.

## Limitações

- **A oferta dos semestres futuros é estimada.** Só o semestre das Turmas Abertas enviadas tem oferta real. Os outros usam a última oferta de mesma paridade (1º ou 2º semestre) e podem mudar. Quando a oferta real sair, carregue as Turmas Abertas dela pelo aviso do semestre.
- **As datas do calendário `.ics` são estimadas.** Confira o início e o fim das aulas no calendário acadêmico da UTFPR antes de baixar.
- **O período mostrado no sistema da UTFPR não é o seu tempo de curso.** Ele depende das aulas semanais que ainda faltam, e o app explica o seu caso na conferência. O plano não depende dele: o que conta são os requisitos.
- **O app foi testado com uma matriz curricular** (a 981). Matrizes de outros cursos podem ter um formato que a leitura não reconhece. Nesse caso, o app mostra o erro em vez de calcular com dados errados.

## Desenvolvimento

Use o Node 22, a mesma versão do CI.

```sh
npm install
npm run dev        # servidor local em http://localhost:5501
npm test           # testes (vitest)
npm run typecheck  # checagem de tipos
npm run build      # build de produção em dist/
```

Stack:

- Vite e TypeScript, sem framework de interface;
- [pdf.js](https://mozilla.github.io/pdf.js/) para extrair o texto dos PDFs;
- [HiGHS](https://highs.dev/), compilado para WebAssembly, para o modelo de programação inteira do planejador;
- SortableJS para reordenar as trilhas;
- Schibsted Grotesk e IBM Plex Mono via Fontsource.

O deploy é feito no GitHub Pages a cada push na `main`. O workflow roda a checagem de tipos, os testes e o build, nessa ordem.

### Log de desenvolvimento

Com `npm run dev`, um plugin do Vite (`vite-plugin-compass-log.ts`) grava os eventos e o estado do app em `logs/`. Ele só existe no servidor de desenvolvimento e não entra no build. A pasta `logs/` está no `.gitignore`, porque o estado salvo contém os dados do aluno.

### Fixtures de teste

Os testes usam páginas extraídas de PDFs reais, **anonimizadas**, em `test/fixtures/`. Para gerar novas fixtures a partir dos seus PDFs:

```sh
npm run fixture -- --matriz matriz.pdf --historico historico.pdf --turmas turmas_abertas.pdf
```

O script troca nome, RA, CPF, RG, datas, endereço, e-mail e telefone por valores falsos. Ele falha se algum valor mascarado continuar presente no resultado e lista os trechos que merecem revisão manual. Confira essa lista antes de fazer commit.

**Nunca faça commit dos PDFs reais.** Eles têm dados pessoais. O `.gitignore` ignora `*.pdf`; mantenha assim.
