import test from "node:test";
import assert from "node:assert/strict";
import {FrappeHelpdeskClient} from "../src/client.mjs";
const options = {baseUrl:"https://support.test",readKey:"reader",readSecret:"r",writeKey:"writer",writeSecret:"w"};
test("read operations use the read-only identity", async()=>{let seen; const client=new FrappeHelpdeskClient({...options,fetch:async(url,init)=>{seen={url:String(url),init};return Response.json({data:[]});}}); await client.searchTickets("refund"); assert.equal(seen.init.headers.Authorization,"token reader:r"); assert.match(seen.url,/HD%20Ticket/);});
test("writes are denied by default", async()=>{const client=new FrappeHelpdeskClient({...options,fetch:async()=>Response.json({})}); await assert.rejects(client.closeTicket("HD-TICKET-1"),/disabled/);});
test("explicit write mode uses a separate identity", async()=>{let auth; const client=new FrappeHelpdeskClient({...options,mode:"write",allowWrites:true,fetch:async(_url,init)=>{auth=init.headers.Authorization;return Response.json({data:{status:"Closed"}});}}); await client.closeTicket("HD-TICKET-1"); assert.equal(auth,"token writer:w");});
