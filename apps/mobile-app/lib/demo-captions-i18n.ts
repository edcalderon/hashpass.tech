// Hand-maintained caption translations for locales the narration audio was
// never recorded in. The demo page's audio only ever plays in English or
// Spanish (see lib/demo-chapters.ts / demo-captions.ts, which are generated
// straight from the TTS engine's own subtitle timing) — but a viewer whose
// UI language is French, Portuguese, German, or Korean still expects the
// on-screen caption text to read in their language, even while the voice
// stays English. These arrays are text-only and line up 1:1 by index with
// demoCaptionsEn's timing (English is the audio track for every non-Spanish
// locale) — see getDemoCaptionCues() in app/demo.tsx for how they're
// recombined with real cue timing at render time.
export const demoCaptionTextFr: string[] = [
  "Bienvenue sur Hash Pass — votre plateforme d'événements numérique.",
  "Découvrez des événements, connectez-vous avec votre communauté et gérez vos pass, le tout au même endroit.",
  "C'est simple de commencer.",
  "Connectez-vous instantanément avec un code à usage unique par e-mail, ou continuez avec Google en un geste.",
  "Une fois connecté, votre tableau de bord met tout à portée de main — explorez chaque événement du réseau Hash Pass et accédez directement à vos pass.",
  "Gardez votre profil de participant à jour.",
  "Ajoutez votre poste et votre entreprise pour que les organisateurs et intervenants sachent exactement qui ils rencontrent.",
  "Changez d'événement en un geste — Chili, Colombie, Pérou, et plus encore — chacun avec son propre programme, ses intervenants et un accès rapide à tout ce dont vous avez besoin.",
  "Et vous pouvez emporter Hash Pass partout avec vous.",
  "Installez-la directement depuis votre navigateur pour la lancer comme une app native depuis votre écran d'accueil, ou trouvez Hash Pass sur le Google Play Store.",
];

export const demoCaptionTextPt: string[] = [
  "Bem-vindo ao Hash Pass — sua plataforma digital de eventos.",
  "Descubra eventos, conecte-se com sua comunidade e gerencie seus passes, tudo em um só lugar.",
  "Começar é fácil.",
  "Entre instantaneamente com um código único por e-mail, ou continue com o Google em um toque.",
  "Assim que você entrar, seu painel coloca tudo ao seu alcance — explore todos os eventos da rede Hash Pass e acesse seus passes diretamente.",
  "Mantenha seu perfil de participante atualizado.",
  "Adicione seu cargo e empresa para que organizadores e palestrantes saibam exatamente com quem estão se encontrando.",
  "Alterne entre todos os eventos da turnê com um toque — Chile, Colômbia, Peru e mais — cada um com sua própria agenda, palestrantes e acesso rápido a tudo o que você precisa.",
  "E você pode levar o Hash Pass com você para todos os lugares.",
  "Instale-o diretamente do seu navegador para abri-lo como um app nativo na tela inicial, ou encontre o Hash Pass na Google Play Store.",
];

export const demoCaptionTextDe: string[] = [
  "Willkommen bei Hash Pass — deiner digitalen Event-Plattform.",
  "Entdecke Events, vernetze dich mit deiner Community und verwalte deine Pässe, alles an einem Ort.",
  "Der Einstieg ist ganz einfach.",
  "Melde dich sofort mit einem Einmalcode per E-Mail an, oder fahre mit Google in nur einem Tipp fort.",
  "Sobald du angemeldet bist, zeigt dir dein Dashboard alles auf einen Blick — entdecke jedes Event im Hash Pass Netzwerk und springe direkt zu deinen Pässen.",
  "Halte dein Teilnehmerprofil aktuell.",
  "Füge deine Rolle und dein Unternehmen hinzu, damit Organisatoren und Sprecher genau wissen, mit wem sie es zu tun haben.",
  "Wechsle mit einem Tipp zwischen allen Events der Tour — Chile, Kolumbien, Peru und mehr — jedes mit eigener Agenda, eigenen Sprechern und schnellem Zugriff auf alles, was du brauchst.",
  "Und du kannst Hash Pass überallhin mitnehmen.",
  "Installiere es direkt über deinen Browser, um es wie eine native App vom Startbildschirm zu starten, oder finde Hash Pass im Google Play Store.",
];

export const demoCaptionTextKo: string[] = [
  "해시패스에 오신 것을 환영합니다 — 여러분의 디지털 이벤트 플랫폼입니다.",
  "이벤트를 찾아보고, 커뮤니티와 소통하고, 패스를 한 곳에서 관리하세요.",
  "시작하는 방법은 아주 간단합니다.",
  "이메일로 받은 일회용 코드로 즉시 로그인하거나, 한 번의 탭으로 구글 계정으로 계속하세요.",
  "로그인하면 대시보드에서 모든 것을 한눈에 볼 수 있습니다 — 해시패스 네트워크의 모든 이벤트를 둘러보고 바로 패스로 이동하세요.",
  "참가자 프로필을 최신 상태로 유지하세요.",
  "직책과 소속을 추가하면 주최자와 연사가 누구를 만나는지 정확히 알 수 있습니다.",
  "투어의 모든 이벤트를 탭 한 번으로 전환하세요 — 칠레, 콜롬비아, 페루 등 각 이벤트마다 고유한 일정과 연사, 필요한 모든 것에 빠르게 접근할 수 있습니다.",
  "그리고 해시패스를 언제 어디서나 가지고 다닐 수 있습니다.",
  "브라우저에서 바로 설치해 홈 화면에서 네이티브 앱처럼 실행하거나, 구글 플레이 스토어에서 해시패스를 찾아보세요.",
];

export const demoCaptionTextByLocale: Record<string, string[]> = {
  fr: demoCaptionTextFr,
  pt: demoCaptionTextPt,
  de: demoCaptionTextDe,
  ko: demoCaptionTextKo,
};
