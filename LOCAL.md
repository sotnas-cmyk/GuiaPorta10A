# Testar o Porta 10A localmente

## Mac — forma mais simples

1. Abra a pasta do projeto.
2. Faça duplo clique em `start.command`.
3. O navegador abre automaticamente em `http://localhost:8000/`.
4. Para parar o servidor, volte à janela/terminal que ficou aberta e pressione `Ctrl+C`.

Não abra `index.html` diretamente com `file://`: a aplicação carrega `data/restaurantes.json` através de `fetch`, e o navegador bloqueia esse acesso local por segurança.

## Terminal

```bash
cd caminho/para/guia-porta-10a-github
python3 -m http.server 8000
```

Depois abra `http://localhost:8000/`.
