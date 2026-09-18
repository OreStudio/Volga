import { catalogueSchema, flatten, type SourceCatalogue } from '../translate.js';
import { en as source } from './en.js';

/**
 * Portuguese.
 *
 * Typed against the English catalogue, so a key that does not exist is a compile
 * error and a missing key is caught by the schema at the bottom of this file.
 */
const pt: SourceCatalogue = {
  app: {
    name: 'ORE Studio',
    tagline: 'Análise de risco de nível empresarial, no navegador.',
  },

  nav: {
    site: 'Site',
    accounts: 'Contas',
    notifications: 'Notificações',
    alerts: 'Alertas',
    signOut: 'Terminar sessão',
    signIn: 'Iniciar sessão',
    menu: 'Menu',
    closeMenu: 'Fechar menu',
    language: 'Idioma',
  },

  landing: {
    heading: 'Análise de risco de nível empresarial — mas visual e de código aberto.',
    introBefore: 'O ORE Studio envolve o',
    introBetween: '(ORE) e o',
    introAfter:
      'numa interface gráfica intuitiva — sem Python nem C++ — sobre um backend nativo de PostgreSQL com desempenho de C++.',
    signUp: 'Criar conta',
    signIn: 'Iniciar sessão',
  },

  signIn: {
    title: 'Iniciar sessão',
    username: 'Nome de utilizador',
    password: 'Palavra-passe',
    show: 'Mostrar',
    hide: 'Ocultar',
    submit: 'Iniciar sessão',
    submitting: 'A iniciar sessão...',
    noAccount: 'Não tem conta?',
    createOne: 'Criar conta',
    failed: 'Não foi possível iniciar sessão.',
    chooseParty: 'Escolha uma entidade',
    choosePartyHint: 'Esta conta trabalha em mais do que uma entidade.',
    partyCategory: 'Categoria',
  },

  signUp: {
    title: 'Criar conta',
    notAvailable:
      'As contas são criadas por um administrador ou através do assistente de aprovisionamento no cliente de ambiente de trabalho. O registo autónomo ainda não está disponível.',
    haveAccount: 'Já tem uma conta?',
  },

  accounts: {
    title: 'Contas',
    description: 'Identidades que podem iniciar sessão ou atuar como serviço, neste inquilino.',
    search: 'Pesquisar',
    searchPlaceholder: 'Nome de utilizador, nome ou email',
    filterByType: 'Tipo',
    allTypes: 'Todos os tipos',
    count: '{shown} de {total}',
    refreshing: 'a atualizar',
    loading: 'A carregar...',
    empty: 'Nenhuma conta corresponde ao filtro atual.',
    failed: 'Não foi possível carregar as contas.',
  },

  account: {
    singular: 'conta',
    colUsername: 'Nome de utilizador',
    colFullName: 'Nome completo',
    colEmail: 'Email',
    colType: 'Tipo',
    colRecorded: 'Registado',
    fldFullName: 'Nome completo',
    fldEmail: 'Email',
    fldJobTitle: 'Cargo',
    fldType: 'Tipo',
    fldDefaultParty: 'Entidade predefinida',
    fldReportsTo: 'Reporta a',
    fldVersion: 'Versão',
    fldModifiedBy: 'Modificado por',
    fldPerformedBy: 'Executado por',
    fldRecordedAt: 'Registado em',
    fldChangeReason: 'Motivo da alteração',
    fldCommentary: 'Comentário',
    notRecorded: 'não registado',
    notSet: 'não definido',
    nobody: 'ninguém',
    unknown: 'desconhecido',
    none: 'nenhum',
  },

  entity: {
    add: 'Adicionar',
    edit: 'Editar',
    delete: 'Eliminar',
    save: 'Guardar',
    saving: 'A guardar...',
    close: 'Fechar',
    cancel: 'Cancelar',
    refresh: 'Atualizar',
    history: 'Histórico',
    search: 'Pesquisar',
    filter: 'Filtrar',
    page: 'Página {page} de {pages}',
    pageSize: 'Itens por página',
    loadAll: 'Carregar tudo',
    noRecords: 'Sem registos',
    loading: 'A carregar...',
    first: 'Primeira',
    previous: 'Anterior',
    next: 'Seguinte',
    last: 'Última',
    provenance: 'Proveniência',
    general: 'Geral',
    related: 'Relacionado',
  },

  audit: {
    createTitle: 'Motivo do novo registo',
    amendTitle: 'Motivo da alteração obrigatório',
    deleteTitle: 'Motivo da eliminação obrigatório',
    createPrompt: 'Escolha um motivo para criar este registo:',
    amendPrompt: 'Escolha um motivo para esta alteração:',
    deletePrompt: 'Escolha um motivo para esta eliminação:',
    reason: 'Motivo',
    commentary: 'Comentário',
    commentaryPlaceholder: 'Introduza uma explicação para esta alteração...',
    commentaryRequired: 'O comentário é obrigatório para este motivo.',
    commentaryOptional: 'O comentário é opcional para este motivo.',
    required: 'Obrigatório',
    create: 'Criar',
    confirmDelete: 'Confirmar eliminação',
  },

  confirmation: {
    deleteTitle: 'Eliminar {singular}',
    deleteBody: "Tem a certeza de que pretende eliminar {singular} '{name}'?",
    unsavedTitle: 'Alterações não guardadas',
    unsavedBody: 'Tem alterações não guardadas. Fechar mesmo assim?',
    yes: 'Sim',
    no: 'Não',
  },

  feedback: {
    saved: '{name} guardado',
    deleted: '{name} eliminado',
    saveFailed: 'Falha ao guardar',
    createFailed: 'Falha ao criar',
    deleteFailed: 'Falha ao eliminar',
    invalidInput: 'Dados inválidos',
    requiredFields: 'Preencha todos os campos obrigatórios.',
    notConnected: 'Sem ligação ao servidor. Inicie sessão.',
    sessionExpired: 'A sua sessão terminou. Inicie sessão novamente.',
    unreachable: 'Não é possível contactar o servidor.',
    retry: 'Tentar novamente',
  },

  status: {
    environment: 'Ambiente',
    connected: 'Ligado',
    disconnected: 'Desligado',
    development: 'desenvolvimento',
    notSignedIn: 'Sessão não iniciada',
    copyright: '© 2026 Contribuidores do ORE Studio.',
  },

  deployment: {
    title: 'Implementação',
    description:
      'Apenas de leitura. Tudo aqui é decidido quando o processo arranca, não no navegador.',
    environment: 'Este ambiente',
    name: 'Nome',
    identifier: 'Identificador',
    kind: 'Tipo',
    production: 'produção',
    notProduction: 'não é produção',
    natsServer: 'Servidor NATS',
    namespace: 'Espaço de nomes',
    httpServer: 'Servidor HTTP',
    notConfigured: 'não configurado',
    configuration: 'Configuração',
    configFile: 'Ficheiro',
    everyEnvironment: 'Todos os ambientes declarados',
    serving: 'em uso',
    switchHint: 'Altere reiniciando com um --env diferente.',
    unavailable: 'Esta implementação não disponibiliza a área de programador.',
  },

  common: {
    loading: 'A carregar...',
    all: 'Todos',
    close: 'Fechar',
    open: 'Abrir',
    revert: 'Reverter',
    apply: 'Aplicar',
    back: 'Voltar',
  },
};

// Checked at import time against the English key set: a missing or renamed key
// fails here rather than silently falling back to English in front of a
// Portuguese speaker.
catalogueSchema(flatten(source)).parse(flatten(pt));
export { pt };
