const https = require('https');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'API key not found in environment' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: body.system,
      messages: body.messages
    });

    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(responseData) }); }
          catch(e) { reject(new Error('Parse error: ' + responseData)); }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    return {
      statusCode: data.status,
      headers,
      body: JSON.stringify(data.body)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
