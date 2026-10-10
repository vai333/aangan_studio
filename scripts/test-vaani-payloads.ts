// npm run test:payloads — Vaani webhook payload shapes. The call_ended sample mirrors a REAL event
// (captured 2026-10-10; content replaced). The post-processing sample follows Vaani's docs.
import { classify, normalize, toE164 } from "../lib/vaani/adapter";

let fails = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`); if (!ok) fails++; };

const realEnded = {
  to: "N/A", from: "N/A", event: "call_ended", timestamp: "2026-10-10T13:33:09.065144+00:00",
  data: {
    room_name: "webrtc-1791639059-adb47bb4", end_reason: "Call Ended", phone_number: null, call_duration: 126.651881, technical_issue: false,
    transcript: "[13:31:07] AGENT: Namaste, Aangan Studio, Thanks for calling.\n[13:31:16] USER: Can you hear me?\n[13:31:29] USER: I want my interior design done for my two BHK in Baner.\n[13:31:33] AGENT: Which locality in Pune is your 2BHK in?",
  },
};
const e1 = normalize(realEnded)!;
check("real call_ended: keyed by data.room_name (not 'undefined')", e1.providerCallId === "webrtc-1791639059-adb47bb4", e1.providerCallId);
check("real call_ended: transcript parsed, so it is graded immediately", e1.kind === "post_call" && e1.transcript.length === 4 && e1.transcript[1].speaker === "caller", `${e1.transcript.length} turns`);
check("real call_ended: duration in seconds, start = end − duration", e1.durationSec === 127 && new Date(e1.startedAt).getTime() === new Date("2026-10-10T13:33:09.065144+00:00").getTime() - 127_000);
check("browser test call has no phone number", e1.callerPhone === null && toE164(e1.callerPhone) === "unknown" && toE164("N/A") === "unknown");
check("a real two-sided call is classified answered", classify(e1) === "answered");

const realPost = normalize({ event: "call_postprocessing", call_id: "webrtc-1791639059-adb47bb4", timestamp: "2026-10-10T13:36:01.901243+00:00", from: "web-user", to: "Aangan Studio",
  data: { call_id: "webrtc-1791639059-adb47bb4", room_name: "webrtc-1791639059-adb47bb4", call_duration: 126.65, call_started_at: "2026-10-10T13:31:03.499463+00:00", call_ended_at: "2026-10-10T13:33:10.852823+00:00", phone_number: "web-user",
    recording_url: "https://app.vaanivoice.ai/api/stream/webrtc-1791639059-adb47bb4?token=x", summary: "s", entities: { bhk: 2 }, transcript: "[13:31:07] AGENT: Hi\n[13:31:16] USER: Can you hear me?\n[13:31:29] USER: 2BHK in Baner." } })!;
check("REAL post-processing: duration is seconds (126.65 -> 127), not ms (which made it 0 and 'missed')", realPost.durationSec === 127 && classify(realPost) === "answered", `${realPost.durationSec}s -> ${classify(realPost)}`);
check("REAL post-processing: exact start time used, same call id as call_ended", realPost.startedAt === "2026-10-10T13:31:03.499Z" && realPost.providerCallId === e1.providerCallId, realPost.startedAt);
check("REAL post-processing: phone 'web-user' is not a number; recording link kept", toE164(realPost.callerPhone) === "unknown" && !!realPost.recordingUrl);

const post = normalize({ event: "call_postprocessing", call_id: "inbound-1790000000-abc", timestamp: "2026-10-10T14:00:00Z", data: { room_name: "inbound-1790000000-abc", call_id: "inbound-1790000000-abc", call_duration: 245000, end_reason: "user_hangup", recording_url: "https://x/r.mp3", from_number: "+919811112222", transcript: "[00:00:01] AGENT: Hi\n[00:00:04] USER: Hello, 3BHK in Kothrud." } })!;
check("post-processing: same call id as call_ended would use; ms converted to seconds", post.providerCallId === "inbound-1790000000-abc" && post.durationSec === 245);
check("post-processing: real caller number kept", toE164(post.callerPhone) === "+919811112222");
check("Indian 10-digit number gets +91", toE164("9811112222") === "+919811112222");

check("call_started / ringing are ignored", normalize({ event: "call_started", room_name: "x", status: "s", phone_number: "+9199" }) === null && normalize({ event: "call_ringing", room_name: "x" }) === null);
check("an event with no call id is dropped (never stored as 'undefined')", normalize({ event: "call_ended", data: { end_reason: "x" } }) === null);
const noTranscript = normalize({ event: "call_ended", timestamp: "2026-10-10T13:00:00Z", data: { room_name: "r1", call_duration: 2, transcript: "" } })!;
check("call_ended with no transcript is a placeholder, classified missed", noTranscript.kind === "call_ended" && classify({ ...noTranscript, kind: "post_call" }) === "missed");
const shortDecline = normalize({ event: "call_postprocessing", call_id: "d1", data: { room_name: "d1", call_duration: 60.2, call_started_at: "2026-10-10T15:01:00Z", transcript: "[00:00:01] AGENT: Namaste, Aangan Studio.\n[00:00:05] USER: I am Suresh from Nashik. Can you take up my home office?\n[00:00:14] AGENT: We only work in Pune and PCMC, so I am sorry we cannot help. Goodbye." } })!;
check("a short call where the agent answered last (a quick decline) is answered, not 'dropped'", classify(shortDecline) === "answered");
const dropped = normalize({ event: "call_postprocessing", call_id: "d2", data: { room_name: "d2", call_duration: 12, call_started_at: "2026-10-10T15:01:00Z", transcript: "[00:00:01] AGENT: Namaste, Aangan Studio.\n[00:00:05] USER: Hi, I wanted to inquire about" } })!;
check("the line cutting out mid-sentence IS dropped (T17 case)", classify(dropped) === "dropped");
console.log(fails ? `\n${fails} FAILED` : "\nALL CHECKS PASSED");
process.exit(fails ? 1 : 0);
