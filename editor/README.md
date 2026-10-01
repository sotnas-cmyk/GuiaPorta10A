# Editor da base de restaurantes

Editor local para `data/restaurantes.json`.

## Utilização

1. Abre `editor/index.html` no navegador.
2. Carrega o ficheiro `../data/restaurantes.json`.
3. Pesquisa e seleciona um restaurante, ou usa **Novo restaurante**.
4. Edita os campos.
5. Usa **Guardar alterações**.
6. No fim, usa **Exportar JSON**.
7. Substitui `data/restaurantes.json` pelo ficheiro exportado.
8. Corre `npm run validate` antes de fazer commit.
9. Faz `git add`, `git commit` e `git push`.

O editor não envia dados para nenhum servidor e não contém credenciais GitHub.

## Nota

O editor mantém `estado: encerrado` como opção preferencial para estabelecimentos que fecharam. A eliminação definitiva deve ficar reservada a duplicados ou erros de inserção.


## Apple Maps

O editor trata o `applePlaceId` como identificador prioritário para abrir o estabelecimento no Apple Maps.

- Se existir `applePlaceId`, **Abrir no Apple Maps** usa diretamente esse ID.
- Se não existir, o botão abre uma pesquisa por nome/morada como fallback.
- A caixa **Confirmei que esta ficha Apple corresponde ao restaurante** deve ser marcada apenas após confirmação humana.
- A exportação não permite uma confirmação Apple sem `applePlaceId` e data de confirmação.
- Os registos antigos com Apple ID mantêm o ID original; a confirmação manual é uma etapa editorial separada.
