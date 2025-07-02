#!/usr/bin/env node
// @ts-nocheck
/**
 * Minimal DAP Adapter that just runs Node.js programs
 */

import { spawn, ChildProcess } from "child_process";

let seq = 1;
let child: ChildProcess | null = null;
let variables: Record<string, any> = {};

function sendMessage(message: any) {
  const json = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

function sendResponse(request: any, body: any = {}) {
  sendMessage({
    seq: seq++,
    type: "response",
    request_seq: request.seq,
    success: true,
    command: request.command,
    body
  });
}

function sendEvent(event: string, body: any = {}) {
  sendMessage({
    seq: seq++,
    type: "event",
    event,
    body
  });
}

// Handle messages
process.stdin.setEncoding("utf8");
let buffer = "";

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    
    const header = buffer.substring(0, headerEnd);
    const match = header.match(/Content-Length: (\d+)/);
    if (!match) break;
    
    const contentLength = parseInt(match[1]);
    const messageStart = headerEnd + 4;
    
    if (buffer.length < messageStart + contentLength) break;
    
    const message = buffer.substring(messageStart, messageStart + contentLength);
    buffer = buffer.substring(messageStart + contentLength);
    
    try {
      const request = JSON.parse(message);
      handleRequest(request);
    } catch (e) {
      // Ignore
    }
  }
});

function handleRequest(request: any) {
  switch (request.command) {
    case "initialize":
      sendResponse(request, {
        supportsConfigurationDoneRequest: true
      });
      sendEvent("initialized");
      break;
    
    case "launch":
      const { program, args = [] } = request.arguments;
      
      // Just run the program normally
      child = spawn("node", [program, ...args], {
        stdio: ["pipe", "pipe", "pipe"]
      });
      
      child.stdout?.on("data", (data) => {
        const output = data.toString();
        
        // Parse variable tracking
        const varMatch = output.match(/\[VAR\] (\w+) = (.+)/);
        if (varMatch) {
          const [, name, value] = varMatch;
          try {
            variables[name] = JSON.parse(value);
          } catch {
            variables[name] = value;
          }
        }
        
        sendEvent("output", {
          category: "stdout",
          output
        });
      });
      
      child.stderr?.on("data", (data) => {
        sendEvent("output", {
          category: "stderr",
          output: data.toString()
        });
      });
      
      child.on("exit", (code) => {
        sendEvent("terminated", { exitCode: code });
      });
      
      sendResponse(request);
      
      if (request.arguments.stopOnEntry) {
        sendEvent("stopped", {
          reason: "entry",
          threadId: 1
        });
      }
      break;
    
    case "setBreakpoints":
      const breakpoints = request.arguments.breakpoints || [];
      sendResponse(request, {
        breakpoints: breakpoints.map((bp: any, i: number) => ({
          id: i + 1,
          verified: true,
          line: bp.line
        }))
      });
      break;
    
    case "configurationDone":
      sendResponse(request);
      break;
    
    case "continue":
      sendResponse(request, { allThreadsContinued: true });
      break;
    
    case "threads":
      sendResponse(request, {
        threads: [{ id: 1, name: "main" }]
      });
      break;
    
    case "stackTrace":
      sendResponse(request, {
        stackFrames: [{
          id: 1,
          name: "main",
          source: { path: "test.js" },
          line: 1,
          column: 1
        }],
        totalFrames: 1
      });
      break;
    
    case "scopes":
      sendResponse(request, {
        scopes: [{
          name: "Local",
          variablesReference: 1,
          expensive: false
        }]
      });
      break;
    
    case "variables":
      const vars = Object.entries(variables).map(([name, value], i) => ({
        name,
        value: JSON.stringify(value),
        type: typeof value,
        variablesReference: 0
      }));
      
      sendResponse(request, { variables: vars });
      break;
    
    case "disconnect":
      if (child) {
        child.kill();
      }
      sendResponse(request);
      process.exit(0);
      break;
    
    default:
      sendResponse(request);
  }
}