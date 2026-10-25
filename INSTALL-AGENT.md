# Setup instructions for an AI agent

You're an agent (Claude Code or similar) setting up this DoorLoop MCP server on the user's own computer.
Do as much as you can yourself and keep the user's work to the few steps only they can do, listed at the
end. Check before installing anything, and skip what's already there.

## Rules

- **Never handle the DoorLoop API key.** Don't ask for it in chat, don't read it back, and don't pass it on a
  command line. The user enters it themselves in their own terminal (step 5).
- **No admin passwords.** Prefer installs that don't need `sudo` or an admin prompt. If one is unavoidable,
  tell the user the exact command and why, and let them run it.
- **Ask before changing global settings** beyond what's listed here.
- Report each step in one short line as you go, and stop on the first failure you can't fix.

## 1. Find out what's there

Run these and note what's missing. Node.js needs to be version 20 or newer.

```sh
uname -s            # Darwin = macOS, Linux = Linux. On Windows, use the Windows section instead.
node -v
npm -v
git --version
claude --version    # Claude Code
gh --version        # optional, makes GitHub sign-in easier
```

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

### Linux

- Git: usually present. If not, the system package manager needs `sudo`
  (`sudo apt install git`, `sudo dnf install git`); tell the user to run it.
- Node.js 20+: use nvm exactly as on macOS.
- The keychain helper `secret-tool` is needed for the API key: `sudo apt install libsecret-tools`
  (Debian/Ubuntu) or `sudo dnf install libsecret` (Fedora); tell the user to run it.

### Windows

`npm run setup` doesn't support Windows. Use the Claude Desktop extension instead:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Git.Git -e
```

Open a new terminal so `node` and `git` are on the PATH. Do steps 3 and 4. Then run `npm run pack` and
tell the user to double-click `doorloop-mcp.mcpb`. Claude Desktop asks them for the API key and stores it.
Then go to step 7.

## 3. Get the code

The repo is private, so the user's GitHub account needs access to `ricseasons/doorloop-mcp`. Rico adds
people as collaborators.

```sh
gh auth status || echo "not signed in"
```

If they're not signed in, tell the user to run `gh auth login` and follow the prompts in their browser.
Without `gh`, git asks for sign-in on the first clone. Then:

```sh
git clone https://github.com/ricseasons/doorloop-mcp.git
cd doorloop-mcp
```

If the clone says "repository not found", the account doesn't have access yet. Tell the user to ask Rico.

## 4. Check the API key exists

The user needs a DoorLoop API key, made in DoorLoop under **Settings > Zapier & API Keys**. DoorLoop's base
plan includes API access. If they don't have one, tell them where to make it. Don't ask them to send it to you.

## 5. Run setup (macOS and Linux)

`npm run setup` installs, builds, saves the key, checks it against DoorLoop, registers the server with
Claude Code, and links the skills. It's safe to run more than once.

The key prompt is hidden input that you can't type into. So:

1. Check whether a key is already saved. This prints nothing secret:
   - macOS: `security find-generic-password -s doorloop-mcp -a api-key >/dev/null 2>&1 && echo saved || echo missing`
   - Linux: `secret-tool lookup service doorloop-mcp account api-key >/dev/null 2>&1 && echo saved || echo missing`
2. If it's missing, tell the user: "Open a terminal in the doorloop-mcp folder and run `npm run set-key`,
   then paste your DoorLoop API key when it asks (the input is hidden)." Wait until they say it's done.
3. Run `npm run setup` yourself. It should print `Connected to DoorLoop as <name>`.

If it says DoorLoop didn't accept the key, ask the user to run `npm run set-key` again with a fresh key.

## 6. Check it

Start a new Claude Code session, because the current one won't see the new server. Then ask
"who am I in DoorLoop?", which calls the `whoami` tool. It should answer with the user's DoorLoop name.

## 7. Only the user can do these

Tell the user about these at the end, as one short list, and only the ones that apply:

- **Adding units or new properties:** install the Claude in Chrome extension and allow it. Step-by-step
  for Mac and Windows: [skills/doorloop-web-forms/SETUP.md](skills/doorloop-web-forms/SETUP.md).
- **Before adding units:** be signed in to DoorLoop in Chrome. Claude never signs in for them.
- **Claude Desktop users:** add the skills under Settings > Capabilities > Skills (one zip per folder in
  `skills/`).

## Undo

```sh
claude mcp remove doorloop
rm ~/.claude/skills/doorloop-*
security delete-generic-password -s doorloop-mcp -a api-key   # macOS: removes the saved key
```
