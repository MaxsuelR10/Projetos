# Identidade visual de instituições financeiras

A versão autenticada persiste `institutionId` como metadado opcional em cada conta ou cartão no JSONB `financas_max_state.payload`. O identificador é validado pelo mesmo catálogo na interface e no servidor. A ausência ou `null` usa identidade neutra. O esquema do banco e a revisão do documento seguem os já usados pelo aplicativo. Nenhuma migration é necessária.

As sugestões na edição usam o nome completo ou um alias do catálogo. A escolha só é aplicada ao salvar. A conta usada para pagamentos continua definida pelo campo de conta vinculada.

## Ativos de marca

Os arquivos em `dist/institution-logos/` são exportações estáticas dos presets de [@edusites/bancos-brasil 1.3.0](https://www.npmjs.com/package/@edusites/bancos-brasil/v/1.3.0), distribuído sob MIT. A licença acompanha os arquivos. As marcas pertencem aos respectivos titulares e são exibidas para identificação das instituições. Os SVGs são carregados da mesma origem do aplicativo, inclusive no modo instalado com conexão.
