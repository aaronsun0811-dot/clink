use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, State};

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
}

#[derive(Default)]
struct Ptys(Arc<Mutex<HashMap<String, Session>>>);

fn expand_home(p: &str) -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    if p.is_empty() || p == "~" {
        return home;
    }
    if let Some(rest) = p.strip_prefix("~/") {
        return format!("{home}/{rest}");
    }
    p.to_string()
}

// A bundled .app launched from Finder inherits only a minimal PATH, so the user's
// node (nvm/homebrew/custom) is missing and `env node` shebangs fail. Resolve the
// real PATH once from their login shell. Cached for the process lifetime.
fn full_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let from_shell = std::process::Command::new(&shell)
            .args(["-lic", "printf '__CLINK__%s' \"$PATH\""])
            .stdin(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .output()
            .ok()
            .and_then(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .split("__CLINK__")
                    .nth(1)
                    .map(|p| p.trim().to_string())
            })
            .filter(|p| !p.is_empty())
            .unwrap_or_else(|| std::env::var("PATH").unwrap_or_default());
        format!("{home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:{from_shell}")
    })
}

// Resolve a bare program name to an absolute path so it works even when the app
// is launched from Finder (no shell PATH). claude/codex live in ~/.local/bin.
fn resolve_program(program: &str) -> String {
    if program.contains('/') {
        return program.to_string();
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let mut dirs = vec![
        format!("{home}/.local/bin"),
        format!("{home}/.grok/bin"),
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
    ];
    dirs.extend(full_path().split(':').map(|s| s.to_string()));
    for d in dirs {
        let cand = Path::new(&d).join(program);
        if cand.is_file() {
            return cand.to_string_lossy().to_string();
        }
    }
    program.to_string()
}

#[tauri::command]
fn spawn_pty(
    app: AppHandle,
    ptys: State<Ptys>,
    id: String,
    program: String,
    args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    on_data: tauri::ipc::Channel<tauri::ipc::Response>,
) -> Result<(), String> {
    // Defense-in-depth: only ever launch the three known CLIs. Even if the webview
    // were somehow compromised, it cannot spawn arbitrary binaries.
    if !matches!(program.as_str(), "claude" | "codex" | "grok") {
        return Err(format!("program not allowed: {program}"));
    }

    let pair = native_pty_system()
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(resolve_program(&program));
    for a in &args {
        cmd.arg(a);
    }
    cmd.cwd(expand_home(&cwd));

    // CommandBuilder inherits the parent environment; override PATH with the user's
    // real login-shell PATH (so node/nvm tools resolve) and TERM (for TUI rendering).
    cmd.env("PATH", full_path());
    cmd.env("TERM", "xterm-256color");

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Register the session before spawning the reader thread, so a fast-exiting
    // process can't remove its own entry before it's been inserted.
    let map = ptys.0.clone();
    map.lock().unwrap().insert(
        id.clone(),
        Session {
            writer,
            master: pair.master,
        },
    );

    // Reader thread: stream raw bytes to the frontend over a binary Channel (sent as
    // an ArrayBuffer, no JSON array-of-numbers overhead). Don't decode to String here
    // — a multi-byte UTF-8 char can straddle a read boundary and corrupt.
    let id_out = id;
    let app_out = app.clone();
    std::thread::spawn(move || {
        // 64KB buffer: fewer reads and IPC sends under heavy output (build logs etc.),
        // which keeps rendering smoother.
        let mut buf = [0u8; 65536];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let _ = on_data.send(tauri::ipc::Response::new(buf[..n].to_vec()));
                }
            }
        }
        // Process ended: drop the session so its writer/master don't leak.
        map.lock().unwrap().remove(&id_out);
        let _ = app_out.emit(&format!("pty:exit:{id_out}"), ());
    });

    // Reap the child so it doesn't linger as a zombie.
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

#[tauri::command]
fn write_pty(ptys: State<Ptys>, id: String, data: String) -> Result<(), String> {
    if let Some(s) = ptys.0.lock().unwrap().get_mut(&id) {
        s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        s.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize_pty(ptys: State<Ptys>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    if let Some(s) = ptys.0.lock().unwrap().get(&id) {
        s.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_pty(ptys: State<Ptys>, id: String) {
    // Dropping the master closes the PTY; the child receives SIGHUP.
    ptys.0.lock().unwrap().remove(&id);
}

// Enable/disable a user skill by moving its folder between skills/ and
// skills-disabled/. Reversible, no data loss. Only applies to ~/.<tool>/skills.
#[tauri::command]
fn set_skill_enabled(tool: String, dir: String, enabled: bool) -> Result<(), String> {
    let base = match tool.as_str() {
        "claude" => ".claude",
        "codex" => ".codex",
        "grok" => ".grok",
        _ => return Err("未知工具".to_string()),
    };
    // `dir` is the skill's path relative to skills/ (may be nested, e.g.
    // "category/my-skill"). Allow '/' but reject empties, absolutes, and any
    // "."/".." component so it can't escape the skills root.
    if dir.is_empty()
        || dir.starts_with('/')
        || dir.split('/').any(|c| c.is_empty() || c == "." || c == "..")
    {
        return Err("无效技能目录".to_string());
    }
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let root = Path::new(&home).join(base);
    let live = root.join("skills").join(&dir);
    let off = root.join("skills-disabled").join(&dir);
    let (from, to) = if enabled { (&off, &live) } else { (&live, &off) };
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::rename(from, to).map_err(|e| e.to_string())?;
    Ok(())
}

// Open a folder (or file) in Finder via the macOS `open` command. No plugin needed.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let full = expand_home(&path);
    std::process::Command::new("open")
        .arg(&full)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_path(path: String, is_dir: bool) -> Result<String, String> {
    let full = expand_home(&path);
    let p = Path::new(&full);
    if p.exists() {
        return Err(format!("已存在: {full}"));
    }
    if is_dir {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    } else {
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::File::create(p).map_err(|e| e.to_string())?;
    }
    Ok(full)
}

#[derive(Serialize)]
struct SkillInfo {
    name: String,
    description: String,
    source: String,
    tool: String,
    enabled: bool,
    dir: String,
}

fn parse_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    let mut name = None;
    let mut desc = None;
    let trimmed = content.trim_start();
    if let Some(rest) = trimmed.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            for line in rest[..end].lines() {
                let line = line.trim();
                if let Some(v) = line.strip_prefix("name:") {
                    name = Some(v.trim().trim_matches(['"', '\'']).to_string());
                } else if let Some(v) = line.strip_prefix("description:") {
                    desc = Some(v.trim().trim_matches(['"', '\'']).to_string());
                }
            }
        }
    }
    (name, desc)
}

// `base` is the skills root (skills/ or skills-disabled/); recorded `dir` is each
// skill's path relative to it, so nested skills (skills/category/foo) round-trip
// correctly through set_skill_enabled.
fn walk_skills(
    base: &Path,
    dir: &Path,
    depth: usize,
    tool: &str,
    source: &str,
    enabled: bool,
    out: &mut Vec<SkillInfo>,
) {
    if depth == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let path = e.path();
        if !path.is_dir() {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        if skill_md.is_file() {
            if let Ok(content) = std::fs::read_to_string(&skill_md) {
                let (n, d) = parse_frontmatter(&content);
                let folder = path.file_name().unwrap().to_string_lossy().to_string();
                let rel = path
                    .strip_prefix(base)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();
                out.push(SkillInfo {
                    name: n.unwrap_or_else(|| folder.clone()),
                    description: d.unwrap_or_default(),
                    source: source.to_string(),
                    tool: tool.to_string(),
                    enabled,
                    dir: rel,
                });
            }
        } else {
            walk_skills(base, &path, depth - 1, tool, source, enabled, out);
        }
    }
}

#[tauri::command]
fn list_skills() -> Vec<SkillInfo> {
    let mut out = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        for (tool, base) in [("claude", ".claude"), ("codex", ".codex"), ("grok", ".grok")] {
            let root = Path::new(&home).join(base);
            let live = root.join("skills");
            let disabled = root.join("skills-disabled");
            walk_skills(&live, &live, 3, tool, "user", true, &mut out);
            walk_skills(&disabled, &disabled, 3, tool, "user", false, &mut out);
        }
        let plugins = Path::new(&home).join(".claude/plugins");
        walk_skills(&plugins, &plugins, 7, "claude", "plugin", true, &mut out);
    }
    out.sort_by(|a, b| {
        a.tool
            .cmp(&b.tool)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    out.dedup_by(|a, b| a.name == b.name && a.tool == b.tool);
    out
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn import_skill(src: String, tool: String) -> Result<String, String> {
    let src_full = expand_home(&src);
    let src_path = Path::new(&src_full);
    if !src_path.is_dir() {
        return Err(format!("不是文件夹: {src_full}"));
    }
    if !src_path.join("SKILL.md").is_file() {
        return Err("该文件夹里没有 SKILL.md".to_string());
    }
    let sub = match tool.as_str() {
        "claude" => ".claude/skills",
        "codex" => ".codex/skills",
        "grok" => ".grok/skills",
        _ => return Err("tool 必须是 claude / codex / grok".to_string()),
    };
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let name = src_path
        .file_name()
        .ok_or("无效路径")?
        .to_string_lossy()
        .to_string();
    let dst = Path::new(&home).join(sub).join(&name);
    if dst.exists() {
        return Err(format!("已存在同名技能: {name}"));
    }
    copy_dir_all(src_path, &dst).map_err(|e| e.to_string())?;
    Ok(format!("已导入到 {tool}: {name}"))
}

#[derive(Serialize)]
struct SessionInfo {
    id: String,
    title: String,
    cwd: String,
    updated_at: String,
    tool: String,
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn list_codex(home: &str, out: &mut Vec<SessionInfo>) {
    let idx = Path::new(home).join(".codex/session_index.jsonl");
    if let Ok(content) = std::fs::read_to_string(&idx) {
        for line in content.lines() {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
                continue;
            };
            let Some(id) = v.get("id").and_then(|x| x.as_str()) else {
                continue;
            };
            out.push(SessionInfo {
                id: id.to_string(),
                title: v
                    .get("thread_name")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
                cwd: String::new(),
                updated_at: v
                    .get("updated_at")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
                tool: "codex".to_string(),
            });
        }
    }
}

fn list_grok(home: &str, out: &mut Vec<SessionInfo>) {
    let root = Path::new(home).join(".grok/sessions");
    let Ok(entries) = std::fs::read_dir(&root) else {
        return;
    };
    for e in entries.flatten() {
        let dir = e.path();
        let ph = dir.join("prompt_history.jsonl");
        if !ph.is_file() {
            continue;
        }
        let cwd = percent_decode(&e.file_name().to_string_lossy());
        let mut seen: HashMap<String, (String, String)> = HashMap::new();
        if let Ok(content) = std::fs::read_to_string(&ph) {
            for line in content.lines() {
                let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
                    continue;
                };
                let Some(id) = v.get("session_id").and_then(|x| x.as_str()) else {
                    continue;
                };
                let prompt = v.get("prompt").and_then(|x| x.as_str()).unwrap_or("");
                let ts = v.get("timestamp").and_then(|x| x.as_str()).unwrap_or("");
                let entry = seen
                    .entry(id.to_string())
                    .or_insert_with(|| (prompt.chars().take(80).collect(), ts.to_string()));
                if ts > entry.1.as_str() {
                    entry.1 = ts.to_string();
                }
            }
        }
        for (id, (title, ts)) in seen {
            out.push(SessionInfo {
                id,
                title,
                cwd: cwd.clone(),
                updated_at: ts,
                tool: "grok".to_string(),
            });
        }
    }
}

fn claude_user_text(v: &serde_json::Value) -> String {
    let msg = v.get("message").unwrap_or(v);
    let text = match msg.get("content") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .find_map(|b| b.get("text").and_then(|x| x.as_str()))
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    };
    text.lines().next().unwrap_or("").chars().take(80).collect()
}

fn claude_session(path: &Path) -> Option<SessionInfo> {
    let id = path.file_stem()?.to_string_lossy().to_string();
    let mut cwd = String::new();
    let mut title = String::new();
    let file = std::fs::File::open(path).ok()?;
    for line in std::io::BufReader::new(file).lines().take(120).map_while(Result::ok) {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if cwd.is_empty() {
            if let Some(c) = v.get("cwd").and_then(|x| x.as_str()) {
                cwd = c.to_string();
            }
        }
        if title.is_empty() && v.get("type").and_then(|x| x.as_str()) == Some("user") {
            title = claude_user_text(&v);
        }
        if !cwd.is_empty() && !title.is_empty() {
            break;
        }
    }
    let updated_at = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
        .unwrap_or_default();
    Some(SessionInfo {
        id,
        title,
        cwd,
        updated_at,
        tool: "claude".to_string(),
    })
}

fn list_claude(home: &str, out: &mut Vec<SessionInfo>) {
    let root = Path::new(home).join(".claude/projects");
    let Ok(dirs) = std::fs::read_dir(&root) else {
        return;
    };
    for d in dirs.flatten() {
        if !d.path().is_dir() {
            continue;
        }
        let Ok(files) = std::fs::read_dir(d.path()) else {
            continue;
        };
        for f in files.flatten() {
            let p = f.path();
            if p.extension().and_then(|x| x.to_str()) == Some("jsonl") {
                if let Some(s) = claude_session(&p) {
                    out.push(s);
                }
            }
        }
    }
}

#[tauri::command]
fn list_sessions() -> Vec<SessionInfo> {
    let mut out = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        list_claude(&home, &mut out);
        list_codex(&home, &mut out);
        list_grok(&home, &mut out);
    }
    // ISO-8601 UTC strings sort chronologically as plain strings; newest first.
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    out
}

fn find_named(root: &Path, name: &str, depth: usize, out: &mut Vec<PathBuf>) {
    if depth == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            find_named(&p, name, depth - 1, out);
        } else if p.file_name().map(|n| n.to_string_lossy() == name).unwrap_or(false) {
            out.push(p);
        }
    }
}

fn find_name_contains(root: &Path, needle: &str, depth: usize, out: &mut Vec<PathBuf>) {
    if depth == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            find_name_contains(&p, needle, depth - 1, out);
        } else if p.file_name().map(|n| n.to_string_lossy().contains(needle)).unwrap_or(false) {
            out.push(p);
        }
    }
}

// Content file(s) for a session, used by delete_session.
fn session_content_paths(home: &str, tool: &str, id: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    match tool {
        "claude" => find_named(
            &Path::new(home).join(".claude/projects"),
            &format!("{id}.jsonl"),
            3,
            &mut out,
        ),
        "codex" => find_name_contains(
            &Path::new(home).join(".codex/sessions"),
            id,
            6,
            &mut out,
        ),
        "grok" => {
            let mut dirs = Vec::new();
            find_named_dir(&Path::new(home).join(".grok/sessions"), id, 3, &mut dirs);
            for d in dirs {
                out.push(d.join("chat_history.jsonl"));
            }
        }
        _ => {}
    }
    out
}

fn find_named_dir(root: &Path, name: &str, depth: usize, out: &mut Vec<PathBuf>) {
    if depth == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        if p.file_name().map(|n| n.to_string_lossy() == name).unwrap_or(false) {
            out.push(p);
        } else {
            find_named_dir(&p, name, depth - 1, out);
        }
    }
}

#[tauri::command]
fn delete_session(tool: String, id: String) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    // Remove the conversation content file(s).
    for path in session_content_paths(&home, &tool, &id) {
        let _ = std::fs::remove_file(&path);
    }
    match tool.as_str() {
        "codex" => {
            // Drop the matching line from the session index.
            let idx = Path::new(&home).join(".codex/session_index.jsonl");
            if let Ok(content) = std::fs::read_to_string(&idx) {
                let kept: Vec<&str> = content.lines().filter(|l| !l.contains(&id)).collect();
                let _ = std::fs::write(&idx, kept.join("\n") + "\n");
            }
        }
        "grok" => {
            // Remove the session subdir and its lines from prompt_history.jsonl.
            let mut dirs = Vec::new();
            find_named_dir(&Path::new(&home).join(".grok/sessions"), &id, 3, &mut dirs);
            for d in &dirs {
                let _ = std::fs::remove_dir_all(d);
                if let Some(parent) = d.parent() {
                    let ph = parent.join("prompt_history.jsonl");
                    if let Ok(content) = std::fs::read_to_string(&ph) {
                        let kept: Vec<&str> =
                            content.lines().filter(|l| !l.contains(&id)).collect();
                        let _ = std::fs::write(&ph, kept.join("\n") + "\n");
                    }
                }
            }
        }
        _ => {}
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Ptys::default())
        .invoke_handler(tauri::generate_handler![
            spawn_pty,
            write_pty,
            resize_pty,
            close_pty,
            list_skills,
            set_skill_enabled,
            open_path,
            create_path,
            import_skill,
            list_sessions,
            delete_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
