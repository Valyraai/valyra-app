import fs from "fs";
import path from "path";
import YAML from "js-yaml";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const task = process.env.TASK || "Scaffold Valyra app";
const masterPlanPath = process.env.MASTER_PLAN_PATH || "docs/THE_FINAL_MASTERPLAN_v2.0.md";

const openaiKey = process.env.OPENAI_API_KEY || "";
const anthropicKey = process.env.ANTHROPIC_API_KEY || "";

// Fail clearly if no provider keys
if (!openaiKey && !anthropicKey) {
  console.error("ERROR: Neither OPENAI_API_KEY nor ANTHROPIC_API_KEY is set in repo Secrets.");
  process.exit(1);
}

function writeFileSafe(rel, content) {
  const fp = path.join(process.cwd(), rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, content);
  console.log("WROTE", rel);
}

function readMasterPlan() {
  if (!fs.existsSync(masterPlanPath)) {
    console.error(`ERROR: Master plan not found at ${masterPlanPath}`);
    process.exit(1);
  }
  return fs.readFileSync(masterPlanPath, "utf-8");
}

const SYSTEM = `
You are Valyra Build Agent. Generate production-quality code, DB migrations, RLS policies,
and docs for the Valyra app, using the Master Plan in /docs.
- Framework: Next.js (App Router) + Tailwind + Supabase (Auth/Postgres/Storage).
- Marketing site is on Framer (not in this repo).
- Secure app: login/register wizard (10-question brief), Packs list, Pack detail with Approve/Changes,
  Approvals loop calling Make.com webhook (secret), email templates (Resend), migrations in supabase/migrations/*.sql.
- Respect RLS. Don’t put secrets in client code. Use env names: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
  MAKE_APPROVAL_WEBHOOK, RESEND_API_KEY, STRIPE_SECRET_KEY.
- Return ONLY a YAML document: {files:[{path,content}], notes:"..."} with NO extra commentary.
`;

const USER_TEMPLATE = (master, task) => `
MASTER PLAN:
${master}

TASK:
${task}

Produce:
- minimal working app if missing (package.json, next.config, app/*, lib/supabase, etc.)
- registration wizard with onboarding brief (10 Q)
- packs pages (list + [id]) wired to Make webhook (GET + secret)
- supabase/migrations/*.sql for tables + basic RLS (DO NOT execute)
- email template (resend/emails/pack.html)
- steps.md with local run + env vars + deploy notes
Return ONLY valid YAML with this exact shape:
files:
  - path: string
    content: |
      (file content)
notes: |
  (short notes)
No code fences; no markdown.
`;

// ---- NEW: strip code fences if they appear anyway
function extractYaml(text) {
  const fence = text.match(/```yaml([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const fenceAny = text.match(/```([\s\S]*?)```/);
  if (fenceAny) return fenceAny[1].trim();
  return text.trim();
}

async function callOpenAI(master, task) {
  const client = new OpenAI({ apiKey: openaiKey });
  const res = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: USER_TEMPLATE(master, task) },
    ],
  });
  return res.choices[0].message.content || "";
}

async function callAnthropic(master, task) {
  const client = new Anthropic({ apiKey: anthropicKey });
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
    max_tokens: 4000,
    temperature: 0.2,
    system: SYSTEM,
    messages: [{ role: "user", content: USER_TEMPLATE(master, task) }],
  });
  return res.content?.[0]?.text || "";
}

(async () => {
  const master = readMasterPlan();
  let raw = "";
  try {
    if (openaiKey) {
      console.log("Using OpenAI provider…");
      raw = await callOpenAI(master, task);
    } else {
      console.log("Using Anthropic provider…");
      raw = await callAnthropic(master, task);
    }
  } catch (e) {
    console.error("LLM ERROR:", e?.response?.data || e.message || e);
    process.exit(1);
  }

  // Save raw for debugging
  writeFileSafe("AI_RAW.md", raw);

  // Strip ```yaml fences before YAML.parse
  const yamlText = extractYaml(raw);
  let parsed;
  try {
    parsed = YAML.load(yamlText);
  } catch (e) {
    console.error("YAML PARSE ERROR:", e.message);
    console.error("See AI_RAW.md for the model output.");
    process.exit(1);
  }

  if (!parsed?.files || !Array.isArray(parsed.files) || !parsed.files.length) {
    console.error("ERROR: Model did not return {files:[...]}.");
    console.error("See AI_RAW.md for the model output.");
    process.exit(1);
  }

  parsed.files.forEach(f => writeFileSafe(f.path, f.content));
  if (parsed.notes) writeFileSafe("AI_NOTES.md", parsed.notes);
})();
