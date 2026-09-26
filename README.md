# ⚡ ForgeLoop — Autonomous Coding Agent Harness

> **Not just another coding chatbot.** ForgeLoop is an autonomous engineering agent harness whose main differentiators are **Self-Verification**, **Token-Efficient Context Management**, **Structured Failure Recovery**, and **Evidence-Based Completion**.

---

## 🎯 The Core Problem & Philosophy

Standard LLM coding assistants and simple agent wrappers suffer from three critical flaws:
1. **Context Bloat & Token Waste**: They repeatedly dump entire repositories, unpruned test files, and lengthy conversation histories into the foundation model on every turn. This exhausts context windows, increases latency, degrades reasoning quality ("lost in the middle"), and explodes costs.
2. **Unverified Hallucinations**: They make an edit and prematurely claim *"I have completed your task!"* without verifying that tests actually passed or inspecting git diffs.
3. **Fragile Error Loops**: When an implementation fails, naive agents either retry blindly with the entire bloated conversation history or give up, repeating the same mistake.

**ForgeLoop solves this through an autonomous harness built around empirical verification and targeted context economics.**

---

## 🏆 Core Differentiators

### 1. 🔍 Token-Efficient Context Engine (Search Before Reading)
- **Search Before Reading**: Scans repository structure and outlines before loading raw file contents.
- **Explainable Relevance Scoring**: Calculates relevance scores (0–100%) for each file and outputs human-readable inclusion/exclusion reasons (e.g., *"Contains target endpoint /api/products"*, *"Referenced by products.test.js"*, or *"Unrelated to current task requirements"*).
- **Targeted Code Slicing**: Instead of feeding 1,000-line controller files, extracts targeted function/class AST slices matching the task.
- **Empirical Baseline Benchmark**: Compares ForgeLoop against naive full repository dumps, reporting actual measured token counts and percentage savings (typically **40% – 75%+ reduction** in context tokens).

### 2. 🛡️ Evidence-Based Self-Verification
The agent **never** simply declares "done". A task is marked `TASK VERIFIED ✓` only when:
- Automated test suites (`node --test`, Jest, etc.) exit with code `0`.
- Test assertions pass with verified counts (e.g., `3/3 passed`).
- Git diff is inspected and non-empty.
- The requested target files or endpoints were actually modified in the diff.

### 3. 🧠 Structured Failure Memory & Targeted Recovery
When tests fail, ForgeLoop does **NOT** resend the whole conversation. It:
1. Parses test runner outputs into **Structured Failure Memory**:
   ```json
   {
     "type": "TEST_FAILURE",
     "file": "test/auth.test.js",
     "test": "returns 401 when Authorization header lacks Bearer prefix",
     "expected": "401",
     "received": "200",
     "likely_area": "Authorization header Bearer prefix validation in auth middleware",
     "attempt": 1
   }
   ```
2. Sends **only** the original task + failure record + targeted function slice + previous attempted fix.
3. Applies a targeted patch and re-verifies.
4. Enforces safety limits: If safe retry limit is reached without success, it escalates to `BLOCKED / NEEDS HUMAN REVIEW` rather than pretending success.

### 4. 🔒 Controlled Tool Layer & Safeguards
- Restrictive permission sandbox: `list_files`, `search_code`, `read_file`, `read_file_range`, `write_file`, `edit_file`, `run_tests`, `git_diff`, `git_status`, `git_reset`.
- Execution timeouts (default 25s–35s).
- Destructive command filters (blocks `rm -rf /`, `mkfs`, fork bombs, unauthorized shell execution).
- Path traversal protection enforcing operations remain inside repository roots.

---

## 🏗️ Architecture & State Machine

```
                 USER TASK
                     ↓
         [ State: ANALYZING ] (Task understood)
                     ↓
         [ State: SEARCHING ] (Search before reading)
                     ↓
      [ State: CONTEXT_SELECTED ] (Rank & extract targeted slices)
                     ↓
         [ State: PLANNING ] (Structured step formulation)
                     ↓
       [ State: IMPLEMENTING ] (Model synthesizes targeted patch)
                     ↓
          [ Tool Action: edit_file ]
                     ↓
          [ State: TESTING ] (Execute automated tests)
                     ↓
               Tests Passed?
              ├── YES ──► [ State: VERIFYING ]
              │                 ↓
              │          Inspect Git Diff & Proof
              │                 ↓
              │          [ State: COMPLETED ] ──► TASK VERIFIED ✓
              │
              └── NO
                    ↓
         [ State: FAILURE_ANALYSIS ] (Parse assertions & stack)
                    ↓
         [ Structured Failure Memory ] (Store error signature)
                    ↓
         [ State: RECOVERING ] (Retrieve targeted failure slice ONLY)
                    ↓
         [ Model: Targeted Repair ]
                    ↓
         [ Retry within safe limit (Max 3) ]
                    ↓
         [ Re-Test & Verify ]
```

---

## 💻 Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Server-Sent Events (SSE) real-time streaming.
- **Backend**: Node.js (ESM), Express.
- **Agent Harness**: Custom modular TypeScript/JavaScript architecture:
  - `orchestrator.js`: Master execution coordinator
  - `contextEngine.js`: Relevance scoring, keyword tokenization, targeted code slicer
  - `failureAnalyzer.js`: Automated failure parsing into structured memory
  - `recoveryEngine.js`: Targeted recovery and repair loop
  - `verifier.js`: Multi-point evidence validator
  - `tokenManager.js`: Actual token accounting & baseline benchmarking
  - `stateManager.js`: Observable state machine with SSE events
  - `modelProvider.js`: Pluggable provider abstraction (Autonomous Smart Engine, Google Gemini API, OpenAI/Claude compatible)
- **Tools**: Controlled tool layer with path validation, timeouts, and structured logging.

---

## 🚀 Official Hackathon Evaluation Quickstart

### Prerequisites
- Node.js v18+ (tested on Node v20 & v24)
- npm v9+
- Git / Make

### 1. Configure Evaluation API Key
```bash
# Set the evaluation key (supports DeepSeek, Qwen, or OpenAI-compatible models)
export AI_API_KEY="<your-provided-key>"

# Optional: configure model provider (defaults to deepseek)
# export MODEL_PROVIDER="deepseek"
# export MODEL_NAME="deepseek-chat"      # or deepseek-reasoner, qwen-plus, etc.
```

### 2. Setup
```bash
make setup
```
Installs all dependencies, compiles the web client, and initializes the persistent SQLite database (`forgeloop.db`).

### 3. Run ForgeLoop
```bash
make run
```
Starts the ForgeLoop server on **`http://localhost:4000`** (serving both backend REST API and the full interactive Web UI).

### 4. Supply Coding Issues / Evaluation Tasks

You can supply issues to ForgeLoop through any of the following 3 ways:

#### A. Headless Evaluation CLI
```bash
make eval TASK="Add pagination to the /api/products endpoint and update the tests" REPO="products-api"
# Or directly:
node server/cli.js --task "<issue_description>" --repo "<repo_name_or_path>"
```

#### B. REST API
```bash
curl -X POST http://localhost:4000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "products-api",
    "task": "Add pagination to the /api/products endpoint and update the tests"
  }'
```

#### C. Interactive Web UI
Open **`http://localhost:4000`** in your browser, select your target repository and model, enter your task, and click **Run Agent**.

---

## 🧪 Automated Test Suite (Safe & Isolated)

Run the official evaluation test suite:
```bash
make test
```
This executes `server/test/harness.test.js` using **isolated temporary fixtures in `os.tmpdir()`**:
- NEVER touches, resets, or destroys real demo repositories.
- Verifies tool layer execution (`list_files`, `search_code`, `read_file`, `write_file`, `edit_file`, `git_diff`).
- Verifies model-agnostic provider adapters (`DeepSeekProvider`, `QwenProvider`, `AI_API_KEY` consumption).
- Verifies dynamic context ranking and relevance scoring.
- Verifies empirical verifier enforcement (blocks false `VERIFIED` declarations).
- Verifies failure analysis and recovery memory.
- Verifies SQLite database persistence (`forgeloop.db` as source of truth).

---

## 🎬 Hackathon Demo Scenarios

ForgeLoop comes pre-configured with 3 reproducible scenarios:

### Demo 1: Products API (`products-api`)
- **Task**: `"Add pagination to the /api/products endpoint and update the tests."`
- **Initial State**: `getProducts` returns all items in an array without pagination metadata. 3 tests fail.
- **ForgeLoop Execution**:
  1. Identifies `src/controllers/products.controller.js` and `test/products.test.js` (relevance 50%+).
  2. Avoids unrelated files (`products.json`, `package.json`).
  3. Implements `page` and `limit` parsing, boundary checks (default 10, max 50), and pagination metadata.
  4. Runs tests (`node --test`) -> **3/3 passed**.
  5. Inspects git diff -> Issues `TASK VERIFIED ✓`.

### Demo 2: Failure Recovery Demo (`auth-service`)
- **Task**: `"Fix authentication middleware to reject expired tokens and require Bearer prefix."`
- **Initial State**: Middleware contains placeholder. 3 tests fail.
- **Scenario**: When *"Trigger Test Failure First"* is checked (or default on Demo 2):
  1. Agent applies an initial implementation that checks authorization header presence but omits the Bearer prefix and expiration checks.
  2. `npm test` runs and **fails** with assertion mismatch (`200 !== 401`).
  3. ForgeLoop triggers **Failure Analysis**:
     - Extracts test: `returns 401 when Authorization header lacks Bearer prefix`
     - Isolates likely root cause: `Authorization header Bearer prefix validation in auth middleware`
     - Stores structured Failure Memory.
  4. Context Engine extracts **only** the failing middleware slice (avoiding entire repo/conversation resend).
  5. Recovery Engine applies targeted repair.
  6. Re-testing succeeds -> **4/4 passed** -> Issues `TASK VERIFIED ✓`.

### Demo 3: User Registration (`user-registration`)
- **Task**: `"Add email validation and password strength check to user registration endpoint."`
- **Initial State**: Accepts any body without validation. 3 tests fail.
- **ForgeLoop Execution**:
  1. Selects `src/controllers/user.controller.js`.
  2. Adds RFC-compliant email regex validation and 8-character minimum password checks.
  3. Tests pass -> **3/3 passed** -> Verified.

---

## 📊 Token Efficiency & Benchmark Mode

Click **"Benchmark vs Baseline"** on any demo task to see actual measured context economics:

| Metric | Naive Baseline | ForgeLoop Engine | Savings |
| :--- | :--- | :--- | :--- |
| **Strategy** | Dumps whole repo on every turn | Searches symbols, scores relevance, extracts slices | **Targeted Slicing** |
| **Files Read** | 100% of files in repo | Only files scoring > 30% | **Files Avoided** |
| **Context per Turn** | ~2,500 – 15,000+ tokens | ~300 – 700 tokens | **~60% – 85% Savings** |
| **Recovery Context** | Full conversation history | Task + Failure Record + Snippet | **~80% Reduction** |

---

## 🛠️ Model Provider Configuration

ForgeLoop supports pluggable models:
1. **Autonomous Smart Engine (Default)**: Fully offline, deterministic code reasoning engine designed for rock-solid, reproducible hackathon demos.
2. **Google Gemini**: Enter your `GEMINI_API_KEY` on the Settings page and choose **Save key**. ForgeLoop stores it in the server-only `server/.env.local` file with private permissions, ignores that file in Git, and reloads it when the server restarts. Alternatively, set `GEMINI_API_KEY` in the server environment.
3. **Custom LLM Provider**: Easily extend `server/services/modelProvider.js` by subclassing `BaseModelProvider`.

---

## 🔮 Future Roadmap

- [ ] AST-based semantic graph indexing with tree-sitter.
- [ ] Multi-turn human-in-the-loop checkpoint approval for destructive shell operations.
- [ ] Dynamic benchmark comparison with real live API pricing calculators ($ USD saved per task).
- [ ] Support for multi-repository polyrepo harnesses.
