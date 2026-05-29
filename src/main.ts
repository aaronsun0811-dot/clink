import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke, Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText as clipWrite, readText as clipRead } from "@tauri-apps/plugin-clipboard-manager";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import "@xterm/xterm/css/xterm.css";

// ---- i18n ----
type Lang = "zh" | "en" | "ja" | "ko" | "de" | "fr" | "pt" | "ar" | "es";
const LANGS: { code: Lang; name: string }[] = [
  { code: "zh", name: "中文" },
  { code: "en", name: "English" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "pt", name: "Português" },
  { code: "ar", name: "العربية" },
  { code: "es", name: "Español" },
];
const RTL = new Set<Lang>(["ar"]);
const savedLang = localStorage.getItem("clink.lang") as Lang | null;
let lang: Lang = LANGS.some((l) => l.code === savedLang) ? savedLang! : "zh";

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    skills: "Skills", history: "History", addColumn: "+ Column", newBtn: "New",
    openFolder: "Open", openFailed: "Open failed: ", refresh: "Refresh",
    hint: "Toolbar / skills act on the highlighted column", import: "+ Import",
    filterSkills: "Filter name / description…", all: "All",
    newFileTitle: "New file / folder", cancel: "Cancel", makeDir: "New folder",
    makeFile: "New file", importTitle: "Import skill (copy folder)", importTo: "Import to:",
    importSrcPh: "Skill folder path, e.g. ~/Downloads/my-skill",
    importNeedSkill: "Folder must contain SKILL.md", importBtn: "Import",
    chooseFolder: "Choose folder", historyTitle: "History (click to resume)",
    historyFilterPh: "Filter title / dir…", close: "Close", dir: "Dir", argsLabel: "Args",
    pick: "Pick", argsPh: "e.g. --continue / --resume", newTab: "New tab",
    closeTab: "Close tab", procExited: "[process exited]", launchFailed: "Launch failed: ",
    loading: "Loading…", readFailed: "Read failed: ", noSkills: "No matching skills",
    clickDisable: "Click to disable", clickEnable: "Click to enable",
    toggleFailed: "Toggle failed: ", insertInto: "Click to insert into # pane",
    openToolFirst: "Open a # pane first",
    maxColumns: "Max # columns; unlimited tabs per column",
    dropped: "Dropped folder filled in; pick a tool and import", enterPath: "Enter a path",
    enterFolder: "Enter a folder path", created: "Created: ", noSessions: "No matching sessions",
    untitled: "(untitled)", pin: "Pin", del: "Delete",
    delConfirm: "Delete this # session? Files are removed from disk and cannot be recovered.",
    delFailed: "Delete failed: ",
  },
  zh: {
    skills: "技能", history: "历史", addColumn: "＋面板", newBtn: "新建", openFolder: "打开",
    openFailed: "打开失败: ", refresh: "刷新",
    hint: "点工具栏 / 技能会作用于「高亮」面板", import: "＋ 导入",
    filterSkills: "筛选 name / 描述…", all: "全部", newFileTitle: "新建文件 / 文件夹",
    cancel: "取消", makeDir: "建文件夹", makeFile: "建文件",
    importTitle: "导入技能（复制文件夹）", importTo: "导入到：",
    importSrcPh: "技能文件夹路径，如 ~/Downloads/my-skill",
    importNeedSkill: "文件夹里需包含 SKILL.md", importBtn: "导入", chooseFolder: "选择文件夹",
    historyTitle: "历史会话（点一下续接）", historyFilterPh: "筛选标题 / 目录…", close: "关闭",
    dir: "目录", argsLabel: "参数", pick: "选", argsPh: "如 --continue / --resume",
    newTab: "新标签", closeTab: "关闭标签", procExited: "[进程已退出]", launchFailed: "启动失败: ",
    loading: "加载中…", readFailed: "读取失败: ", noSkills: "无匹配技能",
    clickDisable: "点击禁用", clickEnable: "点击启用", toggleFailed: "切换失败: ",
    insertInto: "点击插入到 # 面板", openToolFirst: "请先开一个 # 面板",
    maxColumns: "最多 # 列，列内可加无限标签",
    dropped: "已填入拖入的文件夹，选好工具后点导入", enterPath: "请输入路径",
    enterFolder: "请输入文件夹路径", created: "已创建: ", noSessions: "无匹配会话",
    untitled: "(无标题)", pin: "置顶", del: "删除",
    delConfirm: "删除该 # 会话？会从磁盘移除对应文件，不可恢复。", delFailed: "删除失败: ",
  },
  ja: {
    skills: "スキル", history: "履歴", addColumn: "＋列", newBtn: "新規", openFolder: "開く",
    openFailed: "開けません: ", refresh: "更新",
    hint: "ツールバー／スキルはハイライトされた列に作用します", import: "＋ インポート",
    filterSkills: "名前／説明で絞り込み…", all: "すべて", newFileTitle: "新規ファイル／フォルダ",
    cancel: "キャンセル", makeDir: "フォルダ作成", makeFile: "ファイル作成",
    importTitle: "スキルをインポート（フォルダをコピー）", importTo: "インポート先：",
    importSrcPh: "スキルフォルダのパス、例 ~/Downloads/my-skill",
    importNeedSkill: "フォルダに SKILL.md が必要です", importBtn: "インポート",
    chooseFolder: "フォルダを選択", historyTitle: "履歴（クリックで再開）",
    historyFilterPh: "タイトル／ディレクトリで絞り込み…", close: "閉じる", dir: "ディレクトリ",
    argsLabel: "引数", pick: "選択", argsPh: "例 --continue / --resume", newTab: "新しいタブ",
    closeTab: "タブを閉じる", procExited: "[プロセスが終了しました]", launchFailed: "起動に失敗: ",
    loading: "読み込み中…", readFailed: "読み込み失敗: ", noSkills: "一致するスキルがありません",
    clickDisable: "クリックで無効化", clickEnable: "クリックで有効化", toggleFailed: "切り替えに失敗: ",
    insertInto: "クリックで # パネルに挿入", openToolFirst: "先に # パネルを開いてください",
    maxColumns: "最大 # 列、列内のタブは無制限",
    dropped: "ドロップしたフォルダを入力しました。ツールを選んでインポート",
    enterPath: "パスを入力してください", enterFolder: "フォルダのパスを入力してください",
    created: "作成しました: ", noSessions: "一致するセッションがありません", untitled: "(無題)",
    pin: "ピン留め", del: "削除",
    delConfirm: "この # セッションを削除しますか？ファイルはディスクから削除され、復元できません。",
    delFailed: "削除に失敗: ",
  },
  ko: {
    skills: "스킬", history: "기록", addColumn: "＋열", newBtn: "새로 만들기", openFolder: "열기",
    openFailed: "열기 실패: ", refresh: "새로고침",
    hint: "툴바／스킬은 강조된 열에 적용됩니다", import: "＋ 가져오기",
    filterSkills: "이름／설명으로 필터…", all: "전체", newFileTitle: "새 파일／폴더",
    cancel: "취소", makeDir: "폴더 만들기", makeFile: "파일 만들기",
    importTitle: "스킬 가져오기 (폴더 복사)", importTo: "가져올 대상:",
    importSrcPh: "스킬 폴더 경로, 예: ~/Downloads/my-skill",
    importNeedSkill: "폴더에 SKILL.md가 있어야 합니다", importBtn: "가져오기",
    chooseFolder: "폴더 선택", historyTitle: "기록 (클릭하여 이어가기)",
    historyFilterPh: "제목／디렉터리로 필터…", close: "닫기", dir: "디렉터리", argsLabel: "인자",
    pick: "선택", argsPh: "예: --continue / --resume", newTab: "새 탭", closeTab: "탭 닫기",
    procExited: "[프로세스 종료됨]", launchFailed: "실행 실패: ", loading: "불러오는 중…",
    readFailed: "읽기 실패: ", noSkills: "일치하는 스킬 없음", clickDisable: "클릭하여 비활성화",
    clickEnable: "클릭하여 활성화", toggleFailed: "전환 실패: ",
    insertInto: "클릭하여 # 패널에 삽입", openToolFirst: "먼저 # 패널을 여세요",
    maxColumns: "최대 # 열, 열당 탭 무제한",
    dropped: "드롭한 폴더를 입력했습니다. 도구를 선택하고 가져오기", enterPath: "경로를 입력하세요",
    enterFolder: "폴더 경로를 입력하세요", created: "생성됨: ", noSessions: "일치하는 세션 없음",
    untitled: "(제목 없음)", pin: "고정", del: "삭제",
    delConfirm: "이 # 세션을 삭제할까요? 파일이 디스크에서 제거되며 복구할 수 없습니다.",
    delFailed: "삭제 실패: ",
  },
  de: {
    skills: "Skills", history: "Verlauf", addColumn: "+ Spalte", newBtn: "Neu",
    openFolder: "Öffnen", openFailed: "Öffnen fehlgeschlagen: ", refresh: "Aktualisieren",
    hint: "Symbolleiste / Skills wirken auf die hervorgehobene Spalte", import: "+ Import",
    filterSkills: "Nach Name / Beschreibung filtern…", all: "Alle",
    newFileTitle: "Neue Datei / Ordner", cancel: "Abbrechen", makeDir: "Ordner erstellen",
    makeFile: "Datei erstellen", importTitle: "Skill importieren (Ordner kopieren)",
    importTo: "Importieren nach:", importSrcPh: "Skill-Ordnerpfad, z. B. ~/Downloads/my-skill",
    importNeedSkill: "Ordner muss SKILL.md enthalten", importBtn: "Importieren",
    chooseFolder: "Ordner wählen", historyTitle: "Verlauf (zum Fortsetzen klicken)",
    historyFilterPh: "Nach Titel / Verzeichnis filtern…", close: "Schließen", dir: "Ordner",
    argsLabel: "Args", pick: "Wählen", argsPh: "z. B. --continue / --resume",
    newTab: "Neuer Tab", closeTab: "Tab schließen", procExited: "[Prozess beendet]",
    launchFailed: "Start fehlgeschlagen: ", loading: "Wird geladen…",
    readFailed: "Lesen fehlgeschlagen: ", noSkills: "Keine passenden Skills",
    clickDisable: "Zum Deaktivieren klicken", clickEnable: "Zum Aktivieren klicken",
    toggleFailed: "Umschalten fehlgeschlagen: ", insertInto: "Klicken, um in das #-Panel einzufügen",
    openToolFirst: "Öffne zuerst ein #-Panel",
    maxColumns: "Max. # Spalten; unbegrenzte Tabs pro Spalte",
    dropped: "Abgelegter Ordner eingetragen; Tool wählen und importieren",
    enterPath: "Pfad eingeben", enterFolder: "Ordnerpfad eingeben", created: "Erstellt: ",
    noSessions: "Keine passenden Sitzungen", untitled: "(ohne Titel)", pin: "Anheften",
    del: "Löschen",
    delConfirm: "Diese #-Sitzung löschen? Dateien werden von der Festplatte entfernt und können nicht wiederhergestellt werden.",
    delFailed: "Löschen fehlgeschlagen: ",
  },
  fr: {
    skills: "Compétences", history: "Historique", addColumn: "+ Colonne", newBtn: "Nouveau",
    openFolder: "Ouvrir", openFailed: "Échec de l'ouverture : ", refresh: "Actualiser",
    hint: "La barre d'outils / les compétences agissent sur la colonne en surbrillance",
    import: "+ Importer", filterSkills: "Filtrer par nom / description…", all: "Tout",
    newFileTitle: "Nouveau fichier / dossier", cancel: "Annuler", makeDir: "Créer un dossier",
    makeFile: "Créer un fichier", importTitle: "Importer une compétence (copier le dossier)",
    importTo: "Importer vers :", importSrcPh: "Chemin du dossier de compétence, ex. ~/Downloads/my-skill",
    importNeedSkill: "Le dossier doit contenir SKILL.md", importBtn: "Importer",
    chooseFolder: "Choisir un dossier", historyTitle: "Historique (cliquer pour reprendre)",
    historyFilterPh: "Filtrer par titre / répertoire…", close: "Fermer", dir: "Dossier",
    argsLabel: "Args", pick: "Choisir", argsPh: "ex. --continue / --resume",
    newTab: "Nouvel onglet", closeTab: "Fermer l'onglet", procExited: "[processus terminé]",
    launchFailed: "Échec du lancement : ", loading: "Chargement…",
    readFailed: "Échec de lecture : ", noSkills: "Aucune compétence correspondante",
    clickDisable: "Cliquer pour désactiver", clickEnable: "Cliquer pour activer",
    toggleFailed: "Échec du basculement : ", insertInto: "Cliquer pour insérer dans le panneau #",
    openToolFirst: "Ouvrez d'abord un panneau #",
    maxColumns: "# colonnes max ; onglets illimités par colonne",
    dropped: "Dossier déposé renseigné ; choisissez un outil et importez",
    enterPath: "Saisissez un chemin", enterFolder: "Saisissez un chemin de dossier",
    created: "Créé : ", noSessions: "Aucune session correspondante", untitled: "(sans titre)",
    pin: "Épingler", del: "Supprimer",
    delConfirm: "Supprimer cette session # ? Les fichiers sont supprimés du disque et irrécupérables.",
    delFailed: "Échec de la suppression : ",
  },
  pt: {
    skills: "Habilidades", history: "Histórico", addColumn: "+ Coluna", newBtn: "Novo",
    openFolder: "Abrir", openFailed: "Falha ao abrir: ", refresh: "Atualizar",
    hint: "A barra de ferramentas / habilidades agem na coluna destacada", import: "+ Importar",
    filterSkills: "Filtrar por nome / descrição…", all: "Todas",
    newFileTitle: "Novo arquivo / pasta", cancel: "Cancelar", makeDir: "Criar pasta",
    makeFile: "Criar arquivo", importTitle: "Importar habilidade (copiar pasta)",
    importTo: "Importar para:", importSrcPh: "Caminho da pasta da habilidade, ex. ~/Downloads/my-skill",
    importNeedSkill: "A pasta precisa conter SKILL.md", importBtn: "Importar",
    chooseFolder: "Escolher pasta", historyTitle: "Histórico (clique para retomar)",
    historyFilterPh: "Filtrar por título / diretório…", close: "Fechar", dir: "Pasta",
    argsLabel: "Args", pick: "Escolher", argsPh: "ex. --continue / --resume", newTab: "Nova aba",
    closeTab: "Fechar aba", procExited: "[processo encerrado]", launchFailed: "Falha ao iniciar: ",
    loading: "Carregando…", readFailed: "Falha na leitura: ",
    noSkills: "Nenhuma habilidade correspondente", clickDisable: "Clique para desativar",
    clickEnable: "Clique para ativar", toggleFailed: "Falha ao alternar: ",
    insertInto: "Clique para inserir no painel #", openToolFirst: "Abra um painel # primeiro",
    maxColumns: "Máx. # colunas; abas ilimitadas por coluna",
    dropped: "Pasta arrastada preenchida; escolha uma ferramenta e importe",
    enterPath: "Digite um caminho", enterFolder: "Digite o caminho da pasta", created: "Criado: ",
    noSessions: "Nenhuma sessão correspondente", untitled: "(sem título)", pin: "Fixar",
    del: "Excluir",
    delConfirm: "Excluir esta sessão #? Os arquivos são removidos do disco e não podem ser recuperados.",
    delFailed: "Falha ao excluir: ",
  },
  ar: {
    skills: "المهارات", history: "السجل", addColumn: "+ عمود", newBtn: "جديد", openFolder: "فتح",
    openFailed: "فشل الفتح: ", refresh: "تحديث",
    hint: "شريط الأدوات / المهارات تؤثر على العمود المميَّز", import: "+ استيراد",
    filterSkills: "تصفية بالاسم / الوصف…", all: "الكل", newFileTitle: "ملف / مجلد جديد",
    cancel: "إلغاء", makeDir: "إنشاء مجلد", makeFile: "إنشاء ملف",
    importTitle: "استيراد مهارة (نسخ مجلد)", importTo: "استيراد إلى:",
    importSrcPh: "مسار مجلد المهارة، مثل ~/Downloads/my-skill",
    importNeedSkill: "يجب أن يحتوي المجلد على SKILL.md", importBtn: "استيراد",
    chooseFolder: "اختيار مجلد", historyTitle: "السجل (انقر للمتابعة)",
    historyFilterPh: "تصفية بالعنوان / المجلد…", close: "إغلاق", dir: "المجلد",
    argsLabel: "الوسائط", pick: "اختيار", argsPh: "مثل --continue / --resume",
    newTab: "علامة تبويب جديدة", closeTab: "إغلاق علامة التبويب", procExited: "[انتهت العملية]",
    launchFailed: "فشل التشغيل: ", loading: "جارٍ التحميل…", readFailed: "فشل القراءة: ",
    noSkills: "لا توجد مهارات مطابقة", clickDisable: "انقر للتعطيل", clickEnable: "انقر للتفعيل",
    toggleFailed: "فشل التبديل: ", insertInto: "انقر للإدراج في لوحة #",
    openToolFirst: "افتح لوحة # أولاً", maxColumns: "# أعمدة كحد أقصى؛ علامات تبويب غير محدودة لكل عمود",
    dropped: "تم إدخال المجلد المسحوب؛ اختر أداة ثم استورد", enterPath: "أدخل مسارًا",
    enterFolder: "أدخل مسار المجلد", created: "تم الإنشاء: ", noSessions: "لا توجد جلسات مطابقة",
    untitled: "(بدون عنوان)", pin: "تثبيت", del: "حذف",
    delConfirm: "حذف هذه الجلسة #؟ ستُزال الملفات من القرص ولا يمكن استرجاعها.",
    delFailed: "فشل الحذف: ",
  },
  es: {
    skills: "Habilidades", history: "Historial", addColumn: "+ Columna", newBtn: "Nuevo",
    openFolder: "Abrir", openFailed: "Error al abrir: ", refresh: "Actualizar",
    hint: "La barra de herramientas / habilidades actúan sobre la columna resaltada",
    import: "+ Importar", filterSkills: "Filtrar por nombre / descripción…", all: "Todas",
    newFileTitle: "Nuevo archivo / carpeta", cancel: "Cancelar", makeDir: "Crear carpeta",
    makeFile: "Crear archivo", importTitle: "Importar habilidad (copiar carpeta)",
    importTo: "Importar a:", importSrcPh: "Ruta de la carpeta de la habilidad, p. ej. ~/Downloads/my-skill",
    importNeedSkill: "La carpeta debe contener SKILL.md", importBtn: "Importar",
    chooseFolder: "Elegir carpeta", historyTitle: "Historial (haz clic para reanudar)",
    historyFilterPh: "Filtrar por título / directorio…", close: "Cerrar", dir: "Carpeta",
    argsLabel: "Args", pick: "Elegir", argsPh: "p. ej. --continue / --resume",
    newTab: "Nueva pestaña", closeTab: "Cerrar pestaña", procExited: "[proceso finalizado]",
    launchFailed: "Error al iniciar: ", loading: "Cargando…", readFailed: "Error de lectura: ",
    noSkills: "No hay habilidades coincidentes", clickDisable: "Haz clic para desactivar",
    clickEnable: "Haz clic para activar", toggleFailed: "Error al cambiar: ",
    insertInto: "Haz clic para insertar en el panel #", openToolFirst: "Abre primero un panel #",
    maxColumns: "Máx. # columnas; pestañas ilimitadas por columna",
    dropped: "Carpeta soltada rellenada; elige una herramienta e importa",
    enterPath: "Introduce una ruta", enterFolder: "Introduce la ruta de una carpeta",
    created: "Creado: ", noSessions: "No hay sesiones coincidentes", untitled: "(sin título)",
    pin: "Fijar", del: "Eliminar",
    delConfirm: "¿Eliminar esta sesión #? Los archivos se eliminan del disco y no se pueden recuperar.",
    delFailed: "Error al eliminar: ",
  },
};

function tr(key: string, arg?: string): string {
  const dict = STRINGS[lang] ?? STRINGS.en;
  const s = dict[key] ?? STRINGS.en[key] ?? key;
  return arg !== undefined ? s.replace("#", arg) : s;
}

function applyStaticI18n() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = tr(el.dataset.i18n!);
  });
  document.querySelectorAll<HTMLInputElement>("[data-i18n-ph]").forEach((el) => {
    el.placeholder = tr(el.dataset.i18nPh!);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = tr(el.dataset.i18nTitle!);
  });
}

function setLang(l: Lang) {
  lang = l;
  localStorage.setItem("clink.lang", l);
  document.documentElement.lang = l;
  document.documentElement.dir = RTL.has(l) ? "rtl" : "ltr";
  applyStaticI18n();
  panes.forEach((p) => {
    p.tabs.forEach((tm) => tm.relabel());
    p.renderTabs();
  });
}

async function pickFolder(): Promise<string | null> {
  const sel = await open({ directory: true });
  return typeof sel === "string" ? sel : null;
}

type Skill = {
  name: string;
  description: string;
  source: string;
  tool: string;
  enabled: boolean;
  dir: string;
};

const panes: Pane[] = [];
let paneSeq = 0;
let termSeq = 0;
let sessionSeq = 0;
let activePane: Pane | null = null;
let cachedSkills: Skill[] = [];
let toolFilter: "all" | "claude" | "codex" | "grok" = "all";
const MAX_PANES = 3;
let hintTimer: ReturnType<typeof setTimeout> | undefined;

const panesEl = () => document.getElementById("panes")!;

function activeTerm(): Term | null {
  return activePane?.active ?? null;
}

// One terminal session (a tab). Its `host` lives in the owning pane's body when active.
class Term {
  id = `t${++termSeq}`;
  host: HTMLElement;
  term: Terminal | null = null;
  fit: FitAddon | null = null;
  sessionId: string | null = null;
  cwd = "~";
  program = "";
  title = "";
  private unlisten: UnlistenFn[] = [];
  private ro: ResizeObserver | null = null;
  private refitRaf = 0;

  constructor(public pane: Pane) {
    this.host = document.createElement("div");
    this.host.className = "term-host";
    this.showLauncher();
  }

  private showLauncher() {
    this.host.innerHTML = `
      <div class="launcher">
        <div class="launch-row"><label>${tr("dir")}</label><input class="cwd" value="~" /><button class="pick-cwd" type="button">${tr("pick")}</button></div>
        <div class="launch-row"><label>${tr("argsLabel")}</label><input class="args" placeholder="${tr("argsPh")}" /></div>
        <div class="launch-btns">
          <button data-prog="claude">▶ Claude</button>
          <button data-prog="codex">▶ Codex</button>
          <button data-prog="grok">▶ Grok</button>
        </div>
      </div>`;
    const cwdInput = this.host.querySelector(".cwd") as HTMLInputElement;
    this.host.querySelector(".pick-cwd")!.addEventListener("click", async () => {
      const dir = await pickFolder();
      if (dir) cwdInput.value = dir;
    });
    this.host.querySelectorAll<HTMLButtonElement>(".launch-btns button").forEach((b) =>
      b.addEventListener("click", () => {
        const cwd = cwdInput.value || "~";
        const argStr = (this.host.querySelector(".args") as HTMLInputElement).value.trim();
        this.launch(b.dataset.prog!, argStr ? argStr.split(/\s+/) : [], cwd);
      }),
    );
  }

  // Re-render the launcher in the current language (only for un-launched tabs),
  // preserving any text the user already typed.
  relabel() {
    if (this.program) return;
    const cwd = (this.host.querySelector(".cwd") as HTMLInputElement)?.value;
    const args = (this.host.querySelector(".args") as HTMLInputElement)?.value;
    this.showLauncher();
    if (cwd) (this.host.querySelector(".cwd") as HTMLInputElement).value = cwd;
    if (args) (this.host.querySelector(".args") as HTMLInputElement).value = args;
  }

  async launch(program: string, args: string[], cwd: string) {
    this.teardown();
    this.host.innerHTML = "";

    const term = new Terminal({
      fontFamily: "Menlo, Monaco, monospace",
      fontSize: 13,
      cursorBlink: true,
      smoothScrollDuration: 120,
      scrollback: 5000,
      // Hold Option (mac) to force a normal text selection even when a TUI has mouse
      // tracking on (claude/codex/grok), so selecting + copying works.
      macOptionClickForcesSelection: true,
      theme: { background: "#1e1e1e", foreground: "#d4d4d4" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(this.host);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      /* no WebGL — keep default renderer */
    }
    fit.fit();
    this.term = term;
    this.fit = fit;

    const sid = `s${++sessionSeq}`;
    this.sessionId = sid;
    this.cwd = cwd;
    this.program = program;
    this.title = `${program} · ${shortCwd(cwd) || cwd}`;
    this.pane.renderTabs();

    const onData = new Channel<ArrayBuffer>();
    onData.onmessage = (msg) => {
      if (this.term) this.term.write(new Uint8Array(msg));
    };
    this.unlisten.push(
      await listen(`pty:exit:${sid}`, () => {
        term.writeln(`\r\n\x1b[90m${tr("procExited")}\x1b[0m`);
        if (this.sessionId === sid) this.sessionId = null;
      }),
    );

    try {
      await invoke("spawn_pty", {
        id: sid,
        program,
        args,
        cwd,
        cols: term.cols,
        rows: term.rows,
        onData,
      });
    } catch (err) {
      term.writeln(`\x1b[31m${tr("launchFailed")}${err}\x1b[0m`);
      return;
    }

    term.onData((d) => invoke("write_pty", { id: sid, data: d }));

    // Clipboard: Cmd+C copies the selection (Ctrl+C still sends SIGINT to the app),
    // Cmd+V pastes into the PTY. When a TUI has mouse mode on, select with Option+drag.
    let lastSelection = "";
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !e.metaKey) return true;
      if (e.key === "c") {
        const sel = term.getSelection() || lastSelection;
        if (!sel) return true;
        clipWrite(sel)
          .then(() => flashHint(`✓ copied ${sel.length} chars`))
          .catch((err) => flashHint("copy failed: " + err));
        return false;
      }
      if (e.key === "v") {
        clipRead()
          .then((t) => (t ? invoke("write_pty", { id: sid, data: t }) : flashHint("clipboard empty")))
          .catch((err) => flashHint("paste failed: " + err));
        return false;
      }
      return true;
    });
    // Track the latest non-empty selection and auto-copy it, so Option+drag alone
    // puts text on the clipboard. A TUI may emit a trailing empty selection event;
    // ignoring empties keeps the real selection on the clipboard.
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) {
        lastSelection = sel;
        clipWrite(sel).catch(() => {});
      }
    });

    this.ro = new ResizeObserver(() => this.refit());
    this.ro.observe(this.host);
    this.pane.setActiveTerm(this);
  }

  // Coalesce rapid refit calls (window resize, divider drag, ResizeObserver) into at
  // most one fit + resize_pty per frame, so resizing stays smooth.
  refit() {
    if (this.refitRaf) return;
    this.refitRaf = requestAnimationFrame(() => {
      this.refitRaf = 0;
      if (!this.term || !this.fit) return;
      // Skip hidden tabs: fitting a display:none host yields 0 and would shrink the PTY.
      if (this.host.clientWidth === 0 || this.host.clientHeight === 0) return;
      try {
        this.fit.fit();
      } catch {
        /* host not laid out yet */
      }
      if (this.sessionId)
        invoke("resize_pty", { id: this.sessionId, cols: this.term.cols, rows: this.term.rows });
    });
  }

  sendText(text: string) {
    if (this.sessionId) invoke("write_pty", { id: this.sessionId, data: text });
    this.term?.focus();
  }

  teardown() {
    if (this.refitRaf) cancelAnimationFrame(this.refitRaf);
    this.refitRaf = 0;
    this.ro?.disconnect();
    this.ro = null;
    this.unlisten.forEach((u) => u());
    this.unlisten = [];
    if (this.sessionId) invoke("close_pty", { id: this.sessionId });
    this.sessionId = null;
    this.term?.dispose();
    this.term = null;
    this.fit = null;
  }
}

// A column: a tab strip plus the active tab's body. Holds one or more Terms.
class Pane {
  id = `pane-${++paneSeq}`;
  root: HTMLElement;
  tabsEl: HTMLElement;
  bodyEl: HTMLElement;
  grow = 1;
  tabs: Term[] = [];
  active: Term | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "pane";
    this.root.innerHTML = `<div class="pane-tabs"></div><div class="pane-body"></div>`;
    this.tabsEl = this.root.querySelector(".pane-tabs")!;
    this.bodyEl = this.root.querySelector(".pane-body")!;
    this.root.addEventListener("mousedown", () => setActivePane(this), true);
    this.addTab();
  }

  addTab(): Term {
    const t = new Term(this);
    this.tabs.push(t);
    this.bodyEl.appendChild(t.host);
    this.setActiveTerm(t);
    return t;
  }

  closeTab(t: Term) {
    t.teardown();
    t.host.remove();
    const i = this.tabs.indexOf(t);
    if (i < 0) return;
    this.tabs.splice(i, 1);
    if (this.tabs.length === 0) {
      if (panes.length > 1) {
        removePane(this);
        return;
      }
      this.addTab(); // keep at least one tab in the last column
      return;
    }
    if (this.active === t) this.setActiveTerm(this.tabs[Math.max(0, i - 1)]);
    else this.renderTabs();
  }

  // All tab hosts stay mounted; switching only toggles visibility, so there is no
  // reattach/reflow and the active terminal's canvas is never blanked.
  setActiveTerm(t: Term) {
    this.active = t;
    this.tabs.forEach((tm) => tm.host.classList.toggle("term-host--hidden", tm !== t));
    this.renderTabs();
    setActivePane(this);
    t.refit();
    t.term?.focus();
  }

  renderTabs() {
    this.tabsEl.innerHTML = "";
    for (const tm of this.tabs) {
      const label = tm.program ? tm.title : tr("newTab");
      const chip = document.createElement("div");
      chip.className = "tab" + (tm === this.active ? " active" : "");
      chip.innerHTML = `<span class="tab-title">${esc(label)}</span><button class="tab-close" title="${tr("closeTab")}">✕</button>`;
      chip.addEventListener("click", () => this.setActiveTerm(tm));
      chip.querySelector(".tab-close")!.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeTab(tm);
      });
      this.tabsEl.appendChild(chip);
    }
    const add = document.createElement("button");
    add.className = "tab-add";
    add.textContent = "+";
    add.title = tr("newTab");
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      this.addTab();
    });
    this.tabsEl.appendChild(add);
  }

  refit() {
    this.active?.refit();
  }
}

function setActivePane(p: Pane) {
  activePane = p;
  panes.forEach((pp) => pp.root.classList.toggle("active", pp === p));
}

function addPane(): Pane {
  const p = new Pane();
  panes.push(p);
  setActivePane(p);
  layoutPanes();
  return p;
}

function removePane(p: Pane) {
  p.tabs.forEach((t) => t.teardown());
  panes.splice(panes.indexOf(p), 1);
  if (panes.length === 0) {
    addPane();
    return;
  }
  if (activePane === p) setActivePane(panes[0]);
  layoutPanes();
}

// Rebuild #panes with draggable dividers between columns. Re-appending an existing
// pane node only moves it, so the live terminals inside are preserved.
function layoutPanes() {
  const el = panesEl();
  el.replaceChildren();
  panes.forEach((p, i) => {
    p.root.style.flex = `${p.grow} 1 0`;
    el.appendChild(p.root);
    if (i < panes.length - 1) el.appendChild(makeDivider(panes[i], panes[i + 1]));
  });
  refitAll();
}

function makeDivider(a: Pane, b: Pane): HTMLElement {
  const d = document.createElement("div");
  d.className = "divider";
  d.addEventListener("mousedown", (e) => startDrag(e, a, b));
  return d;
}

function startDrag(e: MouseEvent, a: Pane, b: Pane) {
  e.preventDefault();
  const startX = e.clientX;
  const wA = a.root.offsetWidth;
  const totalW = wA + b.root.offsetWidth;
  const totalGrow = a.grow + b.grow;
  const perPx = totalGrow / totalW;
  const minGrow = 140 * perPx;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  let raf = 0;

  const onMove = (ev: MouseEvent) => {
    const newA = Math.max(minGrow, Math.min(totalGrow - minGrow, (wA + ev.clientX - startX) * perPx));
    a.grow = newA;
    b.grow = totalGrow - newA;
    a.root.style.flex = `${a.grow} 1 0`;
    b.root.style.flex = `${b.grow} 1 0`;
    if (!raf)
      raf = requestAnimationFrame(() => {
        raf = 0;
        a.refit();
        b.refit();
      });
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    a.refit();
    b.refit();
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function refitAll() {
  panes.forEach((p) => p.refit());
}

async function loadSkills() {
  const list = document.getElementById("skills-list")!;
  list.innerHTML = `<div class='muted'>${tr("loading")}</div>`;
  try {
    cachedSkills = await invoke<Skill[]>("list_skills");
  } catch (e) {
    list.innerHTML = `<div class='muted'>${tr("readFailed")}${e}</div>`;
    return;
  }
  renderSkills();
}

function renderSkills() {
  const list = document.getElementById("skills-list")!;
  const q = (document.getElementById("skills-filter") as HTMLInputElement).value.toLowerCase();
  const items = cachedSkills.filter(
    (s) =>
      (toolFilter === "all" || s.tool === toolFilter) &&
      (s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
  );
  if (items.length === 0) {
    list.innerHTML = `<div class='muted'>${tr("noSkills")}</div>`;
    return;
  }
  list.innerHTML = "";
  for (const s of items) {
    const el = document.createElement("div");
    el.className = "skill" + (s.enabled ? "" : " off");
    el.title = tr("insertInto", s.tool);
    const toggle =
      s.source === "user"
        ? `<button class="skill-toggle ${s.enabled ? "on" : ""}" title="${s.enabled ? tr("clickDisable") : tr("clickEnable")}">${s.enabled ? "●" : "○"}</button>`
        : "";
    el.innerHTML = `<div class="skill-row">
        <div class="skill-main">
          <div class="skill-name"><span class="skill-tool ${esc(s.tool)}">${esc(s.tool)}</span> /${esc(s.name)} <span class="skill-src">${esc(s.source)}</span></div>
          <div class="skill-desc">${esc(s.description)}</div>
        </div>
        ${toggle}
      </div>`;
    el.querySelector(".skill-main")!.addEventListener("click", () => useSkill(s));
    const tg = el.querySelector(".skill-toggle");
    if (tg)
      tg.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await invoke("set_skill_enabled", { tool: s.tool, dir: s.dir, enabled: !s.enabled });
        } catch (err) {
          flashHint(tr("toggleFailed") + err);
          return;
        }
        await loadSkills();
      });
    list.appendChild(el);
  }
}

// Route the skill to a tab running the matching tool: prefer the active tab, else
// the first matching live tab anywhere. Warn if none is running that tool.
function useSkill(s: Skill) {
  let target: Term | null = null;
  const at = activeTerm();
  if (at && at.program === s.tool && at.sessionId) target = at;
  else
    outer: for (const p of panes)
      for (const t of p.tabs)
        if (t.program === s.tool && t.sessionId) {
          target = t;
          break outer;
        }
  if (!target) {
    flashHint(tr("openToolFirst", s.tool));
    return;
  }
  target.pane.setActiveTerm(target);
  target.sendText(`/${s.name} `);
}

function flashHint(text: string) {
  const h = document.querySelector(".hint") as HTMLElement;
  h.textContent = text;
  h.style.color = "#ff6b6b";
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    h.textContent = tr("hint");
    h.style.color = "";
  }, 2000);
}

function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

window.addEventListener("DOMContentLoaded", () => {
  applyStaticI18n();
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.has(lang) ? "rtl" : "ltr";
  addPane();

  const langSel = document.getElementById("lang-select") as HTMLSelectElement;
  for (const { code, name } of LANGS) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    langSel.appendChild(opt);
  }
  langSel.value = lang;
  langSel.addEventListener("change", () => setLang(langSel.value as Lang));

  document.getElementById("toggle-skills")!.addEventListener("click", () => {
    const s = document.getElementById("skills")!;
    s.classList.toggle("hidden");
    if (!s.classList.contains("hidden") && cachedSkills.length === 0) loadSkills();
    refitAll();
  });

  document.getElementById("add-pane")!.addEventListener("click", () => {
    if (panes.length >= MAX_PANES) {
      flashHint(tr("maxColumns", String(MAX_PANES)));
      return;
    }
    addPane();
  });

  document.getElementById("open-folder")!.addEventListener("click", openFolder);

  document.getElementById("open-folder")!.addEventListener("click", () => {
    const cwd = activeTerm()?.cwd || "~";
    invoke("open_path", { path: cwd }).catch((e) => flashHint(tr("openFailed") + e));
  });

  document.getElementById("skills-refresh")!.addEventListener("click", loadSkills);
  document.getElementById("skills-filter")!.addEventListener("input", renderSkills);
  window.addEventListener("resize", refitAll);

  document.querySelectorAll<HTMLButtonElement>(".skills-tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      toolFilter = b.dataset.tool as typeof toolFilter;
      document
        .querySelectorAll(".skills-tabs button")
        .forEach((x) => x.classList.toggle("active", x === b));
      renderSkills();
    }),
  );

  setupNewPathModal();
  setupImportModal();
  setupHistory();
  setupDragDrop();
});

// Drop a skill folder (or its SKILL.md) onto the window → prefill the import modal.
function setupDragDrop() {
  getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type !== "drop") return;
    if (!event.payload.paths.length) return;
    let p = event.payload.paths[0];
    if (p.toLowerCase().endsWith("/skill.md")) p = p.slice(0, p.lastIndexOf("/"));
    openImportWith(p);
  });
}

function openImportWith(path: string) {
  const modal = document.getElementById("import-modal")!;
  (document.getElementById("import-src") as HTMLInputElement).value = path;
  const msg = document.getElementById("import-msg")!;
  msg.textContent = tr("dropped");
  msg.className = "modal-msg";
  modal.classList.remove("hidden");
}

// Toolbar "Open folder": pick a directory and stage a new terminal tab there,
// reusing an empty active tab if present. The user then picks a tool to launch.
async function openFolder() {
  const dir = await pickFolder();
  if (!dir) return;
  const pane = activePane ?? panes[0] ?? addPane();
  const t = pane.active && !pane.active.sessionId ? pane.active : pane.addTab();
  pane.setActiveTerm(t);
  const cwdInput = t.host.querySelector(".cwd") as HTMLInputElement | null;
  if (cwdInput) {
    cwdInput.value = dir;
    cwdInput.focus();
  }
}

type Session = {
  id: string;
  title: string;
  cwd: string;
  updated_at: string;
  tool: string;
};
let cachedSessions: Session[] = [];
let historyTool: "all" | "claude" | "codex" | "grok" = "all";
const pins = loadPins();

function pinKey(s: Session): string {
  return `${s.tool}:${s.id}`;
}
function loadPins(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("clink.pins") || "[]"));
  } catch {
    return new Set();
  }
}
function savePins() {
  localStorage.setItem("clink.pins", JSON.stringify([...pins]));
}

function setupHistory() {
  const modal = document.getElementById("history-modal")!;
  const close = () => modal.classList.add("hidden");

  document.getElementById("toggle-history")!.addEventListener("click", async () => {
    modal.classList.remove("hidden");
    await loadSessions();
  });
  document.getElementById("history-close")!.addEventListener("click", close);
  modal.addEventListener("mousedown", (e) => {
    if (e.target === modal) close();
  });
  document.getElementById("history-filter")!.addEventListener("input", renderSessions);
  document.querySelectorAll<HTMLButtonElement>("#history-tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      historyTool = b.dataset.tool as typeof historyTool;
      document
        .querySelectorAll("#history-tabs button")
        .forEach((x) => x.classList.toggle("active", x === b));
      renderSessions();
    }),
  );
}

async function loadSessions() {
  const list = document.getElementById("history-list")!;
  list.innerHTML = `<div class='muted'>${tr("loading")}</div>`;
  try {
    cachedSessions = await invoke<Session[]>("list_sessions");
  } catch (e) {
    list.innerHTML = `<div class='muted'>${tr("readFailed")}${e}</div>`;
    return;
  }
  renderSessions();
}

function renderSessions() {
  const list = document.getElementById("history-list")!;
  const q = (document.getElementById("history-filter") as HTMLInputElement).value.toLowerCase();
  const items = cachedSessions.filter(
    (s) =>
      (historyTool === "all" || s.tool === historyTool) &&
      ((s.title || "").toLowerCase().includes(q) || (s.cwd || "").toLowerCase().includes(q)),
  );
  items.sort((a, b) => (pins.has(pinKey(b)) ? 1 : 0) - (pins.has(pinKey(a)) ? 1 : 0));
  if (items.length === 0) {
    list.innerHTML = `<div class='muted'>${tr("noSessions")}</div>`;
    return;
  }
  list.innerHTML = "";
  for (const s of items) {
    const when = s.updated_at ? new Date(s.updated_at).toLocaleString() : "";
    const pinned = pins.has(pinKey(s));
    const el = document.createElement("div");
    el.className = "hist-item";
    el.innerHTML = `<div class="hist-row">
        <div class="hist-main">
          <div class="hist-title"><span class="skill-tool ${esc(s.tool)}">${esc(s.tool)}</span> ${esc(s.title || tr("untitled"))}</div>
          <div class="hist-meta"><span>${esc(shortCwd(s.cwd))}</span><span>${esc(when)}</span></div>
        </div>
        <div class="hist-actions">
          <button class="hist-pin ${pinned ? "on" : ""}" title="${tr("pin")}">${pinned ? "★" : "☆"}</button>
          <button class="hist-del" title="${tr("del")}">🗑</button>
        </div>
      </div>`;
    el.querySelector(".hist-main")!.addEventListener("click", () => resumeSession(s));
    el.querySelector(".hist-pin")!.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pinned) pins.delete(pinKey(s));
      else pins.add(pinKey(s));
      savePins();
      renderSessions();
    });
    el.querySelector(".hist-del")!.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSession(s);
    });
    list.appendChild(el);
  }
}

async function deleteSession(s: Session) {
  if (!confirm(tr("delConfirm", s.tool) + "\n\n" + (s.title || s.id))) return;
  try {
    await invoke("delete_session", { tool: s.tool, id: s.id });
  } catch (e) {
    alert(tr("delFailed") + e);
    return;
  }
  const match = (x: Session) => x.tool === s.tool && x.id === s.id;
  cachedSessions = cachedSessions.filter((x) => !match(x));
  pins.delete(pinKey(s));
  savePins();
  renderSessions();
}

function shortCwd(cwd: string): string {
  if (!cwd) return "";
  const home = "/Users/";
  return cwd.startsWith(home) ? "~/" + cwd.split("/").slice(3).join("/") : cwd;
}

function resumeSession(s: Session) {
  const args = s.tool === "codex" ? ["resume", s.id] : ["--resume", s.id];
  const cwd = s.cwd || "~";
  const pane = activePane ?? panes[0] ?? addPane();
  const t = pane.active && !pane.active.sessionId ? pane.active : pane.addTab();
  t.launch(s.tool, args, cwd);
  document.getElementById("history-modal")!.classList.add("hidden");
}

function setupImportModal() {
  const modal = document.getElementById("import-modal")!;
  const src = document.getElementById("import-src") as HTMLInputElement;
  const msg = document.getElementById("import-msg")!;

  const openModal = () => {
    src.value = "";
    msg.textContent = tr("importNeedSkill");
    msg.className = "modal-msg";
    modal.classList.remove("hidden");
    src.focus();
  };
  const close = () => modal.classList.add("hidden");

  const go = async () => {
    const path = src.value.trim();
    if (!path) {
      msg.textContent = tr("enterFolder");
      msg.className = "modal-msg err";
      return;
    }
    const tool = (document.querySelector('input[name="imp-tool"]:checked') as HTMLInputElement).value;
    try {
      const res = await invoke<string>("import_skill", { src: path, tool });
      msg.textContent = res;
      msg.className = "modal-msg ok";
      await loadSkills();
      setTimeout(close, 800);
    } catch (e) {
      msg.textContent = String(e);
      msg.className = "modal-msg err";
    }
  };

  document.getElementById("skills-import")!.addEventListener("click", openModal);
  document.getElementById("import-cancel")!.addEventListener("click", close);
  document.getElementById("import-go")!.addEventListener("click", go);
  document.getElementById("import-pick")!.addEventListener("click", async () => {
    const dir = await pickFolder();
    if (dir) src.value = dir;
  });
  modal.addEventListener("mousedown", (e) => {
    if (e.target === modal) close();
  });
  src.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
    if (e.key === "Escape") close();
  });
}

function setupNewPathModal() {
  const modal = document.getElementById("newfile-modal")!;
  const input = document.getElementById("newfile-path") as HTMLInputElement;
  const msg = document.getElementById("newfile-msg")!;

  const openModal = () => {
    const base = activeTerm()?.cwd && activeTerm()!.cwd !== "~" ? activeTerm()!.cwd : "~";
    input.value = base.endsWith("/") ? base : base + "/";
    msg.textContent = "";
    msg.className = "modal-msg";
    modal.classList.remove("hidden");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };
  const close = () => modal.classList.add("hidden");

  const create = async (isDir: boolean) => {
    const path = input.value.trim();
    if (!path) {
      msg.textContent = tr("enterPath");
      msg.className = "modal-msg err";
      return;
    }
    try {
      const full = await invoke<string>("create_path", { path, isDir });
      msg.textContent = tr("created") + full;
      msg.className = "modal-msg ok";
      setTimeout(close, 700);
    } catch (e) {
      msg.textContent = String(e);
      msg.className = "modal-msg err";
    }
  };

  document.getElementById("new-path")!.addEventListener("click", openModal);
  document.getElementById("newfile-cancel")!.addEventListener("click", close);
  document.getElementById("newfile-file")!.addEventListener("click", () => create(false));
  document.getElementById("newfile-dir")!.addEventListener("click", () => create(true));
  modal.addEventListener("mousedown", (e) => {
    if (e.target === modal) close();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") create(false);
    if (e.key === "Escape") close();
  });
}
