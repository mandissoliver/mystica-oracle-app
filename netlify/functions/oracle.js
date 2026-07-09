const https = require('https');

exports.handler = async function(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };

  try {
    const body = JSON.parse(event.body);
    const isFree = body.free === true;

    const systemPrompt = `Eres MÍSTIKA, cartomante espiritual. Responde SIEMPRE en español.

${body.system}

FORMATO ESTRICTO — usa EXACTAMENTE estos separadores, uno por línea:
[CARTAS] texto aquí
[ASTROS] texto aquí
[ESENCIA] texto aquí
[KARMA] texto aquí
[DONES] texto aquí
[PRACTICAS] texto aquí
[MENSAJE] texto aquí

Cada sección máximo 60 palabras. USA los corchetes exactamente así.`;

    const payload = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: systemPrompt,
      messages: body.messages
    });

    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        timeout: 25000,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      const req = https.request(options, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
          catch(e) { reject(new Error('Parse error')); }
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    if (!data.body || !data.body.content) {
      return { statusCode: data.status, headers, body: JSON.stringify(data.body) };
    }

    const raw = data.body.content.map(b => b.text || '').join('');

    // Parse sections using [SECTION] format
    const sectionKeys = ['CARTAS','ASTROS','ESENCIA','KARMA','DONES','PRACTICAS','MENSAJE'];
    const parsed = {};
    sectionKeys.forEach((key, i) => {
      const next = sectionKeys[i + 1];
      const regex = next
        ? new RegExp(`\\[${key}\\]([\\s\\S]*?)(?=\\[${next}\\]|$)`, 'i')
        : new RegExp(`\\[${key}\\]([\\s\\S]*)`, 'i');
      const match = raw.match(regex);
      if (match) parsed[key] = match[1].trim();
    });

    // If free mode, only return CARTAS and ESENCIA
    let result;
    if (isFree) {
      result = {
        free: true,
        sections: {
          CARTAS: parsed['CARTAS'] || '',
          ESENCIA: parsed['ESENCIA'] || ''
        }
      };
    } else {
      result = { free: false, sections: parsed };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(result) }] })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
