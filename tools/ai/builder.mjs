import fs from "fs";
import path from "path";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const task = process.env.TASK || "Scaffold Valyra app";
const masterPlanPath = process.env.MASTER_PLAN_PATH || "docs/THE_FINAL_MASTERPLAN_v2.0.md";
const openaiKey = process.env.OPENAI_API_KEY || "";
const anthropicKey = process.env.ANTHROPIC_API_KEY || "";

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

// —— We now demand STRICT JSON (no YAML) and strip code fences if present ——
const SYSTEM = `
You are Valyra Build Agent. Generate production-grade code for Valyra using the Master Plan in /docs.
Stack: Next.js (App Router) + Tailwind + Supabase (Auth/Postgres/Storage). Framer hosts the public site.
Build secure app pages: / (Packs), /packs/[id], /analytics, /agent, /assets, /settings, /login, /register.
Include: registration wizard (10-question brief), packs list/detail with Approve/Request-Changes buttons
that call MAKE_APPROVAL_WEBHOOK (GET + secret), email template resend/emails/pack.html,
and SQL migrations under supabase/migrations/*.sql (do NOT execute).
Respect RLS. No secrets in client code.
RETURN ONLY a JSON object of shape:
{
  "files":[{"path":"string","content":"string"}],
  "notes":"string"
}
No markdown, no prose, no code fences. If unsure, return a minimal valid JSON with "files":[] and a diagnostic "notes".
`;

const USER_TEMPLATE = (master, task) => `
MASTER PLAN:
${master}

TASK:
${task}

RESPONSE FORMAT (STRICT):
{
  "files":[{"path":"string","content":"string"}],
  "notes":"string"
}
Return ONLY this JSON.
`;

// Strip ```json ... ``` or ``` ... ``` if present
function extractJson(text) {
  const fence = text.match(/```json([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const any = text.match(/```([\s\S]*?)```/);
  if (any) return any[1].trim();
  // Try to clip to first { .. last }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) return text.slice(first, last + 1);
  return text.trim();
}

function tryParseJSON(raw) {
  try {
    return JSON.parse(extractJson(raw));
  } catch (e) {
    return null;
  }
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
  return res.choices[0]?.message?.content || "";
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

  // Provider order: OpenAI first if key present, else Anthropic
  let raw1 = "", raw2 = "";
  let parsed = null;
  let providerUsed = "";

  if (openaiKey) {
    try {
      console.log("Trying OpenAI…");
      raw1 = await callOpenAI(master, task);
      writeFileSafe("AI_RAW_openai.txt", raw1);
      parsed = tryParseJSON(raw1);
      providerUsed = "openai";
    } catch (e) {
      console.error("OpenAI error:", e?.response?.data || e.message || e);
    }
  }

  if ((!parsed || !parsed.files) && anthropicKey) {
    try {
      console.log("Falling back to Anthropic…");
      raw2 = await callAnthropic(master, task);
      writeFileSafe("AI_RAW_anthropic.txt", raw2);
      parsed = tryParseJSON(raw2);
      providerUsed = "anthropic";
    } catch (e) {
      console.error("Anthropic error:", e?.response?.data || e.message || e);
    }
  }

  if (!parsed || !Array.isArray(parsed.files)) {
    console.error("ERROR: Model did not return a valid JSON with {files:[...]}.");
    console.error("See AI_RAW_openai.txt / AI_RAW_anthropic.txt for details.");
    process.exit(1);
  }

  parsed.files.forEach(f => writeFileSafe(f.path, f.content));
  if (parsed.notes) writeFileSafe("AI_NOTES.md", `[provider: ${providerUsed}] ` + parsed.notes);
})();
