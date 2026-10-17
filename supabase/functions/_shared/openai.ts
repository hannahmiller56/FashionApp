export interface OpenAiGenerationResult {
  b64Json?: string;
  url?: string;
  revisedPrompt?: string;
}

export interface ClosetItemAutoTagResult {
  category: string;
  color: string;
  style_tags: string[];
}

interface OpenAiReferenceImage {
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
}

function fileExtensionForContentType(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('jpg') || contentType.includes('jpeg')) return 'jpg';
  return 'png';
}

async function downloadReferenceImage(url: string, index: number): Promise<OpenAiReferenceImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download reference image ${index + 1}: HTTP ${response.status}`);
  }

  const contentTypeHeader = response.headers.get('content-type') || 'image/png';
  const contentType = contentTypeHeader.split(';')[0].trim().toLowerCase();
  const bytes = await response.arrayBuffer();
  const extension = fileExtensionForContentType(contentType);

  return {
    bytes,
    contentType,
    filename: `reference_${index + 1}.${extension}`
  };
}

function createEditFormData(params: {
  prompt: string;
  quality: 'low' | 'medium' | 'high';
  size: string;
  referenceImages: OpenAiReferenceImage[];
  imageFieldName: 'image[]' | 'image';
}): FormData {
  const formData = new FormData();
  formData.append('model', 'gpt-image-1');
  formData.append('prompt', params.prompt);
  formData.append('size', params.size);
  formData.append('quality', params.quality);
  formData.append('input_fidelity', 'high');

  for (const referenceImage of params.referenceImages) {
    const blob = new Blob([referenceImage.bytes], { type: referenceImage.contentType });
    formData.append(params.imageFieldName, blob, referenceImage.filename);
  }

  return formData;
}

async function parseImageResponse(response: Response): Promise<OpenAiGenerationResult> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI image request failed: ${response.status} ${message}`);
  }

  const payload = await response.json();
  const first = payload?.data?.[0];

  if (!first) {
    throw new Error('OpenAI image response had no result');
  }

  return {
    b64Json: first.b64_json,
    url: first.url,
    revisedPrompt: first.revised_prompt
  };
}

async function requestImageEdit(params: {
  apiKey: string;
  prompt: string;
  quality: 'low' | 'medium' | 'high';
  size: string;
  referenceImages: OpenAiReferenceImage[];
  imageFieldName: 'image[]' | 'image';
}): Promise<Response> {
  const formData = createEditFormData({
    prompt: params.prompt,
    quality: params.quality,
    size: params.size,
    referenceImages: params.referenceImages,
    imageFieldName: params.imageFieldName
  });

  return fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`
    },
    body: formData
  });
}

export async function generateImageWithOpenAi(params: {
  prompt: string;
  quality?: 'low' | 'medium' | 'high';
  size?: string;
  referenceImageUrls?: string[];
}): Promise<OpenAiGenerationResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  const quality = params.quality || 'medium';
  const size = params.size || '1024x1024';
  const referenceImageUrls = (params.referenceImageUrls || []).filter((url) => !!url);

  if (referenceImageUrls.length > 0) {
    const referenceImages = await Promise.all(
      referenceImageUrls.map((url, index) => downloadReferenceImage(url, index))
    );

    let editResponse = await requestImageEdit({
      apiKey,
      prompt: params.prompt,
      quality,
      size,
      referenceImages,
      imageFieldName: 'image[]'
    });

    // Compatibility fallback: some API clients expect repeated "image" fields instead of "image[]".
    if (!editResponse.ok && editResponse.status === 400) {
      editResponse = await requestImageEdit({
        apiKey,
        prompt: params.prompt,
        quality,
        size,
        referenceImages,
        imageFieldName: 'image'
      });
    }

    return parseImageResponse(editResponse);
  }

  const generationResponse = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: params.prompt,
      size,
      quality
    })
  });

  return parseImageResponse(generationResponse);
}

function safeParseJsonRecord(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function autoTagClosetItemWithOpenAi(params: {
  imageUrl: string;
  currentCategory?: string;
  currentColor?: string;
  currentStyleTags?: string[];
}): Promise<ClosetItemAutoTagResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  const model = Deno.env.get('OPENAI_AUTOTAG_MODEL') || 'gpt-4o-mini';
  const fallbackCategory = params.currentCategory || 'top';
  const fallbackColor = params.currentColor || 'unknown';
  const fallbackTags = (params.currentStyleTags || []).slice(0, 4);

  const systemPrompt =
    'Extract one clothing item label from image. Output strict JSON only with keys: category,color,style_tags.';
  const userPrompt = [
    'Pick the main garment in frame.',
    'category must be one of: top,bottom,dress,outerwear,shoes,accessories.',
    'color: lowercase, 1-2 words.',
    'style_tags: 0-4 short lowercase tags.',
    'No explanations.'
  ].join(' ');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 100,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: params.imageUrl, detail: 'low' } }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI closet auto-tag failed: ${response.status} ${message}`);
  }

  const payload = await response.json();
  const contentRaw = String(payload?.choices?.[0]?.message?.content || '').trim();
  const parsed = safeParseJsonRecord(contentRaw);
  if (!parsed) {
    return {
      category: fallbackCategory,
      color: fallbackColor,
      style_tags: fallbackTags
    };
  }

  const category = String(parsed.category || fallbackCategory).trim().toLowerCase() || fallbackCategory;
  const color = String(parsed.color || fallbackColor).trim().toLowerCase() || fallbackColor;

  const rawTags = Array.isArray(parsed.style_tags) ? parsed.style_tags : [];
  const styleTags = rawTags
    .map((tag) => String(tag || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 4);

  return {
    category,
    color,
    style_tags: styleTags
  };
}
