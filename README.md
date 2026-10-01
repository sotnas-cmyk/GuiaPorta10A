# Porta 10A · by ForumSCP

Guia estático de restaurantes, preparado para publicação no GitHub Pages.

## Estrutura

- `index.html` — apresentação e estrutura da aplicação.
- `src/app.js` — lógica da aplicação.
- `data/restaurantes.json` — base editorial de restaurantes.
- `data/taxonomia.json` — vocabulário controlado usado pelos atributos editoriais.
- `scripts/validate-data.js` — validação local da base.

## Desenvolvimento local

Não abrir `index.html` diretamente do disco, porque a aplicação carrega o JSON por `fetch`. Use um servidor HTTP local, por exemplo:

```bash
python3 -m http.server 8000
```

Depois abrir `http://localhost:8000/`.

## Validar dados

```bash
node scripts/validate-data.js
```

## GitHub Pages

O conteúdo deste diretório pode ser publicado diretamente como site estático. A aplicação lê `data/restaurantes.json` em runtime.

## Publicação automática

O workflow `.github/workflows/pages.yml` publica a raiz do repositório no GitHub Pages sempre que há push para `main`. No GitHub, ativa **Settings → Pages → GitHub Actions** se ainda não estiver ativo.


## Editor de dados

Existe um editor administrativo local em `editor/index.html`. Ele permite carregar `data/restaurantes.json`, pesquisar, adicionar, editar, duplicar, encerrar ou eliminar registos e exportar uma nova versão do JSON.

O editor não é publicado como parte da aplicação pública e não contém credenciais. Os atributos estruturados são editáveis no próprio formulário e são validados antes da exportação. Depois de exportar, substituir o ficheiro em `data/restaurantes.json`, executar `npm run validate` e fazer commit.

Para usar através de um servidor local: `npm run editor` e abrir `http://localhost:8080/editor/`.
