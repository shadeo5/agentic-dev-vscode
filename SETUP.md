# SETUP.md — Local developer environment

Everything you need installed on your Mac before we build StoreFlow, with a
plain-English note on *what each thing is and why*. Run the checks first; only
install what's missing.

## The quick check
Open the **Terminal** app and paste each line (press Enter after each). Each one
prints a version if it's installed, or an error if it's not.

```bash
git --version      # version control — you already have this working
node --version     # the JavaScript runtime — needed for StoreFlow
npm --version      # Node's package manager — comes with Node
code --version     # VS Code command-line launcher (optional but handy)
```

You've already confirmed git and the GitHub push loop work, so that one's done.
The one you said you're unsure about is **Node / npm** — let's cover it.

## What are Node and npm? (the why)
- **Node.js** is a program that runs JavaScript/TypeScript *outside the browser*
  — on your machine or a server. Our API (`api/`) and our build tools all run on
  Node. As a front-end dev you've used the *output* of Node tooling (Vite,
  bundlers); here you'll run it directly.
- **npm** ("Node Package Manager") installs the open-source libraries a project
  depends on (React, Express, Vitest, etc.) and runs project scripts like
  `npm run dev` or `npm test`. It ships *inside* Node — install Node and you get
  npm automatically. You don't install npm separately.
- A project lists its dependencies in a `package.json` file; `npm install` reads
  that file and downloads everything into a `node_modules/` folder (which we
  git-ignore — it's regenerated, not committed).

## Installing Node (pick ONE option)

### Option A — nvm (recommended for developers)
`nvm` = "Node Version Manager." It lets you install and switch between Node
versions per project, which matters once you work on more than one codebase.
Slightly more setup now, saves pain later.

```bash
# 1. install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# 2. close and reopen Terminal (so it picks up nvm), then:
nvm install 24      # install Node 24 (Active LTS — matches StoreFlow)
nvm use 24
nvm alias default 24 # make 24 the default in new terminals

# 3. verify
node --version       # should print v24.x
npm --version
```

### Option B — official installer (simplest)
If you'd rather not touch the terminal for this: go to **https://nodejs.org**,
download the **LTS** ("Long Term Support") macOS installer, run it, then reopen
Terminal and run `node --version` to confirm. This installs Node 22-class LTS
plus npm.

> Either option is fine. If you think you'll juggle multiple projects/versions,
> do Option A. If you want the fastest path to "it works," do Option B.

## VS Code (your editor + where Claude Code lives)
- If `code --version` errored or VS Code isn't installed: download it from
  **https://code.visualstudio.com** and install.
- To enable the `code` command: open VS Code → Command Palette
  (`Cmd+Shift+P`) → type **"Shell Command: Install 'code' command in PATH"** →
  Enter. Now `code .` opens the current folder in VS Code from the terminal.

## Claude Code
You already have Claude Code working in the terminal (per your README). To
confirm: run `claude --version`. We'll use it from inside the project folder so
it picks up the `CLAUDE.md` we wrote.

## Optional, later — the Superpowers plugin
A community plugin that bundles disciplined workflows (test-first, debugging,
planning, code review) as installable *skills*. We'll do those workflows by hand
first so you understand them, then optionally install it to automate them:

```bash
# inside Claude Code:
/plugin install superpowers@claude-plugins-official
```

## Definition of done for this phase
`git`, `node`, and `npm` all print versions in your terminal, VS Code is
installed, and `claude` runs. Then we're ready to scaffold the app.
```bash
git --version && node --version && npm --version && claude --version
```
