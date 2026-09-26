/**
 * Model-Agnostic Provider Architecture for ForgeLoop.
 * 
 * Complies with hackathon evaluation requirements:
 * - Completely provider-agnostic standard interface:
 *   generate(prompt, options)
 *   stream(prompt, onChunk, options)
 *   countTokens(text)
 *   getModelInfo()
 * - First-class native adapters for DeepSeek and Qwen (as well as Gemini & OpenAI/vLLM/Ollama).
 * - Harness intelligence (Planning, Context, Execution, Verification, Recovery)
 *   remains independent of the specific model.
 */

export class BaseModelProvider {
  constructor(name = 'base', config = {}) {
    this.name = name;
    this.config = config;
    this.apiKey = config.apiKey || null;
    this.model = config.model || null;
    this.baseURL = config.baseURL || null;
  }

  getExpectedEnvKey() {
    return 'MODEL_API_KEY';
  }

  getModelInfo() {
    return {
      provider: this.name,
      model: this.model,
      baseURL: this.baseURL,
      isConfigured: Boolean(this.apiKey)
    };
  }

  countTokens(text = '') {
    if (typeof text !== 'string') return 0;
    // Standard heuristic: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  async stream(prompt, onChunk, options = {}) {
    // Default fallback if streaming not supported by endpoint: call generate
    const response = await this.generate(prompt, options);
    if (typeof onChunk === 'function') {
      onChunk(response.text);
    }
    return response;
  }

  async generate(prompt, options = {}) {
    throw new Error('generate(prompt, options) must be implemented by subclass adapter.');
  }

  async generateJson(prompt, options = {}) {
    const response = await this.generate(
      `${prompt}\n\nReturn only one valid JSON object. Do not wrap it in markdown fences.`,
      options
    );
    const jsonText = response.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`Model returned invalid JSON: ${error.message} (Raw: ${jsonText.slice(0, 200)})`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Model response must be a JSON object.');
    }
    return { ...parsed, usage: response.usage };
  }

  async generatePlan(task, repoOutline, relevantFiles) {
    return this.generateJson([
      'Create an implementation plan for this coding task using the supplied repository outline and ranked candidate files.',
      'Do not assume files or functions that are not present in the supplied repository information.',
      'Return {"strategy":string,"summary":string,"steps":[{"step":number,"title":string,"description":string,"files":string[]}]}',
      `USER TASK:\n${task}`,
      `REPOSITORY OUTLINE:\n${JSON.stringify(repoOutline)}`,
      `RANKED FILES:\n${JSON.stringify(relevantFiles)}`
    ].join('\n\n'));
  }

  async generateImplementation(task, plan, contextItems) {
    const response = await this.generateJson([
      'You are an expert autonomous software engineer. Implement the user task in the supplied repository context.',
      'First, formulate a clear concise thought explaining your implementation strategy.',
      'Make minimal, surgical changes. Prefer editing existing files with exact matches or writing new files if necessary.',
      'Return {"thought":string,"actions":[{"thought":string,"tool":"edit_file"|"write_file","file":string,"targetContent":string,"replacementContent":string,"content":string}]}',
      'Return an empty actions array only if no code change is required. Never claim code was changed unless an action is returned.',
      `USER TASK:\n${task}`,
      `PLAN:\n${JSON.stringify(plan)}`,
      `REPOSITORY CONTEXT:\n${contextItems.map(item => `--- ${item.file} ---\n${item.content}`).join('\n\n')}`
    ].join('\n\n'));

    if (!Array.isArray(response.actions)) {
      throw new Error('Model implementation response is missing its actions array.');
    }
    for (const action of response.actions) {
      if (!action || !['write_file', 'edit_file'].includes(action.tool) || typeof action.file !== 'string') {
        throw new Error('Model returned an unsupported code-change action.');
      }
      if (action.tool === 'write_file' && typeof action.content !== 'string') {
        throw new Error(`Model did not provide file content for ${action.file}.`);
      }
      if (action.tool === 'edit_file' && (typeof action.targetContent !== 'string' || typeof action.replacementContent !== 'string')) {
        throw new Error(`Model returned an incomplete edit action for ${action.file}.`);
      }
    }
    return response;
  }

  async analyzeFailure(testOutput, task, contextItems) {
    return this.generateJson([
      'Analyze the actual test output and identify the likely cause using the supplied current repository context.',
      'Return {"type":string,"file":string,"test":string,"expected":string,"received":string,"likely_area":string,"rawMessage":string}',
      `USER TASK:\n${task}`,
      `TEST OUTPUT:\n${testOutput}`,
      `CONTEXT FILES:\n${contextItems.map(item => `--- ${item.file} ---\n${item.content}`).join('\n\n')}`
    ].join('\n\n'));
  }

  async generateRepair(failureMemory, failureContext) {
    const response = await this.generateJson([
      'Repair the code based on the actual test failure and the focused context. Preserve unrelated changes.',
      'Return {"diagnosis":string,"repairActions":[{"tool":"write_file","file":string,"content":string}]}',
      `FAILURE:\n${JSON.stringify(failureMemory)}`,
      `RECOVERY CONTEXT:\n${JSON.stringify(failureContext)}`
    ].join('\n\n'));

    if (!Array.isArray(response.repairActions)) {
      throw new Error('Model repair response is missing its repairActions array.');
    }
    for (const action of response.repairActions) {
      if (!action || !['write_file', 'edit_file'].includes(action.tool) || typeof action.file !== 'string') {
        throw new Error('Model returned an unsupported repair action.');
      }
      if (action.tool === 'write_file' && typeof action.content !== 'string') {
        throw new Error(`Model did not provide repaired file content for ${action.file}.`);
      }
    }
    return response;
  }
}

/**
 * Standard OpenAI-Compatible Provider Adapter
 * Powers DeepSeek, Qwen (DashScope / vLLM), OpenAI, Ollama, and custom endpoints.
 */
export class OpenAICompatibleProvider extends BaseModelProvider {
  constructor(name, config = {}) {
    super(name, config);
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey || null;
    this.model = config.model || 'gpt-4o-mini';
  }

  async generate(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error(`${this.getExpectedEnvKey()} is not configured for provider ${this.name}.`);
    }

    const messages = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const url = `${this.baseURL.replace(/\/+$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...(this.config.headers || {})
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${this.name} API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const promptTokens = data.usage?.prompt_tokens || this.countTokens(prompt);
    const completionTokens = data.usage?.completion_tokens || this.countTokens(text);
    const totalTokens = data.usage?.total_tokens || (promptTokens + completionTokens);

    return {
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        source: data.usage ? 'provider' : 'estimate'
      }
    };
  }
}

/**
 * DeepSeek Adapter
 * Connects to DeepSeek API (deepseek-chat / deepseek-reasoner).
 */
export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super('DeepSeek', config);
    this.baseURL = config.baseURL || process.env.DEEPSEEK_BASE_URL || process.env.MODEL_BASE_URL || 'https://api.deepseek.com/v1';
    this.apiKey = config.apiKey || process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.MODEL_API_KEY;
    this.model = config.model || process.env.MODEL_NAME || 'deepseek-chat';
  }

  getExpectedEnvKey() {
    return 'AI_API_KEY or DEEPSEEK_API_KEY';
  }
}

/**
 * Qwen Adapter
 * Connects to Alibaba Cloud DashScope / OpenAI compatible Qwen endpoint.
 */
export class QwenProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super('Qwen', config);
    this.baseURL = config.baseURL || process.env.QWEN_BASE_URL || process.env.DASHSCOPE_BASE_URL || process.env.MODEL_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    this.apiKey = config.apiKey || process.env.AI_API_KEY || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.MODEL_API_KEY;
    this.model = config.model || process.env.MODEL_NAME || 'qwen-plus';
  }

  getExpectedEnvKey() {
    return 'AI_API_KEY or QWEN_API_KEY';
  }
}

/**
 * Google Gemini Provider Adapter
 */
export class GeminiProvider extends BaseModelProvider {
  constructor(config = {}) {
    super('Google Gemini', config);
    this.apiKey = config.apiKey || process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.MODEL_API_KEY;
    this.model = config.model || process.env.MODEL_NAME || 'gemini-1.5-flash';
  }

  getExpectedEnvKey() {
    return 'AI_API_KEY or GEMINI_API_KEY';
  }

  async generate(prompt) {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY or AI_API_KEY is not configured.");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      text,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
        source: 'provider'
      }
    };
  }
}

/**
 * Generic OpenAI / Custom Provider Adapter
 */
export class GenericOpenAIProvider extends OpenAICompatibleProvider {
  constructor(config = {}) {
    super('OpenAI / Compatible', config);
    this.baseURL = config.baseURL || process.env.OPENAI_BASE_URL || process.env.MODEL_BASE_URL || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.MODEL_API_KEY;
    this.model = config.model || process.env.MODEL_NAME || 'gpt-4o-mini';
  }

  getExpectedEnvKey() {
    return 'AI_API_KEY or OPENAI_API_KEY';
  }
}

/**
 * ModelProviderFactory
 * Instantiates the appropriate adapter based on requested provider or environment.
 */
export class ModelProviderFactory {
  static create(providerType = null, config = {}) {
    const resolvedType = (
      providerType ||
      process.env.MODEL_PROVIDER ||
      ModelProviderFactory.detectProviderFromEnv() ||
      'deepseek'
    ).toLowerCase().trim();

    switch (resolvedType) {
      case 'deepseek':
        return new DeepSeekProvider(config);
      case 'qwen':
      case 'dashscope':
        return new QwenProvider(config);
      case 'gemini':
      case 'google':
        return new GeminiProvider(config);
      case 'openai':
      case 'custom':
        return new GenericOpenAIProvider(config);
      default:
        throw new Error(`Unsupported model provider: "${resolvedType}". Supported providers: deepseek, qwen, gemini, openai.`);
    }
  }

  static detectProviderFromEnv() {
    if (process.env.MODEL_PROVIDER) return process.env.MODEL_PROVIDER;
    if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
    if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) return 'qwen';
    if (process.env.AI_API_KEY) {
      // If AI_API_KEY is supplied, check MODEL_NAME or default to deepseek
      if (process.env.MODEL_NAME?.toLowerCase().includes('qwen')) return 'qwen';
      return 'deepseek';
    }
    if (process.env.GEMINI_API_KEY) return 'gemini';
    if (process.env.OPENAI_API_KEY) return 'openai';
    return null;
  }

  static getAvailableProviders() {
    const hasGlobalKey = Boolean(process.env.AI_API_KEY || process.env.MODEL_API_KEY);
    return [
      {
        id: 'deepseek',
        name: 'DeepSeek',
        label: 'DeepSeek (V3 / R1)',
        defaultModel: 'deepseek-chat',
        envKey: 'AI_API_KEY or DEEPSEEK_API_KEY',
        isConfigured: Boolean(hasGlobalKey || process.env.DEEPSEEK_API_KEY)
      },
      {
        id: 'qwen',
        name: 'Qwen',
        label: 'Qwen (2.5 Coder / Plus)',
        defaultModel: 'qwen-plus',
        envKey: 'AI_API_KEY or QWEN_API_KEY',
        isConfigured: Boolean(hasGlobalKey || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY)
      },
      {
        id: 'gemini',
        name: 'Google Gemini',
        label: 'Google Gemini',
        defaultModel: 'gemini-1.5-flash',
        envKey: 'GEMINI_API_KEY',
        isConfigured: Boolean(process.env.GEMINI_API_KEY)
      },
      {
        id: 'openai',
        name: 'OpenAI / Custom',
        label: 'OpenAI / Compatible Endpoint',
        defaultModel: 'gpt-4o-mini',
        envKey: 'OPENAI_API_KEY',
        isConfigured: Boolean(process.env.OPENAI_API_KEY)
      }
    ];
  }
}
