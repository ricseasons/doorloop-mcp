# Setting up Claude in Chrome

You may not need this. Adding units and properties normally goes through the `create_unit` and
`create_property_with_units` tools after a one-time `npm run login` (see the README). Set up Claude in
Chrome only if you'd rather not save a web login, or as a fallback.

Claude fills in DoorLoop forms through **Claude in Chrome**, a browser extension from Anthropic. This
is a one-time setup. When walking someone through it, give one step at a time and wait for them to say
it's done.

Sources: [Getting started with Claude in Chrome](https://support.claude.com/en/articles/12012173),
[Claude in Chrome troubleshooting](https://support.claude.com/en/articles/12902405-claude-in-chrome-troubleshooting),
[Use Claude Code with Chrome](https://code.claude.com/docs/en/chrome).

## What you need

- A paid Claude plan: Pro, Max, Team or Enterprise.
- **Google Chrome** on a Mac or Windows PC. (Anthropic's help center says Chrome only. Claude Code also
  works with Microsoft Edge, but Chrome is the safe choice.)
- On Windows with Claude Code: run Claude Code in Windows itself, not inside WSL. WSL isn't supported.
- Your DoorLoop login.

## 1. Install the extension (same on Mac and Windows)

1. Open Chrome and go to the
   [Claude extension in the Chrome Web Store](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn).
2. Click **Add to Chrome**, then **Add extension**.
3. Sign in with your Claude account, the same one you use for the Claude app or Claude Code.
4. Pin it so it's easy to find: click the puzzle-piece icon at the top right of Chrome, then the
   thumbtack next to **Claude**.
5. Accept the permissions it asks for. These are Chrome permissions so it can read pages, click and type.
   It needs version 1.0.36 or later; Chrome updates it automatically.

No macOS or Windows system settings (like Accessibility or Screen Recording) are mentioned in
Anthropic's docs for this; if the computer shows a prompt anyway, read it to Claude before allowing it.

## 2a. Connect it to the Claude desktop app

1. In the Claude app, click your initials at the bottom left, then **Settings > Connectors**.
2. Find **Claude in Chrome**, click **Configure**, and turn it on. Install the extension if asked.
3. In each new chat, turn it on from the **Connectors** menu in the message box. It's off by default for
   every conversation.

## 2b. Or connect it to Claude Code

1. Make sure Claude Code is signed in with your Claude account: run `/login`. (If it's set up with an API
   key instead, Chrome stays off.)
2. Start Claude Code with Chrome turned on:

   ```sh
   claude --chrome
   ```

3. Approve the one-time dialog that explains the feature.
4. Run `/chrome`. It should show **Status: Enabled** and **Extension: Installed**. Choose
   **Enabled by default** there so you don't need `--chrome` next time.
5. If this is the first time, quit and reopen Chrome. Chrome only notices the connection when it starts.

## 3. Allow DoorLoop

1. Open Chrome and log in to DoorLoop. Stay logged in; Claude uses that login and never sees your
   password.
2. The first time Claude acts on DoorLoop, you'll be asked to allow it (in Claude Code the prompt starts
   "Claude in Chrome wants to"). Choose the option to allow actions on that site. Your DoorLoop address
   looks like `yourcompany.app.doorloop.com`.
3. You can change which sites Claude may use later in the Claude extension's settings in Chrome.

Claude will still stop and ask before it saves anything in DoorLoop, and it will pause for login pages or
CAPTCHAs so you can handle them.

## If it isn't working

- **"Extension not connected" or "not detected"**
  1. Go to `chrome://extensions` and check that **Claude** is turned on.
  2. Make sure Chrome is open.
  3. In Claude Code, run `/chrome` and choose **Reconnect extension**. In the desktop app, check the
     Claude in Chrome connector is on for this chat.
  4. Quit and reopen both Chrome and Claude.
- **"Receiving end does not exist"** or it stops working after being idle: `/chrome` >
  **Reconnect extension**.
- **Still not connected**: the extension must be signed in to the same Claude account and organization
  as Claude. In Claude Code, `/status` shows the organization. To switch, log out in the extension's
  settings and log back in. (Logging out of the extension deletes its saved shortcuts and scheduled
  tasks.)
- **Sign-in trouble**: confirm the plan is paid, clear cookies for claude.ai, then sign out and back in.
- **Windows only, Claude Code**:
  - An `EADDRINUSE` error means another Claude Code window is using the connection. Close the other
    Claude Code sessions and try again.
  - If the connection keeps crashing, reinstall Claude Code.
- **Where Claude Code registers itself with Chrome** (for whoever is troubleshooting):
  - Mac: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json`
  - Windows: under the registry key `HKCU\Software\Google\Chrome\NativeMessagingHosts\`
