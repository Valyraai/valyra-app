import fs from "fs";
import path from "path";
import YAML from "js-yaml";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const task = process.env.TASK || "Scaffold Valyra app";
const masterPlanPath = process.env.MASTER_PLAN_PATH || "docs/THE_FINAL_MASTERPLAN_v2.0.md";
const openaiKey = process.env.OPENAI_API_KEY || "";
const anthropicKey = process.env.ANTHROPIC_API_KEY || "";

function writeFileSafe(rel, content) {
  const fp = path.join(process.cwd(), rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, content);
  console.log("WROTE", rel);
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
- Return YAML only: {files:[{path,content}], notes:"..."}.
`;

function readMasterPlan() {
  return fs.readFileSync(masterPlanPath, "utf-8");
}

async function askLLM(masterPlan, task) {
  const prompt = `
MASTER PLAN:
${masterPlan}

TASK:
${task}

Produce:
- minimal working app if missing (package.json, next.config, app/*, lib/supabase, etc.)
- registration wizard with onboarding brief (10 Q)
- packs pages (list + [id]) wired to Make webhook (GET with secret)
- supabase/migrations/*.sql for tables + basic RLS (no exec needed now)
- email template (resend/emails/pack.html)
- steps.md with local run + env vars + deploy notes
Return YAML: { files: [ {path, content} ], notes: "…" } only.
`;
  if (openaiKey) {
    const openai = new OpenAI({ apiKey: openaiKey });
    const r = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
    });
    return r.choices[0].message.content;
  }
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const r = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4000,
    temperature: 0.2,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  return r.content[0].text;
}

(async () => {
  const master = readMasterPlan();
  const yaml = await askLLM(master, task);
  const parsed = YAML.load(yaml);

  if (!parsed?.files) {
    console.error("No files returned from AI.");
    process.exit(1);
  }
  parsed.files.forEach(f => writeFileSafe(f.path, f.content));
  if (parsed.notes) writeFileSafe("AI_NOTES.md", parsed.notes);
})();
