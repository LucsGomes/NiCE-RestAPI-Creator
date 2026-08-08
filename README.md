# NiCE RestAPI Creator

Ferramenta web para converter um `cURL` em um script no padrao usado dentro do **NiCE CXone**, no componente **Rest API Action**.

Na pratica, em vez de o desenvolvedor pegar um `cURL` exportado do Postman e montar tudo manualmente no formato do NiCE, a aplicacao ja gera a estrutura pronta com:

- `global:uri`
- `headersjson`
- `paramsjson`

Se o `cURL` estiver escrito corretamente, a ferramenta reduz bastante o tempo gasto na montagem da requisicao.

## O que o projeto faz

O projeto recebe um `cURL` e converte para o formato de script utilizado em fluxos do **NiCE CXone**, especialmente no uso do **Rest API Action**.

Ele interpreta:

- URL da requisicao
- query string
- headers
- body JSON
- campos vazios que podem virar placeholders

O resultado e um script pronto para ser adaptado ou colado no fluxo do NiCE.

## Exemplo de uso

### Exemplo de cURL exportado do Postman

```bash
curl --location 'https://api-na1.niceincontact.com/InContactAPI/services/v31.0/script-trace-subscription' \
--header 'Content-Type: text/plain' \
--header 'Authorization: Bearer dasdasds' \
--data-raw '{"level":"1","scriptName":"teste_api_lucas","traceMethod":"all","sessionId":"-1828680AOA-C44COR01","filterType":"","filterValue":""}'
```

### Saida esperada no formato NiCE

```txt
ASSIGN global:uri = "https://api-na1.niceincontact.com/InContactAPI/services/v31.0/script-trace-subscription"

DYNAMIC headers

	ASSIGN headers.ContentType = "text/plain"
	ASSIGN headers.Authorization = "{Authorization}"
	ASSIGN headers.Accept = "*/*"
	ASSIGN headersjson = "{headers.asjson()}"
	ASSIGN headersjson = headersjson.replace("ContentType", "Content-Type")

DYNAMIC data

	ASSIGN data.level = "1"
	ASSIGN data.scriptName = "teste_api_lucas"
	ASSIGN data.traceMethod = "all"
	ASSIGN data.sessionId = "-1828680AOA-C44COR01"
	ASSIGN data.filterType = "{filterType}"
	ASSIGN data.filterValue = "{filterValue}"

	ASSIGN paramsjson = "{data.asJson()}"
```

## Beneficio para o desenvolvedor

Sem essa ferramenta, o desenvolvedor normalmente precisa:

- exportar o `cURL` do Postman
- separar URL, headers e body manualmente
- reescrever cada campo no formato do NiCE
- ajustar placeholders e nomes de campos

Com a ferramenta, esse trabalho ja sai praticamente pronto, poupando tempo e evitando erros de digitacao ou montagem.

## Como rodar o projeto

Na raiz do projeto, execute:

```bash
pnpm install
pnpm dev
```

Depois abra:

```txt
http://localhost:3000
```

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS

## Observacao

A conversao depende da estrutura do `cURL`. Quanto mais correto estiver o comando de entrada, melhor sera o resultado gerado para o NiCE.
