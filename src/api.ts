import fetch from 'node-fetch';
import { USER_AGENT } from './version';

export class StepFunClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.stepfun.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private authHeaders() {
    return {
      'User-Agent': USER_AGENT,
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  private jsonHeaders() {
    return {
      ...this.authHeaders(),
      'Content-Type': 'application/json'
    };
  }

  async chatCompletion(model: string, messages: any[]) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        model,
        messages
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }
    
    return await response.json();
  }

  async audioSynthesize(model: string, input: string, voice: string = 'cixingnan') {
    const response = await fetch(`${this.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        model,
        input,
        voice
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    return await response.buffer();
  }

  async audioTranscribe(model: string, filePath: string) {
    const FormData = require('form-data');
    const fs = require('fs');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('model', model);

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        ...form.getHeaders()
      },
      body: form
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  async imageEdit(model: string, imagePath: string, prompt: string) {
    const FormData = require('form-data');
    const fs = require('fs');
    const form = new FormData();
    form.append('image', fs.createReadStream(imagePath));
    form.append('prompt', prompt);
    form.append('model', model);

    const response = await fetch(`${this.baseUrl}/images/edits`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        ...form.getHeaders()
      },
      body: form
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }
}
