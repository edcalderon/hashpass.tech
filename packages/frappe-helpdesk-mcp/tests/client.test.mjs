import test from "node:test";
import assert from "node:assert/strict";
import {FrappeHelpdeskClient} from "../src/client.mjs";
import {READ_TOOL_NAMES, WRITE_TOOL_NAMES, createFrappeHelpdeskServer, enabledToolNames} from "../src/server.mjs";
const options = {baseUrl:"https://support.test",readKey:"reader",readSecret:"r",writeKey:"writer",writeSecret:"w"};
test("read operations use the read-only identity", async()=>{let seen; const client=new FrappeHelpdeskClient({...options,fetch:async(url,init)=>{seen={url:String(url),init};return Response.json({data:[]});}}); await client.searchTickets("refund"); assert.equal(seen.init.headers.Authorization,"token reader:r"); assert.match(seen.url,/HD%20Ticket/);});
test("writes are denied by default", async()=>{const client=new FrappeHelpdeskClient({...options,fetch:async()=>Response.json({})}); await assert.rejects(client.closeTicket("HD-TICKET-1"),/disabled/);});
test("explicit write mode uses a separate identity", async()=>{let auth; const client=new FrappeHelpdeskClient({...options,mode:"write",allowWrites:true,fetch:async(_url,init)=>{auth=init.headers.Authorization;return Response.json({data:{status:"Closed"}});}}); await client.closeTicket("HD-TICKET-1"); assert.equal(auth,"token writer:w");});
test("read mode never advertises mutation tools", ()=>{assert.deepEqual(enabledToolNames(), READ_TOOL_NAMES); assert.deepEqual(enabledToolNames({mode:"write"}), READ_TOOL_NAMES);});
test("write tools are advertised only with explicit dual opt-in", ()=>{assert.deepEqual(enabledToolNames({mode:"write",allowWrites:true}), [...READ_TOOL_NAMES,...WRITE_TOOL_NAMES]);});
test("read-only server registers only read tools", ()=>{
  const client = {mode:"read",allowWrites:false};
  for (const method of ["searchSupportArticles","getSupportArticle","listTickets","searchTickets","getTicket","getCustomer","searchCustomers"]) client[method] = async()=>[];
  const server = createFrappeHelpdeskServer(client);
  assert.deepEqual(Object.keys(server._registeredTools), READ_TOOL_NAMES);
});
