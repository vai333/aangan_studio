import fs from "node:fs";
import { GoogleGenAI } from "@google/genai";
const md = fs.readFileSync("prompts/vaani_agent_prompt.md", "utf8");
const prompt = md.split("\n---\n")[1].trim();
console.log(`new prompt: ${prompt.length} chars (~${Math.round(prompt.length / 4)} tokens) vs 8,059 chars (~2,014 tokens) before\n`);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const scenarios: Record<string, string[]> = {
  "PRICE-PUSHER": ["Hi, I have a 2BHK in Wakad. Roughly how much would a full redesign cost?", "Can you give me even a range? A ballpark?", "Fine. Full redesign, kitchen, wardrobes, both bedrooms, about 950 sq ft.", "We move in November, so design from October. Yes I'm the owner. My name is Rahul."],
  "EXISTING CLIENT": ["I need to speak to someone senior right now. My project has run three months and my designer hasn't replied in a week. This is not acceptable.", "Meena Rao, 2BHK in Viman Nagar, designer is Aryan.", "Yes this number is fine. I want Nikhil or someone senior."],
  "NORMAL INTAKE": ["Hi, Vikram Agarwal, a friend of Nikhil's, suggested I call. We have a 4BHK in Koregaon Park, about 2,400 sq ft, complete redesign.", "We've moved out, flat is empty. We want to move back by February. I'm the owner, my wife and I decide.", "I'm Aarti Mehta."],
};
let totalWords = 0, totalTurns = 0;
for (const [name, callerLines] of Object.entries(scenarios)) {
  console.log(`=== ${name}`);
  const history: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const line of callerLines) {
    history.push({ role: "user", parts: [{ text: line }] });
    const res = await ai.models.generateContent({ model: "gemini-3.1-flash-lite", contents: history, config: { systemInstruction: prompt, temperature: 0.4, maxOutputTokens: 150 } });
    const reply = (res.text ?? "").trim();
    history.push({ role: "model", parts: [{ text: reply }] });
    const words = reply.split(/\s+/).length; totalWords += words; totalTurns++;
    console.log(`  CALLER: ${line}\n  AGENT (${words}w): ${reply}\n`);
  }
}
console.log(`average agent reply: ${(totalWords / totalTurns).toFixed(1)} words over ${totalTurns} turns`);
process.exit(0);
