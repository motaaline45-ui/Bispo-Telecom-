# Bispo Telecom

PWA instalável para registrar serviços de telecomunicações, acompanhar instalações e câmeras, gerar relatórios semanais, mensais ou personalizados e compartilhar resultados.

O app usa como referência operacional a planilha `produções.xlsx`. Os dados da planilha não são incluídos neste repositório.

Código-base: [relatorio-instalacoes](https://github.com/bigfatalbear/relatorio-instalacoes).

## Funcionalidades

- **Várias empresas**: cadastre empresas, alterne pelo seletor no cabeçalho e edite o nome e os ajustes de cada uma separadamente.
- **Lançamentos**: data, ID e nome do cliente, quantidade e valor de instalações e câmeras, status e observação.
- **Editar / apagar** qualquer lançamento, com filtro por mês e busca por nome/ID.
- **Relatório semanal** (segunda a domingo, semana ISO).
- **Relatório mensal** por mês.
- **Relatório personalizado** por intervalo de datas, com atalhos (hoje, últimos 7 dias, esta semana, este mês, mês passado).
- **Totais**: instalações, câmeras, valor por dia, média diária e total geral.
- **Compartilhar**:
  - WhatsApp (`wa.me`) com texto formatado;
  - E-mail (`mailto:`) com assunto pronto;
  - Compartilhamento nativo do Android (Web Share API);
  - Copiar texto, baixar **CSV** e **imprimir/salvar PDF**.
- **Importar planilha** `.xlsx`, `.xls` ou `.csv` (detecta cabeçalhos e datas).
- **Backup** em JSON, restauração e **compartilhamento do arquivo** (Drive, WhatsApp, e-mail…); os backups incluem todas as empresas.
- **Login com Google** e **sincronização automática** com o Google Drive (pasta privada do app).
- **PWA**: funciona offline, instala na tela inicial, abre em tela cheia.

## Privacidade

Por padrão, os dados ficam no armazenamento local do navegador (`localStorage`), separados por empresa neste aparelho. A sincronização com o Google Drive é opcional e só acontece depois que o usuário conecta a conta. Os backups manuais e do Drive incluem todas as empresas. A seleção de empresas não cria contas nem controla o acesso de outros usuários; os dados não são compartilhados entre aparelhos sem restaurar um backup. O repositório não contém dados de clientes.

> ⚠️ Se limpar os dados do navegador, os lançamentos são apagados. Use **Ajustes → Baixar backup** periodicamente.

## Como usar

1. Abra o endereço onde o app foi publicado no Chrome do celular.
2. Toque em **Instalar app** (ou menu ⋮ → *Adicionar à tela inicial*).
3. Use o seletor no cabeçalho para alternar entre empresas ou toque em **+** para cadastrar uma.
4. Em **Ajustes**, confira os valores padrão da empresa ativa e importe a planilha (opcional).
5. Cadastre lançamentos em **Lançamentos**.
6. Em **Relatórios**, escolha o tipo, gere e compartilhe.

### Importar a planilha

Em **Ajustes → Importar planilha**, selecione um `.xlsx`, `.xls` ou `.csv` com cabeçalhos reconhecidos pelo app (por exemplo, DATA, CLIENTE, ID, quantidades e valores). Revise os lançamentos após a importação, pois planilhas de produção podem ter colunas e serviços que não correspondem diretamente aos campos de instalações e câmeras. Se já houver lançamentos, escolha:

- **OK** → adiciona aos existentes (duplicados são ignorados);
- **Cancelar** → substitui tudo pelos dados da planilha.

## Google Drive (login e sincronização)

O app pode guardar `bispo-telecom-backup.json` na pasta privada do app no Drive (escopo `drive.appdata`). O Client ID OAuth público vem sugerido na primeira configuração. Depois de confirmado, fica salvo apenas neste aparelho e o campo fica oculto; use **Alterar Client ID** para substituí-lo. Se os dados do navegador forem apagados, o app solicitará a configuração novamente. Client IDs são públicos; nunca coloque um Client Secret no app.

### Configurar um Client ID próprio (opcional)

O app sugere um Client ID OAuth público. Se precisar usar outro, siga os passos abaixo:

1. Abra <https://console.cloud.google.com> e crie um projeto (ex.: `Bispo Telecom`).
2. **APIs e serviços → Biblioteca** → ative **Google Drive API**.
3. **APIs e serviços → Tela de consentimento OAuth**:
   - Tipo: **Externo**;
   - Preencha nome do app e e-mail de suporte;
   - Em **Usuários de teste**, adicione o seu e-mail;
   - Salve.
4. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**;
   - **Origens JavaScript autorizadas**: a origem em que este app será publicado (sem caminho ou barra no final);
   - Criar.
5. Copie o **Client ID** (termina em `.apps.googleusercontent.com`).
6. No app: **Ajustes → Google Drive**, confira ou substitua o Client ID em **Configuração avançada** e toque em **Entrar com Google** para salvá-lo neste aparelho.
7. Autorize o acesso e toque em **Sincronizar agora**.

> O Client ID fica armazenado somente neste aparelho. Se apagar os dados do navegador, será necessário confirmá-lo novamente. Client IDs não são segredos; nunca use um Client Secret no app. O cliente precisa autorizar a origem em que o app está aberto. Em desenvolvimento local, autorize `http://localhost:4173`.
> Enquanto o app estiver em modo **Testing** no Google Cloud, só os e-mails cadastrados como testadores conseguem entrar.

### Como a sincronização funciona

- **Manual:** botões *Sincronizar agora* e *Restaurar do Drive*.
- **Automática:** ao salvar qualquer lançamento/ajuste, o app envia o backup após ~5 s (se a opção estiver marcada).
- **Conflitos:** se o arquivo no Drive estiver mais recente, o app pergunta antes de sobrescrever (OK restaura, Cancelar envia o local).
- O login vale ~1 hora por sessão; depois o app tenta renovar sozinho ou pede um toque em *Entrar com Google*.
- Offline: as alterações ficam no aparelho e são enviadas quando a conexão volta.

### Problemas comuns

| Erro | Causa / correção |
|---|---|
| `redirect_uri_mismatch` ou “registre a origem JavaScript no Console do Google Cloud” | Em **Credenciais → seu cliente OAuth**, adicione a origem exata em que o app está aberto (sem caminho e sem barra) e salve. Pode levar alguns minutos para valer. |
| `access_denied` / “Acesso bloqueado” | Adicione seu e-mail em **Usuários de teste** na tela de consentimento. |
| “Google Drive API has not been used in project…” | Ative a **Google Drive API** no projeto selecionado. |
| A janela do Google não abre no app instalado | Abra o link pelo **Chrome** e faça o login uma vez. |

### Limitações

- Para distribuir o app para muitas pessoas fora dos testadores, o Google pode exigir verificação do OAuth.
- A exclusão do backup no Drive não apaga os dados locais (e vice-versa).

## Desenvolvimento local

```bash
npm start          # http://localhost:4173
npm run check      # valida sintaxe dos módulos
npm test           # testa migração, isolamento e restauração de empresas
```

Ou:

```bash
python -m http.server 4173
```

Não abra o `index.html` direto como arquivo (`file://`): módulos ES e service worker exigem HTTP.

## Publicação no GitHub Pages

```bash
gh repo create bispo-telecom --private --source=. --push
gh api -X POST repos/{owner}/bispo-telecom/pages \
  -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/'
```

URL: `https://{owner}.github.io/bispo-telecom/`

> Ao alterar arquivos, incremente `CACHE` no topo de `sw.js` para forçar a atualização nos aparelhos que já instalaram o app.

## Estrutura

```
index.html            # telas (lançamentos, relatórios, ajustes)
css/styles.css        # tema claro/escuro, impressão
js/app.js             # interface e eventos
js/db.js              # localStorage, datas e valores
js/reports.js         # agregação, texto e CSV dos relatórios
js/share.js           # WhatsApp, e-mail, share nativo, download
js/import.js          # leitura de xlsx/xls/csv
js/drive.js           # login Google e sincronização com o Drive
sw.js                 # cache offline
manifest.webmanifest  # instalação PWA
vendor/xlsx.full.min.js
icons/
```
