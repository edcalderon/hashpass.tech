const requiredFields = ['id', 'title'];

export function validateEventBriefInput(event) {
  if (!event || typeof event !== 'object') throw new Error('Event input must be an object.');
  for (const field of requiredFields) {
    if (typeof event[field] !== 'string' || !event[field].trim()) {
      throw new Error(`Event input requires ${field}.`);
    }
  }
  if (event.themes !== undefined && (!Array.isArray(event.themes) || event.themes.some((theme) => typeof theme !== 'string'))) {
    throw new Error('Event themes must be an array of strings.');
  }
}

export function buildEventVideoBriefRequest(event) {
  validateEventBriefInput(event);
  const location = [event.city, event.country].filter(Boolean).join(', ') || 'location to be confirmed';
  const dates = [event.startDate, event.endDate].filter(Boolean).join(' to ') || 'date to be confirmed';
  const themes = event.themes?.filter(Boolean).join(', ') || 'community and discovery';

  return {
    model: 'configured-by-environment',
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `Create a Diffusion Studio creative brief for the HASHPASS public event explorer.\n\nEvent\n- ID: ${event.id}\n- Title: ${event.title}\n- Location: ${location}\n- Dates: ${dates}\n- Themes: ${themes}\n\nThe deliverable is a muted 8-second seamless 16:9 loop used only as a background behind accessible event title and CTA overlays. No logos, lettering, dates, UI, or readable text. Do not imply official partners, speakers, venue interiors, or factual claims that were not supplied. Prefer abstract, cinematic motion inspired by the themes and location rather than recognizable people.\n\nReturn JSON only, following the required fields in the schema.`,
    }],
    outputSchema: {
      type: 'object',
      required: ['summary', 'prompt', 'negativePrompt', 'reviewChecklist'],
      properties: {
        summary: {type: 'string'},
        prompt: {type: 'string'},
        negativePrompt: {type: 'string'},
        reviewChecklist: {type: 'array', items: {type: 'string'}},
      },
    },
  };
}

/** Build the raw Messages API request with Anthropic's API-key auth scheme. */
export function buildClaudeMessagesFetchInit({apiKey, model, request}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('Anthropic API key is required.');
  if (typeof model !== 'string' || !model.trim()) throw new Error('Anthropic model is required.');

  return {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: request.max_tokens,
      messages: request.messages,
    }),
  };
}

export function parseClaudeBrief(response) {
  const text = response?.content?.find((block) => block.type === 'text')?.text;
  if (!text) throw new Error('Claude returned no text brief.');
  const parsed = JSON.parse(text);
  for (const field of ['summary', 'prompt', 'negativePrompt', 'reviewChecklist']) {
    if (!(field in parsed)) throw new Error(`Claude brief is missing ${field}.`);
  }
  return parsed;
}
