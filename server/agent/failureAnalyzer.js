/**
 * FailureAnalyzer parses test, build, and lint failures into structured Failure Memory
 * and isolates the root cause hypothesis to enable targeted recovery.
 */

export class FailureAnalyzer {
  constructor() {
    this.memoryLog = [];
  }

  getFailures() {
    return this.memoryLog;
  }

  clear() {
    this.memoryLog = [];
  }

  analyze(rawOutput = '', context = {}) {
    const { attempt = 1, currentTask = '', repoFiles = [] } = context;

    // Default structured record
    const memory = {
      id: `fail_${Date.now()}_${attempt}`,
      timestamp: new Date().toISOString(),
      attempt,
      type: "TEST_FAILURE",
      file: "unknown",
      test: "Unknown test case",
      expected: "Expected assertion",
      received: "Received value",
      likely_area: "Component logic",
      stack: "",
      rawSnippet: rawOutput.slice(0, 500)
    };

    // 1. Detect test runner error patterns
    // e.g., "✖ should reject request without Bearer prefix (3.2ms)"
    // or "FAIL test/auth.test.js > should return 401 when token is missing"
    const failureLineMatch = rawOutput.match(/(?:✖|FAIL|✕|not ok \d+ -)\s*([^\r\n]+)/);
    if (failureLineMatch) {
      memory.test = failureLineMatch[1].trim();
    }

    // 2. Detect expected vs received
    const expectedMatch = rawOutput.match(/expected\s*[:]?\s*['"]?([^'"\r\n]+)['"]?/i);
    const receivedMatch = rawOutput.match(/(?:actual|received)\s*[:]?\s*['"]?([^'"\r\n]+)['"]?/i);

    if (expectedMatch) memory.expected = expectedMatch[1].trim();
    if (receivedMatch) memory.received = receivedMatch[1].trim();

    // Specific status code comparisons (e.g. 401 vs 200)
    const codeMatch = rawOutput.match(/expected\s+(?:status\s+)?(\d{3})\s+.*(?:got|received)\s+(\d{3})/i);
    if (codeMatch) {
      memory.expected = codeMatch[1];
      memory.received = codeMatch[2];
    }

    // 3. Detect failing file and stack line
    const fileStackMatch = rawOutput.match(/(?:at\s+.*?\()?([a-zA-Z0-9_\-\.\/]+\.(?:test|spec|controller|js|ts)):(\d+):(\d+)/);
    if (fileStackMatch) {
      memory.file = fileStackMatch[1];
      memory.stack = `${fileStackMatch[1]}:${fileStackMatch[2]}:${fileStackMatch[3]}`;
    } else {
      // Look for any test file mentioned in raw output
      for (const rf of repoFiles) {
        const p = typeof rf === 'string' ? rf : rf.path;
        if (p.includes('test') && rawOutput.includes(p)) {
          memory.file = p;
          break;
        }
      }
    }

    // 4. Determine likely area and target implementation file
    const lowerOutput = rawOutput.toLowerCase();
    if (lowerOutput.includes('pagination') || lowerOutput.includes('limit') || lowerOutput.includes('data.length')) {
      memory.likely_area = "Pagination parameter parsing & array slicing";
      memory.implementationFile = "src/controllers/products.controller.js";
    } else if (lowerOutput.includes('bearer') || lowerOutput.includes('authorization')) {
      memory.likely_area = "Authorization header Bearer prefix validation in auth middleware";
      memory.implementationFile = "src/middleware/auth.js";
    } else if (lowerOutput.includes('expired')) {
      memory.likely_area = "Token expiration verification logic in auth middleware";
      memory.implementationFile = "src/middleware/auth.js";
    } else if (lowerOutput.includes('email') || lowerOutput.includes('password') || lowerOutput.includes('registration')) {
      memory.likely_area = "User input validation rules";
      memory.implementationFile = "src/controllers/user.controller.js";
    } else if (lowerOutput.includes('syntaxerror') || lowerOutput.includes('referenceerror')) {
      memory.type = "SYNTAX_OR_RUNTIME_ERROR";
      memory.likely_area = "Syntax or undefined reference error";
    } else if (lowerOutput.includes('build failed') || lowerOutput.includes('tsc')) {
      memory.type = "BUILD_FAILURE";
      memory.likely_area = "TypeScript compiler or bundling error";
    }

    this.memoryLog.push(memory);
    return memory;
  }
}
