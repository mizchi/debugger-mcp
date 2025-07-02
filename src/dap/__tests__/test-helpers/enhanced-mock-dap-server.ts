/**
 * Enhanced Mock DAP server for testing
 * Extracted from the original implementation to be reusable in tests
 */
import { createServer, Socket, Server } from "net";
import { EventEmitter } from "events";
import {
  sendSuccessResponse,
  sendErrorResponse,
  sendEventWithDelay,
  sendDAPMessage,
  createEvent,
} from "./dap-test-utils.ts";

interface ProgramState {
  stopped: boolean;
  threadId: number;
  frameId: number;
  stopReason: string;
  currentLine: number;
  variables: Map<string, any>;
  scopes: Array<{
    name: string;
    variablesReference: number;
    expensive: boolean;
  }>;
}

export class EnhancedMockDAPServer extends EventEmitter {
  private server: Server;
  private sequenceNumber = 1;
  private variableHandles = new Map<number, any>();
  
  private programState: ProgramState = {
    stopped: false,
    threadId: 1,
    frameId: 1,
    stopReason: "",
    currentLine: 0,
    variables: new Map(),
    scopes: [],
  };

  constructor() {
    super();
    this.server = createServer((socket) => {
      this.setupClient(socket);
    });
    
    this.initializeMockState();
  }

  private initializeMockState() {
    this.programState.variables.set("globalVar", "I'm global");
    
    const localVars = {
      localVar: "I'm local",
      numbers: [1, 2, 3, 4, 5],
      obj: {
        name: "Test Object",
        value: 42,
        nested: {
          deep: "Deep value"
        }
      },
      i: 0,
      sum: 0,
      arr: [1, 2, 3, 4, 5],
    };
    
    this.variableHandles.set(1, this.programState.variables);
    this.variableHandles.set(2, localVars);
    this.variableHandles.set(3, localVars.numbers);
    this.variableHandles.set(4, localVars.obj);
    this.variableHandles.set(5, localVars.obj.nested);
    this.variableHandles.set(6, localVars.arr);
    
    this.programState.scopes = [
      { name: "Locals", variablesReference: 2, expensive: false },
      { name: "Globals", variablesReference: 1, expensive: false },
    ];
  }

  private setupClient(socket: Socket) {
    let buffer = "";

    socket.on("data", (data) => {
      buffer += data.toString();

      while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;

        const header = buffer.substring(0, headerEnd);
        const contentLengthMatch = header.match(/Content-Length: (\d+)/);
        if (!contentLengthMatch) break;

        const contentLength = parseInt(contentLengthMatch[1], 10);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + contentLength;

        if (buffer.length < bodyEnd) break;

        const body = buffer.substring(bodyStart, bodyEnd);
        buffer = buffer.substring(bodyEnd);

        try {
          const message = JSON.parse(body);
          this.handleMessage(message, socket);
        } catch (error) {
          console.error("Failed to parse message:", error);
        }
      }
    });

    socket.on("close", () => {
      // Client disconnected
    });
  }

  private handleMessage(message: any, socket: Socket) {
    switch (message.command) {
      case "initialize":
        this.handleInitialize(message, socket);
        break;
      case "setBreakpoints":
        this.handleSetBreakpoints(message, socket);
        break;
      case "configurationDone":
        this.handleConfigurationDone(message, socket);
        break;
      case "launch":
        this.handleLaunch(message, socket);
        break;
      case "threads":
        this.handleThreads(message, socket);
        break;
      case "stackTrace":
        this.handleStackTrace(message, socket);
        break;
      case "scopes":
        this.handleScopes(message, socket);
        break;
      case "variables":
        this.handleVariables(message, socket);
        break;
      case "evaluate":
        this.handleEvaluate(message, socket);
        break;
      case "continue":
        this.handleContinue(message, socket);
        break;
      case "next":
        this.handleNext(message, socket);
        break;
      case "stepIn":
        this.handleStepIn(message, socket);
        break;
      case "stepOut":
        this.handleStepOut(message, socket);
        break;
      case "disconnect":
        this.handleDisconnect(message, socket);
        break;
      default:
        this.sendErrorResponse(
          message,
          socket,
          `Unknown command: ${message.command}`
        );
    }
  }

  private handleInitialize(request: any, socket: Socket) {
    const response = {
      seq: this.sequenceNumber++,
      type: "response",
      request_seq: request.seq,
      success: true,
      command: request.command,
      body: {
        supportsConfigurationDoneRequest: true,
        supportsFunctionBreakpoints: true,
        supportsConditionalBreakpoints: true,
        supportsEvaluateForHovers: true,
        supportsStepBack: false,
        supportsSetVariable: true,
      },
    };

    this.sendMessage(response, socket);

    setTimeout(() => {
      this.sendEvent("initialized", {}, socket);
    }, 10);
  }

  private handleSetBreakpoints(request: any, socket: Socket) {
    const breakpoints = request.arguments.breakpoints || [];
    const response = {
      seq: this.sequenceNumber++,
      type: "response",
      request_seq: request.seq,
      success: true,
      command: request.command,
      body: {
        breakpoints: breakpoints.map((bp: any, index: number) => ({
          id: index + 1,
          verified: true,
          line: bp.line,
        })),
      },
    };

    this.sendMessage(response, socket);
  }

  private handleConfigurationDone(request: any, socket: Socket) {
    this.sequenceNumber = sendSuccessResponse(
      this.sequenceNumber,
      request,
      socket
    );
  }

  private handleLaunch(request: any, socket: Socket) {
    this.sequenceNumber = sendSuccessResponse(
      this.sequenceNumber,
      request,
      socket
    );

    setTimeout(() => {
      sendEventWithDelay(
        this.sequenceNumber++,
        "output",
        {
          category: "console",
          output: "Starting program...\n",
        },
        socket,
        0
      );
    }, 50);

    setTimeout(() => {
      this.programState.stopped = true;
      this.programState.stopReason = "breakpoint";
      this.programState.currentLine = 24;
      
      sendEventWithDelay(
        this.sequenceNumber++,
        "stopped",
        {
          reason: "breakpoint",
          description: "Paused on breakpoint",
          threadId: this.programState.threadId,
          allThreadsStopped: true,
        },
        socket,
        0
      );
    }, 100);
  }

  private handleThreads(request: any, socket: Socket) {
    this.sequenceNumber = sendSuccessResponse(
      this.sequenceNumber,
      request,
      socket,
      {
        threads: [
          {
            id: this.programState.threadId,
            name: "Main Thread",
          },
        ],
      }
    );
  }

  private handleStackTrace(request: any, socket: Socket) {
    const frames = [
      {
        id: 1,
        name: "testFunction",
        source: { path: "/test/file.js" },
        line: this.programState.currentLine,
        column: 0,
      }
    ];

    this.sequenceNumber = sendSuccessResponse(
      this.sequenceNumber,
      request,
      socket,
      {
        stackFrames: frames,
        totalFrames: frames.length,
      }
    );
  }

  private handleScopes(request: any, socket: Socket) {
    this.sequenceNumber = sendSuccessResponse(
      this.sequenceNumber,
      request,
      socket,
      {
        scopes: this.programState.scopes,
      }
    );
  }

  private handleVariables(request: any, socket: Socket) {
    const variablesReference = request.arguments.variablesReference;
    const variables = [];
    
    const data = this.variableHandles.get(variablesReference);
    
    if (data) {
      if (data instanceof Map) {
        for (const [name, value] of data) {
          variables.push({
            name,
            value: JSON.stringify(value),
            type: typeof value,
            variablesReference: 0,
          });
        }
      } else if (Array.isArray(data)) {
        data.forEach((value, index) => {
          variables.push({
            name: index.toString(),
            value: JSON.stringify(value),
            type: typeof value,
            variablesReference: 0,
          });
        });
      } else if (typeof data === "object") {
        for (const [key, value] of Object.entries(data)) {
          let varRef = 0;
          
          if (Array.isArray(value)) {
            varRef = key === "numbers" ? 3 : key === "arr" ? 6 : 0;
          } else if (typeof value === "object" && value !== null) {
            varRef = key === "obj" ? 4 : key === "nested" ? 5 : 0;
          }
          
          variables.push({
            name: key,
            value: typeof value === "object" ? JSON.stringify(value) : String(value),
            type: Array.isArray(value) ? "array" : typeof value,
            variablesReference: varRef,
          });
        }
      }
    }

    this.sequenceNumber = sendSuccessResponse(
      this.sequenceNumber,
      request,
      socket,
      {
        variables,
      }
    );
  }

  private handleEvaluate(request: any, socket: Socket) {
    const expression = request.arguments.expression;
    let result = "";
    let variablesReference = 0;
    
    switch (expression) {
      case "1 + 1":
        result = "2";
        break;
      case "numbers":
        result = "[1, 2, 3, 4, 5]";
        variablesReference = 3;
        break;
      case "numbers.length":
        result = "5";
        break;
      case "typeof globalVar":
        result = '"string"';
        break;
      default:
        this.sequenceNumber = sendErrorResponse(
          this.sequenceNumber,
          request,
          socket,
          `Cannot evaluate expression: ${expression}`
        );
        return;
    }

    this.sequenceNumber = sendSuccessResponse(
      this.sequenceNumber,
      request,
      socket,
      {
        result,
        type: "string",
        variablesReference,
      }
    );
  }

  private handleNext(request: any, socket: Socket) {
    this.sequenceNumber = sendSuccessResponse(
      this.sequenceNumber,
      request,
      socket
    );

    sendEventWithDelay(
      this.sequenceNumber++,
      "stopped",
      {
        reason: "step",
        threadId: this.programState.threadId,
      },
      socket,
      50
    );
  }

  private handleStepIn(request: any, socket: Socket) {
    this.sequenceNumber = sendSuccessResponse(
      this.sequenceNumber,
      request,
      socket
    );

    sendEventWithDelay(
      this.sequenceNumber++,
      "stopped",
      {
        reason: "step",
        threadId: this.programState.threadId,
      },
      socket,
      50
    );
  }

  private handleStepOut(request: any, socket: Socket) {
    this.sequenceNumber = sendSuccessResponse(
      this.sequenceNumber,
      request,
      socket
    );

    sendEventWithDelay(
      this.sequenceNumber++,
      "stopped",
      {
        reason: "step",
        threadId: this.programState.threadId,
      },
      socket,
      50
    );
  }

  private handleContinue(request: any, socket: Socket) {
    const response = {
      seq: this.sequenceNumber++,
      type: "response",
      request_seq: request.seq,
      success: true,
      command: request.command,
      body: {
        allThreadsContinued: true,
      },
    };

    this.sendMessage(response, socket);

    this.sendEvent(
      "continued",
      {
        threadId: request.arguments.threadId,
        allThreadsContinued: true,
      },
      socket
    );

    setTimeout(() => {
      this.sendEvent("terminated", {}, socket);
    }, 100);
  }

  private handleDisconnect(request: any, socket: Socket) {
    const response = {
      seq: this.sequenceNumber++,
      type: "response",
      request_seq: request.seq,
      success: true,
      command: request.command,
    };

    this.sendMessage(response, socket);
    socket.end();
  }

  private sendErrorResponse(request: any, socket: Socket, message: string) {
    const response = {
      seq: this.sequenceNumber++,
      type: "response",
      request_seq: request.seq,
      success: false,
      command: request.command,
      message,
    };

    this.sendMessage(response, socket);
  }

  private sendEvent(eventName: string, body: any, socket: Socket) {
    const event = createEvent(this.sequenceNumber++, eventName, body);
    sendDAPMessage(event, socket);
  }

  private sendMessage(message: any, socket: Socket) {
    sendDAPMessage(message, socket);
  }

  listen(port: number, callback?: () => void) {
    this.server.listen(port, callback);
  }

  close() {
    this.server.close();
  }
}