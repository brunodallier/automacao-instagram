# Proteção de configurações e verificações locais

Segredos e dados reais ficam fora do repositório e do contexto Docker: `.env`, configurações de produção, `deploy/secrets`, backups e diagnósticos privados. Os arquivos `.example` devem conter apenas placeholders. As exclusões também cobrem formatos de chaves SSH, certificados privados e `.pgpass`. Nunca usar `git add -f` para esses materiais. `.gitignore` não remove arquivos já rastreados nem substitui uma varredura.

O relatório detalhado da auditoria da sessão de 15/10/2026 foi guardado em diretório privado local, com permissões restritas. Não publicar relatórios brutos, snapshots de conta, dumps, payloads, logs de instalação ou arquivos de diagnóstico. Nenhum segredo deve ser colocado em `NEXT_PUBLIC_*`, argumentos de shell, URLs de Graph ou mensagens de erro. O access token é enviado somente no cabeçalho HTTPS ao host oficial fixado; App Secret é usado para validar o HMAC nos bytes originais.

## Antes de publicar alterações

- Conferir `git status`, arquivos preparados para commit e exclusões de Git/Docker.
- Usar o endereço noreply da conta GitHub na autoria quando a privacidade do e-mail for desejada; mudanças de autoria futura não removem metadados já publicados.
- Executar detecção local de segredos com uma versão oficial verificada do Gitleaks, usando redação integral e saída privada. Exemplo: `gitleaks git --log-opts="--all --full-history" --redact=100 --report-format=json --report-path=<arquivo-em-pasta-privada> .`.
- Conferir testes, TypeScript, lint, build e `npm audit --omit=dev`. A auditoria npm consulta metadados de dependências, não deve receber arquivos privados.
- Revisar separadamente mudanças em autenticação, publicação de portas, HMAC, tokens, banco e configurações de produção. Um teste do botão Meta não comprova persistência de evento da conta ou entrega de mensagem.

O GitHub informou secret scanning e push protection habilitados na auditoria. Essas proteções não identificam todo segredo genérico. Proteções de revisão/status checks e CI devem ser configuradas de acordo com o fluxo de trabalho; não presumir que existam só porque a detecção de segredos está ativa. [Documentação oficial sobre push protection](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/prevent-future-leaks/enable-push-protection).

## Incidente confirmado

Se uma credencial real for encontrada, registrar apenas categoria, localização e alcance, mantendo a evidência privada. Interromper novas publicações daquele material, preparar contenção/rotação e obter autorização antes de revogar ou substituir a credencial. Excluir um arquivo atual não elimina a exposição no histórico. Não reescrever histórico, executar force push ou revogar chaves automaticamente durante uma auditoria.

## Operação e recuperação

Worker e envios reais permanecem bloqueados até teste controlado e autorização específica. O callback público deve exigir HMAC e permanecer separado do painel humano. Banco, API Docker e serviços internos não devem publicar portas na internet. Manter backups com acesso restrito, configurar cópia externa criptografada antes de hospedar dados reais e comprovar restauração em ambiente isolado. Guardar o plano de reversão sem incorporar tokens aos comandos.
