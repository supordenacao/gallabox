// index.js (para Vercel, Netlify ou Render)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ljwvslifkwnjihacfcnu.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxqd3ZzbGlma3duamloYWNmY251Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA1ODAwMiwiZXhwIjoyMDgxNjM0MDAyfQ.HGY4h1ChTpPA76tzX9gO4zwvUC7EU5OIJW0DWT-_TXw';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Credenciais Gallabox (NUNCA coloque no frontend)
const GALLABOX_API_KEY = process.env.GALLABOX_API_KEY;
const GALLABOX_API_SECRET = process.env.GALLABOX_API_SECRET;
const GALLABOX_ACCOUNT_ID = process.env.GALLABOX_ACCOUNT_ID;
const GALLABOX_CHANNEL_ID = process.env.GALLABOX_CHANNEL_ID;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const payload = req.body;
    if (!payload) return res.status(200).json({ message: 'No payload' });

    const convId = payload.conversation?.id || payload.data?.conversation?.id || payload.conversationId || null;
    if (!convId) return res.status(200).json({ message: 'No conversation ID' });

    const contactName = payload.contact?.name || payload.conversation?.contact?.name || 'Sem nome';
    const status = payload.conversation?.status || 'OPEN';
    const createdAt = payload.conversation?.createdAt || new Date().toISOString();
    const lastMessageAt = payload.message?.timestamp ? new Date(payload.message.timestamp * 1000).toISOString() : new Date().toISOString();
    const tags = payload.conversation?.tags || payload.tags || [];

    const tagNames = tags.map(t => typeof t === 'string' ? t : t.name || '').filter(Boolean);

    if (status === 'CLOSED' || status === 'closed') {
      // Remove conversa fechada
      const { error } = await supabase
        .from('open_conversations')
        .delete()
        .eq('id', convId);

      if (error) console.error('Erro ao remover conversa fechada:', error);
      else console.log(`Conversa FECHADA removida: ${convId}`);
    } else {
      // Upsert conversa aberta
      const { error } = await supabase
        .from('open_conversations')
        .upsert({
          id: convId,
          contact_name: contactName,
          created_at: createdAt,
          last_message_at: lastMessageAt,
          status: 'OPEN',
          tags: tagNames,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (error) console.error('Erro no upsert:', error);
      else console.log(`Conversa salva/atualizada: ${convId} - ${contactName}`);
    }

    return res.status(200).json({ message: 'OK' });

  } catch (error) {
    console.error('Erro crítico no webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Config Vercel (se usar Vercel)
export const config = {
  api: {
    bodyParser: true,
  },
};