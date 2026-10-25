# Setup instructions for an AI agent

You're an agent (Claude Code or similar) installing this DoorLoop MCP server and its skills on the user's
own Mac or Windows PC (Linux works too). Do as much as you can yourself and keep the user's work to the few
steps only they can do. Check before installing anything, and skip what's already there. The user may not
be technical: one step at a time, plain words, no jargon.

If the repo is already on this computer and the user wants an **update**, skip to "Updating" at the end.

## Rules

- **Never handle the DoorLoop API key.** Don't ask for it in chat, don't read it back, and don't pass it on
  a command line. The user types it into a hidden prompt in their own terminal window (step 5).
- **No admin passwords.** Prefer installs that don't need `sudo` or an admin prompt. If one is unavoidable,
  tell the user what will pop up and why, and let them approve it.
- **Ask before changing global settings** beyond what's listed here.
- Report each step in one short line as you go, and stop on the first failure you can't fix.

## 1. Find out what's there

macOS (Terminal):

```sh
node -v; npm -v; git --version; gh --version
```

Windows (PowerShell). Run it in Windows itself, not inside WSL:

```powershell
node -v; npm -v; git --version; gh --version
```

Node.js needs to be version 20 or newer. `gh` (GitHub CLI) is optional but makes GitHub sign-in easier.

## 2. Install what's missing

### macOS

- **Git:** if `git --version` opens a dialog or fails, tell the user to click Install in the
  "command line developer tools" dialog (`xcode-select --install` opens it). Wait until it's done.
- **Node.js 20+:**
  - If Homebrew is installed (`brew -v`): `brew install node@22 && brew link --overwrite node@22`.
  - Otherwise, install it per user with nvm, without admin rights:
    ```sh
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
    nvm install 22 && nvm alias default 22
    ```
    New terminals pick it up automatically. In this session, source `nvm.sh` before using `node`.
- **GitHub CLI (optional):** `brew install gh` if Homebrew is there.

### Windows

Use `winget` (built into Windows 10 and 11):

```powershell
winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements   # optional
```

Node.js and Git may show a Windows "Do you want to allow this app to make changes" prompt. Tell the user
to click Yes. Afterwards `node` and `git` are only on the PATH in new windows; in this session, refresh it:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
```

### Linux

- Git: usually present. If not, the system package manager needs `sudo`; tell the user to run it.
- Node.js 20+: use nvm exactly as on macOS.
- The keychain helper `secret-tool` is needed for the API key: `sudo apt install libsecret-tools`
  (Debian/Ubuntu) or `sudo dnf install libsecret` (Fedora); tell the user to run it.

## 3. Get the code

The repo is private, so the user's GitHub account needs access to `ricseasons/doorloop-mcp`. Rico adds
people as collaborators.

```sh
gh auth status
```

If they're not signed in, tell the user to run `gh auth login` in their own terminal and follow the prompts
in their browser. Without `gh`, git asks for sign-in on the first clone (on Windows, a browser window
opens). Clone into the user's home folder unless they name another place:

```sh
cd ~
git clone https://github.com/ricseasons/doorloop-mcp.git
cd doorloop-mcp
```

If the clone says "repository not found", the account doesn't have access yet. Tell the user to ask Rico.
If `doorloop-mcp` already exists there, use it: `git pull --ff-only` instead of cloning.

## 4. Check the API key exists

The user needs a DoorLoop API key, made in DoorLoop under **Settings > Zapier & API Keys**. DoorLoop's base
plan includes API access. If they don't have one, tell them where to make it. Don't ask them to send it to you.

## 5. Save the key and run setup

`npm run setup` installs, builds, checks the key against DoorLoop, registers the server with Claude Code
and Claude Desktop (whichever are installed), and installs the skills. It's safe to run more than once.

The key prompt is hidden input that you can't type into. So:

1. Check whether a key is already saved. This prints `saved` or `missing`, never the key:
   `npm run set-key -- --check`
2. If it's missing, tell the user: "Open a new Terminal (Mac) or PowerShell (Windows) window, go to the
   doorloop-mcp folder (`cd ~/doorloop-mcp`), run `npm run set-key`, and paste your DoorLoop API key when it
   asks. Nothing shows while you paste; that's normal." Wait until they say it's done, then check again.
3. Run `npm run setup` yourself. It should print `Connected to DoorLoop as <name>`.

If it says DoorLoop didn't accept the key, ask the user to run `npm run set-key` again with a fresh key.

Where things go: the key goes into the Mac Keychain or Windows Credential Manager. The skills are linked
into `~/.claude/skills` for Claude Code and zipped into `skill-zips/` for Claude Desktop. If Claude Desktop
is installed, `doorloop` is added to its `claude_desktop_config.json` (the old file is kept as `.bak`).

## 6. Check it

Start a new Claude Code session, because the current one won't see the new server (Claude Desktop needs a
quit and reopen). Then ask "who am I in DoorLoop?", which calls the `whoami` tool. It should answer with
the user's DoorLoop name.

## 7. Only the user can do these

Setup ends with a list of what's left by hand. Pass on the ones that apply as one short list:

- **Claude Desktop skills:** in Claude Desktop, go to Settings > Capabilities > Skills and upload each zip
  from the `skill-zips` folder. (Open it for them: `open skill-zips` on Mac, `explorer skill-zips` on
  Windows.)
- **Adding units or new properties:** install the Claude in Chrome extension and allow it. Walk them through
  [skills/doorloop-web-forms/SETUP.md](skills/doorloop-web-forms/SETUP.md) one step at a time.
- **Before adding units:** be signed in to DoorLoop in Chrome. Claude never signs in for them.

## Updating

In the doorloop-mcp folder, run `npm run update`. It pulls the latest code and reruns setup, which rebuilds
and adds any new skills. Claude Code picks up skill changes on its own; for Claude Desktop, upload the
changed zips again, and restart either app so it reloads the server.

## Undo

```sh
claude mcp remove doorloop --scope user
npm run set-key -- --delete        # removes the saved key
```

Then delete the `doorloop-*` links in `~/.claude/skills` (on Windows, `%USERPROFILE%\.claude\skills`), remove
`doorloop` from `claude_desktop_config.json` and the DoorLoop skills in Claude Desktop, and delete the
doorloop-mcp folder.
