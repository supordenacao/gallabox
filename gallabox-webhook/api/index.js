import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ljwvslifkwnjihacfcnu.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxqd3ZzbGlma3duamloYWNmY251Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA1ODAwMiwiZXhwIjoyMDgxNjM0MDAyfQ.HGY4h1ChTpPA76tzX9gO4zwvUC7EU5OIJW0DWT-_TXw';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    if (!payload) return res.status(400).json({ message: 'No payload' });

    const convId = payload.conversation?.id || payload.data?.conversation?.id || payload.conversationId;
    if (!convId) return res.status(400).json({ message: 'No conversation ID' });

    const contactName = payload.contact?.name || payload.conversation?.contact?.name || 'Sem nome';
    const status = payload.conversation?.status || 'OPEN';
    const createdAt = payload.conversation?.createdAt || new Date().toISOString();
    const lastMessageAt = payload.message?.timestamp ? new Date(payload.message.timestamp * 1000).toISOString() : new Date().toISOString();
    const tags = payload.conversation?.tags || payload.tags || [];
    const tagNames = tags.map(t => typeof t === 'string' ? t : t.name || '').filter(Boolean);

    if (status === 'CLOSED' || status === 'closed') {
      const { error } = await supabase.from('open_conversations').delete().eq('id', convId);
      if (error) throw error;
      console.log(`Conversa fechada removida: ${convId}`);
    } else {
      const { error } = await supabase.from('open_conversations').upsert({
        id: convId,
        contact_name: contactName,
        created_at: createdAt,
        last_message_at: lastMessageAt,
        status: 'OPEN',
        tags: tagNames,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (error) throw error;
      console.log(`Conversa salva: ${convId}`);
    }

    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ error: error.message });
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
