#!/usr/bin/env node
// @ts-nocheck
/**
 * Node.js Debug Adapter
 * 
 * Translates between Debug Adapter Protocol (DAP) and Chrome DevTools Protocol (CDP)
 * for debugging Node.js applications.
 */

import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import * as net from "net";
import type {
  DAPRequest,
  DAPResponse,
  DAPEvent,
  InitializeResponse,
  LaunchRequestArguments,
  SetBreakpointsArguments,
  SetBreakpointsResponse,
  StackTraceResponse,
  ScopesArguments,
  ScopesResponse,
  VariablesArguments,
  VariablesResponse,
  EvaluateArguments,
  EvaluateResponse,
  ThreadsResponse,
  StackFrame,
  Scope,
  Variable,
  Breakpoint,
  StoppedEvent,
  OutputEvent,
  TerminatedEvent,
  InitializedEvent,
} from "../types.ts";

interface CDPLocation {
  scriptId: string;
  lineNumber: number;
  columnNumber?: number;
}

interface CDPCallFrame {
  callFrameId: string;
  functionName: string;
  location: CDPLocation;
  url: string;
  scopeChain: CDPScope[];
  this: CDPRemoteObject;
}

interface CDPScope {
  type: "global" | "local" | "with" | "closure" | "catch" | "block" | "script" | "eval" | "module";
  object: CDPRemoteObject;
  name?: string;
  startLocation?: CDPLocation;
  endLocation?: CDPLocation;
}

interface CDPRemoteObject {
  type: string;
  subtype?: string;
  className?: string;
  value?: any;
  unserializableValue?: string;
  description?: string;
  objectId?: string;
  preview?: any;
}

class NodeDAPAdapter extends EventEmitter {
  private sequenceNumber = 1;
  private process: ChildProcess | null = null;
  private ws: net.Socket | null = null;
  private cdpSequence = 1;
  private cdpCallbacks = new Map<number, { resolve: (result: any) => void; reject: (error: Error) => void }>();
  private scriptIdToPath = new Map<string, string>();
  private pathToScriptId = new Map<string, string>();
  private breakpoints = new Map<string, Breakpoint[]>();
  private isInitialized = false;
  private isPaused = false;
  private currentCallFrames: CDPCallFrame[] = [];
  private program: string = "";
  private programArgs: string[] = [];
  private cwd: string = "";
  private env: Record<string, string> = {};
  private wsBuffer = Buffer.alloc(0);
  private wsHandshakeComplete = false;

  constructor() {
    super();
    this.setupStdinHandling();
  }

  private setupStdinHandling(): void {
    let buffer = "";
    
    process.stdin.on("data", (data: Buffer) => {
      buffer += data.toString();
      
      while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;
        
        const header = buffer.substring(0, headerEnd);
        const contentLengthMatch = header.match(/Content-Length: (\d+)/);
        if (!contentLengthMatch) {
          this.sendError("Invalid header");
          break;
        }
        
        const contentLength = parseInt(contentLengthMatch[1], 10);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + contentLength;
        
        if (buffer.length < bodyEnd) break;
        
        const body = buffer.substring(bodyStart, bodyEnd);
        buffer = buffer.substring(bodyEnd);
        
        try {
          const message = JSON.parse(body) as DAPRequest;
          this.handleRequest(message);
        } catch (error) {
          this.sendError(`Failed to parse message: ${error}`);
        }
      }
    });
  }

  private async handleRequest(request: DAPRequest): Promise<void> {
    try {
      switch (request.command) {
        case "initialize":
          await this.handleInitialize(request);
          break;
        case "launch":
          await this.handleLaunch(request);
          break;
        case "setBreakpoints":
          await this.handleSetBreakpoints(request);
          break;
        case "configurationDone":
          await this.handleConfigurationDone(request);
          break;
        case "threads":
          await this.handleThreads(request);
          break;
        case "stackTrace":
          await this.handleStackTrace(request);
          break;
        case "scopes":
          await this.handleScopes(request);
          break;
        case "variables":
          await this.handleVariables(request);
          break;
        case "evaluate":
          await this.handleEvaluate(request);
          break;
        case "continue":
          await this.handleContinue(request);
          break;
        case "next":
          await this.handleNext(request);
          break;
        case "stepIn":
          await this.handleStepIn(request);
          break;
        case "stepOut":
          await this.handleStepOut(request);
          break;
        case "pause":
          await this.handlePause(request);
          break;
        case "disconnect":
          await this.handleDisconnect(request);
          break;
        default:
          this.sendErrorResponse(request, `Unknown command: ${request.command}`);
      }
    } catch (error) {
      this.sendErrorResponse(request, error instanceof Error ? error.message : String(error));
    }
  }

  private async handleInitialize(request: DAPRequest): Promise<void> {
    const response: InitializeResponse = {
      supportsConfigurationDoneRequest: true,
      supportsFunctionBreakpoints: false,
      supportsConditionalBreakpoints: true,
      supportsEvaluateForHovers: true,
      supportsStepBack: false,
      supportsSetVariable: false,
      supportsRestartFrame: false,
      supportsStepInTargetsRequest: false,
      supportsCompletionsRequest: false,
      supportsModulesRequest: false,
    };
    
    this.sendResponse(request, response);
    
    // Send initialized event
    const event: DAPEvent = {
      seq: this.sequenceNumber++,
      type: "event",
      event: "initialized",
      body: {} as InitializedEvent,
    };
    this.sendMessage(event);
    
    this.isInitialized = true;
  }

  private async handleLaunch(request: DAPRequest): Promise<void> {
    const args = request.arguments as LaunchRequestArguments;
    
    this.program = args.program || "";
    this.programArgs = args.args || [];
    this.cwd = args.cwd || process.cwd();
    this.env = { ...process.env, ...args.env };
    
    // Start Node.js with inspector
    const nodeArgs = ["--inspect-brk=0", this.program, ...this.programArgs];
    
    this.process = spawn("node", nodeArgs, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    
    // Capture output
    this.process.stdout?.on("data", (data: Buffer) => {
      this.sendOutputEvent("stdout", data.toString());
    });
    
    let debuggerUrlFound = false;
    this.process.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      
      // Extract debugger URL
      if (!debuggerUrlFound) {
        const urlMatch = output.match(/ws:\/\/[^:\s]+:(\d+)\/[a-f0-9-]+/);
        if (urlMatch) {
          debuggerUrlFound = true;
          const debuggerUrl = urlMatch[0];
          this.connectToDebugger(debuggerUrl).catch((error) => {
            this.sendError(`Failed to connect to debugger: ${error}`);
          });
        }
      }
      
      this.sendOutputEvent("stderr", output);
    });
    
    this.process.on("exit", (code) => {
      this.sendEvent("terminated", {} as TerminatedEvent);
      this.cleanup();
    });
    
    this.sendResponse(request, {});
  }

  private async connectToDebugger(url: string): Promise<void> {
    // Parse WebSocket URL to get host and port
    const match = url.match(/ws:\/\/([^:]+):(\d+)\/(.*)/i);
    if (!match) {
      throw new Error(`Invalid debugger URL: ${url}`);
    }
    
    const host = match[1];
    const port = parseInt(match[2], 10);
    const path = '/' + match[3];
    
    return new Promise((resolve, reject) => {
      this.ws = net.createConnection({ host, port }, () => {
        // Send WebSocket upgrade request
        const key = Buffer.from(Math.random().toString()).toString('base64').substring(0, 16);
        const headers = [
          `GET ${path} HTTP/1.1`,
          `Host: ${host}:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '',
          ''
        ].join('\r\n');
        
        this.ws!.write(headers);
      });
      
      this.ws.on('data', async (data: Buffer) => {
        this.wsBuffer = Buffer.concat([this.wsBuffer, data]);
        
        if (!this.wsHandshakeComplete) {
          const str = this.wsBuffer.toString();
          if (str.includes('\r\n\r\n')) {
            const headerEnd = str.indexOf('\r\n\r\n') + 4;
            if (str.includes('HTTP/1.1 101')) {
              this.wsHandshakeComplete = true;
              this.wsBuffer = this.wsBuffer.slice(Buffer.byteLength(str.substring(0, headerEnd)));
              
              // Connection established, enable CDP domains
              await this.sendCDPCommand("Debugger.enable");
              await this.sendCDPCommand("Runtime.enable");
              await this.sendCDPCommand("Console.enable");
              
              // Set up CDP event handlers
              this.setupCDPEventHandlers();
              
              resolve();
              
              // Process any remaining data
              if (this.wsBuffer.length > 0) {
                this.processWebSocketFrames();
              }
            } else {
              reject(new Error('WebSocket upgrade failed'));
            }
          }
        } else {
          this.processWebSocketFrames();
        }
      });
      
      this.ws.on('error', (error) => {
        console.error('Socket error:', error);
        reject(error);
      });
      
      this.ws.on('close', () => {
        this.cleanup();
      });
    });
  }

  private processWebSocketFrames(): void {
    while (this.wsBuffer.length >= 2) {
      const opcode = this.wsBuffer[0] & 0x0F;
      const masked = (this.wsBuffer[1] & 0x80) === 0x80;
      let payloadLength = this.wsBuffer[1] & 0x7F;
      
      let offset = 2;
      
      if (payloadLength === 126) {
        if (this.wsBuffer.length < offset + 2) break;
        payloadLength = this.wsBuffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (this.wsBuffer.length < offset + 8) break;
        // For simplicity, we'll only handle payloads up to 2^32
        offset += 4; // Skip high 32 bits
        payloadLength = this.wsBuffer.readUInt32BE(offset);
        offset += 4;
      }
      
      let maskKey: Buffer | null = null;
      if (masked) {
        if (this.wsBuffer.length < offset + 4) break;
        maskKey = this.wsBuffer.slice(offset, offset + 4);
        offset += 4;
      }
      
      if (this.wsBuffer.length < offset + payloadLength) break;
      
      let payload = this.wsBuffer.slice(offset, offset + payloadLength);
      
      if (masked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }
      
      // Remove processed frame from buffer
      this.wsBuffer = this.wsBuffer.slice(offset + payloadLength);
      
      if (opcode === 0x01) { // Text frame
        const text = payload.toString('utf8');
        this.handleCDPMessage(text);
      } else if (opcode === 0x08) { // Close frame
        this.ws?.end();
      } else if (opcode === 0x09) { // Ping frame
        // Send pong
        this.sendWebSocketFrame(0x0A, payload);
      }
    }
  }

  private sendWebSocketFrame(opcode: number, payload: Buffer): void {
    if (!this.ws || this.ws.destroyed) return;
    
    const frame = [];
    
    // FIN = 1, RSV = 0, Opcode
    frame.push(0x80 | opcode);
    
    // Mask = 1 (client must mask), Payload length
    if (payload.length < 126) {
      frame.push(0x80 | payload.length);
    } else if (payload.length < 65536) {
      frame.push(0x80 | 126);
      frame.push((payload.length >> 8) & 0xFF);
      frame.push(payload.length & 0xFF);
    } else {
      frame.push(0x80 | 127);
      // Write 8 bytes for length (we only use lower 32 bits)
      for (let i = 0; i < 4; i++) frame.push(0);
      frame.push((payload.length >> 24) & 0xFF);
      frame.push((payload.length >> 16) & 0xFF);
      frame.push((payload.length >> 8) & 0xFF);
      frame.push(payload.length & 0xFF);
    }
    
    // Generate mask key
    const maskKey = Buffer.allocUnsafe(4);
    maskKey.writeUInt32BE(Math.floor(Math.random() * 0xFFFFFFFF), 0);
    frame.push(...maskKey);
    
    // Mask the payload
    const maskedPayload = Buffer.allocUnsafe(payload.length);
    for (let i = 0; i < payload.length; i++) {
      maskedPayload[i] = payload[i] ^ maskKey[i % 4];
    }
    
    this.ws.write(Buffer.from(frame));
    this.ws.write(maskedPayload);
  }

  private handleCDPMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      if (message.id !== undefined) {
        // Response to a command
        const callback = this.cdpCallbacks.get(message.id);
        if (callback) {
          this.cdpCallbacks.delete(message.id);
          if (message.error) {
            callback.reject(new Error(message.error.message));
          } else {
            callback.resolve(message.result);
          }
        }
      } else if (message.method) {
        // Event from CDP
        this.handleCDPEvent(message.method, message.params);
      }
    } catch (error) {
      console.error('Failed to parse CDP message:', error);
    }
  }

  private setupCDPEventHandlers(): void {
    // Script parsing events
    this.on("cdp:Debugger.scriptParsed", (params) => {
      if (params.url && params.url.startsWith("file://")) {
        const filePath = params.url.substring(7);
        this.scriptIdToPath.set(params.scriptId, filePath);
        this.pathToScriptId.set(filePath, params.scriptId);
      }
    });
    
    // Pause events
    this.on("cdp:Debugger.paused", (params) => {
      this.isPaused = true;
      this.currentCallFrames = params.callFrames;
      
      const event: StoppedEvent = {
        reason: this.mapPauseReason(params.reason),
        threadId: 1,
        allThreadsStopped: true,
      };
      
      if (params.hitBreakpoints && params.hitBreakpoints.length > 0) {
        event.hitBreakpointIds = params.hitBreakpoints.map((id: string) => parseInt(id, 10));
      }
      
      this.sendEvent("stopped", event);
    });
    
    // Resume events
    this.on("cdp:Debugger.resumed", () => {
      this.isPaused = false;
      this.currentCallFrames = [];
    });
    
    // Console output
    this.on("cdp:Runtime.consoleAPICalled", (params) => {
      const args = params.args || [];
      const output = args.map((arg: CDPRemoteObject) => this.formatRemoteObject(arg)).join(" ");
      this.sendOutputEvent("console", output + "\n");
    });
  }

  private handleCDPEvent(method: string, params: any): void {
    this.emit(`cdp:${method}`, params);
  }

  private mapPauseReason(cdpReason: string): string {
    switch (cdpReason) {
      case "Break":
      case "debugCommand":
        return "breakpoint";
      case "Step":
        return "step";
      case "Pause":
        return "pause";
      case "Exception":
        return "exception";
      case "EventListener":
      case "promiseRejection":
        return "exception";
      default:
        return cdpReason;
    }
  }

  private async handleSetBreakpoints(request: DAPRequest): Promise<void> {
    const args = request.arguments as SetBreakpointsArguments;
    const source = args.source;
    const lines = args.lines || [];
    const breakpoints = args.breakpoints || [];
    
    if (!source.path) {
      this.sendErrorResponse(request, "Source path is required");
      return;
    }
    
    // Clear existing breakpoints for this file
    const scriptId = this.pathToScriptId.get(source.path);
    if (scriptId) {
      const existingBreakpoints = this.breakpoints.get(source.path) || [];
      for (const bp of existingBreakpoints) {
        if (bp.id) {
          await this.sendCDPCommand("Debugger.removeBreakpoint", {
            breakpointId: bp.id.toString(),
          });
        }
      }
    }
    
    // Set new breakpoints
    const resultBreakpoints: Breakpoint[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const condition = breakpoints[i]?.condition;
      
      if (scriptId) {
        try {
          const result = await this.sendCDPCommand("Debugger.setBreakpoint", {
            location: {
              scriptId,
              lineNumber: line - 1, // CDP uses 0-based lines
            },
            condition,
          });
          
          resultBreakpoints.push({
            id: parseInt(result.breakpointId, 10),
            verified: true,
            line,
            source,
          });
        } catch (error) {
          resultBreakpoints.push({
            verified: false,
            line,
            source,
            message: error instanceof Error ? error.message : "Failed to set breakpoint",
          });
        }
      } else {
        // Script not loaded yet, mark as unverified
        resultBreakpoints.push({
          verified: false,
          line,
          source,
        });
      }
    }
    
    this.breakpoints.set(source.path, resultBreakpoints);
    
    const response: SetBreakpointsResponse = {
      breakpoints: resultBreakpoints,
    };
    
    this.sendResponse(request, response);
  }

  private async handleConfigurationDone(request: DAPRequest): Promise<void> {
    this.sendResponse(request, {});
    
    // Resume execution if stopOnEntry is false
    if (this.isPaused) {
      await this.sendCDPCommand("Debugger.resume");
    }
  }

  private async handleThreads(request: DAPRequest): Promise<void> {
    const response: ThreadsResponse = {
      threads: [
        {
          id: 1,
          name: "Main Thread",
        },
      ],
    };
    
    this.sendResponse(request, response);
  }

  private async handleStackTrace(request: DAPRequest): Promise<void> {
    if (!this.isPaused || this.currentCallFrames.length === 0) {
      const response: StackTraceResponse = {
        stackFrames: [],
        totalFrames: 0,
      };
      this.sendResponse(request, response);
      return;
    }
    
    const stackFrames: StackFrame[] = this.currentCallFrames.map((frame, index) => {
      const location = frame.location;
      const scriptPath = this.scriptIdToPath.get(location.scriptId);
      
      return {
        id: index,
        name: frame.functionName || "<anonymous>",
        source: scriptPath ? { path: scriptPath } : undefined,
        line: location.lineNumber + 1, // Convert to 1-based
        column: (location.columnNumber || 0) + 1,
      };
    });
    
    const response: StackTraceResponse = {
      stackFrames,
      totalFrames: stackFrames.length,
    };
    
    this.sendResponse(request, response);
  }

  private async handleScopes(request: DAPRequest): Promise<void> {
    const args = request.arguments as ScopesArguments;
    const frameId = args.frameId;
    
    if (!this.isPaused || frameId >= this.currentCallFrames.length) {
      const response: ScopesResponse = {
        scopes: [],
      };
      this.sendResponse(request, response);
      return;
    }
    
    const callFrame = this.currentCallFrames[frameId];
    const scopes: Scope[] = [];
    
    for (let i = 0; i < callFrame.scopeChain.length; i++) {
      const cdpScope = callFrame.scopeChain[i];
      const scope: Scope = {
        name: this.mapScopeName(cdpScope.type),
        presentationHint: this.mapScopeHint(cdpScope.type),
        variablesReference: this.createVariableReference(frameId, i),
        expensive: false,
      };
      
      scopes.push(scope);
    }
    
    // Add "this" as a scope if available
    if (callFrame.this && callFrame.this.type !== "undefined") {
      scopes.push({
        name: "this",
        presentationHint: "locals",
        variablesReference: this.createVariableReference(frameId, -1),
        expensive: false,
      });
    }
    
    const response: ScopesResponse = {
      scopes,
    };
    
    this.sendResponse(request, response);
  }

  private mapScopeName(cdpType: string): string {
    switch (cdpType) {
      case "global":
        return "Globals";
      case "local":
        return "Locals";
      case "closure":
        return "Closure";
      case "catch":
        return "Catch";
      case "block":
        return "Block";
      case "with":
        return "With";
      default:
        return cdpType;
    }
  }

  private mapScopeHint(cdpType: string): string {
    switch (cdpType) {
      case "local":
      case "closure":
      case "catch":
      case "block":
        return "locals";
      case "global":
        return "globals";
      default:
        return "locals";
    }
  }

  private createVariableReference(frameId: number, scopeIndex: number): number {
    // Encode frame and scope index into a single reference number
    return (frameId << 16) | ((scopeIndex + 1) & 0xFFFF);
  }

  private decodeVariableReference(ref: number): { frameId: number; scopeIndex: number } {
    return {
      frameId: ref >> 16,
      scopeIndex: (ref & 0xFFFF) - 1,
    };
  }

  private async handleVariables(request: DAPRequest): Promise<void> {
    const args = request.arguments as VariablesArguments;
    const ref = args.variablesReference;
    
    const { frameId, scopeIndex } = this.decodeVariableReference(ref);
    
    if (!this.isPaused || frameId >= this.currentCallFrames.length) {
      const response: VariablesResponse = {
        variables: [],
      };
      this.sendResponse(request, response);
      return;
    }
    
    const callFrame = this.currentCallFrames[frameId];
    let objectId: string | undefined;
    
    if (scopeIndex === -1) {
      // "this" object
      objectId = callFrame.this.objectId;
    } else if (scopeIndex < callFrame.scopeChain.length) {
      objectId = callFrame.scopeChain[scopeIndex].object.objectId;
    }
    
    if (!objectId) {
      const response: VariablesResponse = {
        variables: [],
      };
      this.sendResponse(request, response);
      return;
    }
    
    try {
      const result = await this.sendCDPCommand("Runtime.getProperties", {
        objectId,
        ownProperties: true,
        accessorPropertiesOnly: false,
      });
      
      const variables: Variable[] = [];
      
      for (const prop of result.result) {
        if (!prop.value) continue;
        
        const variable: Variable = {
          name: prop.name,
          value: this.formatRemoteObject(prop.value),
          type: prop.value.type,
          variablesReference: prop.value.objectId ? this.createObjectReference(prop.value.objectId) : 0,
        };
        
        variables.push(variable);
      }
      
      const response: VariablesResponse = {
        variables,
      };
      
      this.sendResponse(request, response);
    } catch (error) {
      this.sendErrorResponse(request, error instanceof Error ? error.message : "Failed to get variables");
    }
  }

  private createObjectReference(objectId: string): number {
    // For simplicity, we'll use a hash of the object ID
    // In a real implementation, you'd want to maintain a proper mapping
    let hash = 0;
    for (let i = 0; i < objectId.length; i++) {
      const char = objectId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) || 1; // Ensure non-zero
  }

  private formatRemoteObject(obj: CDPRemoteObject): string {
    if (obj.type === "undefined") {
      return "undefined";
    } else if (obj.type === "object") {
      if (obj.subtype === "null") {
        return "null";
      } else if (obj.subtype === "array") {
        return obj.description || "Array";
      } else {
        return obj.description || obj.className || "Object";
      }
    } else if (obj.type === "function") {
      return obj.description || "function";
    } else if (obj.value !== undefined) {
      return JSON.stringify(obj.value);
    } else if (obj.unserializableValue) {
      return obj.unserializableValue;
    } else {
      return obj.description || obj.type;
    }
  }

  private async handleEvaluate(request: DAPRequest): Promise<void> {
    const args = request.arguments as EvaluateArguments;
    
    if (!this.isPaused) {
      this.sendErrorResponse(request, "Cannot evaluate while running");
      return;
    }
    
    const frameId = args.frameId || 0;
    if (frameId >= this.currentCallFrames.length) {
      this.sendErrorResponse(request, "Invalid frame ID");
      return;
    }
    
    const callFrame = this.currentCallFrames[frameId];
    
    try {
      const result = await this.sendCDPCommand("Debugger.evaluateOnCallFrame", {
        callFrameId: callFrame.callFrameId,
        expression: args.expression,
        returnByValue: false,
        generatePreview: true,
      });
      
      const response: EvaluateResponse = {
        result: this.formatRemoteObject(result.result),
        type: result.result.type,
        variablesReference: result.result.objectId ? this.createObjectReference(result.result.objectId) : 0,
      };
      
      this.sendResponse(request, response);
    } catch (error) {
      const response: EvaluateResponse = {
        result: `Error: ${error instanceof Error ? error.message : String(error)}`,
        variablesReference: 0,
      };
      this.sendResponse(request, response);
    }
  }

  private async handleContinue(request: DAPRequest): Promise<void> {
    if (!this.isPaused) {
      this.sendResponse(request, { allThreadsContinued: true });
      return;
    }
    
    await this.sendCDPCommand("Debugger.resume");
    this.sendResponse(request, { allThreadsContinued: true });
  }

  private async handleNext(request: DAPRequest): Promise<void> {
    if (!this.isPaused) {
      this.sendErrorResponse(request, "Cannot step while running");
      return;
    }
    
    await this.sendCDPCommand("Debugger.stepOver");
    this.sendResponse(request, {});
  }

  private async handleStepIn(request: DAPRequest): Promise<void> {
    if (!this.isPaused) {
      this.sendErrorResponse(request, "Cannot step while running");
      return;
    }
    
    await this.sendCDPCommand("Debugger.stepInto");
    this.sendResponse(request, {});
  }

  private async handleStepOut(request: DAPRequest): Promise<void> {
    if (!this.isPaused) {
      this.sendErrorResponse(request, "Cannot step while running");
      return;
    }
    
    await this.sendCDPCommand("Debugger.stepOut");
    this.sendResponse(request, {});
  }

  private async handlePause(request: DAPRequest): Promise<void> {
    if (this.isPaused) {
      this.sendResponse(request, {});
      return;
    }
    
    await this.sendCDPCommand("Debugger.pause");
    this.sendResponse(request, {});
  }

  private async handleDisconnect(request: DAPRequest): Promise<void> {
    const args = request.arguments as { terminateDebuggee?: boolean };
    
    if (args.terminateDebuggee !== false && this.process) {
      this.process.kill();
    }
    
    this.cleanup();
    this.sendResponse(request, {});
    
    // Exit the adapter
    setTimeout(() => process.exit(0), 100);
  }

  private cleanup(): void {
    if (this.ws) {
      this.ws.destroy();
      this.ws = null;
    }
    
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    
    this.cdpCallbacks.clear();
    this.scriptIdToPath.clear();
    this.pathToScriptId.clear();
    this.breakpoints.clear();
    this.currentCallFrames = [];
    this.isPaused = false;
    this.wsHandshakeComplete = false;
    this.wsBuffer = Buffer.alloc(0);
  }

  private async sendCDPCommand(method: string, params?: any): Promise<any> {
    if (!this.ws || this.ws.destroyed) {
      throw new Error("Socket not connected");
    }
    
    const id = this.cdpSequence++;
    const message = {
      id,
      method,
      params: params || {},
    };
    
    return new Promise((resolve, reject) => {
      this.cdpCallbacks.set(id, { resolve, reject });
      const payload = Buffer.from(JSON.stringify(message), 'utf8');
      this.sendWebSocketFrame(0x01, payload);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.cdpCallbacks.has(id)) {
          this.cdpCallbacks.delete(id);
          reject(new Error(`CDP command timeout: ${method}`));
        }
      }, 5000);
    });
  }

  private sendResponse(request: DAPRequest, body: any): void {
    const response: DAPResponse = {
      seq: this.sequenceNumber++,
      type: "response",
      request_seq: request.seq,
      success: true,
      command: request.command,
      body,
    };
    
    this.sendMessage(response);
  }

  private sendErrorResponse(request: DAPRequest, message: string): void {
    const response: DAPResponse = {
      seq: this.sequenceNumber++,
      type: "response",
      request_seq: request.seq,
      success: false,
      command: request.command,
      message,
    };
    
    this.sendMessage(response);
  }

  private sendEvent(event: string, body: any): void {
    const message: DAPEvent = {
      seq: this.sequenceNumber++,
      type: "event",
      event,
      body,
    };
    
    this.sendMessage(message);
  }

  private sendOutputEvent(category: string, output: string): void {
    const event: OutputEvent = {
      category,
      output,
    };
    
    this.sendEvent("output", event);
  }

  private sendMessage(message: DAPResponse | DAPEvent): void {
    const json = JSON.stringify(message);
    const contentLength = Buffer.byteLength(json, "utf8");
    const header = `Content-Length: ${contentLength}\r\n\r\n`;
    
    process.stdout.write(header + json);
  }

  private sendError(message: string): void {
    console.error(`[NodeDAPAdapter] Error: ${message}`);
  }
}

// Start the adapter
new NodeDAPAdapter();

// Handle process termination
process.on("SIGINT", () => {
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});