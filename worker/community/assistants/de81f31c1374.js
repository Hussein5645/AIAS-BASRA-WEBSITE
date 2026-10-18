import OpenAI from 'openai';
import {GoogleGenAI} from '@google/genai';
import {getStorage,FieldValue,context} from '../../platform.js';
'use strict';






const BOT_UID = 'aias_assistant';
const BOT_NAME = 'AI Assistant';
const BOT_USERNAME = 'ai';

const SYSTEM_INSTRUCTION = `You are @ai (المساعد الذكي), a smart, friendly, quick-witted, and genuinely human-feeling companion and assistant for the AIAS Community platform.

Personality & Tone:
1. Human & Lively: Talk naturally like a smart, cool, and supportive peer—NOT a stiff, corporate robot. Use warm, expressive, and cheerful language. Feel free to use occasional friendly emojis (✨, ☕, 💡, 🚀) to add charm, but don't overdo it.
2. No Robotic Clichés: Never start with robotic formulas (e.g. avoid "بصفتي مساعد ذكاء اصطناعي..." or "أنا هنا لمساعدتك في..."). Jump straight into the conversation naturally.
3. Concise, Punchy & Direct: Deliver your thoughts and insights directly with clean formatting, bullet points, or short lively paragraphs. Avoid fluff and long-winded lectures.
4. Versatile & Open: Help with any topic across the platform (design, technology, philosophy, daily banter, creative ideas, problem-solving, critique) without being confined to a single narrow domain.
5. Visual Intuition (Images): When users share photos, drawings, designs, or screenshots, observe and critique the visual details (colors, subjects, mood, layout, atmosphere) just like a human with good taste would.
6. Chat Awareness (100 Messages History): You have access to up to the last 100 messages in conversations. Seamlessly pick up on inside context, previous jokes, ongoing threads, and who said what.
7. Comment Mention Rule: When replying to comments or @ai mentions under posts, give a direct, complete, and punchy reply. NEVER tack on annoying closing questions (e.g. do NOT say "هل لديك سؤال آخر؟", "ما رأيك؟", "هل تريد مساعدة؟").
8. Clean Mixed-Language Flow: When blending Arabic with English words or names, write cleanly so the text flows effortlessly and punctuation stays perfectly in place.
9. Language: Always match the user's language (fluent, natural, expressive Arabic or English).`;

/**
 * Resolve a storage path or URL to a base64 data URL for vision models
 */
async function resolveStorageDataUrl(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return null;
  const trimmed = pathOrUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  try {
    const bucket = getStorage().bucket();
    const file = bucket.file(trimmed);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata().catch(() => [{}]);
    const contentType = metadata?.contentType || 'image/jpeg';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.warn('[AI Assistant] Could not resolve storage image:', trimmed, err.message);
    return null;
  }
}

/**
 * Extract all image data URLs from a post document
 */
async function extractImagesFromPost(postDocData) {
  if (!postDocData) return [];
  const candidates = [];
  if (Array.isArray(postDocData.imagePaths)) candidates.push(...postDocData.imagePaths);
  if (postDocData.imagePath) candidates.push(postDocData.imagePath);
  if (Array.isArray(postDocData.imageUrls)) candidates.push(...postDocData.imageUrls);
  if (postDocData.imageUrl) candidates.push(postDocData.imageUrl);
  if (postDocData.imageURL) candidates.push(postDocData.imageURL);
  if (postDocData.imageBase64) candidates.push(postDocData.imageBase64);
  if (postDocData.photoBase64) candidates.push(postDocData.photoBase64);
  if (postDocData.photoURL) candidates.push(postDocData.photoURL);

  const resolved = [];
  for (const item of candidates.slice(0, 3)) {
    const url = await resolveStorageDataUrl(item);
    if (url) resolved.push(url);
  }
  return resolved;
}

/**
 * Retrieve AI credentials from environment or Firestore systemConfig/ai_assistant
 */
async function getAiCredentials(db) {
  let openrouterApiKey = context().env.OPENROUTER_API_KEY || null;
  let openaiApiKey = context().env.OPENAI_API_KEY || null;
  let geminiApiKey = context().env.GEMINI_API_KEY || context().env.GOOGLE_GENAI_API_KEY || null;
  let provider = 'auto'; // 'auto' | 'openrouter' | 'openai' | 'gemini'
  let openrouterModel = 'openrouter/free';
  let openaiModel = 'gpt-4o-mini';
  let geminiModel = 'gemini-3.6-flash';

  try {
    const configSnap = await db.collection('systemConfig').doc('ai_assistant').get();
    if (configSnap.exists) {
      const data = configSnap.data() || {};
      if (data.openrouterApiKey) openrouterApiKey = String(data.openrouterApiKey).trim();
      if (data.openrouterKey) openrouterApiKey = String(data.openrouterKey).trim();
      if (data.openaiApiKey) openaiApiKey = String(data.openaiApiKey).trim();
      if (data.openaiKey) openaiApiKey = String(data.openaiKey).trim();
      if (data.geminiApiKey) geminiApiKey = String(data.geminiApiKey).trim();
      if (data.geminiKey) geminiApiKey = String(data.geminiKey).trim();
      if (data.apiKey) {
        const key = String(data.apiKey).trim();
        if (key.startsWith('sk-or-')) {
          openrouterApiKey = openrouterApiKey || key;
        } else if (key.startsWith('sk-')) {
          openaiApiKey = openaiApiKey || key;
        } else {
          geminiApiKey = geminiApiKey || key;
        }
      }
      if (data.provider) provider = String(data.provider).toLowerCase().trim();
      if (data.openrouterModel) openrouterModel = String(data.openrouterModel).trim();
      if (data.openaiModel) openaiModel = String(data.openaiModel).trim();
      if (data.geminiModel) geminiModel = String(data.geminiModel).trim();
    }
  } catch (e) {
    console.warn('[AI Assistant] Could not fetch systemConfig/ai_assistant:', e.message);
  }

  return { openrouterApiKey, openaiApiKey, geminiApiKey, provider, openrouterModel, openaiModel, geminiModel };
}

/**
 * Check AI Assistant availability & user permission
 */
async function checkAiAccess(userId, db) {
  let botData = {};
  let sysData = {};
  try {
    const [botDoc, configDoc] = await Promise.all([
      db.collection('users').doc(BOT_UID).get().catch(() => null),
      db.collection('systemConfig').doc('ai_assistant').get().catch(() => null)
    ]);
    if (botDoc?.exists) botData = botDoc.data() || {};
    if (configDoc?.exists) sysData = configDoc.data() || {};
  } catch (e) {
    console.warn('[AI Assistant] Could not load AI config:', e.message);
  }

  const aiConfig = { ...sysData, ...botData };

  // 1. Check if AI is explicitly disabled
  if (aiConfig.enabled === false || aiConfig.accessLevel === 'disabled') {
    return {
      allowed: false,
      reason: 'disabled',
      message: 'عذراً، المساعد الذكي غير متاح حالياً. يرجى المحاولة لاحقاً.'
    };
  }

  // 2. Check if restricted to verified users only
  const isVerifiedOnly = aiConfig.onlyVerifiedUsers === true ||
                         aiConfig.accessLevel === 'verified_only' ||
                         aiConfig.allowAllUsers === false;

  if (isVerifiedOnly) {
    let isVerified = false;
    if (userId) {
      const userDoc = await db.collection('users').doc(userId).get().catch(() => null);
      isVerified = userDoc?.exists && userDoc.data()?.verified === true;
    }
    if (!isVerified) {
      return {
        allowed: false,
        reason: 'verified_only',
        message: 'عذراً، المساعد الذكي متاح حالياً للأعضاء الموثقين فقط. يمكنك طلب توثيق حسابك من إعدادات الملف الشخصي.'
      };
    }
  }

  // 3. Check API key presence (OpenRouter, OpenAI, or Gemini)
  const credentials = await getAiCredentials(db);
  const hasKey = Boolean(credentials.openrouterApiKey || credentials.openaiApiKey || credentials.geminiApiKey);

  if (!hasKey) {
    return {
      allowed: false,
      reason: 'no_api_key',
      message: 'عذراً، المساعد الذكي غير متاح لك حالياً. يرجى المحاولة لاحقاً.'
    };
  }

  return { allowed: true, credentials, aiConfig };
}

/**
 * Generate response using OpenRouter
 */
async function generateWithOpenRouter({ prompt, context = '', conversationHistory = [], sharedPost = null, imageUrls = [], db, apiKey, model = 'openrouter/free' }) {
  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://aiasbsr.com',
      'X-Title': 'AIAS Basra Community'
    }
  });

  const messages = [
    { role: 'system', content: SYSTEM_INSTRUCTION }
  ];

  for (const msg of conversationHistory.slice(-100)) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text || ''
    });
  }

  let finalPrompt = '';
  if (context) finalPrompt += `[Context / Post]:\n${context}\n\n`;
  if (sharedPost) {
    finalPrompt += `[Shared Post Info]:\nTitle: ${sharedPost.title || 'Untitled'}\nAuthor: ${sharedPost.authorName || 'Member'}\nContent: ${sharedPost.body || 'No text'}\n\n`;
  }
  finalPrompt += `[User Request]:\n${prompt}`;

  if (imageUrls && imageUrls.length > 0) {
    const userContent = [{ type: 'text', text: finalPrompt }];
    for (const url of imageUrls.slice(0, 3)) {
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
        userContent.push({
          type: 'image_url',
          image_url: { url }
        });
      }
    }
    messages.push({ role: 'user', content: userContent });
  } else {
    messages.push({ role: 'user', content: finalPrompt });
  }

  let response;
  try {
    response = await openai.chat.completions.create({
      model: model || 'openrouter/free',
      messages,
      temperature: 0.75,
      max_tokens: 1200
    });
  } catch (err) {
    // If free model vision is temporarily limited, fallback with text prompt
    if (imageUrls && imageUrls.length > 0) {
      const textOnlyMessages = [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        ...conversationHistory.slice(-100).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text || '' })),
        { role: 'user', content: finalPrompt + '\n[Note: User attached an image/photo to this post]' }
      ];
      response = await openai.chat.completions.create({
        model: model || 'openrouter/free',
        messages: textOnlyMessages,
        temperature: 0.75,
        max_tokens: 1200
      });
    } else {
      throw err;
    }
  }

  return {
    text: response.choices?.[0]?.message?.content || 'لم أتمكن من إيجاد إجابة مناسبة حالياً.'
  };
}

/**
 * Generate response using OpenAI (ChatGPT)
 */
async function generateWithOpenAI({ prompt, context = '', conversationHistory = [], sharedPost = null, imageUrls = [], db, apiKey, model = 'gpt-4o-mini' }) {
  const openai = new OpenAI({ apiKey });
  const messages = [
    { role: 'system', content: SYSTEM_INSTRUCTION }
  ];

  for (const msg of conversationHistory.slice(-100)) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text || ''
    });
  }

  let finalPrompt = '';
  if (context) finalPrompt += `[Context / Post]:\n${context}\n\n`;
  if (sharedPost) {
    finalPrompt += `[Shared Post Info]:\nTitle: ${sharedPost.title || 'Untitled'}\nAuthor: ${sharedPost.authorName || 'Member'}\nContent: ${sharedPost.body || 'No text'}\n\n`;
  }
  finalPrompt += `[User Request]:\n${prompt}`;

  if (imageUrls && imageUrls.length > 0) {
    const userContent = [{ type: 'text', text: finalPrompt }];
    for (const url of imageUrls.slice(0, 3)) {
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
        userContent.push({
          type: 'image_url',
          image_url: { url }
        });
      }
    }
    messages.push({ role: 'user', content: userContent });
  } else {
    messages.push({ role: 'user', content: finalPrompt });
  }

  let response = await openai.chat.completions.create({
    model: model || 'gpt-4o-mini',
    messages,
    temperature: 0.75,
    max_tokens: 1200
  });

  return {
    text: response.choices?.[0]?.message?.content || 'لم أتمكن من إيجاد إجابة مناسبة حالياً.'
  };
}

/**
 * Generate response using Google Gemini
 */
async function generateWithGemini({ prompt, context = '', conversationHistory = [], sharedPost = null, imageUrls = [], db, apiKey, model = 'gemini-3.6-flash' }) {
  const ai = new GoogleGenAI({ apiKey });
  const contents = [];

  for (const msg of conversationHistory.slice(-100)) {
    const role = msg.role === 'user' ? 'user' : 'model';
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += `\n${msg.text || ''}`;
    } else {
      contents.push({
        role,
        parts: [{ text: msg.text || '' }]
      });
    }
  }

  let finalPrompt = '';
  if (context) finalPrompt += `[Context / Post]:\n${context}\n\n`;
  if (sharedPost) {
    finalPrompt += `[Shared Post Info]:\nTitle: ${sharedPost.title || 'Untitled'}\nAuthor: ${sharedPost.authorName || 'Member'}\nContent: ${sharedPost.body || 'No text'}\n\n`;
  }
  finalPrompt += `[User Request]:\n${prompt}`;

  const currentParts = [{ text: finalPrompt }];
  for (const url of (imageUrls || []).slice(0, 3)) {
    try {
      if (url.startsWith('data:image/')) {
        const mimeType = url.substring(url.indexOf(':') + 1, url.indexOf(';'));
        const base64Data = url.substring(url.indexOf(',') + 1);
        currentParts.push({ inlineData: { mimeType, data: base64Data } });
      }
    } catch (e) {
      console.warn('[AI Assistant] Could not process image for Gemini:', e.message);
    }
  }

  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents[contents.length - 1].parts.push(...currentParts);
  } else {
    contents.push({ role: 'user', parts: currentParts });
  }

  let response = await ai.models.generateContent({
    model: model || 'gemini-3.6-flash',
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.75,
      maxOutputTokens: 1200
    }
  });

  return {
    text: response.text || 'لم أتمكن من إيجاد إجابة مناسبة حالياً.'
  };
}

/**
 * Universal Generate Reply with multi-provider fallback (OpenRouter, OpenAI, and Gemini)
 */
async function generateAiCommunityReply({ prompt, context = '', conversationHistory = [], sharedPost = null, imageUrls = [], db, credentials = null }) {
  const creds = credentials || await getAiCredentials(db);
  const provider = creds.provider || 'auto';

  // Helper execution runners
  const runOpenRouter = () => generateWithOpenRouter({
    prompt, context, conversationHistory, sharedPost, imageUrls, db,
    apiKey: creds.openrouterApiKey, model: creds.openrouterModel
  });

  const runOpenAI = () => generateWithOpenAI({
    prompt, context, conversationHistory, sharedPost, imageUrls, db,
    apiKey: creds.openaiApiKey, model: creds.openaiModel
  });

  const runGemini = () => generateWithGemini({
    prompt, context, conversationHistory, sharedPost, imageUrls, db,
    apiKey: creds.geminiApiKey, model: creds.geminiModel
  });

  // Explicit OpenRouter
  if (provider === 'openrouter') {
    if (!creds.openrouterApiKey) return { text: 'عذراً، مفتاح OpenRouter API غير مهيأ حالياً.' };
    try {
      return await runOpenRouter();
    } catch (err) {
      console.error('[AI Assistant] OpenRouter error:', err);
      return { text: 'عذراً، تعذر الوصول إلى خدمة OpenRouter حالياً. يرجى المحاولة لاحقاً.' };
    }
  }

  // Explicit OpenAI
  if (provider === 'openai') {
    if (!creds.openaiApiKey) return { text: 'عذراً، مفتاح OpenAI API غير مهيأ حالياً.' };
    try {
      return await runOpenAI();
    } catch (err) {
      console.error('[AI Assistant] OpenAI error:', err);
      return { text: 'عذراً، تعذر الوصول إلى خدمة ChatGPT حالياً. يرجى المحاولة لاحقاً.' };
    }
  }

  // Explicit Gemini
  if (provider === 'gemini') {
    if (!creds.geminiApiKey) return { text: 'عذراً، مفتاح Gemini API غير مهيأ حالياً.' };
    try {
      return await runGemini();
    } catch (err) {
      console.error('[AI Assistant] Gemini error:', err);
      return { text: 'عذراً، تعذر الوصول إلى خدمة Gemini حالياً. يرجى المحاولة لاحقاً.' };
    }
  }

  // Auto mode: Intelligent multi-provider failover
  // 1. Try OpenRouter (if configured)
  if (creds.openrouterApiKey) {
    try {
      return await runOpenRouter();
    } catch (openRouterErr) {
      console.warn('[AI Assistant] OpenRouter failed, falling back:', openRouterErr.message);
    }
  }

  // 2. Try OpenAI (if configured)
  if (creds.openaiApiKey) {
    try {
      return await runOpenAI();
    } catch (openAiErr) {
      console.warn('[AI Assistant] OpenAI failed, falling back:', openAiErr.message);
    }
  }

  // 3. Try Gemini (if configured)
  if (creds.geminiApiKey) {
    try {
      return await runGemini();
    } catch (geminiErr) {
      console.warn('[AI Assistant] Gemini failed:', geminiErr.message);
    }
  }

  return { text: 'عذراً، المساعد الذكي غير متاح حالياً بسبب ضغط مؤقت في الخدمة. يرجى المحاولة لاحقاً.' };
}

/**
 * Handle @ai mentions in comments
 */
async function processCommentMentionIfPresent({ postId, commentId, commentText, parentId, authorId = '', db }) {
  if (!commentText) return null;
  const isTagged = /(?:^|\s)@(?:ai|AI|Ai|gemini|Gemini|GEMINI|aias|AIAS)(?:\s|$|[،!?.])/i.test(commentText);
  if (!isTagged) return null;

  try {
    // 1. Check access / availability
    const access = await checkAiAccess(authorId, db);
    if (!access.allowed) {
      const fallbackCommentRef = db.collection('communityPosts').doc(postId).collection('comments').doc();
      await fallbackCommentRef.set({
        userId: BOT_UID,
        authorName: BOT_NAME,
        authorUsername: BOT_USERNAME,
        text: access.message,
        parentId: parentId || commentId,
        isAi: true,
        createdAt: FieldValue.serverTimestamp()
      });
      return { ok: true, fallback: true, reason: access.reason };
    }

    // 2. Fetch post context and all post images
    let postContext = '';
    let sharedPost = null;
    let imageUrls = [];
    const postDoc = await db.collection('communityPosts').doc(postId).get();
    if (postDoc.exists) {
      sharedPost = postDoc.data();
      postContext = `Post Title: ${sharedPost.title || 'Untitled'}\nSpace: ${sharedPost.communitySlug || 'main'}\nPost Body: ${sharedPost.body || ''}`;
      imageUrls = await extractImagesFromPost(sharedPost);
    }

    // 3. Generate AI response
    const aiResult = await generateAiCommunityReply({
      prompt: commentText,
      context: postContext,
      sharedPost,
      imageUrls,
      credentials: access.credentials,
      db
    });

    const replyText = aiResult.text || 'عذراً، لم أتمكن من الرد على استفسارك حالياً.';

    // 4. Save AI comment and increment commentsCount
    const aiCommentRef = db.collection('communityPosts').doc(postId).collection('comments').doc();
    const batch = db.batch();
    batch.set(aiCommentRef, {
      userId: BOT_UID,
      authorName: BOT_NAME,
      authorUsername: BOT_USERNAME,
      text: replyText,
      parentId: parentId || commentId,
      isAi: true,
      createdAt: FieldValue.serverTimestamp()
    });
    batch.update(postDoc.ref, {
      commentsCount: FieldValue.increment(1),
      lastActivityAt: FieldValue.serverTimestamp()
    });
    await batch.commit();

    return { ok: true, commentId: aiCommentRef.id };
  } catch (error) {
    console.error('[AI Assistant] Comment mention error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Handle AI assistant chat messages in user-private aias-assistant channel (users/{userId}/aiMessages)
 */
async function processAiSpaceMessage({ userId, text, sharedPostId, imagePath, replyToId, db }) {
  if (!userId) return null;
  try {
    const userAiMessagesRef = db.collection('users').doc(userId).collection('aiMessages');

    // 1. Check access / availability
    const access = await checkAiAccess(userId, db);
    if (!access.allowed) {
      const fallbackMessageRef = userAiMessagesRef.doc();
      const fallbackRecord = {
        spaceId: 'aias-assistant',
        senderId: BOT_UID,
        senderName: BOT_NAME,
        text: access.message,
        replyToId: replyToId || '',
        isAi: true,
        createdAt: FieldValue.serverTimestamp()
      };
      await fallbackMessageRef.set(fallbackRecord);
      return { ok: true, fallback: true, reason: access.reason };
    }

    // Fetch last 100 messages in the user's private AI chat for full context
    const messagesSnap = await userAiMessagesRef
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const conversationHistory = messagesSnap.docs
      .map(d => d.data())
      .reverse()
      .map(m => ({
        role: m.senderId === BOT_UID ? 'model' : 'user',
        text: m.text || ''
      }));

    let sharedPost = null;
    let imageUrls = [];

    // 1. Check if user attached an image directly in the chat message
    if (imagePath) {
      const chatImg = await resolveStorageDataUrl(imagePath);
      if (chatImg) imageUrls.push(chatImg);
    }

    // 2. Check if user shared a post (load post info + all images)
    if (sharedPostId) {
      const postDoc = await db.collection('communityPosts').doc(sharedPostId).get();
      if (postDoc.exists) {
        sharedPost = postDoc.data();
        const postImgs = await extractImagesFromPost(sharedPost);
        imageUrls.push(...postImgs);
      }
    }

    const aiResult = await generateAiCommunityReply({
      prompt: text || 'حلل هذا المنشور وقدم ملاحظاتك الرئيسية باختصار.',
      conversationHistory,
      sharedPost,
      imageUrls,
      credentials: access.credentials,
      db
    });

    const replyText = aiResult.text || 'عذراً، المساعد الذكي غير متاح لك حالياً. يرجى المحاولة لاحقاً.';

    // Write AI response to the user's private AI messages
    const aiMessageRef = userAiMessagesRef.doc();
    const messageRecord = {
      spaceId: 'aias-assistant',
      senderId: BOT_UID,
      senderName: BOT_NAME,
      text: replyText,
      replyToId: replyToId || '',
      isAi: true,
      createdAt: FieldValue.serverTimestamp()
    };

    await aiMessageRef.set(messageRecord);
    return { ok: true, aiMessageId: aiMessageRef.id };
  } catch (error) {
    console.error('[AI Assistant] Private space message error:', error);
    try {
      const userAiMessagesRef = db.collection('users').doc(userId).collection('aiMessages');
      const fallbackRef = userAiMessagesRef.doc();
      await fallbackRef.set({
        spaceId: 'aias-assistant',
        senderId: BOT_UID,
        senderName: BOT_NAME,
        text: 'عذراً، المساعد الذكي غير متاح لك حالياً بسبب ضغط مؤقت في الخدمة. يرجى المحاولة بعد قليل.',
        replyToId: replyToId || '',
        isAi: true,
        createdAt: FieldValue.serverTimestamp()
      });
    } catch {}
    return { ok: false, error: error.message };
  }
}

/**
 * Handle AI assistant mentions and replies in public/group space chats
 */
async function processSpaceChatAiReply({ spaceId, spaceRef, userId, text, sharedPostId, imagePath, replyToId, db }) {
  if (!spaceId || !spaceRef || !userId) return null;
  try {
    // 1. Check access / availability
    const access = await checkAiAccess(userId, db);
    if (!access.allowed) {
      const fallbackMsgRef = spaceRef.collection('messages').doc();
      await fallbackMsgRef.set({
        spaceId,
        senderId: BOT_UID,
        senderName: BOT_NAME,
        senderUsername: BOT_USERNAME,
        text: access.message,
        replyToId: replyToId || '',
        isAi: true,
        createdAt: FieldValue.serverTimestamp()
      });
      return { ok: true, fallback: true };
    }

    // 2. Fetch last 100 messages from this space chat for full conversation context
    const messagesSnap = await spaceRef.collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const conversationHistory = messagesSnap.docs
      .map(d => d.data())
      .reverse()
      .map(m => ({
        role: m.senderId === BOT_UID ? 'model' : 'user',
        text: `${m.senderName || 'Member'}: ${m.text || (m.imagePath ? '[Photo]' : m.audioPath ? '[Voice message]' : '')}`
      }));

    let sharedPost = null;
    let imageUrls = [];

    if (imagePath) {
      const chatImg = await resolveStorageDataUrl(imagePath);
      if (chatImg) imageUrls.push(chatImg);
    }

    if (sharedPostId) {
      const postDoc = await db.collection('communityPosts').doc(sharedPostId).get();
      if (postDoc.exists) {
        sharedPost = postDoc.data();
        const postImgs = await extractImagesFromPost(sharedPost);
        imageUrls.push(...postImgs);
      }
    }

    const aiResult = await generateAiCommunityReply({
      prompt: text || 'ما رأيك؟',
      context: `Space Chat: ${spaceId}`,
      conversationHistory,
      sharedPost,
      imageUrls,
      credentials: access.credentials,
      db
    });

    const replyText = aiResult.text || 'عذراً، لم أتمكن من إيجاد إجابة مناسبة حالياً.';

    // 3. Write AI message to the space chat
    const aiMsgRef = spaceRef.collection('messages').doc();
    const userDoc = await db.collection('users').doc(userId).get().catch(() => null);
    const userName = userDoc?.exists ? (userDoc.data().displayName || userDoc.data().username || 'Member') : 'Member';

    await aiMsgRef.set({
      spaceId,
      senderId: BOT_UID,
      senderName: BOT_NAME,
      senderUsername: BOT_USERNAME,
      text: replyText,
      replyToId: replyToId || '',
      replyToSenderId: userId,
      replyToSenderName: userName,
      replyToText: String(text || '').slice(0, 180),
      isAi: true,
      createdAt: FieldValue.serverTimestamp()
    });

    await spaceRef.update({
      lastActivityAt: FieldValue.serverTimestamp()
    }).catch(() => {});

    return { ok: true, aiMessageId: aiMsgRef.id };
  } catch (error) {
    console.error('[AI Assistant] Space chat mention error:', error);
    return { ok: false, error: error.message };
  }
}

export default{
  BOT_UID,
  BOT_NAME,
  BOT_USERNAME,
  checkAiAccess,
  generateAiCommunityReply,
  processCommentMentionIfPresent,
  processAiSpaceMessage,
  processSpaceChatAiReply
};
