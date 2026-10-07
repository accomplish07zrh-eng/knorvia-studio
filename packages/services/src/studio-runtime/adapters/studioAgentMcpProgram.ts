/** Small transport only: authorization, admission and results remain in the Host. */
export function studioAgentMcpProgram(toolDeclarations: unknown): string {
  return `
const readline = require("node:readline");
const tools = ${JSON.stringify(toolDeclarations)};
const send = (id, result) => process.stdout.write(JSON.stringify({jsonrpc:"2.0", id, result}) + "\\n");
async function handle(frame) {
  if (!frame || !Object.hasOwn(frame, "id")) return;
  if (frame.method === "initialize") return send(frame.id, {
    protocolVersion: frame.params?.protocolVersion || "2025-06-18",
    capabilities: {tools:{}}, serverInfo:{name:"knorvia-studio-agents",version:"1.0.0"}
  });
  if (frame.method === "ping") return send(frame.id, {});
  if (frame.method === "tools/list") return send(frame.id, {tools});
  if (frame.method !== "tools/call") {
    process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:frame.id,error:{code:-32601,message:"Method not found"}}) + "\\n");
    return;
  }
  try {
    if (!tools.some(tool => tool.name === frame.params?.name)) throw new Error("Unknown Studio tool");
    const response = await fetch(process.env.KNORVIA_STUDIO_AGENT_URL + "/tool", {
      method:"POST", headers:{"content-type":"application/json",authorization:"Bearer " + process.env.KNORVIA_STUDIO_AGENT_TOKEN},
      body:JSON.stringify({name:frame.params.name,input:frame.params.arguments ?? {}})
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Studio tool request failed");
    send(frame.id, {content:[{type:"text",text:JSON.stringify(body.result)}]});
  } catch (error) {
    send(frame.id, {isError:true,content:[{type:"text",text:error instanceof Error ? error.message : "Studio tool failed"}]});
  }
}
readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on("line", line => {
  if (line.length > 65536) return;
  try { void handle(JSON.parse(line)); } catch {}
});
`;
}
