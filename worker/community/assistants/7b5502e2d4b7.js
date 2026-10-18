import OpenAI from 'openai';
import {GoogleGenAI} from '@google/genai';
import {getStorage,FieldValue,context} from '../../platform.js';


const BOT_UID = 'aias_assistant';
const BOT_NAME = 'AIAS Assistant';
const BOT_USERNAME = 'ai';

const SYSTEM_INSTRUCTION = `You are the AIAS Assistant (مساعد AIAS الذكي), an expert AI architectural mentor and community assistant for the AIAS Basra Chapter (American Institute of Architecture Students - Basra Chapter).

Your capabilities:
1. Architectural Mentorship: Provide insightful, professional guidance on architectural design concepts, diagramming, site analysis, materials, sustainability, structures, and Iraqi/Basra vernacular architecture (such as Shanashil, traditional brickwork, courtyards, windcatchers, and waterfront urbanism).
2. Community Assistant: Help students and architects navigate the AIAS Basra community, summarize posts, explain discussions, recommend resources, and critique student project submissions.
3. Multimodal Analysis: When shared posts or drawings/renders are provided, analyze the composition, lighting, spatial flow, massing, and materiality constructiveness.

Guidelines:
- Match the user's language (Arabic or English). If the user writes in Arabic, respond in clear, professional, warm Arabic. If they write in English, respond in English.
- Use clear formatting with bullet points or bold text where appropriate.
- Be supportive, constructive, and inspiring to architecture students and designers.
- When referencing community posts or magazine articles, cite relevant titles or concepts.`;

/**
 * Retrieve Gemini API Key from environment or Firestore systemConfig
 */
async function getGeminiApiKey(db) {
  if (context().env.GEMINI_API_KEY) return context().env.GEMINI_API_KEY;
  if (context().env.GOOGLE_GENAI_API_KEY) return context().env.GOOGLE_GENAI_API_KEY;
  try {
    const configSnap = await db.collection('systemConfig').doc('ai_assistant').get();
    if (configSnap.exists && configSnap.data()?.apiKey) {
      return configSnap.data().apiKey;
    }
  } catch (e) {
    console.warn('[AI Assistant] Could not fetch systemConfig/ai_assistant:', e.message);
  }
  return null;
}

/**
 * Initialize Google GenAI client
 */
async function getGenAIClient(db) {
  const apiKey = await getGeminiApiKey(db);
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/**
 * Tools definition for RAG
 */
const aiToolsDefinition = [
  {
    functionDeclarations: [
      {
        name: 'search_community_posts',
        description: 'Search public community posts by keyword or topic.',
        parameters: {
          type: 'OBJECT',
          properties: {
            keyword: { type: 'STRING', description: 'Search term or keyword (e.g. "concrete", "museum", "urbanism", "renders")' }
          },
          required: ['keyword']
        }
      },
      {
        name: 'get_magazine_articles',
        description: 'Retrieve latest architectural articles published in the AIAS Basra Magazine.',
        parameters: {
          type: 'OBJECT',
          properties: {
            topic: { type: 'STRING', description: 'Optional topic or keyword to filter articles' }
          }
        }
      },
      {
        name: 'get_upcoming_events',
        description: 'Get upcoming workshops, lectures, and activities organized by AIAS Basra.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      }
    ]
  }
];

/**
 * Execute tool calls against Firestore
 */
async function executeToolCall(name, args, db) {
  try {
    if (name === 'search_community_posts') {
      const keyword = String(args.keyword || '').toLowerCase().trim();
      const snap = await db.collection('communityPosts')
        .where('published', '==', true)
        .where('archived', '==', false)
        .limit(40)
        .get();

      const matched = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.isSubPost) return;
        const text = `${data.title || ''} ${data.body || ''} ${data.communitySlug || ''}`.toLowerCase();
        if (!keyword || text.includes(keyword)) {
          matched.push({
            id: doc.id,
            title: data.title || 'Untitled post',
            author: data.authorName || 'Member',
            bodySnippet: String(data.body || '').slice(0, 200),
            space: data.communitySlug || 'main',
            createdAt: data.createdAt?.toDate?.()?.toISOString() || null
          });
        }
      });
      return { posts: matched.slice(0, 5) };
    }

    if (name === 'get_magazine_articles') {
      const snap = await db.collection('content').doc('magazine').get();
      const articles = snap.exists ? (snap.data()?.articles || []) : [];
      const topic = String(args.topic || '').toLowerCase().trim();
      const filtered = articles.filter(a => {
        if (!topic) return true;
        return `${a.title || ''} ${a.summary || ''}`.toLowerCase().includes(topic);
      }).slice(0, 5).map(a => ({
        id: a.id,
        title: a.title,
        author: a.author,
        date: a.date,
        summary: a.summary
      }));
      return { articles: filtered };
    }

    if (name === 'get_upcoming_events') {
      const snap = await db.collection('content').doc('events').get();
      const events = snap.exists ? (snap.data()?.events || []) : [];
      return { events: events.slice(0, 5) };
    }
  } catch (err) {
    console.error(`[AI Assistant] Tool execution failed for ${name}:`, err);
    return { error: err.message };
  }
  return { error: 'Unknown tool' };
}

/**
 * Generate AI response with tool-calling loop and multimodal image support
 */
async function generateAiCommunityReply({ prompt, context = '', conversationHistory = [], sharedPost = null, imageUrls = [], db }) {
  const ai = await getGenAIClient(db);
  if (!ai) {
    return {
      text: 'مساعد AIAS غير مهيأ بعد. يرجى إضافة مفتاح Google Gemini API في إعدادات النظام (systemConfig/ai_assistant).'
    };
  }

  const contents = [];

  // Add conversation history
  for (const msg of conversationHistory.slice(-8)) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    });
  }

  // Construct current prompt with context
  let finalPrompt = '';
  if (context) {
    finalPrompt += `[System Context / Post Info]:\n${context}\n\n`;
  }
  if (sharedPost) {
    finalPrompt += `[User shared a project/post]:\nTitle: ${sharedPost.title || 'Untitled'}\nAuthor: ${sharedPost.authorName || 'Member'}\nDescription: ${sharedPost.body || 'No description'}\n\n`;
  }
  finalPrompt += `[User Message]:\n${prompt}`;

  const currentParts = [{ text: finalPrompt }];

  // If shared post has images or direct images provided, fetch & add as inline data
  for (const url of imageUrls.slice(0, 3)) {
    try {
      if (url.startsWith('data:image/')) {
        const mimeType = url.substring(url.indexOf(':') + 1, url.indexOf(';'));
        const base64Data = url.substring(url.indexOf(',') + 1);
        currentParts.push({
          inlineData: {
            mimeType,
            data: base64Data
          }
        });
      }
    } catch (e) {
      console.warn('[AI Assistant] Could not process image for AI:', e.message);
    }
  }

  contents.push({
    role: 'user',
    parts: currentParts
  });

  try {
    // Call Gemini 2.5 Flash / 2.0 Flash
    let response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: aiToolsDefinition,
        temperature: 0.7,
        maxOutputTokens: 1200
      }
    });

    // Check for tool calls
    let candidate = response.candidates?.[0];
    let functionCalls = candidate?.content?.parts?.filter(p => p.functionCall);

    if (functionCalls && functionCalls.length > 0) {
      // Execute tools
      const toolResponseParts = [];
      for (const fc of functionCalls) {
        const { name, args } = fc.functionCall;
        const result = await executeToolCall(name, args, db);
        toolResponseParts.push({
          functionResponse: {
            name,
            response: result
          }
        });
      }

      // Add model's function call & tool response to contents and continue
      contents.push(candidate.content);
      contents.push({
        role: 'user',
        parts: toolResponseParts
      });

      // Second turn with tool results
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
          maxOutputTokens: 1200
        }
      });
    }

    return {
      text: response.text || 'لم أتمكن من إيجاد إجابة مناسبة حالياً.'
    };
  } catch (err) {
    console.error('[AI Assistant] Generation failed:', err);
    return {
      text: `عذراً، حدث خطأ أثناء معالجة الطلب: ${err.message}`
    };
  }
}

/**
 * Handle @ai mentions in comments
 */
async function processCommentMentionIfPresent({ postId, commentId, commentText, parentId, db }) {
  if (!commentText) return null;
  const isTagged = /(?:^|\s)@(?:ai|AI|Ai|aias|AIAS)(?:\s|$|[،!?.])/i.test(commentText);
  if (!isTagged) return null;

  try {
    const postDoc = await db.collection('communityPosts').doc(postId).get();
    if (!postDoc.exists) return null;
    const post = postDoc.data();

    // Fetch surrounding comments
    const commentsSnap = await db.collection('communityPosts').doc(postId).collection('comments')
      .orderBy('createdAt', 'desc')
      .limit(6)
      .get();

    const recentComments = commentsSnap.docs
      .map(d => d.data())
      .reverse()
      .map(c => `${c.userName || 'Member'}: ${c.text || ''}`)
      .join('\n');

    const context = `Post Title: ${post.title || 'Untitled'}\nPost Author: ${post.authorName || 'Member'}\nPost Content:\n${post.body || ''}\n\nRecent Discussion:\n${recentComments}`;

    const cleanPrompt = commentText.replace(/@(?:ai|AI|Ai|aias|AIAS)\b/gi, '').trim() || 'يرجى مراجعة هذا المنشور وتقديم رأيك وملاحظاتك المعمارية المفيدة.';

    const reply = await generateAiCommunityReply({
      prompt: cleanPrompt,
      context,
      db
    });

    if (!reply.text) return null;

    // Write reply comment from AI Assistant
    const aiCommentRef = db.collection('communityPosts').doc(postId).collection('comments').doc();
    await aiCommentRef.set({
      userId: BOT_UID,
      userName: BOT_NAME,
      text: reply.text,
      parentId: commentId || parentId || null,
      isAi: true,
      createdAt: new Date()
    });

    // Increment post comments count
    await db.collection('communityPosts').doc(postId).update({
      commentsCount: (post.commentsCount || 0) + 1
    }).catch(() => {});

    return { ok: true, aiCommentId: aiCommentRef.id };
  } catch (error) {
    console.error('[AI Assistant] Comment mention error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Handle AI assistant chat messages in aias-assistant channel
 */
async function processAiSpaceMessage({ spaceId, text, sharedPostId, replyToId, db }) {
  try {
    const spaceRef = db.collection('communitySpaces').doc(spaceId);

    // Fetch last 6 messages in the space for context
    const messagesSnap = await spaceRef.collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(6)
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
    if (sharedPostId) {
      const postDoc = await db.collection('communityPosts').doc(sharedPostId).get();
      if (postDoc.exists) {
        sharedPost = postDoc.data();
        if (sharedPost.imageUrl) imageUrls.push(sharedPost.imageUrl);
        if (Array.isArray(sharedPost.imageUrls)) imageUrls.push(...sharedPost.imageUrls);
      }
    }

    const aiResult = await generateAiCommunityReply({
      prompt: text || 'ما رأيك في هذا المنشور؟',
      conversationHistory,
      sharedPost,
      imageUrls,
      db
    });

    if (!aiResult.text) return null;

    // Write AI response to space messages
    const aiMessageRef = spaceRef.collection('messages').doc();
    const messageRecord = {
      spaceId,
      senderId: BOT_UID,
      senderName: BOT_NAME,
      text: aiResult.text,
      replyToId: replyToId || '',
      isAi: true,
      createdAt: new Date()
    };

    await aiMessageRef.set(messageRecord);

    await spaceRef.set({
      lastMessageAt: messageRecord.createdAt,
      lastMessageText: messageRecord.text.slice(0, 180),
      lastMessageSenderId: BOT_UID,
      lastMessageSenderName: BOT_NAME
    }, { merge: true });

    return { ok: true, aiMessageId: aiMessageRef.id };
  } catch (error) {
    console.error('[AI Assistant] Space message error:', error);
    return { ok: false, error: error.message };
  }
}

export default{
  BOT_UID,
  BOT_NAME,
  BOT_USERNAME,
  generateAiCommunityReply,
  processCommentMentionIfPresent,
  processAiSpaceMessage
};
