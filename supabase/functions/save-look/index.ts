import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { createUserClient } from '../_shared/clients.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const userClient = createUserClient(req.headers.get('Authorization'));

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse(401, { error: `Unauthorized: ${userError?.message || 'missing user in access token'}` });
  }

  try {
    const body = await req.json();
    const result = body.result;
    const calendarDate = body.calendarDate ? String(body.calendarDate) : null;

    if (!result || !result.image_url || !result.prompt) {
      return jsonResponse(400, { error: 'Result payload is incomplete' });
    }

    const generationResultId = typeof result.id === 'string' ? result.id : null;

    const { data: savedLook, error: saveError } = await userClient
      .from('saved_looks')
      .insert({
        user_id: user.id,
        generation_result_id: generationResultId,
        image_url: result.image_url,
        prompt_text: result.prompt,
        recipe_simplified: result.recipe_simplified || {
          closet_item_ids: [],
          non_closet_notes: []
        },
        model_version: result.model_version || 'gpt-image-1',
        calendar_date: calendarDate
      })
      .select('*')
      .single();

    if (saveError || !savedLook) {
      throw saveError || new Error('Failed to save look');
    }

    return jsonResponse(200, {
      savedLook: {
        id: savedLook.id,
        image_url: savedLook.image_url,
        prompt_text: savedLook.prompt_text,
        recipe_simplified: savedLook.recipe_simplified,
        calendar_date: savedLook.calendar_date,
        model_version: savedLook.model_version,
        created_at: savedLook.created_at
      }
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown save error'
    });
  }
});
